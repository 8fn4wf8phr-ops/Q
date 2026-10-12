// Tests for latency statistics and the run-data export (public/stats.js).
//   npm test

import { percentile, summarize, cleanRun, buildExport, kindOf, sameWords, MIN_FOR_P90, IDLE_MS } from '../public/stats.js';

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✕'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\nPercentiles');
const ten = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
check('p50 of 100…1000 is 500', percentile(ten, 0.5) === 500, String(percentile(ten, 0.5)));
check('p90 of 100…1000 is 900', percentile(ten, 0.9) === 900, String(percentile(ten, 0.9)));
check('p90 of 30 values is the 27th smallest', percentile(Array.from({ length: 30 }, (_, i) => i + 1), 0.9) === 27);
check('order of input does not matter', percentile([900, 100, 500], 0.5) === 500);
check('a single value is its own p50 and p90', percentile([42], 0.5) === 42 && percentile([42], 0.9) === 42);
check('no values gives null', percentile([], 0.5) === null);
check('non-numbers are ignored', percentile([100, null, NaN, 'x', 300], 0.5) === 100);

console.log('\nCold and warm split');
const run = (total, extra = {}) => ({ source: 'voice', engine: 'helper', total, cold: false, ...extra });
const runs = [
  ...ten.map((t) => run(t)),
  run(5000, { cold: true }), run(7000, { cold: true }),
  run(50, { source: 'text' }),
  run(null),
];
const s = summarize(runs);
check('10 warm voice turns counted', s.warm.n === 10, JSON.stringify(s.warm));
check('warm p50 500, p90 900', s.warm.p50 === 500 && s.warm.p90 === 900, JSON.stringify(s.warm));
check('2 cold turns counted, p50 5000', s.cold.n === 2 && s.cold.p50 === 5000, JSON.stringify(s.cold));
check(`cold p90 withheld below ${MIN_FOR_P90} turns`, s.cold.p90 === null);
check('typed turn kept out of the statistics but counted', s.typedTurns === 1 && s.voiceTurns === 12);
check('a turn with no audio is not counted', s.voiceTurns === 12);

console.log('\nWarm, idle and cold');
check('a turn 7.6 min after the last use is idle', kindOf({ cold: false, idleMs: 7.6 * 60000 }) === 'idle');
check('a turn 30 s after the last use is warm', kindOf({ cold: false, idleMs: 30000 }) === 'warm');
check(`exactly ${IDLE_MS / 60000} min counts as idle`, kindOf({ cold: false, idleMs: IDLE_MS }) === 'idle');
check('cold wins over idle', kindOf({ cold: true, idleMs: 10 * 60000 }) === 'cold');
check('unknown idle time is treated as warm', kindOf({ cold: false, idleMs: null }) === 'warm');
const mixed = [run(1400, { idleMs: 20000 }), run(1600, { idleMs: 40000 }), run(5960, { idleMs: 456000 }), run(7190, { cold: true, idleMs: 900000 })];
const sm = summarize(mixed);
check('summary reports the three groups separately', sm.warm.n === 2 && sm.idle.n === 1 && sm.cold.n === 1, JSON.stringify([sm.warm, sm.idle, sm.cold]));
check('the idle turn does not inflate the warm p50', sm.warm.p50 === 1400 && sm.idle.p50 === 5960);
const ex = buildExport(mixed);
check('each exported run carries its kind', same(ex.runs.map((r) => r.kind), ['warm', 'warm', 'idle', 'cold']));
check('a stored sample with nothing usable in it is not counted', buildExport([{ ...run(1), sys: { error: 'not found' } }]).systemSamples === 0 && buildExport([{ ...run(1), sys: { error: 'not found' } }]).runs[0].sys === null);
check('export counts how many runs have a system sample', ex.systemSamples === 0 && buildExport([{ ...run(1), sys: { swapUsedMb: 1 } }]).systemSamples === 1);

