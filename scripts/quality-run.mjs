// Runs the quality-test prompts (quality/prompts.json) through Q's real chat
// pipeline and saves the replies for blind comparison in /quality.html.
//
//   node scripts/quality-run.mjs --label llama3.2
//   node scripts/quality-run.mjs --label qwen2.5 --model qwen2.5:3b   another installed Ollama model
//   node scripts/quality-run.mjs --template cloud                     an empty file to fill in by hand
//
// Results go to quality/out/<label>.json, which is not checked in: unlike the
// run data, these files contain the replies. Nothing here contacts a cloud
// service. A cloud reference is made by copying the non-personal prompts into
// a cloud model yourself and pasting its answers into the template.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : fallback;
};
const URL_BASE = opt('url', 'http://127.0.0.1:4141');
const TEMPLATE = opt('template');
const LABEL = TEMPLATE || opt('label');
const MODEL = opt('model');
if (!LABEL || !/^[\w.-]+$/.test(LABEL)) {
  console.error('Give the run a short name: --label llama3.2  (letters, numbers, dots, dashes)');
  process.exit(1);
}

const { prompts } = JSON.parse(await readFile(path.join(ROOT, 'quality/prompts.json'), 'utf8'));
const outDir = path.join(ROOT, 'quality/out');
const outFile = path.join(outDir, `${LABEL}.json`);
await mkdir(outDir, { recursive: true });

if (TEMPLATE) {
  const items = prompts.filter((p) => !p.personal).map((p) => ({ ...p, reply: '' }));
  await writeFile(outFile, JSON.stringify({ label: LABEL, model: 'filled in by hand', createdAt: new Date().toISOString(), items }, null, 1));
  console.log(`\n  Wrote ${path.relative(ROOT, outFile)} with ${items.length} prompts (personal ones left out).`);
  console.log('  For each item, give the cloud model the "turns" in order and paste its last answer into "reply".\n');
  process.exit(0);
}

async function chat(messages) {
  const started = performance.now();
  const r = await fetch(`${URL_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, benchmark: true, ...(MODEL ? { model: MODEL } : {}) }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `chat HTTP ${r.status}`);
  const dec = new TextDecoder();
  let buf = '';
  let reply = '';
  let stats = null;
  let firstTokenMs = null;
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.type === 'token') {
        if (firstTokenMs == null) firstTokenMs = performance.now() - started;
        reply += msg.text;
      } else if (msg.type === 'done') stats = msg.stats;
      else if (msg.type === 'error') throw new Error(msg.message);
    }
  }
  return { reply: reply.trim(), firstTokenMs, stats };
}

const status = await fetch(`${URL_BASE}/api/status`).then((r) => r.json()).catch(() => null);
if (!status) { console.error(`Q isn't reachable at ${URL_BASE} — start it first.`); process.exit(1); }
const model = MODEL || status.model;
console.log(`\n  ${prompts.length} prompts → ${model} (as "${LABEL}")\n`);

const items = [];
try {
  for (const p of prompts) {
    const messages = [];
    let last = null;
    for (const user of p.turns) {
      messages.push({ role: 'user', content: user, at: Date.now() });
      last = await chat(messages);
      messages.push({ role: 'assistant', content: last.reply });
    }
    items.push({ ...p, reply: last.reply, exchange: messages.map((m) => ({ role: m.role, content: m.content })), firstTokenMs: Math.round(last.firstTokenMs), tokPerSec: last.stats?.tokPerSec ?? null });
    console.log(`  ✓ ${p.id}`);
  }
} catch (err) {
  console.error(`  ✕ Stopped: ${err.message}. Nothing was saved.\n`);
  process.exit(1);
}
await writeFile(outFile, JSON.stringify({ label: LABEL, model, createdAt: new Date().toISOString(), items }, null, 1));
console.log(`\n  Saved ${path.relative(ROOT, outFile)}. Open ${URL_BASE}/quality.html to compare two runs blind.\n`);
