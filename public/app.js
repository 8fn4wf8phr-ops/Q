import { QCore } from './core.js';
import { Recorder, Player, BrowserSpeaker, blobToWav16k } from './audio.js';

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
  engine: $('#engine'),
  engineNote: $('#engineNote'),
  speak: $('#speak'),
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
    if (turn && turn.tFirstAudio == null) { turn.tFirstAudio = performance.now(); renderLatency(); }
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
  voice: store.get('voice', ''),
  engine: store.get('engine', 'say'),
  browserVoice: store.get('browserVoice', ''),
  runs: store.get('runs', []),
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
    row('Brain', s.model, brain, meta || (o.reachable ? '' : 'start the Ollama app')),
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

// ---------- sentence chunking for streaming speech ----------

function takeSentences(buf) {
  const out = [];
  const re = /[.!?…]+["'”’)\]]*\s+|\n+/g;
  let last = 0;
  let m;
  while ((m = re.exec(buf))) {
    const end = m.index + m[0].length;
    const s = buf.slice(last, end).trim();
    if (s.replace(/[^\p{L}\p{N}]/gu, '').length >= 2) out.push(s);
    last = end;
  }
  return { sentences: out, rest: buf.slice(last) };
}

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

function newTurn(source) {
  return { source, t0: performance.now(), streamDone: false };
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
          const { sentences, rest } = takeSentences(pending);
          pending = rest;
          sentences.forEach(speakSentence);
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
      meta: st ? `${st.evalTokens} tokens · ${st.tokPerSec ? st.tokPerSec.toFixed(1) : '—'} tok/s${coldMs(st) ? ` · cold start ${(coldMs(st) / 1000).toFixed(1)} s` : ''}` : '',
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
  if (!turn.recorded) {
    turn.recorded = true;
    const v2v = turn.tFirstAudio != null ? turn.tFirstAudio - turn.t0 : null;
    if (v2v != null) {
      S.runs = [...S.runs, { v2v, source: turn.source, engine: S.engine === 'browser' ? 'browser' : (S.status?.tts?.engine ?? 'say'), at: Date.now() }].slice(-12);
      store.set('runs', S.runs);
    }
    renderLatency();
    renderHistory();
  }
  turn = null;
  S.abort = null;
  settle();
}

function interrupt(reason = 'interrupted') {
  const wasBusy = ['transcribing', 'thinking', 'speaking'].includes(S.phase);
  S.abort?.abort();
  S.abort = null;
  stopSpeech();
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
    .then(() => { if (S.ptt) setPhase('listening'); })
    .catch((err) => { S.ptt = false; els.mic.classList.remove('held'); fail(`Microphone unavailable: ${err.message}`); throw err; });
}

async function pttUp() {
  if (!S.ptt) return;
  S.ptt = false;
  els.mic.classList.remove('held');
  try { await S.arming; } catch { return; }
  const result = await recorder.stop();
  if (!result) return settle();
  if (result.durationMs < 300) { settle(); els.stateDetail.textContent = 'Too short — hold while you talk'; return; }
  const t = newTurn('voice');
  turn = t;
  t.captureMs = result.durationMs;
  setPhase('transcribing');
  try {
    const wav = await blobToWav16k(result.blob);
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
// Cold = the model was loaded for this turn, or the turn waited on the startup warm-up.
const coldMs = (st) => (st.loadMs > 300 ? st.loadMs : 0) + (st.warmupWaitMs || 0);
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
  els.v2v.textContent = v2v != null ? (v2v / 1000).toFixed(2) : '-.--';
  const v = verdict(v2v);
  els.v2vVerdict.dataset.kind = v.kind;
  els.v2vVerdict.textContent = v2v != null ? v.text : (t.streamDone && !S.speak ? 'Voice off' : 'Measuring…');

  const heardAt = t.source === 'voice' ? t.tStt : t.t0;
  const segs = [
    { key: 'hear', label: 'Speech → text', ms: t.source === 'voice' && t.tStt ? t.tStt - t.t0 : null },
    { key: 'think', label: 'First token', ms: t.tFirstToken && heardAt ? t.tFirstToken - heardAt : null },
    { key: 'form', label: 'First sentence', ms: t.tFirstSentence && t.tFirstToken ? t.tFirstSentence - t.tFirstToken : null },
    { key: 'voice', label: 'Voice synth', ms: t.tFirstAudio && t.tFirstSentence ? t.tFirstAudio - t.tFirstSentence : null },
  ];
  const total = segs.reduce((a, s) => a + (s.ms || 0), 0) || 1;
  els.breakdown.innerHTML = segs.map((s) => `<span class="seg ${s.key}" style="flex:${s.ms ? Math.max(s.ms / total, 0.02) : 0}" title="${s.label}: ${fmtS(s.ms)}"></span>`).join('');
  const st = t.stats;
  els.latRows.innerHTML = segs.map((s) => `<div class="lrow"><span class="key ${s.key}"></span><span>${s.label}</span><b>${fmtS(s.ms)}</b></div>`).join('')
    + `<div class="lrow plain"><span></span><span>Prompt processing</span><b>${st ? `${fmtS(st.promptMs)} · ${st.promptTokens} tokens` : '—'}</b></div>`
    + `<div class="lrow plain"><span></span><span>Generation speed</span><b>${st?.tokPerSec ? `${st.tokPerSec.toFixed(1)} tok/s` : '—'}</b></div>`
    + `<div class="lrow plain"><span></span><span>Model load this turn</span><b>${st ? (coldMs(st) ? `${(coldMs(st) / 1000).toFixed(1)} s (cold${st.warmupWaitMs ? ', waited on warm-up' : ''})` : 'warm') : '—'}</b></div>`
    + (t.source === 'voice' ? `<div class="lrow plain"><span></span><span>You spoke for</span><b>${fmtS(t.captureMs)}</b></div>` : '');
}

function renderHistory() {
  const runs = S.runs;
  if (!runs.length) { els.history.innerHTML = ''; els.historyNote.textContent = 'Voice-to-voice for your last turns will show here.'; return; }
  const max = Math.max(...runs.map((r) => r.v2v), 3000);
  els.history.innerHTML = runs.map((r) => {
    const v = verdict(r.v2v);
    return `<span class="hbar" data-kind="${v.kind}" style="height:${Math.max(6, (r.v2v / max) * 100)}%" title="${fmtS(r.v2v)} · ${r.source}${r.engine ? ` · ${r.engine}` : ''}"></span>`;
  }).join('');
  const sorted = runs.map((r) => r.v2v).sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  els.historyNote.textContent = `Median ${fmtS(med)} over ${runs.length} turn${runs.length > 1 ? 's' : ''} · target under 1.50 s`;
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

setPhase('boot');
renderHistory();
await refreshStatus();
loadVoices();
setInterval(() => { if (!document.hidden) refreshStatus(); }, 8000);
