// Blind pairwise comparison of two quality-test runs (see scripts/quality-run.mjs).
// Everything happens in this page; the result that can be copied holds counts
// and prompt ids only, not the replies.

import { pairings, tally } from './quality-score.js';

const $ = (sel) => document.querySelector(sel);
const runs = { a: null, b: null };
let pairs = [];
let votes = [];
let at = 0;
let audio = null;
// For prompts with a rule: each side has to be judged yes or no before a vote
// counts. An unanswered rule is never recorded as a failure.
const judged = { left: null, right: null };

function refreshJudging() {
  const p = pairs[at];
  for (const side of ['left', 'right']) {
    document.querySelectorAll(`[data-pass="${side}"] [data-judge]`).forEach((b) => {
      const on = judged[side] === (b.dataset.judge === 'yes');
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  const waiting = !!p?.check && (judged.left === null || judged.right === null);
  $('#needs').hidden = !waiting;
  document.querySelectorAll('[data-vote]').forEach((b) => { b.disabled = waiting; });
}

async function readRun(input, key) {
  runs[key] = null;
  const file = input.files[0];
  if (file) {
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.items)) throw new Error('no "items" list');
      runs[key] = data;
    } catch (err) {
      $('#setupNote').textContent = `${file.name} isn't a quality-test result (${err.message}).`;
    }
  }
  const ready = runs.a && runs.b;
  $('#begin').disabled = !ready;
  if (ready) {
    const n = pairings(runs.a, runs.b).length;
    $('#setupNote').textContent = n ? `${n} prompts answered by both runs.` : 'These two files have no answered prompts in common.';
    $('#begin').disabled = !n;
  }
}

function start(a, b) {
  runs.a = a;
  runs.b = b;
  pairs = pairings(a, b).sort(() => Math.random() - 0.5);
  votes = [];
  at = 0;
  $('#setup').hidden = true;
  $('#done').hidden = true;
  $('#round').hidden = false;
  show();
}

const sideKey = (pair, side) => (side === 'left' ? pair.left : pair.left === 'a' ? 'b' : 'a');

function show() {
  const p = pairs[at];
  $('#progress').textContent = `${at + 1} of ${pairs.length}`;
  $('#category').textContent = p.category || '';
  const q = $('#question');
  q.textContent = '';
  p.turns.forEach((text, i) => {
    const line = document.createElement('p');
    if (i < p.turns.length - 1) line.className = 'earlier';
    line.textContent = (p.turns.length > 1 ? `${i + 1}. ` : '') + text;
    q.appendChild(line);
  });
  if (p.turns.length > 1) {
    const note = document.createElement('p');
    note.className = 'earlier';
    note.textContent = 'Each side answered every message; only the final replies are shown.';
    q.appendChild(note);
  }
  $('#rule').hidden = !p.check;
  $('#rule').textContent = p.check ? `Rule for this one: ${p.check}` : '';
  for (const side of ['left', 'right']) {
    $(`#${side}`).textContent = p[sideKey(p, side)];
    document.querySelector(`[data-pass="${side}"]`).hidden = !p.check;
    judged[side] = null;
  }
  refreshJudging();
  window.scrollTo({ top: 0 });
}

function vote(choice) {
  const p = pairs[at];
  const v = { id: p.id, winner: choice === 'tie' ? 'tie' : sideKey(p, choice) };
  if (p.check) {
    if (judged.left === null || judged.right === null) return;
    v.passA = judged[p.left === 'a' ? 'left' : 'right'];
    v.passB = judged[p.left === 'a' ? 'right' : 'left'];
  }
  votes.push(v);
  audio?.pause();
  at++;
  if (at < pairs.length) show();
  else finish();
}

function summary() {
  const t = tally(votes);
  const name = (k) => `${runs[k].label} (${runs[k].model})`;
  return { comparedAt: new Date().toISOString(), prompts: t.n, ties: t.ties, a: { run: name('a'), ...t.a }, b: { run: name('b'), ...t.b }, votes };
}

function finish() {
  const s = summary();
  $('#round').hidden = true;
  $('#done').hidden = false;
  const table = document.createElement('table');
  table.className = 'result';
  const row = (cells, tag = 'td') => {
    const tr = document.createElement('tr');
    for (const c of cells) { const el = document.createElement(tag); el.textContent = c; tr.appendChild(el); }
    table.appendChild(tr);
  };
  row(['Run', 'Preferred', 'Share (ties count half)', 'Rules met'], 'th');
  for (const k of ['a', 'b']) row([s[k].run, `${s[k].wins} of ${s.prompts}`, `${s[k].share}%`, s[k].checks ? `${s[k].checksPassed} of ${s[k].checks}` : '—']);
  row(['About the same', `${s.ties} of ${s.prompts}`, '', '']);
  $('#result').replaceChildren(table);
}

async function hear(side) {
  const p = pairs[at];
  audio?.pause();
  try {
    const r = await fetch('/api/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: p[sideKey(p, side)], voice: '' }) });
    if (!r.ok) throw new Error(`speak HTTP ${r.status}`);
    audio = new Audio(URL.createObjectURL(await r.blob()));
    await audio.play();
  } catch (err) {
    alert(`Couldn’t play that through Q’s voice: ${err.message}`);
  }
}

$('#fileA').addEventListener('change', (e) => readRun(e.target, 'a'));
$('#fileB').addEventListener('change', (e) => readRun(e.target, 'b'));
$('#begin').addEventListener('click', () => start(runs.a, runs.b));
document.querySelectorAll('[data-vote]').forEach((b) => b.addEventListener('click', () => vote(b.dataset.vote)));
document.querySelectorAll('[data-hear]').forEach((b) => b.addEventListener('click', () => hear(b.dataset.hear)));
document.querySelectorAll('[data-pass]').forEach((group) => group.querySelectorAll('[data-judge]').forEach((b) => b.addEventListener('click', () => {
  judged[group.dataset.pass] = b.dataset.judge === 'yes';
  refreshJudging();
})));
$('#copyResult').addEventListener('click', async () => {
  const text = JSON.stringify(summary(), null, 1);
  try {
    await navigator.clipboard.writeText(text);
    $('#copyResultNote').textContent = 'Copied · counts and prompt ids only';
  } catch {
    $('#resultText').value = text;
    $('#resultText').hidden = false;
    $('#resultText').select();
    $('#copyResultNote').textContent = 'Clipboard unavailable — copy from the box';
  }
});
