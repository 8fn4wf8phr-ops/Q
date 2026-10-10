// Loudness check for a recording, used to skip Whisper on near-silent clips so
// Q doesn't answer words nobody said. Free of browser APIs so that
// scripts/test-level.mjs can run it in Node.
//
// The clip is cut into short frames and the frames louder than a low, fixed
// threshold are counted. Counting frames, instead of averaging the whole clip,
// keeps one quiet word inside a long hold from being averaged away. The
// threshold is deliberately low: when in doubt the clip goes to Whisper.

export const SPEECH = {
  frameMs: 20,
  thresholdDb: -50, // a frame counts as sound at or above this RMS level (dBFS)
  minLoudMs: 120, // this much sound in total counts as speech
  ignoreTailMs: 100, // the key-release click lands at the very end
};

const toDb = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

// samples: mono Float32Array in [-1, 1]. Returns
// { hasSpeech, loudMs, peakDb, floorDb } where peakDb and floorDb are the
// 95th and 10th percentile frame levels.
export function measureLevel(samples, rate, opts = SPEECH) {
  const size = Math.max(1, Math.round((rate * opts.frameMs) / 1000));
  const usable = Math.max(0, samples.length - Math.round((rate * opts.ignoreTailMs) / 1000));
  const frames = [];
  for (let i = 0; i + size <= usable; i += size) {
    let sum = 0;
    for (let j = i; j < i + size; j++) sum += samples[j] * samples[j];
    frames.push(toDb(Math.sqrt(sum / size)));
  }
  if (!frames.length) return { hasSpeech: false, loudMs: 0, peakDb: -Infinity, floorDb: -Infinity };
  const loudMs = frames.filter((f) => f >= opts.thresholdDb).length * opts.frameMs;
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { hasSpeech: loudMs >= opts.minLoudMs, loudMs, peakDb: at(0.95), floorDb: at(0.1) };
}
