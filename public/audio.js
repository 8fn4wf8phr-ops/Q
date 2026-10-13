// Microphone capture (push-to-talk) and ordered sentence-by-sentence playback.

import { measureLevel } from './level.js';

const AC = window.AudioContext || window.webkitAudioContext;

function rms(analyser, buf) {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

// Chrome prefixes the system default device with "Default - "; drop it so the
// same microphone has the same name whether it was listed or opened.
export const micName = (label) => (label ? label.replace(/^Default - /, '').trim() : null);

export class Recorder {
  // holdMs: how long to keep the microphone open after a recording, so the
  // next press starts at once instead of waiting for the device. 0 = close it
  // straight away. Nothing is recorded while it is held.
  constructor({ onRelease } = {}) { this.active = false; this.holdMs = 0; this.onRelease = onRelease; }

  get held() { return !this.active && !!this.stream; }

  // deviceId: record from exactly that microphone, or fail. Without it the
  // browser uses the system default, which macOS can change on its own.
  async start(deviceId) {
    clearTimeout(this.holdTimer);
    const track = this.stream?.getAudioTracks()[0];
    this.reused = !!track && this.openedFor === (deviceId || '') && track.readyState === 'live' && !track.muted;
    if (!this.reused) {
      this.release();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
      });
      this.openedFor = deviceId || '';
      const stream = this.stream;
      // Unplugged or taken away while held: forget it so the next press opens a fresh one.
      stream.getAudioTracks()[0]?.addEventListener('ended', () => { if (this.stream === stream && !this.active) this.release(); });
      this.ctx = new AC();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.buf = new Float32Array(this.analyser.fftSize);
      src.connect(this.analyser);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => window.MediaRecorder?.isTypeSupported?.(t));
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    const started = new Promise((res) => (this.rec.onstart = res));
    this.rec.start();
    await started;
    this.startedAt = performance.now();
    this.active = true;
    this.flowing = this.whenFlowing();
    // The device the browser actually opened, which is not always the one you expect.
    this.deviceName = micName(this.stream.getAudioTracks()[0]?.label);
  }

  // "Started" is not the same as "hearing". Some browsers (WebKit, so Q's own
  // window) hand over the microphone and start the recorder up to a second
  // before any sound arrives. This resolves true once real samples are coming
  // in, or false if the recording ends or two seconds pass first. A microphone
  // kept open from the last turn is already flowing, so it resolves at once.
  whenFlowing(limitMs = 2000) {
    const stream = this.stream;
    const t0 = performance.now();
    return new Promise((resolve) => {
      const check = () => {
        if (!this.active || this.stream !== stream || !this.analyser) return resolve(false);
        this.analyser.getFloatTimeDomainData(this.buf);
        if (this.buf.some((v) => v !== 0)) return resolve(true);
        if (performance.now() - t0 > limitMs) return resolve(false);
        setTimeout(check, 8);
      };
      check();
    });
  }

  getLevel = () => (this.active && this.analyser ? Math.min(1, rms(this.analyser, this.buf) * 5) : 0);

  async stop() {
    if (!this.rec) return null;
    const stopped = new Promise((res) => (this.rec.onstop = res));
    this.rec.stop();
    await stopped;
    const durationMs = performance.now() - this.startedAt;
    if (this.holdMs > 0) {
      this.active = false;
      this.holdTimer = setTimeout(() => this.release(), this.holdMs);
    } else this.release();
    return { blob: new Blob(this.chunks, { type: this.rec.mimeType || 'audio/webm' }), durationMs };
  }

  release() {
    clearTimeout(this.holdTimer);
    const had = !!this.stream;
    this.active = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.analyser = null;
    this.stream = null;
    this.ctx = null;
    if (had) this.onRelease?.();
  }
}

// Decode whatever the browser recorded and resample to 16 kHz mono 16-bit WAV,
// the format whisper.cpp expects. Also measures how loud the clip was, so the
// caller can skip Whisper when nobody spoke.
export async function blobToWav16k(blob) {
  const ctx = new AC();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close().catch(() => {});
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  const samples = rendered.getChannelData(0);
  return { wav: encodeWav(samples, rate), level: measureLevel(samples, rate) };
}

function encodeWav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0, o = 44; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

// Plays synthesized sentences strictly in order. Each enqueued item is a
// promise for WAV bytes, so synthesis of later sentences overlaps playback.
export class Player {
  constructor({ onStart, onIdle, onError } = {}) {
    this.onStart = onStart;
    this.onIdle = onIdle;
    this.onError = onError;
    this.queue = [];
    this.playing = false;
    this.gen = 0;
  }

