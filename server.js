// Q — local voice-loop server.
// Serves the UI and three local endpoints: speech-to-text (whisper.cpp),
// chat (Ollama, streamed) and text-to-speech (Q's speech helper, macOS `say`
// or Piper).
// Binds to 127.0.0.1 only. Makes no calls to any cloud service.
// Every external program is run with execFile/spawn and a fixed argument
// array — never a shell string.

import http from 'node:http';
import { readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEchoFilter } from './echo.js';
import { openHistory } from './history.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');

const DEFAULTS = {
  port: 4141,
  ollamaUrl: 'http://127.0.0.1:11434',
  model: 'llama3.2:3b',
  keepAlive: '30m',
  numCtx: 4096,
  temperature: 0.8,
  historyTurns: 8,
  historyChars: 6000,
  keepWarmSeconds: 120, // ping this often…
  keepWarmMinutes: 15, // …for this long after the last turn (0 turns keep-warm off)
  whisperServerBin: 'whisper-server',
  whisperCliBin: 'whisper-cli',
  whisperModel: 'models/ggml-base.en.bin',
  whisperThreads: 4,
  // Words Whisper should expect, written as ordinary speech. It only nudges
  // spelling of names and jargon; set to '' to turn it off.
  whisperPrompt: 'Hey Q. Yo Q, what\'s good? Q, open VS Code. Ollama, Whisper, MacBook Air, GitHub.',
  whisperPort: 4142,
  // A second Whisper model to compare against, started only when the page asks for it.
  whisperCompareModel: 'models/ggml-small.en.bin',
  whisperComparePort: 4143,
  tts: 'helper', // 'helper' (falls back to 'say' if not built) | 'say' | 'piper' | 'none'
  speechHelperBin: 'bin/q-speak',
  sayVoice: 'Samantha', // falls back to the system voice if not installed
  sayRate: 0,
  piperBin: 'piper',
  piperModel: '',
  // Where conversations are saved. Empty means ~/Library/Application Support/Q/history.sqlite,
  // which is outside this folder so it can never be committed by accident.
  historyFile: '',
  // Where exported conversations are written. Empty means ~/Downloads.
  exportDir: '',
};

const CONFIG = await loadConfig();
// Raised whenever the page starts needing something new from the server, so a
// page served by a server that hasn't been restarted can say so.
const API_LEVEL = 7;
const VERSION = await readFile(path.join(ROOT, 'package.json'), 'utf8').then((t) => JSON.parse(t).version).catch(() => null);
let stopping = false;

// ---------- saved conversations ----------
// What was said is kept in one local file (history.js). It is never added to
// what the model is sent. Old conversations are dropped at start and a few
// times a day.
// (Named `saved` because the chat handler already calls its message list `history`.)
const saved = await openHistory(CONFIG.historyFile);
// After a restart the page carries on the last conversation if it was active this recently.
const RESUME_MS = 6 * 3600_000;
const pruneHistory = () => { try { saved.prune(); } catch (err) { console.warn('[q] history prune failed:', err.message); } };
pruneHistory();
setInterval(pruneHistory, 6 * 3600_000).unref();

// Saved conversations are private. Only Q's own page may read or change them:
// the request has to be addressed to this server by its local name, and come
// from a page this server served, which shuts out other sites and DNS tricks.
function fromOwnPage(req) {
  const hosts = [`127.0.0.1:${CONFIG.port}`, `localhost:${CONFIG.port}`];
  if (!hosts.includes(req.headers.host)) return false;
  const origin = req.headers.origin;
  if (origin && !hosts.some((h) => origin === `http://${h}`)) return false;
  const site = req.headers['sec-fetch-site'];
  return !site || site === 'same-origin' || site === 'none';
}

// Exports go to the Downloads folder under a name that never overwrites an
// earlier file. Returns the path as it should be shown (~/Downloads/…).
async function writeExport(markdown, label) {
  const dir = CONFIG.exportDir || path.join(homedir(), 'Downloads');
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  for (let n = 1; n < 100; n++) {
    const file = path.join(dir, `Q ${label} ${stamp}${n > 1 ? ` (${n})` : ''}.md`);
    try {
      await writeFile(file, markdown, { flag: 'wx', mode: 0o600 }); // wx: fail rather than overwrite
      return file.replace(homedir(), '~');
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
  throw new Error('too many exports with the same name this minute');
}

function historyState(withLatest) {
  return {
    available: saved.available,
    reason: saved.reason,
    file: saved.file ? saved.file.replace(homedir(), '~') : null,
    settings: saved.settings(),
    stats: saved.stats(),
    resumeHours: RESUME_MS / 3600_000,
    ...(withLatest ? { latest: saved.latest(RESUME_MS) } : {}),
  };
}

async function loadConfig() {
  let user = {};
  try {
    user = JSON.parse(await readFile(path.join(ROOT, 'q.config.json'), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[q] could not read q.config.json:', err.message);
  }
  const cfg = { ...DEFAULTS, ...user };
  if (process.env.Q_MODEL) cfg.model = process.env.Q_MODEL;
  if (process.env.Q_PORT) cfg.port = Number(process.env.Q_PORT);
  if (process.env.Q_HISTORY_FILE) cfg.historyFile = process.env.Q_HISTORY_FILE;
  if (!cfg.historyFile) cfg.historyFile = path.join(homedir(), 'Library', 'Application Support', 'Q', 'history.sqlite');
  for (const key of ['whisperModel', 'whisperCompareModel', 'piperModel', 'speechHelperBin']) {
    if (cfg[key] && !path.isAbsolute(cfg[key])) cfg[key] = path.join(ROOT, cfg[key]);
  }
  return cfg;
}

// ---------- process helpers ----------

function run(bin, args, { input, timeoutMs = 60_000 } = {}) {
  return new Promise((resolve) => {
    const started = performance.now();
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ ok: false, code: -1, stdout, stderr: err.message, ms: 0 });
      return;
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, code: -1, stdout, stderr: err.message, ms: performance.now() - started });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr, ms: performance.now() - started });
    });
    if (input != null) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function which(bin) {
  if (!bin) return null;
  if (path.isAbsolute(bin)) {
    try { await access(bin); return bin; } catch { return null; }
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter).concat(['/opt/homebrew/bin', '/usr/local/bin'])) {
    const full = path.join(dir, bin);
    try { await access(full); return full; } catch { /* keep looking */ }
  }
  return null;
}

