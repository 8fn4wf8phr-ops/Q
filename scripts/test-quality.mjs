// Tests for the blind quality test's pairing and scoring (public/quality-score.js).
//   npm test

import { pairings, tally } from '../public/quality-score.js';

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✕'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

console.log('\nPairing');
const item = (id, reply, extra = {}) => ({ id, category: 'facts', turns: ['q'], reply, ...extra });
const A = { label: 'A', items: [item('one', 'a1'), item('two', 'a2', { check: 'must say x' }), item('three', ''), item('four', 'a4')] };
const B = { label: 'B', items: [item('one', 'b1'), item('two', 'b2'), item('three', 'b3'), item('five', 'b5')] };
const pairs = pairings(A, B, () => 0.9);
check('only prompts both runs answered are paired', pairs.map((p) => p.id).join() === 'one,two', pairs.map((p) => p.id).join());
check('each pair carries both replies and the check', pairs[1].a === 'a2' && pairs[1].b === 'b2' && pairs[1].check === 'must say x');
check('left/right order follows the random draw', pairs.every((p) => p.left === 'b') && pairings(A, B, () => 0.1).every((p) => p.left === 'a'));
const sides = pairings({ items: Array.from({ length: 200 }, (_, i) => item(`p${i}`, 'x')) }, { items: Array.from({ length: 200 }, (_, i) => item(`p${i}`, 'y')) });
const lefts = sides.filter((p) => p.left === 'a').length;
check('with real randomness both sides appear on the left', lefts > 60 && lefts < 140, String(lefts));

console.log('\nScoring');
const t = tally([
  { id: '1', winner: 'a' }, { id: '2', winner: 'a' }, { id: '3', winner: 'b' }, { id: '4', winner: 'tie' },
  { id: '5', winner: 'a', passA: true, passB: false }, { id: '6', winner: 'tie', passA: true, passB: true },
]);
check('wins and ties are counted', t.a.wins === 3 && t.b.wins === 1 && t.ties === 2 && t.n === 6, JSON.stringify(t));
check('a tie is half a win for each side', t.a.share === 66.7 && t.b.share === 33.3, `${t.a.share} / ${t.b.share}`);
check('the two shares add up to 100', Math.abs(t.a.share + t.b.share - 100) < 0.11);
check('checks are counted per side', t.a.checks === 2 && t.a.checksPassed === 2 && t.b.checks === 2 && t.b.checksPassed === 1);
check('no votes gives no share', tally([]).a.share === null);

console.log(failed ? `\n${failed} case(s) failed\n` : '\nAll cases passed\n');
process.exit(failed ? 1 : 0);
