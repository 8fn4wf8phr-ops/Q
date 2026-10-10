// Tests for reply chunking (public/chunk.js) and the timestamp-echo filter (echo.js).
//   npm test

import { takeChunks } from '../public/chunk.js';
import { createEchoFilter } from '../echo.js';

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✕'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Feed text the way the model streams it, a few characters at a time, and
// collect what would be spoken, in order.
function stream(text, clauseFirst, step = 3) {
  const spoken = [];
  let pending = '';
  let first = null;
  for (let i = 0; i < text.length; i += step) {
    pending += text.slice(i, i + step);
    const cut = takeChunks(pending, clauseFirst && !spoken.length);
    pending = cut.rest;
    if (cut.chunks.length && first == null) first = cut.clause ? 'clause' : 'sentence';
    spoken.push(...cut.chunks);
  }
  if (pending.trim()) spoken.push(pending.trim());
  return { spoken, first };
}

console.log('\nSentences (clause option off) — unchanged behaviour');
check('two sentences', same(takeChunks('Abuja. Lagos gets more attention. ').chunks, ['Abuja.', 'Lagos gets more attention.']));
check('unfinished text is kept as the remainder', takeChunks('Abuja. Lagos gets').rest === 'Lagos gets');
check('a comma does not cut when the option is off', takeChunks('It scatters blue light, which is why').chunks.length === 0);
check('streamed sentence by sentence', same(stream('It is because of light, mostly. That is all.', false).spoken, ['It is because of light, mostly.', 'That is all.']));

console.log('\nFirst clause (option on)');
const sky = "It's because of the way light interacts with molecules, scattering blue wavelengths more. That's why.";
const s1 = stream(sky, true);
check('the first piece ends at the comma', s1.spoken[0] === "It's because of the way light interacts with molecules," && s1.first === 'clause', JSON.stringify(s1));
check('the rest of that sentence is the second piece', s1.spoken[1] === 'scattering blue wavelengths more.');
check('later sentences are not cut at commas', same(stream('One two three four, five six. Seven eight nine ten, eleven twelve. End.', true).spoken, ['One two three four,', 'five six.', 'Seven eight nine ten, eleven twelve.', 'End.']));
check('nothing is lost or reordered', s1.spoken.join(' ') === sky);
check('"Sure, …" is too short to speak alone', stream('Sure, I can help with that. Go on.', true).spoken[0] === 'Sure, I can help with that.');
check('"Short version: …" (two words) waits for the sentence', stream('Short version: computers pass messages around. Want more?', true).first === 'sentence');
check('a number like 1,000 is not split', stream('It costs about 1,000 dollars today. Okay.', true).spoken[0] === 'It costs about 1,000 dollars today.');
check('a short first sentence is spoken whole', same(stream('Abuja. Lagos gets more attention, but Abuja is the capital.', true).spoken, ['Abuja.', 'Lagos gets more attention, but Abuja is the capital.']));
check('semicolon and dash also count', stream('Rust is safer by design; Go is simpler to learn. Pick one.', true).spoken[0] === 'Rust is safer by design;' && stream('It works on my machine — which is the problem. Hm.', true).spoken[0] === 'It works on my machine —');
check('a reply with no break at all still comes out', same(stream('Recursion is when a function calls itself', true).spoken, ['Recursion is when a function calls itself']));
check('token size does not change the result', same(stream(sky, true, 1).spoken, stream(sky, true, 7).spoken));

console.log('\nTimestamp echo filter');
function filtered(tokens) {
  const f = createEchoFilter();
  const out = tokens.map((t) => f.push(t));
  return { text: out.join('') + f.end(), firstEmit: out.findIndex((t) => t !== '') };
}
check('an echoed stamp at the start is removed', filtered(['[', 'Sat', ',', ' Oct', ' 10', ',', ' 2026', ',', ' 2', ':10', ' PM', ']', ' For', ' me', ',', ' Compton.']).text === 'For me, Compton.');
check('a stamp arriving in one token is removed', filtered(['[Sat, Oct 10, 2026, 2:10 PM] Hello.']).text === 'Hello.');
check('leading spaces before the stamp are handled', filtered([' ', '[Sat, Oct 10, 2026, 2:10 PM]', ' Hi.']).text === 'Hi.');
check('a long-format stamp is removed too', filtered(['[Saturday, October 10, 2026 at 1:09 AM] It is today.']).text === 'It is today.');
check('an ordinary reply passes through untouched and at once', same(filtered(['Abuja', '.', ' Lagos', ' is', ' bigger.']), { text: 'Abuja. Lagos is bigger.', firstEmit: 0 }));
check('a bracket that is not a stamp is kept', filtered(['[', 'laughs', ']', ' Good one.']).text === '[laughs] Good one.');
check('an unclosed bracket is released after 60 characters', filtered(['[', 'x'.repeat(70), ' and more']).text === `[${'x'.repeat(70)} and more`);
check('a reply that ends while still held is not lost', filtered(['[note']).text === '[note');
check('a stamp later in the reply is left alone', filtered(['It is ', '[Sat, Oct 10, 2026, 2:10 PM]', ' now.']).text === 'It is [Sat, Oct 10, 2026, 2:10 PM] now.');
check('an empty reply stays empty', filtered([]).text === '');

console.log(failed ? `\n${failed} case(s) failed\n` : '\nAll cases passed\n');
process.exit(failed ? 1 : 0);
