// Pairing and scoring for the blind quality test. No browser APIs, so
// scripts/test-quality.mjs can run it in Node.

// Which prompts both runs answered, each with a random left/right order.
export function pairings(runA, runB, random = Math.random) {
  const b = new Map((runB.items || []).map((x) => [x.id, x]));
  return (runA.items || [])
    .filter((x) => x.reply && b.get(x.id)?.reply)
    .map((x) => ({ id: x.id, category: x.category, check: x.check || null, turns: x.turns, a: x.reply, b: b.get(x.id).reply, left: random() < 0.5 ? 'a' : 'b' }));
}

// votes: [{ id, winner: 'a' | 'b' | 'tie', passA?: boolean, passB?: boolean }]
// A tie counts as half a win for each side.
export function tally(votes) {
  const side = () => ({ wins: 0, checks: 0, checksPassed: 0 });
  const out = { n: votes.length, ties: 0, a: side(), b: side() };
  for (const v of votes) {
    if (v.winner === 'a') out.a.wins++;
    else if (v.winner === 'b') out.b.wins++;
    else out.ties++;
    for (const [k, pass] of [['a', v.passA], ['b', v.passB]]) {
      if (typeof pass !== 'boolean') continue;
      out[k].checks++;
      if (pass) out[k].checksPassed++;
    }
  }
  const share = (wins) => (out.n ? Math.round(((wins + out.ties / 2) / out.n) * 1000) / 10 : null);
  out.a.share = share(out.a.wins);
  out.b.share = share(out.b.wins);
  return out;
}