async function exists(file) {
  if (!file) return false;
  try { await access(file); return true; } catch { return false; }
}

async function withTmp(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'q-'));
  try { return await fn(dir); } finally { rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

// ---------- speech-to-text (whisper.cpp) ----------
// Prefer a long-running whisper-server so the model stays loaded between
// turns; fall back to spawning whisper-cli per request (reloads the model
// every time, noticeably slower).

const stt = { mode: 'none', cliPath: null, serverPath: null, serverProc: null, serverReady: false, lastError: null };

async function initWhisper() {
  stt.cliPath = await which(CONFIG.whisperCliBin);
  stt.serverPath = await which(CONFIG.whisperServerBin);
  const modelOk = await exists(CONFIG.whisperModel);
  if (!modelOk) { stt.mode = 'none'; stt.lastError = `model not found at ${CONFIG.whisperModel}`; return; }
  if (stt.serverPath) {
    stt.serverProc = spawn(stt.serverPath, [
      '-m', CONFIG.whisperModel,
      '--host', '127.0.0.1',
      '--port', String(CONFIG.whisperPort),
      '-t', String(CONFIG.whisperThreads),
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    stt.serverProc.stderr.on('data', () => {});
    stt.serverProc.on('exit', (code) => {
      stt.serverReady = false;
      stt.serverProc = null;
      if (stt.mode === 'server') stt.mode = stt.cliPath ? 'cli' : 'none';
      console.warn(`[q] whisper-server exited (${code}); ${stt.mode === 'cli' ? 'using whisper-cli' : 'no STT available'}`);
    });
    stt.mode = 'server';
    // Poll until it answers (model load can take a couple of seconds).
    for (let i = 0; i < 60 && stt.serverProc; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${CONFIG.whisperPort}/`, { signal: AbortSignal.timeout(500) });
        if (r.status < 500) { stt.serverReady = true; break; }
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (stt.serverReady) return;
    stt.serverProc?.kill();
  }
  stt.mode = stt.cliPath ? 'cli' : 'none';
  if (stt.mode === 'none') stt.lastError = 'whisper-cli / whisper-server not found on PATH';
}

function cleanTranscript(text) {
  return text
    .replace(/\[[^\]]*\]|\([^)]*(music|noise|silence|blank)[^)]*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// One transcription request to a whisper-server on the given port.
async function whisperRequest(port, wav) {
  const started = performance.now();
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  if (CONFIG.whisperPrompt) form.append('prompt', CONFIG.whisperPrompt);
  const r = await fetch(`http://127.0.0.1:${port}/inference`, { method: 'POST', body: form });
  if (!r.ok) throw new Error(`whisper-server HTTP ${r.status}`);
  const data = await r.json();
  return { text: cleanTranscript(data.text || ''), ms: performance.now() - started, mode: 'server' };
}

// ---------- second Whisper model, for comparing on real recordings ----------
// Off unless the page switches it on. While on, the page sends each recording
// to both models; the turn itself still runs on the main one. The same audio,
// the same vocabulary hint, a different model.

const cmp = { available: false, proc: null, ready: false, starting: null };

async function initCompare() {
  cmp.available = !!stt.serverPath && (await exists(CONFIG.whisperCompareModel));
}

function startCompare() {
  if (cmp.proc) return cmp.starting;
  const proc = spawn(stt.serverPath, [
    '-m', CONFIG.whisperCompareModel,
    '--host', '127.0.0.1',
    '--port', String(CONFIG.whisperComparePort),
    '-t', String(CONFIG.whisperThreads),
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  cmp.proc = proc;
  proc.on('error', () => {});
  proc.on('exit', () => { if (cmp.proc === proc) { cmp.proc = null; cmp.ready = false; } });
  cmp.starting = (async () => {
    for (let i = 0; i < 120 && cmp.proc === proc; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${CONFIG.whisperComparePort}/`, { signal: AbortSignal.timeout(500) });
        if (r.status < 500) { cmp.ready = true; return true; }
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  })();
  return cmp.starting;
}

function stopCompare() {
  cmp.proc?.kill();
  cmp.proc = null;
  cmp.ready = false;
}

async function transcribe(wav) {
  if (stt.mode === 'server' && stt.serverReady) return whisperRequest(CONFIG.whisperPort, wav);
  if (stt.mode === 'cli') {
    return withTmp(async (dir) => {
      const file = path.join(dir, 'speech.wav');
      await writeFile(file, wav);
      const args = ['-m', CONFIG.whisperModel, '-f', file, '-l', 'en', '-nt', '-np', '-t', String(CONFIG.whisperThreads)];
      if (CONFIG.whisperPrompt) args.push('--prompt', CONFIG.whisperPrompt);
      const res = await run(stt.cliPath, args);
      if (!res.ok) throw new Error(`whisper-cli failed: ${res.stderr.slice(-300)}`);
      return { text: cleanTranscript(res.stdout), ms: res.ms, mode: 'cli' };
    });
  }
  throw new Error(`speech-to-text unavailable: ${stt.lastError || 'not configured'}`);
}

// ---------- text-to-speech ----------

const tts = { engine: CONFIG.tts, path: null, available: false, voices: [], lastError: null, note: null };

// The speech helper (speech/q-speak.swift) is one process kept running for
// the life of the server. Requests go in as JSON lines; each reply is a JSON
// header line followed by that many bytes of 16-bit mono PCM. It answers
// strictly in order, so replies are matched to requests by position.
const helper = { proc: null, buf: Buffer.alloc(0), header: null, pending: [], nextId: 1, onReady: null };

function helperDrain() {
  for (;;) {
    if (!helper.header) {
      const nl = helper.buf.indexOf(0x0a);
      if (nl < 0) return;
      const msg = JSON.parse(helper.buf.subarray(0, nl).toString('utf8'));
      helper.buf = helper.buf.subarray(nl + 1);
      if (msg.ready) { helper.onReady?.(msg.voices || []); continue; }
      helper.header = msg;
    }
    const bytes = helper.header.bytes || 0;
    if (helper.buf.length < bytes) return;
    const pcm = Buffer.from(helper.buf.subarray(0, bytes));
    helper.buf = helper.buf.subarray(bytes);
    const header = helper.header;
    helper.header = null;
    const job = helper.pending.shift();
    if (!job) continue;
    clearTimeout(job.timer);
    helperArmNext();
    if (header.error) job.reject(new Error(`speech helper: ${header.error}`));
    else job.resolve({ pcm, sampleRate: header.sampleRate, ms: header.ms });
  }
}

// Each sentence's time limit starts when it reaches the front of the queue,
// not when it was asked for, so a slow sentence ahead of it doesn't use it up.
function helperArmNext() {
  const job = helper.pending[0];
  const proc = helper.proc;
  if (job && !job.timer && proc) job.timer = setTimeout(() => proc.kill(), job.limitMs);
}

function startHelper() {
  return new Promise((resolve) => {
    let proc;
    try { proc = spawn(CONFIG.speechHelperBin, [], { stdio: ['pipe', 'pipe', 'ignore'] }); }
    catch { resolve(null); return; }
    const giveUp = setTimeout(() => proc.kill(), 30_000);
    helper.proc = proc;
    helper.buf = Buffer.alloc(0);
    helper.header = null;
    helper.onReady = (voices) => { clearTimeout(giveUp); resolve(voices); };
    proc.stdin.on('error', () => {});
    proc.stdout.on('data', (d) => {
      helper.buf = Buffer.concat([helper.buf, d]);
      try { helperDrain(); } catch { proc.kill(); }
    });
    proc.on('error', () => {});
    proc.on('close', () => {
      clearTimeout(giveUp);
      if (helper.proc !== proc) return;
      helper.proc = null;
      for (const job of helper.pending.splice(0)) { clearTimeout(job.timer); job.reject(new Error('speech helper stopped')); }
      resolve(null);
      if (tts.engine === 'helper' && !stopping) {
        console.warn('[q] speech helper stopped; using `say` while it restarts');
        tts.engine = 'say';
        initTts();
        retryHelperLater();
      }
    });
  });
}

// limitMs: how long the helper may take once this sentence is at the front.
// Normal sentences take well under a second. The first one after the Mac has
// just booted has been seen to take 24 s, so the warm-up sentence gets longer.
function helperSpeak(text, voiceId, limitMs = 30_000) {
  return new Promise((resolve, reject) => {
    if (!helper.proc) { reject(new Error('speech helper not running')); return; }
    helper.pending.push({ resolve, reject, timer: null, limitMs });
    helperArmNext();
    helper.proc.stdin.write(JSON.stringify({ id: helper.nextId++, text, voice: voiceId || '' }) + '\n');
  });
}

// Starts the helper and switches Q's voice over to it. Used at launch and
// again if the helper stops: Q speaks through `say` in the meantime.
const HELPER_WARMUP_MS = 120_000;
let helperRetries = 0;

async function adoptHelper() {
  const voices = (await exists(CONFIG.speechHelperBin)) ? await startHelper() : null;
  if (!voices) return false;
  tts.engine = 'helper';
  tts.voices = helperVoices(voices);
  tts.available = true;
  tts.note = null;
  // The first sentence after launch is slow; pay for it now.
  helperSpeak('Ready.', tts.voices.find((v) => v.name === CONFIG.sayVoice)?.id, HELPER_WARMUP_MS)
    .then(() => { helperRetries = 0; })
    .catch(() => {});
  return true;
}

function retryHelperLater() {
  if (stopping || helperRetries >= 3) {
    tts.note = 'speech helper stopped — using say (slower); restart Q to retry';
    return;
  }
  helperRetries++;
  tts.note = 'speech helper stopped — using say (slower) while it restarts';
  setTimeout(async () => {
    if (stopping || helper.proc) return;
    if (!(await adoptHelper())) retryHelperLater();
  }, 15_000 * helperRetries);
}

// Several installed voices share a name (US and UK variants, Enhanced and
// Premium downloads), so the list shown to the UI gets unique labels.
function helperVoices(raw) {
  const quality = { 2: 'Enhanced', 3: 'Premium' };
  // Newer macOS already puts "(Enhanced)" in the voice's own name; don't say it twice.
  const label = (v) => (quality[v.quality] && !v.name.includes(quality[v.quality]) ? `${v.name} (${quality[v.quality]})` : v.name);
  const labelled = raw.map((v) => ({ id: v.id, lang: v.lang.replace('-', '_'), name: label(v) }));
  return labelled
    .map((v) => (labelled.filter((x) => x.name === v.name).length > 1 ? { ...v, name: `${v.name} · ${v.lang}` } : v))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function pcmToWav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function initTts() {
  if (tts.engine === 'helper') {
    if (await adoptHelper()) return;
    tts.engine = 'say';
    tts.note = 'speech helper not built — using say (slower); run npm run setup';
  }
  if (tts.engine === 'say') {
    tts.path = await which('say');
    tts.available = !!tts.path;
    if (tts.available) {
      const res = await run(tts.path, ['-v', '?'], { timeoutMs: 30_000 });
      tts.voices = res.stdout.split('\n').map((line) => {
        const m = line.match(/^(.+?)\s+([a-z]{2,3}_[A-Z0-9]{2,3})\s+#/);
        return m ? { name: m[1].trim(), lang: m[2] } : null;
      }).filter((v) => v && v.lang.startsWith('en'));
    } else tts.lastError = '`say` not found (macOS only)';
  } else if (tts.engine === 'piper') {
    tts.path = await which(CONFIG.piperBin);
    tts.available = !!tts.path && (await exists(CONFIG.piperModel));
    if (!tts.available) tts.lastError = 'piper binary or voice model missing';
  }
}

function speakable(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>~]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function synthesize(text, voice) {
  const clean = speakable(text).slice(0, 1200);
  if (!clean) return null;
  if (!tts.available) throw new Error(`text-to-speech unavailable: ${tts.lastError || tts.engine}`);
  if (tts.engine === 'helper') {
    const v = voice || CONFIG.sayVoice;
    const out = await helperSpeak(clean, tts.voices.find((x) => x.name === v)?.id);
    return { wav: pcmToWav(out.pcm, out.sampleRate), ms: out.ms };
  }
  return withTmp(async (dir) => {
    const out = path.join(dir, 'out.wav');
    let res;
    if (tts.engine === 'say') {
      const txt = path.join(dir, 'in.txt');
      await writeFile(txt, clean);
      const args = ['-f', txt, '-o', out, '--file-format=WAVE', '--data-format=LEI16@22050'];
      const v = voice || CONFIG.sayVoice;
      if (v && tts.voices.some((x) => x.name === v)) args.push('-v', v);
      if (CONFIG.sayRate) args.push('-r', String(CONFIG.sayRate));
      res = await run(tts.path, args, { timeoutMs: 30_000 });
    } else {
      res = await run(tts.path, ['--model', CONFIG.piperModel, '--output_file', out], { input: clean, timeoutMs: 30_000 });
    }
    if (!res.ok) throw new Error(`${tts.engine} failed: ${res.stderr.slice(-300)}`);
    return { wav: await readFile(out), ms: res.ms };
  });
}

// ---------- LLM (Ollama) ----------

async function ollamaStatus() {
  try {
    const [ver, tags, ps] = await Promise.all([
      fetch(`${CONFIG.ollamaUrl}/api/version`, { signal: AbortSignal.timeout(1500) }).then((r) => r.json()),
      fetch(`${CONFIG.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(1500) }).then((r) => r.json()),
      fetch(`${CONFIG.ollamaUrl}/api/ps`, { signal: AbortSignal.timeout(1500) }).then((r) => r.json()).catch(() => ({ models: [] })),
    ]);
    const names = (tags.models || []).map((m) => m.name);
    const installed = (tags.models || []).find((m) => m.name === CONFIG.model || m.name === `${CONFIG.model}:latest`);
    const loaded = (ps.models || []).find((m) => m.name === CONFIG.model || m.name === `${CONFIG.model}:latest`);
    return {
      reachable: true,
      version: ver.version,
      modelInstalled: !!installed,
      modelLoaded: !!loaded,
      modelSizeBytes: installed?.size ?? null,
      loadedVramBytes: loaded?.size_vram ?? null,
      quantization: installed?.details?.quantization_level ?? null,
      parameterSize: installed?.details?.parameter_size ?? null,
      models: names,
    };
  } catch (err) {
    return { reachable: false, error: err.message };
  }
}

// Load the model ahead of the first turn and run the real system prompt
// through it, so the first turn only has to process the new message. It sends
// exactly the system prompt a chat turn sends and asks for a single token.
async function warmModel() {
  const r = await fetch(`${CONFIG.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.model,
      stream: false,
      keep_alive: CONFIG.keepAlive,
      options: { num_ctx: CONFIG.numCtx, temperature: CONFIG.temperature, num_predict: 1 },
      messages: [{ role: 'system', content: await systemPrompt() }],
    }),
  });
  if (!r.ok) throw new Error(`warmup HTTP ${r.status}`);
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return { loadMs: (data.load_duration || 0) / 1e6, promptMs: (data.prompt_eval_duration || 0) / 1e6 };
}

// Warm-up state, reported in /api/status so the UI never shows "Ready" while
// the model is still loading. Never rejects: a failed warm-up resolves null.
const warm = { state: 'idle', promise: null, ms: null, error: null, lastTry: 0 };

// When the model was last used (a turn or a warm-up), to tell a turn that
// follows a long idle spell from an ordinary warm one.
let lastModelUse = null;

// Called on every status poll: if Ollama is up and the model isn't in memory
// (Ollama was restarted, started after Q, or dropped the model), warm it again
// instead of showing "Ready" over a cold model. A failed attempt is retried at
// most every 15 s.
function warmIfNeeded(o) {
  if (!o.reachable || !o.modelInstalled || o.modelLoaded) return;
  if (warm.state === 'warming') return;
  if (warm.state === 'failed' && Date.now() - warm.lastTry < 15_000) return;
  startWarmup();
}

function startWarmup() {
  const started = performance.now();
  warm.state = 'warming';
  warm.ms = null;
  warm.error = null;
  warm.lastTry = Date.now();
  warm.promise = warmModel()
    .then((w) => { warm.state = 'ready'; warm.ms = performance.now() - started; lastModelUse = Date.now(); return w; })
    .catch((err) => { warm.state = 'failed'; warm.ms = performance.now() - started; warm.error = err.message; return null; });
  return warm.promise;
}

async function persona() {
  try { return await readFile(path.join(ROOT, 'persona.md'), 'utf8'); }
  catch { return 'You are Q, a helpful local assistant. Keep spoken replies short.'; }
}

// The one system prompt, shared by chat turns and the warm-up so they match.
async function systemPrompt() {
  return `${await persona()}\n\n${TIME_NOTE}`;
}

// Ollama reuses its work on a prompt only up to the first token that differs
// from the previous request, so everything sent before the newest message has
// to stay byte-for-byte the same from turn to turn. Two rules follow:
//  - the system prompt never changes; the time rides on each user message,
//    fixed at the moment that message was created;
//  - old turns are dropped a block at a time, so the start of the history
//    moves once every few turns instead of on every turn.
const TIME_NOTE = 'Each of his messages starts with the time it was sent, in square brackets. That is how you know the current date and time. Never read the brackets out or repeat a timestamp back; only use it when the time or date matters.';
const STAMP = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };

function stamped(m) {
  if (m.role !== 'user' || !Number.isFinite(m.at)) return m.content;
  const d = new Date(m.at);
  return Number.isNaN(d.getTime()) ? m.content : `[${d.toLocaleString('en-US', STAMP)}] ${m.content}`;
}

function trimHistory(msgs) {
  const max = CONFIG.historyTurns * 2;
  const block = Math.max(2, CONFIG.historyTurns);
  const last = msgs.length - 1;
  const chars = (from) => msgs.slice(from).reduce((n, m) => n + m.content.length, 0);
  let start = 0;
  while (start < last && (msgs.length - start > max || chars(start) > CONFIG.historyChars)) start += block;
  start = Math.max(0, Math.min(start, last));
  while (start < last && msgs[start].role !== 'user') start++;
  return msgs.slice(start);
}

async function streamChat(req, res) {
  activeChats++;
  try { await streamChatInner(req, res); } finally { activeChats--; }
}

async function streamChatInner(req, res) {
  const body = JSON.parse((await readBody(req, 1_000_000)).toString('utf8') || '{}');
  const history = Array.isArray(body.messages) ? body.messages : [];
  const valid = history.filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
  const kept = trimHistory(valid);
  const trimmed = kept.map((m) => ({ role: m.role, content: stamped(m) }));
  const system = await systemPrompt();

  // The quality test (scripts/quality-run.mjs) sends its prompts through this
  // same pipeline, optionally with another installed model. Such requests are
  // marked so they don't count as turns for keep-warm.
  const bench = body.benchmark === true;
  let model = CONFIG.model;
  if (bench && typeof body.model === 'string' && body.model !== CONFIG.model) {
    const tags = await fetch(`${CONFIG.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json()).catch(() => ({}));
    if (!(tags.models || []).some((m) => m.name === body.model)) throw Object.assign(new Error(`model not installed in Ollama: ${body.model}`), { status: 400 });
    model = body.model;
  }

  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' });
  const send = (obj) => res.write(JSON.stringify(obj) + '\n');

  // A turn that arrives during the warm-up waits for it here, so the wait is
  // measured instead of hiding inside Ollama's queue.
  let warmupWaitMs = 0;
  if (warm.state === 'warming') {
    const waitStarted = performance.now();
    await warm.promise;
    warmupWaitMs = performance.now() - waitStarted;
    if (controller.signal.aborted) return res.end();
  }

  const idleMs = lastModelUse == null ? null : Date.now() - lastModelUse;
  const started = performance.now();
  let firstTokenMs = null;
  const echo = createEchoFilter(); // drops a timestamp the model copies back at the start
  let said = ''; // the reply as the page received it, kept only so keep-warm can replay this turn
  try {
    const upstream = await fetch(`${CONFIG.ollamaUrl}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        keep_alive: CONFIG.keepAlive,
        options: { num_ctx: CONFIG.numCtx, temperature: CONFIG.temperature },
        messages: [{ role: 'system', content: system }, ...trimmed],
      }),
    });
    if (!upstream.ok) throw new Error(`Ollama HTTP ${upstream.status}: ${(await upstream.text()).slice(0, 300)}`);
    const decoder = new TextDecoder();
    let buf = '';
    for await (const chunk of upstream.body) {
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.error) throw new Error(msg.error);
        const text = msg.message?.content || '';
        if (text) {
          if (firstTokenMs == null) firstTokenMs = performance.now() - started;
          const out = echo.push(text);
          if (out) { said += out; send({ type: 'token', text: out }); }
        }
        if (msg.done) {
          const held = echo.end();
          if (held) { said += held; send({ type: 'token', text: held }); }
          lastModelUse = Date.now();
          if (!bench) {
            // Save the finished exchange (history.js decides whether saving is on).
            const asked = valid[valid.length - 1];
            if (said && asked?.role === 'user' && fromOwnPage(req)) {
              try { saved.record(body.conv, asked.content, said); } catch (err) { console.warn('[q] could not save the turn:', err.message); }
            }
            keep.lastTurnAt = lastModelUse;
            // What the next turn will send, up to the point where its new
            // message starts. Usually that is this turn plus the reply. Every
            // few turns the history cap drops a block instead, which changes
            // the start of the prompt and would make the next turn reprocess
            // everything; in that case the model is primed with the trimmed
            // version now, while Q is still speaking.
            const next = trimHistory([...valid, ...(said ? [{ role: 'assistant', content: said }] : []), { role: 'user', content: '' }]).slice(0, -1);
            keep.messages = [{ role: 'system', content: system }, ...next.map((m) => ({ role: m.role, content: stamped(m) }))];
            if (next[0] !== kept[0]) setTimeout(() => primeModel().catch(() => {}), 50);
          }
          const pingsSinceLastTurn = keep.sinceTurn;
          keep.sinceTurn = 0;
          const evalMs = (msg.eval_duration || 0) / 1e6;
          send({
            type: 'done',
            stats: {
              model,
              serverFirstTokenMs: firstTokenMs,
              totalMs: performance.now() - started,
              loadMs: (msg.load_duration || 0) / 1e6,
              warmupWaitMs,
              idleMs,
              pingsSinceLastTurn,
              promptTokens: msg.prompt_eval_count || 0,
              promptMs: (msg.prompt_eval_duration || 0) / 1e6,
              evalTokens: msg.eval_count || 0,
              evalMs,
              tokPerSec: evalMs > 0 ? (msg.eval_count || 0) / (evalMs / 1000) : null,
            },
          });
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') send({ type: 'error', message: err.message });
  }
  res.end();
}

// ---------- keep-warm (D-026) ----------
// After a few idle minutes macOS compresses the memory of the model, Whisper
// and the voice, and the next turn takes seconds to wake them. Two remedies:
//  - while a Q page is open, touch all three every keepWarmSeconds, for
//    keepWarmMinutes after the last turn;
//  - whenever the talk key goes down, touch them at once, so they wake while
//    the user is still speaking.
// A touch is one one-token model request, one tiny Whisper clip and one spoken
// word. The model request replays the last turn exactly, reply included, so
// Ollama's cached conversation still ends where the conversation ends.

const keep = { startedAt: 0, lastTurnAt: 0, lastPollAt: 0, lastTouchAt: 0, busy: false, sinceTurn: 0, messages: null, clip: null };
let activeChats = 0;

// A short spoken clip at 16 kHz for Whisper, made once with Q's own voice.
async function keepWarmClip() {
  if (keep.clip) return keep.clip;
  const made = await synthesize('Okay.', '').catch(() => null);
  if (!made) return null;
  const rate = made.wav.readUInt32LE(24);
  const n = Math.floor((made.wav.length - 44) / 2);
  const out = Buffer.alloc(Math.floor((n * 16000) / rate) * 2);
  for (let i = 0; i < out.length / 2; i++) out.writeInt16LE(made.wav.readInt16LE(44 + Math.min(n - 1, Math.floor((i * rate) / 16000)) * 2), i * 2);
  keep.clip = pcmToWav(out, 16000);
  return keep.clip;
}

async function touchModel() {
  const r = await fetch(`${CONFIG.ollamaUrl}/api/chat`, {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.model,
      stream: false,
      keep_alive: CONFIG.keepAlive,
      options: { num_ctx: CONFIG.numCtx, temperature: CONFIG.temperature, num_predict: 1 },
      messages: keep.messages ?? [{ role: 'system', content: await systemPrompt() }],
    }),
  });
  await r.arrayBuffer();
}

async function touchWhisper() {
  if (stt.mode !== 'server' || !stt.serverReady) return; // whisper-cli reloads on every call anyway
  const clip = await keepWarmClip();
  if (!clip) return;
  const form = new FormData();
  form.append('file', new Blob([clip], { type: 'audio/wav' }), 'warm.wav');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  const r = await fetch(`http://127.0.0.1:${CONFIG.whisperPort}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
  await r.arrayBuffer();
}

async function touchVoice() {
  if (tts.engine === 'helper' && helper.proc) await helperSpeak('Ok.', tts.voices.find((v) => v.name === CONFIG.sayVoice)?.id);
}

// The model alone, for when the cached conversation needs rebuilding (not a
// keep-warm ping, so it isn't counted as one).
async function primeModel() {
  if (keep.busy || activeChats > 0 || warm.state !== 'ready') return false;
  keep.busy = true;
  try {
    await touchModel();
    lastModelUse = Date.now();
    return true;
  } finally {
    keep.busy = false;
  }
}

// Never overlaps a real turn, a warm-up or another touch.
async function touchAll() {
  if (keep.busy || activeChats > 0 || warm.state !== 'ready') return false;
  keep.busy = true;
  try {
    await Promise.allSettled([touchModel(), touchWhisper(), touchVoice()]);
    keep.lastTouchAt = lastModelUse = Date.now();
    keep.sinceTurn++;
    return true;
  } finally {
    keep.busy = false;
  }
}

// The window runs from the last turn, or from the startup warm-up if there has
// been no turn yet, so the first thing you say after starting Q is fast too.
const keepWarmFrom = () => Math.max(keep.lastTurnAt, keep.startedAt);
const keepWarmUntil = () => (CONFIG.keepWarmMinutes && keepWarmFrom() ? keepWarmFrom() + CONFIG.keepWarmMinutes * 60_000 : 0);
// A page counts as open if it checked in during the last 150 s. A visible page
// polls status every 8 s; a hidden one (covered by another window, or in a
// background tab) only sends a heartbeat, and browsers slow a hidden page's
// timers to about once a minute.
const pageOpen = () => Date.now() - keep.lastPollAt < 150_000;

setInterval(() => {
  const now = Date.now();
  if (now > keepWarmUntil() || !pageOpen()) return;
  if (now - (lastModelUse || 0) < CONFIG.keepWarmSeconds * 1000) return;
  touchAll().catch(() => {});
}, 5000).unref();

// ---------- system sample (for run data) ----------
// Memory and power figures recorded next to each turn's timings. Every command
// is fixed, with fixed arguments; nothing here is built from request data.

const MB = 1024 * 1024;

async function systemSample() {
  const opts = { timeoutMs: 3000 };
  const [swap, level, vm, ps, batt] = await Promise.all([
    run('/usr/sbin/sysctl', ['-n', 'vm.swapusage'], opts),
    run('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], opts),
    run('/usr/bin/vm_stat', [], opts),
    run('/bin/ps', ['-axo', 'rss=,comm='], opts),
    run('/usr/bin/pmset', ['-g', 'batt'], opts),
  ]);
  const swapMb = (label) => {
    const m = swap.stdout.match(new RegExp(`${label} = ([\\d.]+)([KMG])`));
    return m ? Number(m[1]) * { K: 1 / 1024, M: 1, G: 1024 }[m[2]] : null;
  };
  const pageBytes = Number(vm.stdout.match(/page size of (\d+) bytes/)?.[1]) || 16384;
  const pagesMb = (label) => {
    const m = vm.stdout.match(new RegExp(`${label}:\\s+(\\d+)`));
    return m ? (Number(m[1]) * pageBytes) / MB : null;
  };
  let ollamaMb = 0;
  let whisperMb = 0;
  let helperMb = 0;
  let vscodeRunning = false;
  for (const line of ps.stdout.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(.+)$/);
    if (!m) continue;
    const mb = Number(m[1]) / 1024;
    if (/ollama/i.test(m[2])) ollamaMb += mb;
    else if (/whisper-server$/.test(m[2])) whisperMb += mb;
    else if (/q-speak$/.test(m[2])) helperMb += mb;
    if (m[2].includes('Visual Studio Code.app')) vscodeRunning = true;
  }
  return {
    swapUsedMb: swapMb('used'),
    swapTotalMb: swapMb('total'),
    freeMb: pagesMb('Pages free'),
    compressedMb: pagesMb('Pages occupied by compressor'),
    // Running totals since boot; the page turns them into per-turn differences.
    decompressedTotalMb: pagesMb('Decompressions'),
    pageinsTotalMb: pagesMb('Pageins'),
    swapinsTotalMb: pagesMb('Swapins'),
    pressure: { 1: 'normal', 2: 'warning', 4: 'critical' }[Number(level.stdout.trim())] ?? null,
    ollamaMb,
    whisperMb,
    helperMb,
    serverMb: process.memoryUsage().rss / MB,
    power: /AC Power/.test(batt.stdout) ? 'ac' : /Battery Power/.test(batt.stdout) ? 'battery' : null,
    vscodeRunning,
  };
}

// ---------- HTTP plumbing ----------

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return json(res, 403, { error: 'forbidden' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch {
    json(res, 404, { error: 'not found' });
  }
}

const server = http.createServer(async (req, res) => {
  // Only same-origin requests from the local UI; reject cross-site posts.
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) return json(res, 403, { error: 'origin not allowed' });
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && pathname === '/api/status') {
      const ollama = await ollamaStatus();
      warmIfNeeded(ollama);
      keep.lastPollAt = Date.now();
      return json(res, 200, {
        version: VERSION,
        api: API_LEVEL,
        model: CONFIG.model,
        history: { turns: CONFIG.historyTurns, chars: CONFIG.historyChars },
        ollama,
        warmup: { state: warm.state, ms: warm.ms, error: warm.error },
        compare: { available: cmp.available, on: !!cmp.proc, ready: cmp.ready, model: path.basename(CONFIG.whisperCompareModel) },
        keepWarm: { until: keepWarmUntil() > Date.now() ? keepWarmUntil() : null, hadTurn: keep.lastTurnAt > 0, everySeconds: CONFIG.keepWarmSeconds, minutes: CONFIG.keepWarmMinutes },
        stt: { mode: stt.mode, ready: stt.mode === 'cli' || (stt.mode === 'server' && stt.serverReady), model: path.basename(CONFIG.whisperModel), error: stt.mode === 'none' ? stt.lastError : null },
        tts: { engine: tts.engine, available: tts.available, error: tts.available ? null : tts.lastError, note: tts.note, defaultVoice: tts.voices.some((v) => v.name === CONFIG.sayVoice) ? CONFIG.sayVoice : null },
        server: { host: '127.0.0.1', port: CONFIG.port, pid: process.pid, rssBytes: process.memoryUsage().rss },
      });
    }
    if (req.method === 'POST' && pathname === '/api/alive') {
      keep.lastPollAt = Date.now();
      res.writeHead(204);
      return res.end();
    }
    if (req.method === 'POST' && pathname === '/api/keepwarm') {
      // The talk key just went down. Skip it if everything was used moments ago.
      if (Date.now() - (lastModelUse || 0) > 20_000) touchAll().catch(() => {});
      res.writeHead(204);
      return res.end();
    }
    if (req.method === 'GET' && pathname === '/api/system') return json(res, 200, await systemSample());
    if (req.method === 'GET' && pathname === '/api/voices') return json(res, 200, { engine: tts.engine, voices: tts.voices });
    if (req.method === 'POST' && pathname === '/api/warm') {
      const w = await (warm.state === 'warming' ? warm.promise : startWarmup());
      if (!w) throw new Error(warm.error || 'warm-up failed');
      return json(res, 200, w);
    }
    if (req.method === 'POST' && pathname === '/api/transcribe') {
      const wav = await readBody(req, 25_000_000);
      return json(res, 200, await transcribe(wav));
    }
    if (req.method === 'POST' && pathname === '/api/compare') {
      const { on } = JSON.parse((await readBody(req, 1000)).toString('utf8') || '{}');
      if (on) {
        if (!cmp.available) return json(res, 400, { error: `comparison model not found at ${CONFIG.whisperCompareModel}, or whisper-server is missing` });
        await startCompare();
      } else stopCompare();
      return json(res, 200, { on: !!cmp.proc, ready: cmp.ready });
    }
    if (req.method === 'POST' && pathname === '/api/transcribe-compare') {
      if (!cmp.ready) return json(res, 409, { error: 'comparison model is not running' });
      return json(res, 200, await whisperRequest(CONFIG.whisperComparePort, await readBody(req, 25_000_000)));
    }
    if (req.method === 'POST' && pathname === '/api/chat') return await streamChat(req, res);
    if (pathname.startsWith('/api/history')) {
      if (!fromOwnPage(req)) return json(res, 403, { error: 'saved conversations are only available to Q’s own page' });
      if (req.method === 'GET' && pathname === '/api/history') return json(res, 200, historyState(new URL(req.url, 'http://localhost').searchParams.get('resume') === '1'));
      if (req.method === 'POST' && pathname === '/api/history/settings') {
        const body = JSON.parse((await readBody(req, 10_000)).toString('utf8') || '{}');
        saved.setSettings({ enabled: body.enabled, retentionDays: body.retentionDays });
        pruneHistory();
        return json(res, 200, historyState(false));
      }
      const params = new URL(req.url, 'http://localhost').searchParams;
      if (req.method === 'GET' && pathname === '/api/history/list') return json(res, 200, { conversations: saved.list() });
      if (req.method === 'GET' && pathname === '/api/history/search') return json(res, 200, { results: saved.search(params.get('q'), 60) });
      if (req.method === 'GET' && pathname === '/api/history/conversation') {
        const conv = saved.conversation(params.get('id'));
        return conv ? json(res, 200, conv) : json(res, 404, { error: 'no such conversation' });
      }
      if (req.method === 'POST' && pathname === '/api/history/export') {
        const body = JSON.parse((await readBody(req, 10_000)).toString('utf8') || '{}');
        const one = body.all !== true;
        if (one && !saved.conversation(body.conv)) return json(res, 404, { error: 'no such conversation' });
        const file = await writeExport(saved.exportMarkdown(one ? [body.conv] : undefined), one ? 'conversation' : 'conversations');
        return json(res, 200, { file });
      }
      if (req.method === 'POST' && pathname === '/api/history/delete') {
        const body = JSON.parse((await readBody(req, 10_000)).toString('utf8') || '{}');
        const removed = body.all === true ? saved.clear() : saved.remove(body.conv);
        return json(res, 200, { removed, ...historyState(false) });
      }
      return json(res, 404, { error: 'not found' });
    }
    if (req.method === 'POST' && pathname === '/api/speak') {
      const { text, voice } = JSON.parse((await readBody(req, 100_000)).toString('utf8') || '{}');
      const out = await synthesize(String(text || ''), typeof voice === 'string' ? voice : '');
      if (!out) { res.writeHead(204); return res.end(); }
      res.writeHead(200, { 'content-type': 'audio/wav', 'x-q-synth-ms': out.ms.toFixed(0), 'cache-control': 'no-store' });
      return res.end(out.wav);
    }
    if (req.method === 'GET') return await serveStatic(req, res);
    json(res, 405, { error: 'method not allowed' });
  } catch (err) {
    if (!res.headersSent) json(res, err.status || 500, { error: err.message });
    else res.end();
  }
});

await Promise.all([initWhisper(), initTts()]);
await initCompare();
server.listen(CONFIG.port, '127.0.0.1', async () => {
  const o = await ollamaStatus();
  console.log(`\n  Q is up → http://127.0.0.1:${CONFIG.port}\n`);
  console.log(`  model    ${CONFIG.model}  ${o.reachable ? (o.modelInstalled ? '✓ installed' : '✗ not pulled — run: ollama pull ' + CONFIG.model) : '✗ Ollama not running'}`);
  console.log(`  speech   whisper.cpp (${stt.mode})${stt.mode === 'none' ? '  ✗ ' + stt.lastError : '  ✓'}`);
  console.log(`  voice    ${tts.engine}${tts.available ? '  ✓' : '  ✗ ' + tts.lastError}\n`);
  if (o.reachable && o.modelInstalled) startWarmup().then((w) => { if (w) keep.startedAt = Date.now(); console.log(w ? `  model loaded in ${w.loadMs.toFixed(0)} ms, system prompt primed in ${w.promptMs.toFixed(0)} ms\n` : `  model warm-up failed: ${warm.error}\n`); });
});

const shutdown = () => { stopping = true; stt.serverProc?.kill(); cmp.proc?.kill(); helper.proc?.kill(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown); // the Terminal window was closed
// Started by Q's own window: if that app goes away without stopping us (a
// crash, a force quit), macOS hands this process to another parent. Stop then,
// so nothing is left running with no way to reach it.
if (process.env.Q_EXIT_WITH_PARENT) {
  const parent = process.ppid;
  setInterval(() => { if (process.ppid !== parent) shutdown(); }, 2000).unref();
}
