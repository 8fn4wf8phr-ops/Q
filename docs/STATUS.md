# Q — Status

_Claude Code updates this after every change. Labels: **proposed → approved → built → tested (stand-ins) → verified (real Mac)**. Only "verified" means it worked on Jacquez's Mac with real components._

**Current version:** v0.1  
**Last updated:** 2026-10-10 (Claude Code: browser speech engine built as a selectable option; persistent speech helper timed as a throwaway spike, not built)

## v0.1 — what exists
| Feature | State |
|---|---|
| Push-to-talk (hold Space in the browser tab) → whisper.cpp → Ollama → `say` | run on the real Mac 2026-10-10: works end to end, **latency far over the 1.5 s target** (see Measurements) |
| Speech starts after the first sentence; later sentences synthesize while earlier ones play | tested (stand-ins) |
| whisper-server stays loaded between turns (falls back to whisper-cli) | tested (stand-ins) |
| Q Core Canvas animation tied to real mic, inference and playback events; ~30 fps idle; Reduce Motion | tested (stand-ins) |
| Interrupt via Esc, the Stop button or clicking the core; typed input fallback | tested (stand-ins) |
| Latency panel: per-stage times, voice-to-voice, median of last 12 turns | tested (stand-ins) |
| System panel: model, speech and voice status; Ollama model memory; server process memory | tested (stand-ins) |
| `persona.md` re-read every turn; last 8 turns of context | tested (stand-ins) |
| `npm run setup` (whisper-cpp, base.en model, llama3.2:3b) | run by Jacquez (Ollama 0.40.2 and whisper.cpp present 2026-10-10) |
| Whole pipeline on the real Mac | first runs 2026-10-10; test conditions (browser, VS Code load, power) not recorded |
| "Warming up" state until the startup model load finishes; a turn that waits on it is timed (`warmupWaitMs`) and labelled cold; warm-up now loads with the same `num_ctx` as chat (D-020) | tested (stand-ins): fake Ollama with a slow and a failing load, checked through the API and in a browser; **not yet run on the real pipeline** |
| Samantha is the default voice when none is chosen, falling back to the system voice if she isn't installed; the Voice panel names the real default (D-018) | tested (stand-ins): `/api/status` and `/api/speak` on this Mac with a fake Ollama; **not yet confirmed in a real turn** |
| Voice engine selector: "Browser speech (local voices only)" next to "macOS say"; browser speech never uses a non-local voice; the core pulses on real word events; "first audio" is the first word event, not the browser's early `start` event. Default engine is still `say` (D-019) | tested (stand-ins): fake Ollama, typed turns in Claude's built-in Chromium on this Mac, including interrupt and switch; **not yet run in Jacquez's browser or with the mic** |
| `say` sentences are now synthesized one at a time instead of in parallel | tested (stand-ins): one typed turn; **effect on real latency not measured** |
| `scripts/bench-cache.mjs`: prompt-cache benchmark through `/api/chat` (back-to-back vs `--gap 61`), timings only | tested (stand-ins): ran against a fake Ollama stub; **not run** against real Ollama |

## Known issues — fix before benchmarking
1. **Timestamp breaks Ollama's prompt cache.** `server.js` puts the current time, to the minute, into the system prompt, so the persona and history are reprocessed after every minute change and latency comes out inflated. Use the date or hour, or put the time in the latest message. _(found by Claude Chat; not yet fixed)_
2. **Instrumentation gaps for the v0.1 gate:** no p90, no swap or memory-pressure sampling (must come from the server), no cold vs warm split, no "Copy run data" export. The metric should be labeled "key release → first audio". The export must contain timings only, no transcripts or audio.
3. **Whisper hallucinations on near-silent clips** (e.g. "Thank you."): only a 300 ms minimum exists; add a loudness check.
4. **Push-to-talk only works while the browser tab is focused** (expected until v0.3).
5. **Voice synthesis is the main bottleneck.** Each sentence spawns a new `say` process, which costs 1.3–4 s before any audio exists, regardless of sentence length. _(measured 2026-10-10; browser speech built as an alternative, `say` still the default)_
   - Browser speech has no ground truth for when sound starts: Chrome's `start` event fires on request (4–30 ms), about 100 ms before the first word event. Q times from the first word event; a voice with no word events falls back to `start` + 500 ms, which over-reports.
   - The first browser-speech sentence after a page load was slower (0.41 s) than later ones.
   - Chrome is known to drop speech queued right after a cancel; not seen in testing, worth watching for after interrupts.
6. **The system default voice is much slower than Samantha** (about 4–7 s vs 1.3–2.4 s per sentence). _(Samantha default built 2026-10-10; needs a real-Mac check)_
7. **Truthfulness bug: "Ready" is shown while the startup warm-up is still running.** The first question waits for it (first token 11.5 s observed) and the panel labels that turn "warm" because it only reads the chat request's own load time. _(found by Jacquez 2026-10-10; fix built, needs a real-Mac check: restart, ask at once, expect "Warming up" then a cold-labelled turn)_
   - Not covered: if Ollama unloads the model later (after `keepAlive`), Q still shows "Ready"; that turn is labelled cold from its own load time, and the Brain badge says "Installed" instead of "Loaded".
