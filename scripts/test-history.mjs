// Tests for Q's saved conversations. Run: node scripts/test-history.mjs
// Everything here uses a throwaway file; the real history is never opened.
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openHistory, RETENTION_CHOICES } from '../history.js';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`  ${ok ? '✓' : '✕'} ${name}${ok || !detail ? '' : ` — ${detail}`}`); if (!ok) failed++; };
const dir = mkdtempSync(path.join(tmpdir(), 'q-history-test-'));
const file = path.join(dir, 'sub', 'history.sqlite');
const DAY = 86_400_000;
const A = 'conv-aaaaaaaa';
const B = 'conv-bbbbbbbb';
const SECRET = 'zebra-umbrella-4471';

try {
  const h = await openHistory(file);
  console.log('saved conversations');
  check('opens, creating the folder', h.available && statSync(file).isFile());
  check('the file is readable by this user only', (statSync(file).mode & 0o077) === 0, (statSync(file).mode & 0o777).toString(8));
  check('starts on, keeping 90 days', h.settings().enabled === true && h.settings().retentionDays === 90);
  check('starts empty', h.stats().conversations === 0 && h.latest() === null);

  const t0 = 1_800_000_000_000;
  check('stores a finished exchange', h.record(A, 'What is the capital of Nigeria?', 'Abuja.', t0) === true);
  h.record(A, `Remember ${SECRET}`, 'Got it.', t0 + 1000);
  h.record(B, 'Second conversation', 'Yes.', t0 + 5000);
  const s = h.stats();
  check('counts conversations and turns', s.conversations === 2 && s.turns === 6 && s.oldestAt === t0 && s.bytes > 0, JSON.stringify(s));
  const latest = h.latest(Infinity, t0 + 6000);
  check('the latest conversation is the one last spoken in', latest.id === B && latest.turns.length === 2 && latest.turns[0].role === 'user' && latest.turns[1].content === 'Yes.');
  check('turns come back in the order they were said', h.record(B, 'third', 'ok', t0 + 7000) && h.latest().turns.map((t) => t.content).join('|') === 'Second conversation|Yes.|third|ok');
  check('a conversation that has gone quiet is not picked up again', h.latest(6 * 3600_000, t0 + 7000 + 7 * 3600_000) === null && h.latest(6 * 3600_000, t0 + 7000 + 3600_000).id === B);
  check('lists conversations, newest first, with turn counts', h.list().map((c) => `${c.id}:${c.turns}`).join(',') === `${B}:4,${A}:4`);

  check('refuses a bad conversation id', h.record('../../etc', 'a', 'b') === false && h.record('short', 'a', 'b') === false && h.record(null, 'a', 'b') === false);
  check('refuses empty or non-text turns', h.record(A, '', 'b') === false && h.record(A, 'a', '   ') === false && h.record(A, 5, 'b') === false);
  check('nothing was stored by those', h.stats().turns === 8);

  h.setSettings({ enabled: false });
  check('paused: nothing is stored', h.record(A, 'while paused', 'not kept', t0 + 9000) === false && h.stats().turns === 8);
  check('paused: what was already saved is still there', h.list().length === 2);
  h.setSettings({ enabled: true });
  check('settings ignore junk', h.setSettings({ enabled: 'yes', retentionDays: 7 }).retentionDays === 90 && h.settings().enabled === true);
  check('every offered retention choice is accepted', RETENTION_CHOICES.every((d) => h.setSettings({ retentionDays: d }).retentionDays === d));

  h.setSettings({ retentionDays: 30 });
  check('pruning removes only conversations older than the retention period', h.prune(t0 + 20 * DAY) === 0 && h.prune(t0 + 7000 + 30 * DAY - 1000) === 1 && h.list().map((c) => c.id).join() === B, JSON.stringify(h.list()));
  h.setSettings({ retentionDays: 0 });
  check('"until I delete them" never prunes', h.prune(t0 + 5000 * DAY) === 0 && h.list().length === 1);

  h.record(A, `Remember ${SECRET}`, 'Got it.', t0 + 10_000);
  check('deleting one conversation removes its turns', h.remove(A) === 1 && h.stats().turns === 4 && h.remove(A) === 0 && h.remove('../x') === 0);
  check('a deleted conversation leaves no trace in the file', !readFileSync(file).includes(SECRET));
  h.record(A, `Remember ${SECRET}`, 'Got it.', t0 + 11_000);
  check('delete everything empties it', h.clear() === 2 && h.stats().conversations === 0 && h.stats().turns === 0 && h.latest() === null);
  check('after delete everything, the words are gone from the file', !readFileSync(file).includes(SECRET) && !readFileSync(file).includes('Second conversation'));
  check('settings survive delete everything', h.settings().retentionDays === 0);
  h.close();

  const again = await openHistory(file);
  again.record(A, 'after reopening', 'still works', t0);
  check('reopening the same file keeps settings and data', again.settings().retentionDays === 0 && again.latest().turns[0].content === 'after reopening');
  again.close();

  const bad = await openHistory(path.join(file, 'cannot', 'be', 'here.sqlite')); // a path under a file
  check('an unusable path gives a harmless stand-in, not a crash', bad.available === false && typeof bad.reason === 'string' && bad.record(A, 'a', 'b') === false && bad.latest() === null && bad.stats().turns === 0 && bad.settings().enabled === false);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failed) { console.log(`\n${failed} case(s) failed\n`); process.exit(1); }
console.log('\nall passed\n');
