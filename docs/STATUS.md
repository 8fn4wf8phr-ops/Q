# Q — Status

_Claude Code updates this after every change. Labels: **proposed → approved → built → tested (stand-ins) → verified (real Mac)**. Only "verified" means it worked on Jacquez's Mac with real components._

**Current version:** v0.1  
**Last updated:** 2026-10-11 (Claude Code: microphone menu committed; System panel text now wraps instead of being cut off)  
**What's left:** see [CHECKLIST.md](CHECKLIST.md), which covers the whole roadmap and lists each item as built or not, checked against the code.

## v0.1 — what exists
| Feature | State |
|---|---|
| Push-to-talk (hold Space in the browser tab) → whisper.cpp → Ollama → `say` | run on the real Mac 2026-10-10: works end to end, **latency far over the 1.5 s target** (see Measurements) |
| Speech starts after the first sentence; later sentences synthesize while earlier ones play | tested (stand-ins) |
| First-clause speech: the first piece of a reply may end at a comma, semicolon, colon or dash once three words are ready ("Start speaking at the first pause" in the Voice panel, on by default); each turn records whether its first piece was a clause or a sentence (D-025) | tested: `npm test` (11 chunking cases) and three typed turns on the real model in Claude's built-in Chromium, 2026-10-10; **heard by Jacquez 2026-10-10: keep it on** |
| Timestamp-echo filter (`echo.js`): a bracketed timestamp the model copies back at the start of a reply is removed before the reply is shown, spoken or kept in history | tested: `npm test` (10 cases) and 40 real replies through the server with none leaking, 2026-10-10 |
| whisper-server stays loaded between turns (falls back to whisper-cli) | tested (stand-ins) |
| Q Core Canvas animation tied to real mic, inference and playback events; ~30 fps idle; Reduce Motion | tested (stand-ins) |
| Interrupt via Esc, the Stop button or clicking the core; typed input fallback | tested (stand-ins) |
| Latency panel: per-stage times, voice-to-voice, median of last 12 turns | tested (stand-ins); superseded 2026-10-10 by the rows below |
| Main metric is "Key release → first audio", timed from key release (typed turns: "Enter → first audio", kept out of the statistics) | built; typed turns checked in Claude's built-in Chromium; **the key-release timing needs a real voice turn** |
| Every finished turn is stored as numbers only (stages, prompt time and size, load, warm-up wait, cold flag, idle time since the previous turn, input level, turn number), up to 200 turns; a turn interrupted while speaking a finished reply is kept | tested: two typed turns on the real model, 2026-10-10; no message text in storage |
| p50 and p90 for warm and cold voice turns, p90 only from 10 turns up (`public/stats.js`) | tested: `npm test` (23 cases) and the panel with 14 injected turns; **no real voice turns yet** |
| Server sample per turn (`/api/system`): swap, memory pressure, free and compressed memory, decompressed/paged-in since the previous turn, process memory, power source, whether VS Code is running | run on this Mac 2026-10-10 and matched against the same commands by hand; takes about 40 ms, requested after first audio |
| "Copy run data" and "Clear" buttons; the export is built from an allowlist of numeric fields (D-007) | tested: `npm test` plants message text and checks none comes out; export checked in Claude's built-in Chromium through the fallback text box; **the clipboard path itself has not run (that browser blocks it); try it in Chrome** |
| System panel: model, speech and voice status; Ollama model memory; server process memory | tested (stand-ins) |
| `persona.md` re-read every turn; last 8 turns of context | tested (stand-ins) |
| Example-driven persona written by Jacquez (short first sentence, no assistant-speak, wider "can't do yet" list, twelve example exchanges), applied unchanged in `21c0809` | one ten-turn typed run on the real model 2026-10-10 (see Measurements); **confirmed working by Jacquez 2026-10-10**; no blind quality test |
| `npm run setup` (whisper-cpp, base.en model, llama3.2:3b) | run by Jacquez (Ollama 0.40.2 and whisper.cpp present 2026-10-10) |
| Whole pipeline on the real Mac | first runs 2026-10-10; test conditions (browser, VS Code load, power) not recorded |
| "Warming up" state until the startup model load finishes; a turn that waits on it is timed (`warmupWaitMs`) and labelled cold; warm-up now loads with the same `num_ctx` as chat (D-020) | **real-Mac test by Jacquez 2026-10-10 found two gaps**: after Ollama was quit and reopened Q showed "Ready" with Brain "Installed", and the first turn paid a 3.8 s load (correctly labelled cold) plus 3.39 s of prompt processing for 745 tokens. Both addressed in the next row |
| Warm-up runs again whenever a status poll finds Ollama reachable with the model not in memory, and it primes Ollama's cache with the real system prompt instead of an empty one (D-024) | benchmarked on the real Mac against real Ollama through a second Q instance 2026-10-10 (see Measurements); **confirmed by Jacquez 2026-10-10 on both paths: Q restart (export) and Ollama quit-and-reopen** |
| Turns that follow 3 minutes or more without the model being used are labelled "idle" (server-measured), and the statistics and export report warm, idle and cold separately | tested: `npm test` (33 cases in the statistics file); **no real idle turn recorded with the new label yet** |
| The page warns "Q's server is older than this page · Restart Q" when the running server predates the page's code; a failed memory sample is no longer stored as a sample | built 2026-10-10 after Jacquez's export came back with every memory field empty because his server had been running since before the export code existed; **not yet seen in a browser** |
| Samantha is the default voice when none is chosen, falling back to the system voice if she isn't installed; the Voice panel names the real default (D-018) | tested (stand-ins): `/api/status` and `/api/speak` on this Mac with a fake Ollama; **not yet confirmed in a real turn** |
| Voice engine selector: "Browser speech (local voices only)" next to "macOS say"; browser speech never uses a non-local voice; the core pulses on real word events; "first audio" is the first word event, not the browser's early `start` event. Default engine is still `say` (D-019) | tested (stand-ins): fake Ollama, typed turns in Claude's built-in Chromium on this Mac, including interrupt and switch; **not yet run in Jacquez's browser or with the mic** |
| Speech helper (`speech/q-speak.swift` → `bin/q-speak`): one process kept loaded, returns audio through `/api/speak`; default voice path, with automatic fallback to `say` if it isn't built or stops, shown in the System panel (D-021) | tested (stand-ins): real helper and real voices on this Mac through the server and Claude's built-in Chromium, with a fake Ollama; **one real voice turn by Jacquez 2026-10-10: voice synth 0.21 s (was 3.40 s)** |
| `say` sentences are now synthesized one at a time instead of in parallel | tested (stand-ins): one typed turn; **effect on real latency not measured** |
| Stable prompt prefix: the system prompt no longer changes; each user message carries a fixed timestamp from when it was created; history is capped at 8 turns or 6000 characters and old turns are dropped 4 at a time (D-006, D-022) | benchmarked on the real Mac against real Ollama through `/api/chat` 2026-10-10 (see Measurements); **not yet run in a real voice turn** |
| "Prompt processing" row in the latency panel (time and prompt size) | built; **not yet seen in a browser** |
| Silence guard: each recording is measured in 20 ms frames (`public/level.js`); if less than 120 ms of it is louder than -50 dBFS, Whisper is skipped and Q says it didn't hear anything, with the measured level. Voice turns show an "Input level" row (D-012) | tested (stand-ins): `npm test` (16 cases, including real synthesized speech turned down 20 and 30 dB) and the decode-and-measure path in Claude's built-in Chromium; **confirmed on the real microphone by Jacquez 2026-10-10: silent holds are skipped; real speech peaks at −27 to −6 dB; threshold kept at −50 dB (silent-hold levels not recorded)** |
| Whisper vocabulary hint (`whisperPrompt` in the config): a short line of expected words ("Hey Q", "Yo Q", "VS Code", "Ollama", "GitHub") sent with every transcription (D-023) | tested on the real Whisper (`base.en`) with synthesized speech, 2026-10-10 (see Measurements); **not yet tried with Jacquez's voice** |
| Speech helper fix: a late "finished" signal from one sentence no longer ends the next one with no audio | tested on this Mac 2026-10-10: 40 of 40 runs of 6 queued sentences and 120 of 120 sequential sentences at full length (the old helper lost sentences in 10 of 12 queued runs); **confirmed by Jacquez after a restart, 2026-10-10: a reply of three or more sentences played in full** |
| The System panel shows which microphone Q records through: the device the browser opened for the last recording, or the system default before the first one. A change mid-session is announced in the conversation and flagged on the row; phone and wireless mics are marked "Check". Each run and the export header record the device name | tested 2026-10-10: `npm test`, and the default-device and device-change paths in Claude's built-in Chromium with simulated device lists (including a name containing HTML, which is shown as text); **the recording path has not run with a real microphone** |
| Microphone menu ("Your microphone" in the Voice panel): "System default" or one specific device. A chosen device is requested exactly; if it isn't connected Q refuses to record and says so, with no fallback to another microphone. The choice is remembered in the browser | tested 2026-10-10 in Claude's built-in Chromium with simulated devices and a stand-in audio stream: the menu lists devices, the chosen device's ID is what the browser is asked for, and with the device removed Q shows an error and makes no fallback request; **seen on the real Mac by Jacquez 2026-10-11: the menu is there, the Mic row named AirPods (Bluetooth) with the "Check" badge, and the change from the built-in microphone was announced; pinning a device and recording through it not yet confirmed** |
| `npm test` runs `scripts/test-level.mjs`, the repo's first test | run on this Mac 2026-10-10: all cases pass |
| `Start Q.command`: double-click launcher. Opens the page if Q is already running; otherwise checks Ollama (opens the app and waits up to a minute), runs `npm start` in a Terminal window and opens the page when the server answers. No auto-start at login | tested from a shell on this Mac with a stand-in for the browser `open`: already-running, cold start through a symlink, second launch, busy port, Ollama not running; **double-click from Finder confirmed working by Jacquez 2026-10-10** |
| Closing the Terminal window (SIGHUP) now shuts Q down cleanly, including `whisper-server` and the speech helper | tested by sending SIGHUP to a test instance: no stray processes left |
| `scripts/bench-cache.mjs`: prompt-cache benchmark through `/api/chat` (back-to-back vs `--gap 61`, `--turns`, `--save`/`--load` for restart tests), timings only | run on the real Mac against real Ollama 2026-10-10 (see Measurements) |

