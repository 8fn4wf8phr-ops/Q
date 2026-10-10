// Prompt-cache benchmark for Q's /api/chat.
// Sends a fixed typed conversation through the running Q server and records
// how long Ollama spent on the prompt each turn. Run it twice per commit:
//   node scripts/bench-cache.mjs            back-to-back turns
//   node scripts/bench-cache.mjs --gap 61   every turn lands in a new minute
// If the minute-changing timestamp defeats the prompt cache, the --gap run
// shows higher prompt ms on turns 2+ than the back-to-back run.
// Prints timings and token counts only — never the replies.

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : fallback;
};
const URL_BASE = opt('url', 'http://127.0.0.1:4141');
const GAP_S = Number(opt('gap', 0));
const TURNS = Number(opt('turns', 6));
const AS_JSON = args.includes('--json');

const PROMPTS = [
  'Give me one tip for staying focused while coding.',
  'Why does that work?',
  'What is a good way to remember to do it?',
  'How long should a break be?',
  'What should I do during the break?',
  'Sum up everything you told me in one sentence.',
  'Which of those matters most?',
  'What is the first thing I should try tomorrow?',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const minuteOf = (d) => Math.floor(d.getTime() / 60_000);

async function chat(messages) {
  const started = performance.now();
  const r = await fetch(`${URL_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!r.ok) throw new Error(`chat HTTP ${r.status}`);
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
  if (!stats) throw new Error('stream ended without stats');
  return { reply, stats, firstTokenMs };
}

const status = await fetch(`${URL_BASE}/api/status`).then((r) => r.json()).catch(() => null);
if (!status) { console.error(`Q server not reachable at ${URL_BASE} — run npm start first.`); process.exit(1); }
if (!status.ollama?.reachable || !status.ollama.modelInstalled) {
  console.error(`Ollama or the model (${status.model}) isn't ready — run npm run setup first.`);
  process.exit(1);
}

const turns = Math.min(TURNS, PROMPTS.length);
const messages = [];
const rows = [];
let lastMinute = null;
if (!AS_JSON) console.log(`\n  ${status.model} · ${turns} turns · gap ${GAP_S} s · ${new Date().toISOString()}\n`);

for (let i = 0; i < turns; i++) {
  if (i > 0 && GAP_S > 0) await sleep(GAP_S * 1000);
  const minute = minuteOf(new Date());
  messages.push({ role: 'user', content: PROMPTS[i] });
  const { reply, stats, firstTokenMs } = await chat(messages);
  messages.push({ role: 'assistant', content: reply });
  rows.push({
    turn: i + 1,
    newMinute: lastMinute != null && minute !== lastMinute,
    promptTokens: stats.promptTokens,
    promptMs: Math.round(stats.promptMs),
    firstTokenMs: Math.round(firstTokenMs),
    loadMs: Math.round(stats.loadMs),
    evalTokens: stats.evalTokens,
    tokPerSec: stats.tokPerSec ? Number(stats.tokPerSec.toFixed(1)) : null,
  });
  lastMinute = minute;
  if (!AS_JSON) console.log(`  turn ${i + 1} done`);
}

const later = rows.slice(1).map((r) => r.promptMs).sort((a, b) => a - b);
const mid = later.length >> 1;
const medianLater = later.length ? (later.length % 2 ? later[mid] : (later[mid - 1] + later[mid]) / 2) : null;
const summary = {
  model: status.model,
  gapSeconds: GAP_S,
  turnsInNewMinute: rows.filter((r) => r.newMinute).length,
  medianPromptMsTurns2Plus: medianLater,
  rows,
};

if (AS_JSON) console.log(JSON.stringify(summary));
else {
  console.log();
  console.table(rows);
  console.log(`\n  median prompt ms, turns 2+: ${medianLater ?? '—'}  (${summary.turnsInNewMinute} of ${rows.length - 1} later turns crossed a minute)\n`);
}
