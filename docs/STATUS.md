# Q — Status

_Claude Code updates this after every change. Labels: **proposed → approved → built → tested (stand-ins) → verified (real Mac)**. Only "verified" means it worked on Jacquez's Mac with real components._

**Current version:** v0.1  
**Last updated:** 2026-10-10 (Claude Code: speech helper confirmed in a real voice turn; cache benchmark run on real Ollama; helper still uncommitted)

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
| Speech helper (`speech/q-speak.swift` → `bin/q-speak`): one process kept loaded, returns audio through `/api/speak`; default voice path, with automatic fallback to `say` if it isn't built or stops, shown in the System panel (D-021) | tested (stand-ins): real helper and real voices on this Mac through the server and Claude's built-in Chromium, with a fake Ollama; **one real voice turn by Jacquez 2026-10-10: voice synth 0.21 s (was 3.40 s)** |
| `say` sentences are now synthesized one at a time instead of in parallel | tested (stand-ins): one typed turn; **effect on real latency not measured** |
| `scripts/bench-cache.mjs`: prompt-cache benchmark through `/api/chat` (back-to-back vs `--gap 61`), timings only | run on the real Mac against real Ollama 2026-10-10 (see Measurements) |

## Known issues — fix before benchmarking
1. **Timestamp breaks Ollama's prompt cache.** `server.js` puts the current time, to the minute, into the system prompt, so the persona and history are reprocessed after every minute change and latency comes out inflated. Use the date or hour, or put the time in the latest message. _(found by Claude Chat; not yet fixed)_
2. **Instrumentation gaps for the v0.1 gate:** no p90, no swap or memory-pressure sampling (must come from the server), no cold vs warm split, no "Copy run data" export. The metric should be labeled "key release → first audio". The export must contain timings only, no transcripts or audio.
3. **Whisper hallucinations on near-silent clips** (e.g. "Thank you."): only a 300 ms minimum exists; add a loudness check.
4. **Push-to-talk only works while the browser tab is focused** (expected until v0.3).
5. **Voice synthesis is the main bottleneck.** Each sentence spawns a new `say` process, which costs 1.3–4 s before any audio exists, regardless of sentence length. _(measured 2026-10-10; speech helper built as the new default, needs a real-Mac check)_
   - `sayRate` in the config is ignored by the helper (it only applies to the `say` fallback).
   - Each voice costs a one-time load the first time it is used (Samantha about 0.5–0.9 s, paid at startup; other voices 0.2–0.5 s on first use).
   - `BRIEF.md` still lists macOS `say` as the text-to-speech stack; that file is Jacquez's to update.
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

### 2026-10-10 — speech helper through Q's server, run by Claude Code on this Mac (stand-in Ollama)
| What | Result |
|---|---|
| Synth time reported by the helper, 11-word sentence, Samantha | 43–52 ms |
| Whole `/api/speak` request, same sentence, 3 runs | 62, 44, 43 ms |
| "Voice synth" in the latency panel, two typed turns | 0.05 s, 0.04 s (was 1.86–2.07 s with `say` in the same test setup) |
| Three requests at once | each reply matched its own text |
| Helper killed mid-session | server switched to `say` and said so in status; next sentence took 869 ms |
| Server killed with `kill -9` | helper exited by itself; no stray process |
| Helper binary missing | server started on `say` with a note to run setup |

### 2026-10-10 — real voice turn after the speech helper (Jacquez's screenshot, Chrome with many tabs open)
| Stage | Time |
|---|---|
| Voice to voice | 13.18 s |
| Speech → text | 0.35 s |
| First token | **11.95 s** (model loaded, panel says "warm") |
| First sentence | 0.68 s |
| Voice synth | 0.21 s |
| Generation speed | 17.6 tok/s |

The first-token cost is not explained by model load. The panel doesn't show prompt-processing time, so the cause of this particular turn is not proven; the benchmark below shows a cache miss is the likely one, and the Mac was swapping heavily (8.1 GB of 9.2 GB swap in use, 17% memory free) a minute later.

### 2026-10-10 — prompt-cache benchmark on real Ollama 0.40.2, llama3.2:3b, run by Claude Code on this Mac (code at `0f537e8` plus the uncommitted helper; timestamp still in the system prompt)
| Turn | Back-to-back: prompt ms / first token ms | 61 s gaps (every turn in a new minute): prompt ms / first token ms |
|---|---|---|
| 1 | 189 / 330 | 105 / 185 |
| 2 | 157 / 239 | 424 / 612 |
| 3 | 141 / 203 | 558 / 726 |
| 4 | 163 / 179 | 791 / 942 |
| 5 | 188 / 266 | 1030 / 1224 |
| 6 | 156 / 233 | 1619 / 1848 |
| Median prompt ms, turns 2+ | **157** | **791** |

- With the cache hit, first token stays near 0.2 s however long the conversation is.
- When the minute changes, the cost grows every turn with the history (about 60 prompt tokens per turn here; real replies are longer). This confirms D-006.
- Conditions: Chrome with many tabs, Claude desktop app, Q server and whisper-server running; power state not recorded. Generation ran at 16–27 tok/s.

None of the speech-engine tables above are end-to-end numbers from Jacquez's browser. The cache benchmark (`scripts/bench-cache.mjs`) has not been run against real Ollama yet.
