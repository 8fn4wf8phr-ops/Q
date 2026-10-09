# Q — Status

_Claude Code updates this after every change. Labels: **proposed → approved → built → tested (stand-ins) → verified (real Mac)**. Only "verified" means it worked on Jacquez's Mac with real components._

**Current version:** v0.1  
**Last updated:** 2026-10-09 (Claude Chat, from the original v0.1 build; Claude Code should check this against the actual repo and correct it)

## v0.1 — what exists
| Feature | State |
|---|---|
| Push-to-talk (hold Space in the browser tab) → whisper.cpp → Ollama → `say` | tested (stand-ins) |
| Speech starts after the first sentence; later sentences synthesize while earlier ones play | tested (stand-ins) |
| whisper-server stays loaded between turns (falls back to whisper-cli) | tested (stand-ins) |
| Q Core Canvas animation tied to real mic, inference and playback events; ~30 fps idle; Reduce Motion | tested (stand-ins) |
| Interrupt via Esc, the Stop button or clicking the core; typed input fallback | tested (stand-ins) |
| Latency panel: per-stage times, voice-to-voice, median of last 12 turns | tested (stand-ins) |
| System panel: model, speech and voice status; Ollama model memory; server process memory | tested (stand-ins) |
| `persona.md` re-read every turn; last 8 turns of context | tested (stand-ins) |
| `npm run setup` (whisper-cpp, base.en model, llama3.2:3b) | **not run** |
| Whole pipeline on the real Mac | **not run** |

## Known issues — fix before benchmarking
1. **Timestamp breaks Ollama's prompt cache.** `server.js` puts the current time, to the minute, into the system prompt, so the persona and history are reprocessed after every minute change and latency comes out inflated. Use the date or hour, or put the time in the latest message. _(found by Claude Chat; not yet fixed)_
2. **Instrumentation gaps for the v0.1 gate:** no p90, no swap or memory-pressure sampling (must come from the server), no cold vs warm split, no "Copy run data" export. The metric should be labeled "key release → first audio". The export must contain timings only, no transcripts or audio.
3. **Whisper hallucinations on near-silent clips** (e.g. "Thank you."): only a 300 ms minimum exists; add a loudness check.
4. **Push-to-talk only works while the browser tab is focused** (expected until v0.3).

## Next steps
1. Claude Code: inspect the repo and propose fixes for issues 1–3 → Jacquez approves.
2. Jacquez: review `scripts/setup.sh`, run `npm run setup` and `npm start`.
3. Benchmark: about 30 turns over two sessions with VS Code open. Record the browser, VS Code's workload, and whether the Mac is plugged in.
4. Quality: set up a 20-prompt blind pairwise test (include multi-turn prompts and "can't do that" honesty checks, plus a cloud reference on non-personal prompts).

## Measurements
_None yet. Paste exported run data here once real runs exist._
