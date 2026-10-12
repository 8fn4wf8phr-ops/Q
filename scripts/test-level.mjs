// Tests for the silence guard's loudness check (public/level.js).
//   npm test
// Uses generated signals, plus real synthesized speech from the speech helper
// when bin/q-speak has been built. Exits non-zero if any case fails.

import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureLevel } from '../public/level.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 16000;
const gain = (db) => 10 ** (db / 20);

// Deterministic noise so runs are repeatable.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
const noise = (seconds, db, rate = RATE) => Float32Array.from({ length: Math.round(seconds * rate) }, () => rand() * gain(db) * Math.sqrt(3));
const mix = (base, clip, atSeconds, rate = RATE) => {
  const out = Float32Array.from(base);
  const start = Math.round(atSeconds * rate);
  for (let i = 0; i < clip.length && start + i < out.length; i++) out[start + i] += clip[i];
  return out;
};
const scaled = (clip, db) => clip.map((x) => x * gain(db));

let failed = 0;
function check(name, samples, expected, rate = RATE) {
  const m = measureLevel(samples, rate);
  const ok = m.hasSpeech === expected;
  if (!ok) failed++;
  const peak = Number.isFinite(m.peakDb) ? `${m.peakDb.toFixed(0)} dB` : 'silence';
  console.log(`  ${ok ? '✓' : '✕'} ${name}: ${m.hasSpeech ? 'speech' : 'no speech'} (loudest ${peak}, ${m.loudMs} ms of sound)`);
}

console.log('\nNo speech — Whisper must be skipped');
check('empty recording', new Float32Array(0), false);
check('2 s of digital silence', new Float32Array(2 * RATE), false);
check('2 s of room noise at -70 dB', noise(2, -70), false);
check('2 s of room noise at -58 dB', noise(2, -58), false);
check('a 40 ms click mid-recording', mix(noise(2, -70), noise(0.04, -15), 1), false);
check('a key-release click at the very end', mix(noise(2, -70), noise(0.06, -15), 1.93), false);

console.log('\nGenerated speech-like sound — must be accepted');
const syllables = (db) => {
  let clip = noise(1.2, -90);
  for (const at of [0.1, 0.4, 0.7]) clip = mix(clip, noise(0.18, db), at);
  return clip;
};
check('three syllable bursts at -25 dB', syllables(-25), true);
check('three syllable bursts at -45 dB', syllables(-45), true);

let helperBuilt = true;
try { await access(path.join(ROOT, 'bin/q-speak')); } catch { helperBuilt = false; }
if (!helperBuilt) {
  console.log('\nReal synthesized speech — skipped (bin/q-speak not built; run npm run build:speech)');
} else {
  const proc = spawn(path.join(ROOT, 'bin/q-speak'), [], { stdio: ['pipe', 'pipe', 'ignore'] });
  let buf = Buffer.alloc(0);
  let header = null;
  const waiting = [];
  proc.stdout.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (!header) {
        const nl = buf.indexOf(0x0a);
        if (nl < 0) return;
        const msg = JSON.parse(buf.subarray(0, nl).toString('utf8'));
        buf = buf.subarray(nl + 1);
        if (msg.ready) continue;
        header = msg;
      }
      if (buf.length < header.bytes) return;
      const pcm = buf.subarray(0, header.bytes);
      buf = buf.subarray(header.bytes);
      const samples = new Float32Array(pcm.length / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
      waiting.shift()({ samples, rate: header.sampleRate });
      header = null;
    }
  });
  const speak = (text) => new Promise((resolve) => { waiting.push(resolve); proc.stdin.write(JSON.stringify({ id: 1, text, voice: '' }) + '\n'); });

  console.log('\nReal synthesized speech with room noise — must be accepted');
  for (const text of ['Yes.', 'Stop.', 'What time is it?']) {
    const { samples, rate } = await speak(text);
    for (const db of [-20, -30]) {
      check(`"${text}" turned down ${-db} dB`, mix(noise(samples.length / rate + 0.4, -70, rate), scaled(samples, db), 0.2, rate), true, rate);
    }
  }
  const yes = await speak('Yes.');
  check('one quiet "Yes." inside a 4 s hold', mix(noise(4, -70, yes.rate), scaled(yes.samples, -30), 2, yes.rate), true, yes.rate);

  console.log('\nReal speech too faint to count — rejected (this is the current lower limit)');
  check('"Yes." turned down 40 dB', mix(noise(1, -70, yes.rate), scaled(yes.samples, -40), 0.2, yes.rate), false, yes.rate);
  proc.stdin.end();
}

console.log('\nSpeech already under way when the recording starts');
function checkStart(name, samples, expected, rate = RATE) {
  const ok = measureLevel(samples, rate).startsLoud === expected;
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✕'} ${name}: ${measureLevel(samples, rate).startsLoud ? 'flagged' : 'not flagged'}`);
}
checkStart('sound from the very first sample', mix(noise(1.5, -70), noise(0.6, -25), 0), true);
checkStart('speech that starts after 0.3 s of quiet', mix(noise(1.5, -70), noise(0.6, -25), 0.3), false);
checkStart('a 40 ms click at the very start, then speech later', mix(mix(noise(1.5, -70), noise(0.04, -15), 0), noise(0.6, -25), 0.4), false);
checkStart('silence', noise(1.5, -70), false);
checkStart('an empty recording', new Float32Array(0), false);

console.log(failed ? `\n${failed} case(s) failed\n` : '\nAll cases passed\n');
process.exit(failed ? 1 : 0);