## Known issues — fix before benchmarking
1. **(Fix built 2026-10-10, see Measurements.)** **Timestamp breaks Ollama's prompt cache.** `server.js` puts the current time, to the minute, into the system prompt, so the persona and history are reprocessed after every minute change and latency comes out inflated. Use the date or hour, or put the time in the latest message. _(found by Claude Chat; not yet fixed)_
2. **(Built 2026-10-10.)** **Instrumentation gaps for the v0.1 gate:** no p90, no swap or memory-pressure sampling (must come from the server), no cold vs warm split, no "Copy run data" export. The metric should be labeled "key release → first audio". The export must contain timings only, no transcripts or audio.
   - Turns interrupted before the reply finished generating are not recorded.
   - The first turn after a page load has no "since the previous turn" memory figures.
   - `ollamaMb` is the Ollama processes' own memory and does not include the model, which lives in graphics memory; the model's size is in the export header from Ollama's own figure.
   - The 12 turns stored in the old format are dropped on first load of the new page.
   - "First audio" is still when playback is scheduled, not when sound leaves the speaker.
3. **Whisper hallucinations on near-silent clips** (e.g. "Thank you."): only a 300 ms minimum exists; add a loudness check. _(silence guard built 2026-10-10; needs calibrating on the real mic)_
   - The -50 dBFS threshold has not been checked against Jacquez's microphone, which runs with automatic gain control. To calibrate: a few silent holds and a few quiet sentences, then read the levels Q reports.
   - Synthesized speech turned down 40 dB (loudest frame about -52 dB) is rejected; that is the current lower limit for quiet speech.
   - Steady loud noise still reaches Whisper. The guard catches silence, not noise.
   - The last 100 ms of each recording is ignored so the key-release click doesn't count as sound.
