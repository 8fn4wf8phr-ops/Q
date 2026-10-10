import { QCore } from './core.js';
import { Recorder, Player, BrowserSpeaker, blobToWav16k, micName } from './audio.js';
import { takeChunks } from './chunk.js';
import { SCHEMA, MAX_RUNS, MIN_FOR_P90, IDLE_MS, kindOf, summarize, buildExport } from './stats.js';

// What this page needs from the server (server.js API_LEVEL). A server started
// before an update keeps serving new pages until it is restarted.
const NEEDS_API = 2;

const $ = (sel) => document.querySelector(sel);
const els = {
  canvas: $('#core'),
  stage: $('#stage'),
  stateText: $('#stateText'),
  stateDetail: $('#stateDetail'),
  statePill: $('#statePill'),
  log: $('#log'),
  form: $('#composer'),
  input: $('#input'),
  mic: $('#mic'),
  stop: $('#stop'),
  clock: $('#clock'),
  status: $('#statusRows'),
  netNote: $('#netNote'),
  v2v: $('#v2v'),
  v2vVerdict: $('#v2vVerdict'),
  breakdown: $('#breakdown'),
  latRows: $('#latRows'),
  history: $('#history'),
  historyNote: $('#historyNote'),
  voice: $('#voice'),
  v2vLabel: $('#v2vLabel'),
  copyRuns: $('#copyRuns'),
  clearRuns: $('#clearRuns'),
  copyNote: $('#copyNote'),
  runData: $('#runData'),
  engine: $('#engine'),
  engineNote: $('#engineNote'),
  speak: $('#speak'),
  clauseFirst: $('#clauseFirst'),
  empty: $('#empty'),
};