console.log('\nExport contains numbers only');
const SECRET = 'my-private-sentence-xyzzy';
const dirty = {
  ...run(1234.56, { cold: true }),
  at: 1791600000000, stt: 350, firstToken: 890, promptMs: 150, promptTokens: 700, turnIndex: 3, idleMs: 42000,
  text: SECRET, content: SECRET, reply: SECRET, messages: [{ role: 'user', content: SECRET }],
  engine: SECRET, source: 'voice', stageNote: SECRET,
  firstSentence: SECRET, // a string where a number belongs
  sys: { swapUsedMb: 8085.1, pressure: 'warning', power: 'ac', vscodeRunning: true, note: SECRET, ollamaMb: SECRET },
};
const out = buildExport([dirty], { model: 'llama3.2:3b', browser: 'TestBrowser/1.0', transcript: SECRET, historyTurns: 8, qVersion: 5 }, new Date('2026-10-10T12:00:00Z'));
const text = JSON.stringify(out);
check('planted message text does not appear anywhere', !text.includes(SECRET));
check('unknown fields are dropped', !('text' in out.runs[0]) && !('messages' in out.runs[0]) && !('note' in out.runs[0].sys));
check('a string in a numeric field becomes null', out.runs[0].firstSentence === null && out.runs[0].sys.ollamaMb === null);
check('an unknown engine value becomes null', out.runs[0].engine === null);
check('numbers survive, rounded to 0.1', out.runs[0].total === 1234.6 && out.runs[0].stt === 350 && out.runs[0].sys.swapUsedMb === 8085.1);
check('cold flag, pressure and power survive', out.runs[0].cold === true && out.runs[0].sys.pressure === 'warning' && out.runs[0].sys.power === 'ac');
check('header keeps allowed strings, drops the rest', out.header.model === 'llama3.2:3b' && !('transcript' in out.header) && out.header.qVersion === null);
check('header takes power and VS Code state from the latest sample', out.header.power === 'ac' && out.header.vscodeRunning === true);
check('summary is included', out.summary.cold.n === 1 && out.summary.cold.p50 === 1234.6);
const mics = buildExport([{ ...run(1), mic: 'MacBook Air Microphone' }, { ...run(2), mic: 'Jacquez’s iPhone Microphone' }, { ...run(3), mic: 'Jacquez’s iPhone Microphone' }, { ...run(4), mic: 42 }, { ...run(5), mic: 'x'.repeat(300) }]);
check('each run keeps its microphone name', mics.runs[0].mic === 'MacBook Air Microphone' && mics.runs[1].mic === 'Jacquez’s iPhone Microphone');
check('the header lists each microphone once, in order of use', same(mics.header.microphones.slice(0, 2), ['MacBook Air Microphone', 'Jacquez’s iPhone Microphone']));
check('a non-text microphone value is dropped and a long one is cut to 80 characters', mics.runs[3].mic === null && mics.runs[4].mic.length === 80);
console.log('\nWhisper comparison');
check('same words, different case and punctuation, count as the same', sameWords('What time is it?', 'what time is it'));
check('a different word counts as different', !sameWords('Is Ollama still running?', 'Is Olima still running?'));
check('an empty transcript differs from a real one', !sameWords('', 'Hello') && sameWords('', ' '));
const cm = buildExport([{ ...run(1), sttAltMs: 455.2, compare: 'alt' }, { ...run(2), compare: 'the other one' }], { compareModel: 'ggml-small.en.bin', compareTally: { same: 7, base: 1, alt: 3, neither: 1, text: SECRET } });
check('each run keeps the verdict and the second model’s time', cm.runs[0].compare === 'alt' && cm.runs[0].sttAltMs === 455.2 && cm.runs[1].compare === null);
check('the header carries the tally as counts only', same(cm.header.compareTally, { same: 7, base: 1, alt: 3, neither: 1 }) && !JSON.stringify(cm).includes(SECRET));
const mo = buildExport([{ ...run(1), armMs: 120.4, startsLoud: false }, { ...run(2), armMs: 480, startsLoud: true }, { ...run(3), armMs: 'soon', startsLoud: 'yes' }, run(4)]);
check('each run keeps the mic-open time and the early-speech flag', mo.runs[0].armMs === 120.4 && mo.runs[1].startsLoud === true && mo.runs[2].armMs === null && mo.runs[2].startsLoud === null);
check('the summary reports mic-open time and how often speech had already started', mo.summary.micOpen.n === 2 && mo.summary.micOpen.medianMs === 120.4 && mo.summary.micOpen.speechAlreadyStarted === 1 && mo.summary.micOpen.of === 2, JSON.stringify(mo.summary.micOpen));
check('garbage input does not throw', same(buildExport(null).runs, []) && cleanRun(undefined).total === null);

console.log(failed ? `\n${failed} case(s) failed\n` : '\nAll cases passed\n');
process.exit(failed ? 1 : 0);