19. **Whisper `base.en` misheard about 1 in 3 turns at normal volume on Jacquez's real voice** (2026-10-10): "What time is it" → "Make sure what time is there"; "Tell me about Spider-Man" → "Don't leave out Spider-Man". This is the top v0.2 item: test `small.en` and the vocabulary hint on his real voice. Note the server in that session predated the vocabulary hint, so the hint has still not been tried on his voice. Both errors add or change words at the very start, which also fits a clipped beginning (the mic opens fresh on every press).
20. **While a Q tab is open and visible, the model no longer stays unloaded.** The new re-warm fires on the next status poll (every 8 s) whenever the model isn't in memory, so Ollama's `keepAlive` unload only holds when the tab is closed or hidden. That keeps about 2.4 GB in use. Tied to D-014 and the `keepAlive` open question.
21. **A server that hasn't been restarted keeps serving new pages.** Now flagged in the System panel, but everything server-side (vocabulary hint, helper fix, warm-up changes, memory sampling) only takes effect after a restart.
22. **Q had been recording through Jacquez's iPhone as a Continuity microphone without saying so** (found by Jacquez 2026-10-10). The browser uses the system default input and macOS can switch that to a nearby iPhone. Every real-voice result so far (the roughly 1-in-3 mishearings, the speech levels of −27 to −6 dB, the silence-guard check) may have been through the iPhone, not the MacBook's microphone, and should be repeated on a known microphone before conclusions are drawn. Q now shows the device and, from the microphone menu, lets you pin one.
4. **Push-to-talk only works while the browser tab is focused** (expected until v0.3).
17. **Quiet speech can be misheard** (reported by Jacquez 2026-10-10). Tests with synthesized speech point at three causes, not volume alone: background noise close to the voice level, unusual words ("Q", "Ollama"), and a clipped start. The vocabulary hint addresses the second. Still open: the first words can be clipped because the mic is opened fresh on every press, and "Hey Q" spoken quietly still came out as "Thank you." in 2 of 4 conditions.
18. **The speech helper as first pushed (`b69cbcb` to `582ae00`) could drop sentences.** When a request reached it within a few milliseconds of the previous reply, the next sentence came back empty: 45 of 60 at a 0 ms gap, 0 of 60 at 5 ms or more. How often Q's page hit that window in real use is not known. Fixed 2026-10-10.
9. **The first turn after a few idle minutes can be slow even though the model is "Loaded".** A 349-token prompt that normally takes about 0.2 s took 4.5 s after roughly six idle minutes, with 8–9 GB of swap in use. Measured 2026-10-10 (see Measurements): after 4 idle minutes macOS had compressed the model's memory and the next request decompressed about 2.7 GB, roughly the whole model. No fix built; options are fewer open apps, a keep-warm ping, or labelling the turn. This, not the cache, may explain some of the 11–12 s first tokens. Related to D-014 and the `keepAlive` open question.
10. **Trimming still costs about 1.1–1.2 s on one turn in four** once a conversation passes 8 turns (was 1.6–1.9 s on every turn).
11. **Timestamps on messages cost about 0.1 s per turn** (more tokens in each new message: prompt time on a cache hit went from about 0.16 s to 0.26 s).
13. **The model only partly follows the new persona** (one typed run, 2026-10-10): the first sentence ran over the "about eight words" rule in 3 of 10 replies; two refusals and "big dawg" were copied word for word from the examples despite the rule against it; one reply used assistant-speak ("here to help and answer any questions") and one invented a claim ("been waiting for you to wake up").
14. **The longer persona roughly doubles the fixed part of the prompt** (about 750 tokens on the first turn, up from about 390). It is cached after the first turn, but the first turn after a start or an idle spell pays for it: 7.8 s first token in the trial run.
15. **The launcher always uses port 4141** (or `Q_PORT` if set in the environment); it does not read a port from `q.config.json`.
16. **Two copies of Q on different ports share one `whisper-server` port (4142).** The second copy reports speech-to-text as ready because the first copy's whisper answers. Only reachable by starting Q twice on purpose with different ports; the launcher prevents a second copy on the same port.
12. **(Echo now filtered, 2026-10-10.)** In a 30-reply test one reply began by reading its timestamp back ("[Sat, Oct 10, 2026, 2:10 PM] For me, …"); the filter removes a leading echoed stamp. An echo in the middle of a reply is not removed. **Date answers from the 3B model are not fully reliable.** With the short stamp it answered the weekday wrongly once in 7 tries ("Sunday" on a Saturday); a longer stamp format got 6 of 6 but echoed the bracketed stamp aloud once in 4 date questions. The short format was kept. The old system-prompt time was never tested the same way, so there is no baseline.
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