const store = {
  get(k, d) { try { const v = localStorage.getItem(`q.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`q.${k}`, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const core = new QCore(els.canvas, { reducedMotion });
core.start();

const recorder = new Recorder();
// Two ways to speak, same callbacks: `player` plays WAVs the server made with
// `say`; `speaker` uses the browser's own speech engine (local voices only).
const speechEvents = {
  onStart: () => {
    if (turn && turn.tFirstAudio == null) { turn.tFirstAudio = performance.now(); renderLatency(); sampleSystem(turn); }
    setPhase('speaking');
  },
  onIdle: () => {
    if (turn && !turn.streamDone) setPhase('thinking');
    else finishTurn();
  },
  onError: (err) => console.warn('[q] playback', err),
};
const player = new Player(speechEvents);
const speaker = new BrowserSpeaker(speechEvents);
const out = () => (S.engine === 'browser' ? speaker : player);
const canSpeak = () => (S.engine === 'browser' ? speaker.available : !!S.status?.tts?.available);
const stopSpeech = () => { player.stop(); speaker.stop(); synthChain = Promise.resolve(); };
const unlockSpeech = () => { player.unlock(); if (S.engine === 'browser') speaker.unlock(); };

const S = {
  phase: 'boot',
  status: null,
  messages: [],
  abort: null,
  ptt: false,
  arming: null,
  speak: store.get('speak', true),
  clauseFirst: store.get('clauseFirst', true),
  voice: store.get('voice', ''),
  engine: store.get('engine', 'say'),
  browserVoice: store.get('browserVoice', ''),
  runs: store.get('runs', []).filter((r) => r && r.v === SCHEMA), // older entries lack the per-stage fields
};
let turn = null;

// ---------- phase / state label ----------

const PHASES = {
  boot:         { core: 'boot',      label: 'Starting',      pill: '' },
  offline:      { core: 'offline',   label: 'Not ready',     pill: 'warn' },
  warming:      { core: 'boot',      label: 'Warming up',    pill: 'busy' },
  idle:         { core: 'idle',      label: 'Ready',         pill: 'ok' },
  arming:       { core: 'idle',      label: 'Opening mic',   pill: '' },
  listening:    { core: 'listening', label: 'Listening',     pill: 'live' },
  transcribing: { core: 'thinking',  label: 'Transcribing',  pill: 'busy' },
  thinking:     { core: 'thinking',  label: 'Thinking',      pill: 'busy' },
  speaking:     { core: 'speaking',  label: 'Speaking',      pill: 'live' },
  error:        { core: 'error',     label: 'Error',         pill: 'err' },
};

function setPhase(phase, detail) {
  S.phase = phase;
  const p = PHASES[phase];
  core.setState(p.core);
  core.setLevelSource(phase === 'listening' ? recorder.getLevel : phase === 'speaking' ? out().getLevel : null);
  els.stateText.textContent = p.label;
  els.statePill.dataset.kind = p.pill;
  els.stage.dataset.phase = phase;
  if (detail !== undefined) els.stateDetail.textContent = detail;
  else els.stateDetail.textContent = defaultDetail(phase);
  els.stop.hidden = !['transcribing', 'thinking', 'speaking'].includes(phase);
}

function defaultDetail(phase) {
  switch (phase) {
    case 'warming': return `Loading ${S.status?.model ?? 'the model'} into memory — the first reply will be slow`;
    case 'idle': return 'Hold Space or the mic to talk';
    case 'arming': return 'Waiting for microphone access';
    case 'listening': return 'Release to send';
    case 'transcribing': return `whisper.cpp · ${S.status?.stt?.model ?? ''}`;
    case 'thinking': return S.status?.model ? `${S.status.model} generating locally` : '';
    case 'speaking': return 'Esc or Space to interrupt';
    default: return '';
  }
}

function ready() {
  const o = S.status?.ollama;
  return !!(o?.reachable && o.modelInstalled);
}

const warming = () => S.status?.warmup?.state === 'warming';

function settle() {
  if (!ready()) setPhase('offline', offlineReason());
  else if (warming()) setPhase('warming');
  else setPhase('idle');
}

function offlineReason() {
  const o = S.status?.ollama;
  if (!S.status) return 'Q server not reachable — run npm start';
  if (!o?.reachable) return 'Ollama isn’t running — open the Ollama app';
  if (!o.modelInstalled) return `Model missing — run: ollama pull ${S.status.model}`;
  return '';
}

// ---------- status ----------

// ---------- microphone ----------
// Which microphone Q is recording through. The browser picks it, and macOS can
// switch it without asking (an iPhone nearby becomes a Continuity microphone),
// so Q shows the device it actually opened and says when that changes.

const mic = { name: null, source: null, changed: false };
const WIRELESS = /iphone|ipad|airpods|bluetooth|hands-free|headset/i;

function setMic(name, source) {
  if (!name) return;
  if (mic.name && name !== mic.name) {
    mic.changed = true;
    systemNote(source === 'recording' ? `Microphone changed: ${mic.name} → ${name}` : `The default microphone is now ${name} (was ${mic.name})`, 'err');
  } else if (mic.source === 'recording' && source === 'default') {
    return; // same device, and "used for your last recording" is the stronger fact
  }
  mic.name = name;
  mic.source = source;
  renderStatus();
}

// Before the first recording, and whenever devices are plugged in or removed,
// ask the browser which input is the system default. Names stay hidden until
// the microphone has been allowed once.
async function checkDefaultMic() {
  try {
    const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    setMic(micName((inputs.find((d) => d.deviceId === 'default') || inputs[0])?.label), 'default');
  } catch { /* device list unavailable */ }
}

function micRow() {
  if (!mic.name) return row('Mic', 'not known yet', { kind: 'idle', text: 'Unknown' }, 'the browser shows its name after the first recording');
  const note = WIRELESS.test(mic.name) ? ' · phone or wireless mic: often slower to start and lower quality' : '';
  const sub = (mic.source === 'recording' ? 'used for your last recording' : 'system default · used on the next press') + (mic.changed ? ' · changed this session' : '') + note;
  const badge = note ? { kind: 'warn', text: 'Check' } : mic.source === 'recording' ? { kind: 'ok', text: 'In use' } : { kind: 'idle', text: 'Default' };
  return row('Mic', escapeHtml(mic.name), badge, sub);
}

function fmtBytes(n) {
  if (n == null) return '—';
  const gb = n / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(n / 1024 ** 2).toFixed(0)} MB`;
}

function row(label, value, state, sub) {
  return `<div class="srow"><span class="slabel">${label}</span><span class="sval">${value}${sub ? `<small>${sub}</small>` : ''}</span><span class="badge" data-kind="${state.kind}">${state.text}</span></div>`;
}

const SERVER_ENGINES = { helper: 'macOS voice, kept loaded', say: 'macOS say' };

function renderStatus() {
  const s = S.status;
  if (!s) {
    els.status.innerHTML = row('Q server', 'unreachable', { kind: 'err', text: 'Down' });
    return;
  }
  const stale = (s.api ?? 0) < NEEDS_API;
  const o = s.ollama;
  const brain = !o.reachable ? { kind: 'err', text: 'No Ollama' }
    : !o.modelInstalled ? { kind: 'warn', text: 'Not pulled' }
    : warming() ? { kind: 'idle', text: 'Loading' }
    : o.modelLoaded ? { kind: 'ok', text: 'Loaded' } : { kind: 'idle', text: 'Installed' };
  const meta = [o.parameterSize, o.quantization].filter(Boolean).join(' · ');
  const ears = s.stt.ready ? { kind: 'ok', text: s.stt.mode === 'server' ? 'Ready' : 'Ready (slow)' } : { kind: 'warn', text: 'Missing' };
  const voice = canSpeak() ? { kind: 'ok', text: 'Ready' } : { kind: 'warn', text: 'Missing' };
  const voiceRow = S.engine === 'browser'
    ? row('Voice', 'Browser speech', voice, speaker.available ? `${speaker.pick().name} · local voice` : 'no local voice in this browser')
    : row('Voice', SERVER_ENGINES[s.tts.engine] || s.tts.engine, voice, s.tts.available ? [S.voice || s.tts.defaultVoice || 'system default voice', s.tts.note].filter(Boolean).join(' · ') : s.tts.error);
  els.status.innerHTML = [
    stale ? row('Update', 'Q’s server is older than this page', { kind: 'warn', text: 'Restart Q' }, 'some features and measurements are off until then') : '',
    row('Brain', s.model, brain, meta || (o.reachable ? '' : 'start the Ollama app')),
    micRow(),
    row('Ears', `whisper.cpp`, ears, s.stt.ready ? `${s.stt.model.replace(/^ggml-|\.bin$/g, '')} · ${s.stt.mode === 'server' ? 'kept loaded' : 'reloads each turn'}` : s.stt.error),
    voiceRow,
    row('Model memory', fmtBytes(o.loadedVramBytes), { kind: 'idle', text: o.modelLoaded ? 'Measured' : 'Not loaded' }, 'reported by Ollama'),
    row('Q server', fmtBytes(s.server.rssBytes), { kind: 'idle', text: 'Measured' }, `process RSS · pid ${s.server.pid}`),
  ].join('');
}

let warmPoll = null;
async function refreshStatus() {
  clearTimeout(warmPoll);
  try {
    const r = await fetch('/api/status');
    S.status = await r.json();
  } catch {
    S.status = null;
  }
  renderStatus();
  if (['boot', 'offline', 'warming', 'idle'].includes(S.phase)) settle();
  if (warming()) warmPoll = setTimeout(refreshStatus, 1000);
}

async function loadVoices() {
  els.engine.value = S.engine;
  if (S.engine === 'browser') {
    const voices = speaker.voices();
    const def = voices.find((v) => v.name === 'Samantha') || voices[0];
    els.voice.innerHTML = [`<option value="">${def ? `Default (${escapeHtml(def.name)})` : 'No local voice found'}</option>`]
      .concat(voices.map((v) => `<option value="${escapeAttr(v.name)}">${escapeHtml(v.name)} · ${v.lang}</option>`)).join('');
    els.voice.value = voices.some((v) => v.name === S.browserVoice) ? S.browserVoice : '';
    els.voice.disabled = !voices.length;
    els.engineNote.textContent = voices.length
      ? 'Spoken by this browser using voices installed on this Mac. The core pulses on spoken words, not loudness.'
      : 'This browser reports no local English voice, so Q stays silent in this mode.';
    return;
  }
  els.engineNote.textContent = S.status?.tts?.engine === 'helper'
    ? 'Each sentence is rendered by Q’s speech helper, which stays loaded, then played here. The core follows the audio’s loudness.'
    : `Each sentence is rendered by a new macOS say process, then played here. ${S.status?.tts?.note ? 'The faster speech helper isn’t running. ' : ''}The core follows the audio’s loudness.`;
  try {
    const { voices } = await (await fetch('/api/voices')).json();
    const def = S.status?.tts?.defaultVoice;
    const opts = [`<option value="">${def ? `Default (${escapeHtml(def)})` : 'System default'}</option>`]
      .concat(voices.map((v) => `<option value="${escapeAttr(v.name)}">${escapeHtml(v.name)} · ${v.lang}</option>`));
    els.voice.innerHTML = opts.join('');
    els.voice.value = voices.some((v) => v.name === S.voice) ? S.voice : '';
    els.voice.disabled = !voices.length;
  } catch {
    els.voice.disabled = true;
  }
}

// ---------- conversation log ----------

function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }

function addBubble(who, text = '', meta = '') {
  els.empty.hidden = true;
  const el = document.createElement('div');
  el.className = `msg ${who}`;
  el.innerHTML = `${who === 'q' ? '<span class="avatar" aria-hidden="true"></span>' : ''}<div class="bubble"><p></p>${meta ? `<span class="meta">${meta}</span>` : ''}</div>`;
  el.querySelector('p').textContent = text;
  els.log.appendChild(el);
  els.log.scrollTop = els.log.scrollHeight;
  return el;
}

function setBubble(el, text, { streaming = false, meta } = {}) {
  el.querySelector('p').textContent = text;
  el.classList.toggle('streaming', streaming);
  if (meta !== undefined) {
    let m = el.querySelector('.meta');
    if (!m) { m = document.createElement('span'); m.className = 'meta'; el.querySelector('.bubble').appendChild(m); }
    m.textContent = meta;
  }
  els.log.scrollTop = els.log.scrollHeight;
}

function systemNote(text, kind = '') {
  els.empty.hidden = true;
  const el = document.createElement('div');
  el.className = `note ${kind}`;
  el.textContent = text;
  els.log.appendChild(el);
  els.log.scrollTop = els.log.scrollHeight;
}

// ---------- streaming speech ----------

// `say` requests run one at a time: parallel `say` processes slow each other,
// which delays the first sentence. Later ones still overlap playback.
let synthChain = Promise.resolve();

function speakSentence(text) {
  if (!S.speak || !canSpeak()) return;
  const t = turn;
  if (t && t.tFirstSentence == null) t.tFirstSentence = performance.now();
  if (S.engine === 'browser') { speaker.enqueue(text); return; }
  const signal = S.abort?.signal;
  let sentAt;
  const p = synthChain.then(() => {
    sentAt = performance.now();
    return fetch('/api/speak', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice: S.voice }),
      signal,
    });
  }).then(async (r) => {
    if (r.status === 204) return null;
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `speak HTTP ${r.status}`);
    if (t && t.synthMs == null) t.synthMs = Number(r.headers.get('x-q-synth-ms')) || performance.now() - sentAt;
    return r.arrayBuffer();
  });
  synthChain = p.then(() => {}, () => {});
  player.enqueue(p);
}