  // Must be called from a user gesture the first time (autoplay rules).
  unlock() {
    if (!this.ctx) {
      this.ctx = new AC();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.buf = new Float32Array(this.analyser.fftSize);
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  getLevel = () => (this.current && this.analyser ? Math.min(1, rms(this.analyser, this.buf) * 4) : 0);

  // tag travels with the audio and comes back in onStart, so the caller knows which piece is playing.
  enqueue(promise, tag) {
    this.queue.push({ promise, tag });
    if (!this.playing) this.pump(this.gen);
  }

  async pump(gen) {
    this.playing = true;
    while (this.queue.length && gen === this.gen) {
      const { promise: item, tag } = this.queue.shift();
      let bytes;
      try { bytes = await item; } catch (err) { this.onError?.(err); continue; }
      if (gen !== this.gen) return;
      if (!bytes) continue;
      let audio;
      try { audio = await this.ctx.decodeAudioData(bytes); } catch (err) { this.onError?.(err); continue; }
      if (gen !== this.gen) return;
      await new Promise((resolve) => {
        const src = this.ctx.createBufferSource();
        src.buffer = audio;
        src.connect(this.analyser);
        src.onended = resolve;
        this.current = src;
        src.start();
        this.onStart?.(tag);
      });
      this.current = null;
    }
    if (gen === this.gen) {
      this.playing = false;
      this.onIdle?.();
    }
  }

  stop() {
    this.gen++;
    this.queue = [];
    try { this.current?.stop(); } catch { /* already stopped */ }
    this.current = null;
    this.playing = false;
  }
}

// Speaks sentences with the browser's own speech engine (Web Speech API), so
// there is no process to start per sentence. Only voices the browser marks as
// local are ever used: Chrome also lists network voices that would send the
// text off this Mac, and an utterance with no voice set could pick one.
// The audio never passes through Web Audio, so there is no loudness to read;
// getLevel() pulses on the engine's real word-boundary events instead.
export class BrowserSpeaker {
  constructor({ onStart, onIdle, onError } = {}) {
    this.onStart = onStart;
    this.onIdle = onIdle;
    this.onError = onError;
    this.synth = window.speechSynthesis || null;
    this.voiceName = '';
    this.live = new Set(); // keeps utterances referenced until they end
    this.playing = false;
    this.speaking = false;
    this.lastWord = 0;
    this.gen = 0;
    this.unlocked = false;
  }

  voices() {
    if (!this.synth) return [];
    return this.synth.getVoices().filter((v) => v.localService && v.lang.replace('_', '-').startsWith('en'));
  }

  onVoices(fn) { this.synth?.addEventListener('voiceschanged', fn); }

  pick() {
    const list = this.voices();
    return list.find((v) => v.name === this.voiceName) || list.find((v) => v.name === 'Samantha') || list[0] || null;
  }

  get available() { return !!this.pick(); }

  // Safari only lets speech start from a user gesture; a silent utterance
  // during the key press or click opens it for the rest of the session.
  unlock() {
    const voice = this.pick();
    if (this.unlocked || !voice) return;
    this.unlocked = true;
    const u = new SpeechSynthesisUtterance(' ');
    u.voice = voice;
    u.volume = 0;
    this.synth.speak(u);
  }

  getLevel = () => {
    if (!this.speaking) return 0;
    return Math.max(0, 1 - (performance.now() - this.lastWord) / 260) * 0.85;
  };

  enqueue(text) {
    const voice = this.pick();
    if (!voice) { this.onError?.(new Error('no local voice available for browser speech')); return; }
    const gen = this.gen;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    const finish = () => {
      if (!this.live.delete(u) || gen !== this.gen) return;
      this.speaking = false;
      if (!this.live.size) { this.playing = false; this.onIdle?.(); }
    };
    // Chrome fires `start` when speech is requested, before any sound. The
    // first word-boundary event is when audio really begins, so that is what
    // counts as started. A voice that sends no word events falls back to a
    // fixed delay after `start`, which over-reports latency, never under.
    let begun = false;
    let fallback = null;
    const begin = () => {
      clearTimeout(fallback);
      if (begun || gen !== this.gen) return;
      begun = true;
      this.speaking = true;
      this.lastWord = performance.now();
      this.onStart?.(text);
    };
    u.onstart = () => { fallback = setTimeout(begin, 500); };
    u.onboundary = () => {
      if (gen !== this.gen) return;
      if (begun) this.lastWord = performance.now();
      else begin();
    };
    u.onend = () => { clearTimeout(fallback); finish(); };
    u.onerror = (e) => {
      if (gen === this.gen && e.error !== 'interrupted' && e.error !== 'canceled') this.onError?.(new Error(`browser speech: ${e.error}`));
      finish();
    };
    this.live.add(u);
    this.playing = true;
    this.synth.speak(u);
  }

  stop() {
    this.gen++;
    this.live.clear();
    this.playing = false;
    this.speaking = false;
    this.synth?.cancel();
  }
}