### 2026-10-10 — prompt fix, before vs after, real Ollama 0.40.2, llama3.2:3b (run by Claude Code on this Mac through a second Q instance on port 4198; before = `b69cbcb`, after = working tree)
First token in ms, as measured by the benchmark client.

| Case | Before | After |
|---|---|---|
| Back-to-back, turns 2–8 | 168–238 | 276–507 (most 276–299) |
| Back-to-back, turns 9–14 (past the history cap) | 1607–1977 on every turn | 213–298, except 1329 and 1186 on turns 9 and 13 when a block is dropped |
| 61 s gaps, turns 2–6 (every turn in a new minute) | 612, 726, 942, 1224, 1848 | 853, 541, 486, 342, 487 |
| First turn after restarting Q, 6 turns of history | 1741 | 340 |

Prompt-processing time alone (Ollama's own figure):

| Case | Before | After |
|---|---|---|
| Median, back-to-back turns 2–14 | 166 ms, but 1546–1896 ms on turns 9–14 | 259 ms |
| Median, 61 s gaps turns 2–6 | 791 ms, rising to 1619 | 293 ms, flat |
| First turn after restart | 1624 ms | 279 ms |

- The restart cost was the minute changing, not the warm-up: with the stamp fixed it disappeared.
- In the gap runs first token is 50–550 ms above prompt time on some turns; that overhead appears after idle and is not explained yet.
- Timestamp check: 14 benchmark replies contained no brackets, times or dates. "What time is it?" was right 3 of 3, including with a three-hour-old message in history.
- Conditions: Chrome with many tabs, Claude desktop app; 8–9 GB of swap in use throughout; power state not recorded. Jacquez's own Q server was not running during the after runs.

### 2026-10-10 — new persona, one ten-turn typed conversation (run by Claude Code through a temporary Q instance, real llama3.2:3b, no voice)
| Check | Result |
|---|---|
| Replies of at most three sentences | 10 of 10 |
| First sentence under about eight words | 7 of 10 (misses: 12, 14 and 13 words) |
| Plain refusal when asked for something Q can't do (weather, open an app) | 2 of 2, both word for word from the persona's examples |
| Recalled the previous turn when asked | 1 of 1 |
| "What time is it?" | correct; no bracketed timestamp read back in any reply |
| First token, turns 2–10 | 0.16–0.29 s, except 0.93 s on turn 9 when a history block was dropped |
| First token, turn 1 (new persona, nothing cached, after idle) | 7.84 s (6.75 s of prompt processing for 748 tokens) |

One run of a model that varies every time: these are observations, not rates.

### 2026-10-10 — first turn after idle (run by Claude Code straight against Ollama: one identical, fully cached request after each idle gap; plugged in, Low Power Mode off, 9.4–9.8 GB swap in use)
| Idle before request | First token | Prompt processing | Memory decompressed during the request | Generation |
|---|---|---|---|---|
| 0 s | 51 ms | 41 ms | 186 MB | 27.1 tok/s |
| 20 s | 100 ms | 72 ms | 197 MB | 27.7 tok/s |
| 60 s | 165 ms | 69 ms | 86 MB | 28.0 tok/s |
| 120 s | 160 ms | 82 ms | 85 MB | 28.0 tok/s |
| 240 s | 805 ms | 704 ms | 2665 MB | 27.5 tok/s |

- The prompt was identical every time, so none of this is prompt-cache cost. Disk swap-ins stayed at 0–2 MB; the work was decompression.
- One run, one sample per gap. It shows the mechanism but did not reproduce the 4.5–7.8 s seen earlier after longer idle spells; those may involve pages that had gone to disk, which this run did not capture.

### 2026-10-10 — Whisper vocabulary hint (real `base.en` through `/api/transcribe`; 10 synthesized sentences × 4 conditions: normal, 30 dB quieter, 30 dB quieter with noise 10 dB below the voice, 38 dB quieter)
| | Exact transcripts (ignoring case and punctuation) |
|---|---|
| Without the hint | 23 of 40 |
| With the hint | 33 of 40 |

- Every change was a wrong transcript becoming right; none went the other way. Fixed: "Yo Q" (was "Yo-kyo", "You're cute"), "Ollama" (was "Olima"), "VS Code", "GitHub", and one quiet "Hey Q".
- Still wrong with the hint: quiet "Hey Q, are you there?" → "Thank you. Are you there?" in 2 conditions, and 5 noisy-room transcripts of ordinary sentences.
- Silence and noise clips returned nothing with or without the hint, so the hint did not leak into empty audio.
- Caveats: a synthetic voice, not Jacquez's; and two of the test sentences use phrases that are in the hint itself, which flatters the result.
- Volume alone was not the problem: ordinary sentences were transcribed correctly 38 dB quieter in a quiet room. Cutting the first 0.3 s off a clip lost the opening words every time and once produced a phantom "Thank you."

### 2026-10-10 — real-Mac voice turns reported by Jacquez (server started 11:59, so: speech helper before its fix, no vocabulary hint, no memory sampling)
| What | Result |
|---|---|
| Warm turns, key release → first audio | 1.37–1.61 s, every stage under 0.6 s |
| Turn after 7.6 min idle | 5.96 s (speech → text 1.60 s, prompt processing 2.43 s for 942 tokens); was labelled warm |
| First turn after quitting and reopening Ollama | 3.8 s model load plus 3.39 s prompt processing for 745 tokens; Q showed "Ready" beforehand |
| Whisper accuracy | about 1 turn in 3 misheard at normal volume |
| Export | timings correct; every memory field and five header fields empty (stale server, see known issue 21) |

### 2026-10-10 — cold first turn, before vs after (real Ollama, second Q instance on port 4198; before = `eb7f659`, after = working tree; 2 trials each)
| Case | Before: first token | After: first token |
|---|---|---|
| Model not loaded, then Q starts | 3184, 3342 ms (load 7–10 ms, prompt 3089–3288 ms for 751 tokens) | 342, 319 ms (prompt 268–269 ms) |
| Q running, then the model is dropped as an Ollama restart does; one status poll; 10 s later a turn | 4357, 5111 ms (load 1334–2084 ms, prompt 2964–2965 ms) | 348, 382 ms (load 5–23 ms, prompt 287–290 ms) |

- The cost moved into the warm-up, where it belongs: "Warming up" now lasts about 3–5 s (about 1.1 s load plus 2.8 s priming the system prompt) instead of the first turn paying it.
- A first attempt at the second case showed no gain because a retry throttle blocked re-warming within 15 s of a successful warm-up; fixed, and the figures above are after that fix.
- A second and third turn after the primed first turn took 165 and 276 ms to first token.

### 2026-10-10 — first export from the restarted server (Jacquez, Chrome 154, on battery, VS Code running; 4 voice turns, memory figures present)
| Turn | Key release → first audio | Speech → text | First token | First sentence | Voice synth | Prompt processing |
|---|---|---|---|---|---|---|
| 1 (first turn after the restart) | 2149 ms | 605 | 584 | 780 | 181 | 356 ms / 792 tokens |
| 2 | 2075 ms | 395 | 562 | 935 | 183 | 343 ms / 842 tokens |
| 3 | 2225 ms | 282 | 346 | 1377 | 220 | 236 ms / 892 tokens |
| 4 | 1816 ms | 422 | 419 | 805 | 171 | 228 ms / 949 tokens |

- The first turn after a restart was not slow: prompt processing 0.36 s for 792 tokens, against 3.39 s for 745 tokens before the priming fix. That is real-Mac evidence for the warm-up fix on the Q-restart path; the Ollama quit-and-reopen path has not been re-tested.
- "First sentence" is now the largest stage (0.78–1.38 s). The model was generating at 19–20 tokens per second and each reply's first sentence ran 16–26 tokens, so Q waits about a second for a sentence to finish before it can speak.
- Memory: swap 5.3 of 6.1 GB in use, 55–79 MB free, pressure "warning" on every sample. Between turns 12–15 s apart the whole Mac decompressed 3.2–4.9 GB and paged in 0.5–1.4 GB, so the system was churning memory even during active use.
- Input level on real speech across all 10 exported turns: loudest frame −27 to −6 dB, far above the silence guard's −50 dB threshold. Silent holds have not been measured yet.
- Idle label on the earlier six turns (old server, client-measured idle): 3.0 min idle → 1614 ms (not slow), 2.6 min → 1429 ms, 7.6 min → 5957 ms. One slow and one fast turn in the idle group; the slowdown starts somewhere between 3 and 7.6 minutes.
- Export fault found: the six turns recorded against the old server carried an empty memory object, and the export counted them as samples ("systemSamples": 10; the true figure is 4). Fixed in `public/stats.js`.

### 2026-10-10 — how much sooner a first clause arrives than a first sentence (30 single-turn typed prompts, real model, current persona; measured on the token stream before the feature was built)
| Measure | Result |
|---|---|
| First token → end of first sentence | median 609 ms, range 119–1480 ms |
| Replies with a clause break (after 3+ words) inside the first sentence | 17 of 30 |
| Time saved on those by speaking at the clause | median 502 ms, range 125–1211 ms |
| Averaged over all 30 replies | 294 ms |
| First sentences of 8 words or fewer (the persona's rule) | 12 of 30; median first sentence 12 words |

- Some breaks are awkward: "Break down big tasks into smaller, | manageable chunks"; "Practice in front of a mirror, | record yourself, and watch or listen".
- After the build, three typed turns in a browser: first piece was a clause on two (first phrase 311 and 154 ms) and a sentence on one (359 ms).

### 2026-10-10 — Whisper `base.en` vs `small.en` (two `whisper-server` instances on spare ports, 4 threads; 14 sentences × 2 synthesized voices (Samantha, Daniel) × 4 conditions = 112 clips each)
`ggml-small.en.bin` (487,614,201 bytes) was downloaded from `huggingface.co/ggerganov/whisper.cpp` and its SHA-256 matched the published value. It is in `models/`, not in use by Q.

| | base.en | base.en + hint | small.en | small.en + hint |
|---|---|---|---|---|
| Exact transcripts, normal volume | 23/28 | 26/28 | 25/28 | 28/28 |
| Exact, 30 dB quieter | 21/28 | 26/28 | 23/28 | 26/28 |
| Exact, quieter with noise | 11/28 | 13/28 | 17/28 | 20/28 |
| Exact, first 0.3 s clipped | 0/28 | 0/28 | 2/28 | 2/28 |
| Exact, all 112 | 55 (49%) | 65 (58%) | 67 (60%) | 76 (68%) |
| Words wrong, all 112 | 17.3% | 12.8% | 13.5% | 8.0% |
| Words wrong, quieter with noise | 27.6% | 21.8% | 19.2% | 7.7% |
| Time per clip, median / p90 | 159 / 169 ms | 163 / 174 ms | 447 / 469 ms | 455 / 474 ms |
| Memory held by the server | about 220–280 MB | | about 550–630 MB | |

- `small.en` with the hint is the most accurate, and its biggest gain is in noise. It costs about 0.29 s more per turn and about 350 MB more memory, on a Mac that had 7.5 of 8.2 GB swap in use during the run.
- The hint helps both models by a similar amount and costs nothing measurable.
- A clipped start defeats both models: 0 and 2 exact out of 28. A bigger model does not fix that.
- Jacquez's two real failures ("What time is it", "Tell me about Spider-Man") were transcribed correctly by both models in every condition except the clipped one, so they were not reproduced. A follow-up test put a key thump, a breath-like noise, a loud noise burst or 1.5 s of silence before the speech: both models were still 6 of 6 on every variant. The cause of his real-voice errors is not identified; synthesized speech does not stand in for his voice, mic and room.

None of the speech-engine tables above are end-to-end numbers from Jacquez's browser. The cache benchmark (`scripts/bench-cache.mjs`) has not been run against real Ollama yet.