// ---------- a turn ----------

// t0 is key release for voice turns and Enter for typed ones.
let lastTurnEnd = null;
function newTurn(source, t0 = performance.now()) {
  return { source, t0, streamDone: false, idleMs: lastTurnEnd == null ? null : t0 - lastTurnEnd };
}

// Memory and power figures for the run data, fetched once per turn after audio
// has started so the sample itself never delays Q's reply.
let prevSys = null;
async function sampleSystem(t) {
  if (t.sysAsked) return;
  t.sysAsked = true;
  try {
    const r = await fetch('/api/system');
    if (!r.ok) throw new Error(`system HTTP ${r.status}`);
    const now = await r.json();
    const since = (key) => (prevSys && now[key] != null && prevSys[key] != null ? now[key] - prevSys[key] : null);
    t.sys = { ...now, decompressedMb: since('decompressedTotalMb'), pageinsMb: since('pageinsTotalMb'), swapinsMb: since('swapinsTotalMb') };
    prevSys = now;
    if (t.run) { t.run.sys = t.sys; store.set('runs', S.runs); }
  } catch { /* the run is still recorded, without a system sample */ }
}

async function runTurn(text) {
  const t = turn;
  S.messages.push({ role: 'user', content: text, at: Date.now() });
  t.userPushed = true;
  addBubble('user', text, t.source === 'voice' ? `heard · ${(t.sttMs / 1000).toFixed(2)} s` : '');
  const bubble = addBubble('q');
  t.bubble = bubble;
  bubble.classList.add('streaming');
  setPhase('thinking');

  const controller = new AbortController();
  S.abort = controller;
  let full = '';
  let pending = '';
  t.tChat = performance.now();
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: S.messages }),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`chat HTTP ${r.status}`);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.type === 'token') {
          if (t.tFirstToken == null) { t.tFirstToken = performance.now(); renderLatency(); }
          full += msg.text;
          pending += msg.text;
          setBubble(bubble, full, { streaming: true });
          const cut = takeChunks(pending, S.clauseFirst && !t.firstChunk);
          pending = cut.rest;
          if (cut.chunks.length && !t.firstChunk) t.firstChunk = cut.clause ? 'clause' : 'sentence';
          cut.chunks.forEach(speakSentence);
        } else if (msg.type === 'done') {
          t.stats = msg.stats;
        } else if (msg.type === 'error') {
          throw new Error(msg.message);
        }
      }
    }
    if (pending.trim()) speakSentence(pending.trim());
    S.messages.push({ role: 'assistant', content: full });
    t.streamDone = true;
    const st = t.stats;
    setBubble(bubble, full || '(no reply)', {
      streaming: false,
      meta: st ? `${st.evalTokens} tokens · ${st.tokPerSec ? st.tokPerSec.toFixed(1) : '—'} tok/s${coldMs(st) ? ` · cold start ${(coldMs(st) / 1000).toFixed(1)} s` : st.idleMs >= IDLE_MS ? ` · after ${(st.idleMs / 60000).toFixed(1)} min idle` : ''}` : '',
    });
    renderLatency();
    if (!out().playing) finishTurn();
  } catch (err) {
    if (err.name === 'AbortError') return;
    t.streamDone = true;
    bubble.remove();
    S.messages.pop();
    fail(err.message);
  }
}