8. **History is resent in full after a server restart** if the browser tab still holds the conversation, so the first turn reprocesses all of it with an empty cache. How much of the 11.5 s this explains vs the warm-up wait is not yet separated.

### Found by Claude Code's read-only inspection (2026-10-09, not yet fixed, not yet confirmed by a run)
- Issue 1 is narrower than stated: the timestamp is at the end of the system prompt, so the persona prefix should stay cached and only the history is reprocessed when the minute changes.
- History trimming (`slice(-historyTurns * 2)`) shifts the prompt prefix every turn once a conversation passes 8 turns, which defeats the cache regardless of the timestamp; it also leaves the context starting with an orphaned assistant message.
- `warmModel()` loads the model without `num_ctx`; if Ollama's default differs from 4096 the first real turn may reload the model.
- The latency clock starts after the recorder has stopped, not at key release; typed and voice turns share one median; turns with voice off aren't recorded.
- `whisper-server` is only killed on SIGINT/SIGTERM, so a crash can leave it running and holding memory.
- `new URL(req.url)` in `server.js` is outside the `try`; a malformed request path can crash the server. The whisper-server request has no timeout.
- No `Host` header check (low severity, local only). `setup.sh` prints the Whisper model's sha256 but doesn't verify it.
- `persona.md` says "Nothing you hear or say leaves this machine" as fact; the brief says that is unverified.
- The repo contains no tests, so there is no evidence here for the "tested (stand-ins)" labels above.

## Next steps
1. Jacquez: review `scripts/setup.sh`, install Ollama, run `npm run setup` and `npm start`.
2. Jacquez: run `node scripts/bench-cache.mjs` and `node scripts/bench-cache.mjs --gap 61` on the baseline; paste both tables below (this is the test D-006 is waiting on).
3. Claude Code: timestamp fix (proposed, waiting on the baseline numbers), then silence guard and run-data export, each after Jacquez approves.
4. Benchmark: about 30 turns over two sessions with VS Code open. Record the browser, VS Code's workload, and whether the Mac is plugged in.
5. Quality: set up a 20-prompt blind pairwise test (include multi-turn prompts and "can't do that" honesty checks, plus a cloud reference on non-personal prompts).

## Measurements
### 2026-10-10 — first real-Mac runs (reported by Jacquez; conditions not recorded)
| What | Result |
|---|---|
| Voice-to-voice, system default voice | 10–18 s |
| Voice-to-voice, Samantha, best turn | 5.46 s = speech → text 0.40 + first token 0.89 + first sentence 0.78 + voice synth 3.40 |
| Standalone `say`, one sentence, default voice | 4.15 s at 14–24% CPU |
| Standalone `say`, one sentence, Samantha | 1.59 s at 14–24% CPU |
| First token, first turn after a server restart with old history still in the browser | 11.5 s (panel labelled it "warm") |

### 2026-10-10 — `say` timings run by Claude Code on this Mac (Q server and Ollama 0.40.2 running, macOS 26.6.2; writing to a WAV file, no playback)
| What | Result |
|---|---|
| Samantha, one 11-word sentence (3.48 s of audio), 4 runs back to back | 2.37, 2.19, 1.50, 1.30 s |
| Samantha, one word ("Okay.") | 1.54 s — the cost is fixed startup, not sentence length |
| Samantha, 3 sentences synthesized in parallel | 2.99 s for all three — parallel `say` processes slow each other |
| System default voice, same sentence, 3 runs | 3.81, 6.94, 4.18 s |

### 2026-10-10 — speech engine comparison, run by Claude Code on this Mac (Samantha; stand-in Ollama, so only the speech stage is real)
| Engine | Time from sentence ready to first audio | Notes |
|---|---|---|
| `say` per sentence (current default) | 1.86–2.07 s in the test UI; 1.3–2.4 s standalone | new process every sentence |
| Browser speech, Claude's built-in Chromium 152 | 0.04–0.41 s in the test UI; first word event 109–179 ms after the request in a direct test (3 runs + a one-word run) | 11 word events for an 11-word sentence; all 180 voices this browser lists are local |
| Persistent Swift helper (`AVSpeechSynthesizer.write`), throwaway spike outside the repo, 2 runs × 5 sentences | first audio buffer 13–19 ms; whole sentence rendered in 23–44 ms | first sentence after the process starts: 478 and 828 ms, once; returns PCM, so the core's loudness meter would keep working |

None of these are end-to-end numbers from Jacquez's browser. The cache benchmark (`scripts/bench-cache.mjs`) has not been run against real Ollama yet.
