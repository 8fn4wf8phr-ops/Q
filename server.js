// Q — local voice-loop server.
// Serves the UI and three local endpoints: speech-to-text (whisper.cpp),
// chat (Ollama, streamed) and text-to-speech (macOS `say` or Piper).
// Binds to 127.0.0.1 only. Makes no calls to any cloud service.
// Every external program is run with execFile/spawn and a fixed argument
// array — never a shell string.

import http from 'node:http';
import { readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  whisperServerBin: 'whisper-server',
  whisperCliBin: 'whisper-cli',
  whisperModel: 'models/ggml-base.en.bin',
  whisperThreads: 4,
  whisperPort: 4142,
  tts: 'say', // 'say' | 'piper' | 'none'
  sayVoice: 'Samantha', // falls back to the system voice if not installed
  sayRate: 0,
  piperBin: 'piper',
  piperModel: '',
};

const CONFIG = await loadConfig();

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
  for (const key of ['whisperModel', 'piperModel']) {
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

async function transcribe(wav) {
  if (stt.mode === 'server' && stt.serverReady) {
    const started = performance.now();
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
    form.append('response_format', 'json');
    form.append('temperature', '0');
    const r = await fetch(`http://127.0.0.1:${CONFIG.whisperPort}/inference`, { method: 'POST', body: form });
    if (!r.ok) throw new Error(`whisper-server HTTP ${r.status}`);
    const data = await r.json();
    return { text: cleanTranscript(data.text || ''), ms: performance.now() - started, mode: 'server' };
  }
  if (stt.mode === 'cli') {
    return withTmp(async (dir) => {
      const file = path.join(dir, 'speech.wav');
      await writeFile(file, wav);
      const res = await run(stt.cliPath, [
        '-m', CONFIG.whisperModel, '-f', file, '-l', 'en', '-nt', '-np', '-t', String(CONFIG.whisperThreads),
      ]);
      if (!res.ok) throw new Error(`whisper-cli failed: ${res.stderr.slice(-300)}`);
      return { text: cleanTranscript(res.stdout), ms: res.ms, mode: 'cli' };
    });
  }
  throw new Error(`speech-to-text unavailable: ${stt.lastError || 'not configured'}`);
}

// ---------- text-to-speech ----------

const tts = { engine: CONFIG.tts, path: null, available: false, voices: [], lastError: null };

async function initTts() {
  if (tts.engine === 'say') {
    tts.path = await which('say');
    tts.available = !!tts.path;
    if (tts.available) {
      const res = await run(tts.path, ['-v', '?'], { timeoutMs: 10_000 });
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

// Load the model ahead of the first turn so it isn't paying the cold start.
async function warmModel() {
  const r = await fetch(`${CONFIG.ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: CONFIG.model, prompt: '', keep_alive: CONFIG.keepAlive, options: { num_ctx: CONFIG.numCtx } }),
  });
  if (!r.ok) throw new Error(`warmup HTTP ${r.status}`);
  const data = await r.json();
  return { loadMs: (data.load_duration || 0) / 1e6 };
}

// Warm-up state, reported in /api/status so the UI never shows "Ready" while
// the model is still loading. Never rejects: a failed warm-up resolves null.
const warm = { state: 'idle', promise: null, ms: null, error: null };

function startWarmup() {
  const started = performance.now();
  warm.state = 'warming';
  warm.ms = null;
  warm.error = null;
  warm.promise = warmModel()
    .then((w) => { warm.state = 'ready'; warm.ms = performance.now() - started; return w; })
    .catch((err) => { warm.state = 'failed'; warm.ms = performance.now() - started; warm.error = err.message; return null; });
  return warm.promise;
}

async function persona() {
  try { return await readFile(path.join(ROOT, 'persona.md'), 'utf8'); }
  catch { return 'You are Q, a helpful local assistant. Keep spoken replies short.'; }
}

async function streamChat(req, res) {
  const body = JSON.parse((await readBody(req, 1_000_000)).toString('utf8') || '{}');
  const history = Array.isArray(body.messages) ? body.messages : [];
  const trimmed = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-CONFIG.historyTurns * 2);
  const now = new Date();
  const system = `${await persona()}\n\nCurrent local date and time: ${now.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}.`;

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

  const started = performance.now();
  let firstTokenMs = null;
  try {
    const upstream = await fetch(`${CONFIG.ollamaUrl}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: CONFIG.model,
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
          send({ type: 'token', text });
        }
        if (msg.done) {
          const evalMs = (msg.eval_duration || 0) / 1e6;
          send({
            type: 'done',
            stats: {
              model: CONFIG.model,
              serverFirstTokenMs: firstTokenMs,
              totalMs: performance.now() - started,
              loadMs: (msg.load_duration || 0) / 1e6,
              warmupWaitMs,
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
      return json(res, 200, {
        model: CONFIG.model,
        ollama: await ollamaStatus(),
        warmup: { state: warm.state, ms: warm.ms, error: warm.error },
        stt: { mode: stt.mode, ready: stt.mode === 'cli' || (stt.mode === 'server' && stt.serverReady), model: path.basename(CONFIG.whisperModel), error: stt.mode === 'none' ? stt.lastError : null },
        tts: { engine: tts.engine, available: tts.available, error: tts.available ? null : tts.lastError, defaultVoice: tts.voices.some((v) => v.name === CONFIG.sayVoice) ? CONFIG.sayVoice : null },
        server: { host: '127.0.0.1', port: CONFIG.port, pid: process.pid, rssBytes: process.memoryUsage().rss },
      });
    }
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
    if (req.method === 'POST' && pathname === '/api/chat') return await streamChat(req, res);
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
server.listen(CONFIG.port, '127.0.0.1', async () => {
  const o = await ollamaStatus();
  console.log(`\n  Q is up → http://127.0.0.1:${CONFIG.port}\n`);
  console.log(`  model    ${CONFIG.model}  ${o.reachable ? (o.modelInstalled ? '✓ installed' : '✗ not pulled — run: ollama pull ' + CONFIG.model) : '✗ Ollama not running'}`);
  console.log(`  speech   whisper.cpp (${stt.mode})${stt.mode === 'none' ? '  ✗ ' + stt.lastError : '  ✓'}`);
  console.log(`  voice    ${tts.engine}${tts.available ? '  ✓' : '  ✗ ' + tts.lastError}\n`);
  if (o.reachable && o.modelInstalled) startWarmup().then((w) => console.log(w ? `  model warmed in ${w.loadMs.toFixed(0)} ms\n` : `  model warm-up failed: ${warm.error}\n`));
});

const shutdown = () => { stt.serverProc?.kill(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