function finishTurn() {
  if (!turn) { if (['speaking', 'thinking'].includes(S.phase)) settle(); return; }
  if (!turn.streamDone) return;
  recordTurn(turn);
  turn = null;
  S.abort = null;
  settle();
}

// Numbers only: nothing said or heard is ever stored here.
function recordTurn(t) {
  if (t.recorded) return;
  t.recorded = true;
  const st = t.stats || {};
  const heardAt = t.source === 'voice' ? t.tStt : t.t0;
  const span = (to, from) => (to != null && from != null ? to - from : null);
  t.run = {
    v: SCHEMA,
    at: Date.now(),
    source: t.source,
    engine: S.engine === 'browser' ? 'browser' : (S.status?.tts?.engine ?? 'say'),
    cold: coldMs(st) > 0,
    total: span(t.tFirstAudio, t.t0),
    stt: t.source === 'voice' ? span(t.tStt, t.t0) : null,
    firstToken: span(t.tFirstToken, heardAt),
    firstSentence: span(t.tFirstSentence, t.tFirstToken),
    voiceSynth: span(t.tFirstAudio, t.tFirstSentence),
    promptMs: st.promptMs ?? null,
    promptTokens: st.promptTokens ?? null,
    loadMs: st.loadMs ?? null,
    warmupWaitMs: st.warmupWaitMs ?? null,
    evalTokens: st.evalTokens ?? null,
    tokPerSec: st.tokPerSec ?? null,
    captureMs: t.captureMs ?? null,
    levelDb: t.level?.peakDb ?? null,
    loudMs: t.level?.loudMs ?? null,
    turnIndex: S.messages.filter((m) => m.role === 'user').length,
    idleMs: st.idleMs ?? t.idleMs,
    firstChunk: t.firstChunk ?? null,
    mic: t.mic ?? null,
    sys: t.sys ?? null,
  };
  S.runs = [...S.runs, t.run].slice(-MAX_RUNS);
  store.set('runs', S.runs);
  lastTurnEnd = performance.now();
  sampleSystem(t);
  renderLatency();
  renderHistory();
}

