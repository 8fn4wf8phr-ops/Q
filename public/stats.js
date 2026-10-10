// Latency statistics and the "Copy run data" export. Free of browser APIs so
// scripts/test-stats.mjs can run it in Node.
//
// The export is built field by field from the allowlists below, never by
// serialising a turn. Anything not named here (message text above all) cannot
// end up in it.

export const SCHEMA = 1;
export const MAX_RUNS = 200;
export const MIN_FOR_P90 = 10;

const NUMBERS = [
  'at', 'total', 'stt', 'firstToken', 'firstSentence', 'voiceSynth',
  'promptMs', 'promptTokens', 'loadMs', 'warmupWaitMs', 'evalTokens', 'tokPerSec',
  'captureMs', 'levelDb', 'loudMs', 'turnIndex', 'idleMs',
];
const ENUMS = {
  source: ['voice', 'text'],
  engine: ['helper', 'say', 'piper', 'browser', 'none'],
};
const SYS_NUMBERS = [
  'swapUsedMb', 'swapTotalMb', 'freeMb', 'compressedMb',
  'decompressedMb', 'pageinsMb', 'swapinsMb',
  'ollamaMb', 'whisperMb', 'helperMb', 'serverMb',
];
const SYS_ENUMS = { pressure: ['normal', 'warning', 'critical'], power: ['ac', 'battery'] };
const SYS_BOOLS = ['vscodeRunning'];
const HEADER_STRINGS = ['qVersion', 'model', 'whisperModel', 'serverVoiceEngine', 'voiceEngine', 'browser'];
const HEADER_NUMBERS = ['historyTurns', 'historyChars', 'modelMemoryMb'];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const oneOf = (v, allowed) => (allowed.includes(v) ? v : null);

// Nearest-rank percentile: the smallest value with at least p of the data at or below it.
export function percentile(values, p) {
  const sorted = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

function group(runs) {
  const totals = runs.map((r) => r.total).filter((v) => typeof v === 'number' && Number.isFinite(v));
  return {
    n: totals.length,
    p50: num(percentile(totals, 0.5)),
    p90: totals.length >= MIN_FOR_P90 ? num(percentile(totals, 0.9)) : null,
  };
}

// Statistics cover voice turns that reached first audio. Typed turns are
// counted but kept out, since their clock starts at Enter, not key release.
export function summarize(runs) {
  const voice = runs.filter((r) => r.source === 'voice' && typeof r.total === 'number');
  const stage = (key) => num(percentile(voice.map((r) => r[key]), 0.5));
  return {
    metric: 'key release → first audio, ms',
    voiceTurns: voice.length,
    typedTurns: runs.filter((r) => r.source === 'text').length,
    warm: group(voice.filter((r) => !r.cold)),
    cold: group(voice.filter((r) => r.cold)),
    p90NeedsAtLeast: MIN_FOR_P90,
    stageMedians: { stt: stage('stt'), firstToken: stage('firstToken'), firstSentence: stage('firstSentence'), voiceSynth: stage('voiceSynth'), promptMs: stage('promptMs') },
  };
}

export function cleanSys(sys) {
  if (!sys || typeof sys !== 'object') return null;
  const out = {};
  for (const k of SYS_NUMBERS) out[k] = num(sys[k]);
  for (const [k, allowed] of Object.entries(SYS_ENUMS)) out[k] = oneOf(sys[k], allowed);
  for (const k of SYS_BOOLS) out[k] = typeof sys[k] === 'boolean' ? sys[k] : null;
  return out;
}

export function cleanRun(run) {
  const out = {};
  for (const k of NUMBERS) out[k] = num(run?.[k]);
  for (const [k, allowed] of Object.entries(ENUMS)) out[k] = oneOf(run?.[k], allowed);
  out.cold = run?.cold === true;
  out.sys = cleanSys(run?.sys);
  return out;
}

export function buildExport(runs, header = {}, now = new Date()) {
  const list = (Array.isArray(runs) ? runs : []).map(cleanRun);
  const head = {};
  for (const k of HEADER_STRINGS) head[k] = typeof header[k] === 'string' ? header[k].slice(0, 200) : null;
  for (const k of HEADER_NUMBERS) head[k] = num(header[k]);
  const last = [...list].reverse().find((r) => r.sys)?.sys;
  head.power = last?.power ?? null;
  head.vscodeRunning = last?.vscodeRunning ?? null;
  return {
    schema: SCHEMA,
    exportedAt: now.toISOString(),
    contains: 'timings and system memory figures only — no transcripts, replies or audio',
    header: head,
    summary: summarize(list),
    runs: list,
  };
}