function interrupt(reason = 'interrupted') {
  const wasBusy = ['transcribing', 'thinking', 'speaking'].includes(S.phase);
  S.abort?.abort();
  S.abort = null;
  stopSpeech();
  // Cut off while speaking a finished reply: its timings are complete, keep them.
  if (turn && turn.streamDone && turn.stats && turn.tFirstAudio != null) recordTurn(turn);
  if (turn && turn.userPushed && !turn.streamDone) {
    const b = turn.bubble;
    const partial = b?.querySelector('p')?.textContent || '';
    S.messages.push({ role: 'assistant', content: partial ? `${partial} [${reason}]` : `[${reason} before replying]` });
    if (b) setBubble(b, partial || '…', { streaming: false, meta: reason });
  }
  turn = null;
  if (wasBusy) settle();
}

function fail(message) {
  setPhase('error', message);
  systemNote(message, 'err');
  turn = null;
  S.abort = null;
  setTimeout(() => { if (S.phase === 'error') refreshStatus().then(settle); }, 4000);
}

// ---------- push to talk ----------

async function pttDown() {
  if (S.ptt) return;
  if (!ready()) { setPhase('offline', offlineReason()); return; }
  if (!S.status?.stt?.ready) { fail('Speech-to-text isn’t set up yet — run npm run setup. You can still type.'); return; }
  interrupt();
  S.ptt = true;
  unlockSpeech();
  els.mic.classList.add('held');
  setPhase('arming');
  S.arming = recorder.start()
    .then(() => { setMic(recorder.deviceName, 'recording'); if (S.ptt) setPhase('listening'); })
    .catch((err) => { S.ptt = false; els.mic.classList.remove('held'); fail(`Microphone unavailable: ${err.message}`); throw err; });
}

async function pttUp() {
  if (!S.ptt) return;
  const released = performance.now();
  S.ptt = false;
  els.mic.classList.remove('held');
  try { await S.arming; } catch { return; }
  const result = await recorder.stop();
  if (!result) return settle();
  if (result.durationMs < 300) { settle(); els.stateDetail.textContent = 'Too short — hold while you talk'; return; }
  const t = newTurn('voice', released);
  turn = t;
  t.mic = recorder.deviceName;
  t.captureMs = result.durationMs;
  setPhase('transcribing');
  try {
    const { wav, level } = await blobToWav16k(result.blob);
    t.level = level;
    console.info('[q] input level', level);
    if (!level.hasSpeech) {
      // Near-silent clip: Whisper would invent words, so it isn't asked.
      turn = null;
      settle();
      els.stateDetail.textContent = `Didn’t hear anything (loudest ${fmtDb(level.peakDb)}) — try again`;
      return;
    }
    const tSent = performance.now();
    const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav });
    const data = await r.json();
    if (turn !== t) return; // interrupted while transcribing
    if (!r.ok) throw new Error(data.error || `transcribe HTTP ${r.status}`);
    turn.tStt = performance.now();
    turn.sttMs = turn.tStt - turn.t0;
    turn.sttEngineMs = data.ms;
    turn.encodeMs = tSent - turn.t0;
    if (!data.text) { turn = null; settle(); els.stateDetail.textContent = 'Didn’t catch that — try again'; return; }
    renderLatency();
    await runTurn(data.text);
  } catch (err) {
    if (turn === t) fail(err.message);
  }
}

// ---------- latency panel ----------

const fmtS = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(2)} s`);
const fmtDb = (db) => (Number.isFinite(db) ? `${db.toFixed(0)} dB` : 'silence');
// Cold = the model was loaded for this turn, or the turn waited on the startup warm-up.
const coldMs = (st) => (st.loadMs > 300 ? st.loadMs : 0) + (st.warmupWaitMs || 0);
// warm / idle / cold for the panel, from the same rule the statistics use.
function loadLabel(st) {
  if (coldMs(st)) return `${(coldMs(st) / 1000).toFixed(1)} s (cold${st.warmupWaitMs ? ', waited on warm-up' : ''})`;
  if (st.idleMs >= IDLE_MS) return `idle · ${(st.idleMs / 60000).toFixed(1)} min since last use`;
  return 'warm';
}
function verdict(ms) {
  if (ms == null) return { kind: 'idle', text: 'No data yet' };
  if (ms < 1500) return { kind: 'ok', text: 'Feels live' };
  if (ms < 3000) return { kind: 'warn', text: 'Noticeable' };
  return { kind: 'err', text: 'Sluggish' };
}

let shownTurn = null;
function renderLatency() {
  if (turn) shownTurn = turn;
  const t = shownTurn;
  if (!t) return;
  const end = t.tFirstAudio;
  const v2v = end != null ? end - t.t0 : null;
  els.v2vLabel.textContent = t.source === 'voice' ? 'Key release → first audio' : 'Enter → first audio';
  els.v2v.textContent = v2v != null ? (v2v / 1000).toFixed(2) : '-.--';
  const v = verdict(v2v);
  els.v2vVerdict.dataset.kind = v.kind;
  els.v2vVerdict.textContent = v2v != null ? v.text : (t.streamDone && !S.speak ? 'Voice off' : 'Measuring…');

  const heardAt = t.source === 'voice' ? t.tStt : t.t0;
  const segs = [
    { key: 'hear', label: 'Speech → text', ms: t.source === 'voice' && t.tStt ? t.tStt - t.t0 : null },
    { key: 'think', label: 'First token', ms: t.tFirstToken && heardAt ? t.tFirstToken - heardAt : null },
    { key: 'form', label: 'First phrase', ms: t.tFirstSentence && t.tFirstToken ? t.tFirstSentence - t.tFirstToken : null },
    { key: 'voice', label: 'Voice synth', ms: t.tFirstAudio && t.tFirstSentence ? t.tFirstAudio - t.tFirstSentence : null },
  ];
  const total = segs.reduce((a, s) => a + (s.ms || 0), 0) || 1;
  els.breakdown.innerHTML = segs.map((s) => `<span class="seg ${s.key}" style="flex:${s.ms ? Math.max(s.ms / total, 0.02) : 0}" title="${s.label}: ${fmtS(s.ms)}"></span>`).join('');
  const st = t.stats;
  els.latRows.innerHTML = segs.map((s) => `<div class="lrow"><span class="key ${s.key}"></span><span>${s.label}</span><b>${fmtS(s.ms)}</b></div>`).join('')
    + `<div class="lrow plain"><span></span><span>Prompt processing</span><b>${st ? `${fmtS(st.promptMs)} · ${st.promptTokens} tokens` : '—'}</b></div>`
    + `<div class="lrow plain"><span></span><span>Generation speed</span><b>${st?.tokPerSec ? `${st.tokPerSec.toFixed(1)} tok/s` : '—'}</b></div>`
    + `<div class="lrow plain"><span></span><span>Model load this turn</span><b>${st ? loadLabel(st) : '—'}</b></div>`
    + (t.source === 'voice' ? `<div class="lrow plain"><span></span><span>You spoke for</span><b>${fmtS(t.captureMs)}</b></div>` : '')
    + (t.level ? `<div class="lrow plain"><span></span><span>Input level</span><b>${fmtDb(t.level.peakDb)} · ${fmtS(t.level.loudMs)} of sound</b></div>` : '');
}

function renderHistory() {
  els.copyRuns.disabled = els.clearRuns.disabled = !S.runs.length;
  const runs = S.runs.filter((r) => r.total != null).slice(-24);
  if (!runs.length) { els.history.innerHTML = ''; els.historyNote.textContent = 'Key release → first audio for your turns will show here.'; return; }
  const max = Math.max(...runs.map((r) => r.total), 3000);
  els.history.innerHTML = runs.map((r) => {
    const v = verdict(r.total);
    return `<span class="hbar" data-kind="${v.kind}" style="height:${Math.max(6, (r.total / max) * 100)}%" title="${fmtS(r.total)} · ${r.source} · ${kindOf(r)}${r.engine ? ` · ${r.engine}` : ''}"></span>`;
  }).join('');
  const s = summarize(S.runs);
  const part = (label, g) => (g.n ? `${label} p50 ${fmtS(g.p50)} · p90 ${g.p90 != null ? fmtS(g.p90) : `needs ${MIN_FOR_P90} turns`} (${g.n})` : `${label} no turns yet`);
  els.historyNote.textContent = `${part('Warm', s.warm)} — ${part(`Idle ${IDLE_MS / 60000}+ min`, s.idle)} — ${part('Cold', s.cold)} — voice turns only · target under 1.50 s`;
}

function runHeader() {
  const s = S.status;
  return {
    qVersion: s?.version,
    model: s?.model,
    whisperModel: s?.stt?.model,
    serverVoiceEngine: s?.tts?.engine,
    voiceEngine: S.engine === 'browser' ? 'browser' : 'server',
    browser: navigator.userAgent,
    historyTurns: s?.history?.turns,
    historyChars: s?.history?.chars,
    modelMemoryMb: s?.ollama?.loadedVramBytes != null ? s.ollama.loadedVramBytes / 1024 ** 2 : null,
  };
}

async function copyRunData() {
  const text = JSON.stringify(buildExport(S.runs, runHeader()), null, 1);
  els.runData.hidden = true;
  try {
    await navigator.clipboard.writeText(text);
    const missing = S.runs.filter((r) => !r.sys).length;
    els.copyNote.textContent = `Copied ${S.runs.length} turn${S.runs.length > 1 ? 's' : ''} · timings only${missing ? ` · ${missing} without memory figures` : ''}`;
  } catch {
    // Clipboard blocked: show the same text to copy by hand.
    els.runData.value = text;
    els.runData.hidden = false;
    els.runData.select();
    els.copyNote.textContent = 'Clipboard unavailable — copy from the box';
  }
}

// ---------- input wiring ----------

const typing = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') { interrupt(); return; }
  if (e.code === 'Space' && !typing(e)) {
    e.preventDefault();
    if (!e.repeat) pttDown();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !typing(e)) { e.preventDefault(); pttUp(); }
});
window.addEventListener('blur', () => { if (S.ptt) pttUp(); });

els.mic.addEventListener('pointerdown', (e) => { e.preventDefault(); els.mic.setPointerCapture(e.pointerId); pttDown(); });
els.mic.addEventListener('pointerup', () => pttUp());
els.mic.addEventListener('pointercancel', () => pttUp());
els.mic.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } });

els.stop.addEventListener('click', () => interrupt());
els.canvas.addEventListener('click', () => { if (['thinking', 'speaking', 'transcribing'].includes(S.phase)) interrupt(); });

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = els.input.value.trim();
  if (!text) return;
  if (!ready()) { setPhase('offline', offlineReason()); return; }
  interrupt();
  unlockSpeech();
  els.input.value = '';
  turn = newTurn('text');
  runTurn(text);
});

els.copyRuns.addEventListener('click', copyRunData);
els.clearRuns.addEventListener('click', () => {
  if (!confirm(`Clear the stored timings for ${S.runs.length} turn${S.runs.length > 1 ? 's' : ''}?`)) return;
  S.runs = [];
  store.set('runs', S.runs);
  els.runData.hidden = true;
  els.copyNote.textContent = '';
  renderHistory();
});

els.clauseFirst.checked = S.clauseFirst;
els.clauseFirst.addEventListener('change', () => { S.clauseFirst = els.clauseFirst.checked; store.set('clauseFirst', S.clauseFirst); });
els.speak.checked = S.speak;
els.speak.addEventListener('change', () => { S.speak = els.speak.checked; store.set('speak', S.speak); if (!S.speak) stopSpeech(); });
els.voice.addEventListener('change', () => {
  if (S.engine === 'browser') { S.browserVoice = els.voice.value; store.set('browserVoice', S.browserVoice); speaker.voiceName = S.browserVoice; }
  else { S.voice = els.voice.value; store.set('voice', S.voice); }
  renderStatus();
});
els.engine.addEventListener('change', () => {
  interrupt();
  S.engine = els.engine.value;
  store.set('engine', S.engine);
  renderStatus();
  loadVoices().then(renderStatus);
});
speaker.voiceName = S.browserVoice;
// Browsers fill their voice list late; redraw when it arrives.
speaker.onVoices(() => { if (S.engine === 'browser') loadVoices().then(renderStatus); });

function tickClock() {
  els.clock.textContent = new Date().toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
tickClock();
setInterval(tickClock, 15_000);

navigator.mediaDevices?.addEventListener?.('devicechange', checkDefaultMic);

setPhase('boot');
renderHistory();
await refreshStatus();
checkDefaultMic();
loadVoices();
setInterval(() => { if (!document.hidden) refreshStatus(); }, 8000);
