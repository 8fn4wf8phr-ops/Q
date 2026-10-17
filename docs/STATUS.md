# Q — Status

_Claude Code updates this after every change. Labels: **proposed → approved → built → tested (stand-ins) → verified (real Mac)**. Only "verified" means it worked on Jacquez's Mac with real components._

**Current version:** v0.4 in progress (v0.1 closed 2026-10-11, D-028; v0.2 closed 2026-10-16, D-039; v0.3 built 2026-10-13, not formally closed)  
**Last updated:** 2026-10-13 (Claude Code: v0.4 step 1: conversations are saved to a local file with pause, delete and retention controls (D-037), confirmed by Jacquez. AirPods as microphone cut Q's voice mid-sentence; pinning the MacBook mic fixed it)  
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
| Persona additions on 2026-10-11 after the quality test: four honesty examples (files, past sessions, predictions, exact figures) and a closing reminder paragraph. Drafted by Claude Code, approved by Jacquez | sampled on the real model: honesty passes 17 → 27 of 30 as read by Claude Code; **judged blind by Jacquez 2026-10-11: 9 of 9 rules met, 6 of 6 honesty rules; not yet reported from a voice turn** |
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
| Microphone menu ("Your microphone" in the Voice panel): "System default" or one specific device. A chosen device is requested exactly; if it isn't connected Q refuses to record and says so, with no fallback to another microphone. The choice is remembered in the browser | tested 2026-10-10 in Claude's built-in Chromium with simulated devices and a stand-in audio stream: the menu lists devices, the chosen device's ID is what the browser is asked for, and with the device removed Q shows an error and makes no fallback request; **seen on the real Mac by Jacquez 2026-10-11: the menu is there, the Mic row named AirPods (Bluetooth) with the "Check" badge, and the change from the built-in microphone was announced; pinning the built-in microphone and recording through it confirmed by Jacquez the same day** |
| Keep-warm (D-026): while a Q page is open, the server touches the model, Whisper and the voice every 120 s for 15 minutes after the last turn; pressing the talk key also touches them at once. The model touch replays the last turn, reply included, so the cached conversation is preserved. The Brain row shows "kept warm until …"; each run records how many pings preceded it | tested on the real model 2026-10-11 through a temporary second instance (see Measurements); **seen in Jacquez's browser after a restart, 2026-10-11: the Brain row showed "kept warm until …" after a turn; confirmed by Jacquez the same day with a real idle gap followed by a fast turn** |
| Whisper comparison mode: a Voice-panel checkbox starts a second `whisper-server` (`small.en`) while ticked; each recording goes to both models; if they differ, both transcripts are shown and Jacquez marks `base.en`, `small.en` or neither. Only the score and the second model's timing are kept | tested on the real models 2026-10-11 through an isolated instance, including a browser run with speech played into a stand-in microphone: one "heard the same", one disagreement marked, score and export fields correct, no transcript in storage; second server gone after switching off; **used by Jacquez on his real voice 2026-10-11 for 43 turns (see Measurements)** |
| Quality test tooling (D-008): 20 prompts in `quality/prompts.json`; `scripts/quality-run.mjs` runs them through Q's real chat pipeline (optionally another installed model) and writes a cloud-reference template to fill in by hand; `/quality.html` compares two runs blind | runner run once on the real model (20 of 20 answered); comparison page checked with made-up data; **no real blind comparison done yet; thresholds not set** |
| Trim priming: when the next turn will drop a block of history, the server rebuilds the model's cached conversation right after the current reply, while Q is still speaking | benchmarked on the real model 2026-10-11 (see Measurements); **confirmed in real use by Jacquez's 2026-10-12 export: the three trim turns that evening processed their prompts in 0.23–0.38 s, and five more in the 2026-10-11 comparison session in 0.27–0.49 s (was 0.9–1.6 s)** |
| Hidden-page heartbeat: the page tells the server it is open every 30 s even when hidden, and the server counts a page as open for 150 s, so keep-warm continues with Q behind another window | tested on the real model 2026-10-11 with heartbeats only and with none (see Measurements); **not yet tested with a really hidden Chrome tab** |
| Clipped-first-words measurement: each voice turn records how long the microphone took to open after the key went down, and whether sound was already present in the first 100 ms of the recording. Shown as "Mic opened in …" in the latency panel; both in the run data, with a summary in the export | tested 2026-10-12: `npm test`, and a browser run with a stand-in microphone (opened in 0.09, 0.28 and 0.68 s as set up; flagged only the case where speech was already playing); **real data from Jacquez's 2026-10-12 session (19 voice turns, built-in microphone): see Measurements** |
| Microphone kept open for 60 s after each voice turn, so a follow-up press starts recording at once instead of waiting for the device. Nothing is recorded while it is held; a new recorder is made per turn. Let go when the device list changes, when another microphone is picked, or when the box under Voice is unticked. Not used for phone or wireless microphones. Run data records `micHeld` per turn and splits mic-open time into kept-open and opened-fresh. While held, the macOS microphone indicator stays on | tested with stand-ins (stand-in microphone with a 0.5 s opening delay: second press recording after 0.08 s without reopening the device; release on device change and on untick confirmed). **Verified on the real Mac 2026-10-12: 16 follow-up presses recorded after 0.05–0.07 s (median 0.06 s) against 0.55 and 1.30 s for the two fresh opens; the hold ended as designed after a 62 s gap.** Release on device change not exercised on the real Mac |
| Keep-warm now also runs from the startup warm-up, not only after a turn (15 minutes, page open). A turn is labelled cold only if the model load took over 1 s (was 0.3 s) | tested with stand-ins (status shows the keep-warm window open before any turn). **Seen once on the real Mac 2026-10-12: the first turn after a restart, with three pings before it (six minutes or more), reached first audio in 1.31 s; the same case took 7.8 s the day before.** No turn was mislabelled cold |
| Q's own window (`shell/` → `bin/Q.app`, D-032): Q's page in a floating WKWebView window, a **Q** menu bar item (show or hide, reload, quit), and the global ⌥Space push-to-talk key (D-033). Built by setup or `npm run build:shell`; the launcher opens it, or the browser if it isn't built. Reloads by itself while the server isn't answering. Quitting it leaves the server running. Its run history is separate from Chrome's. Started as the 2026-10-13 spike, which Jacquez used by voice from ⌥Space | tested with stand-ins 2026-10-13: builds twice cleanly; launcher checked in three cases (fresh start on the real Mac brought up the server and one window; already running; window not built → browser); retries against a dead port. **Verified on the real Mac 2026-10-13 by Jacquez's report: voice from ⌥Space works in this build** (no log this time; the launcher starts the window without one). Setup's new step was not run end to end |
| Floating Q Core, step 1 (orb only): Q's window starts as a 120 × 120 frameless, see-through orb in the top-right corner, on every Space. Drag it anywhere and it stays there. Click it to open the full panel from that corner; "Shrink to orb" (top of the panel, or the menu bar item) goes back. Clicking while Q is busy interrupts instead. The idle orb stops redrawing after 2 s in compact mode only. A soft dark disc sits behind the orb because its glow needs a dark background. | verified on the real Mac 2026-10-13 by Jacquez's report: the orb reacts to him and to Q. Tested with stand-ins: compact layout shows only the orb and switches back; it starts on the real Mac in compact mode and loads the page in 1.8 s; the window's processes sat at 0–1% CPU while idle with one blip to 6%. Dragging and the look have not been commented on |
| Floating Q Core, step 2 (caption): during a turn the compact window widens by 300 px toward the middle of the screen, the orb staying put, and shows what Q heard and the piece it is saying (or "Listening…", "Thinking…", "Didn’t catch that" and errors). It fades 4 s after Q goes quiet and the window narrows again. When replies aren't spoken aloud the caption still follows them | Tested with stand-ins 2026-10-13: a typed turn in compact layout showed the question, "Thinking…", then the reply, and the caption was gone 5 s later. **Verified on the real Mac 2026-10-13 by Jacquez's report ("it works")**; no measurements behind it |
| Automatic microphone (D-034, `public/micpick.js`): with no mic chosen and a wireless system default, Q uses the built-in mic, and says so in the Mic row, the mic menu (first entry is now "Automatic") and once in the conversation. Choosing the wireless mic yourself still works and is warned about | tested with stand-ins 2026-10-13: 11 unit cases in `npm test`; in the page with stand-in device lists the menu, note, Mic row and one-time message behaved through AirPods arriving, being picked by hand, and leaving. **Confirmed by Jacquez 2026-10-13 with AirPods in: works.** Q's window (WebKit) does list the default microphone first (seen 2026-10-13: AirPods first while they were the default) |
| One app (D-035): Q's window starts Q's server itself when none is answering (`node server.js` from the Q folder, found in the usual install places since Finder gives apps no shell PATH), opens Ollama if needed, and stops the server on quit. A server that was already running is used and left alone. The server stops by itself if the app dies. Server output goes to `~/Library/Logs/Q/server.log` (menu: Show server log). The menu shows Q's state, and while there is no page the orb shows "Starting Q…" or the reason it can't start. `Start Q.command` now just opens the app | tested on the real Mac 2026-10-13 by Claude Code, with process counts: attaches to a running server and leaves it on quit; starts its own (page loaded 2.9 s after launch); normal quit removed server, Whisper and voice helper; `kill -9` of the app removed all three within 5 s; throwaway copies showed the "not in the Q folder" and "Node.js isn't installed" messages. Found by Jacquez the same day: closing the full panel with its red button hid Q altogether, and the launcher then brought the panel back with no orb. Fixed: closing the panel now shrinks Q to the orb, and a hidden Q always comes back as the orb (self-tested: panel closed → compact, visible, top right). Right-clicking (or Control-clicking) the orb now opens the same menu as the menu bar item, because the plain "Q" in the menu bar was hard to find; confirmed by Jacquez. If a server the window was only borrowing stops, the window now starts its own (tested on a separate port: borrowed server killed, own server up and page back 10 s later). **Verified on the real Mac 2026-10-13 by Jacquez's report ("it works") after trying: the right-click menu, Quit Q, starting again from the launcher, closing the panel back to the orb, and a voice turn.** The Ollama-not-running path was not exercised |
| Split-Core mark, phase 1 of 5 (D-036): `public/mark.js` describes the mark's shape once (three ring segments, the tail in its own gap, a dark core; a simpler cut for 32 px and under) and turns it into an SVG at any size, with an optional halo and a one-colour version. A preview page shows it at 256 to 16 px on dark, light and grey: `http://127.0.0.1:4141/mark.html`. **Nothing in Q uses the mark yet**: the orb, header, tab icon and menu bar are unchanged | built 2026-10-13, uncommitted. 31 unit cases in `npm test` (no overlapping segments, tail inside its gap, fits its box, no blur filters, colour contrast of 4.8 or more against navy). Looked at by Claude Code in a test browser; Jacquez went on to phase 2 without changes. Known weak spot: on a white background the cyan segments have little contrast |
| Split-Core mark, phase 2 (the live orb): `public/core.js` now draws the orb in the Split-Core shape from `mark.js`, in the full page and the floating orb: three solid ring segments, the tail in its gap, a navy sphere in a dark channel. Every earlier animation is kept, at Jacquez's request: breathing, orbit lines, particles, tick ring (now in the channel), audio ripples, the thinking spinner (now inside the core), the build-up on start, and a band of light travelling round the ring in place of the old rotating colours. New: the core brightens with live audio. Working states keep cyan left and violet right; waiting, error and not-ready colour the whole mark amber, red or grey | verified on the real Mac by Jacquez's report. Before that, looked at by Claude Code as still frames in a test browser for every state at 190 and 120 px. Cost per frame against the old orb, same test: 6.2 ms vs 5.5 ms at 380 px idle, 1.3 ms vs 1.1 ms at 120 px, so **about 12–25% more, not less** (the figures include a forced read-back and overstate both). **Seen running in Q's window by Jacquez 2026-10-13: "works"** |
| Split-Core mark, phases 4 and 5: the page header, the browser tab icon (on its own dark tile) and the avatar beside Q's replies are drawn from `mark.js`; the page's cyan, blue and violet are now the Split-Core palette; the header mark's blur-based glow is gone. `Q.app` gets an app icon (`Q.icns`, the mark with its halo on a dark tile, simpler cut at 16 and 32 px) and a one-colour menu bar icon that macOS tints, both generated at build time from `mark.js` (`shell/make-assets.mjs`, `shell/make-icon.swift`). Without Node at build time the app falls back to the plain "Q" and the default icon | verified on the real Mac by Jacquez's report. Checked by Claude Code before that: header mark and palette in a test browser; the 256 px and 64 px icon images by eye; `Q.icns` and `menubar.svg` are in the built app; 34 unit cases. **Seen by Jacquez 2026-10-13 (menu bar icon, app icon, tab icon, avatar); no changes asked for** |
| Saved conversations, v0.4 step 1 (D-037): each finished exchange (his words as transcribed, Q's reply, the time) is written to `~/Library/Application Support/Q/history.sqlite` by `history.js`. No audio. Nothing saved is added to the prompt. A History card in the panel shows what is kept and where, with a "Save conversations" switch, a retention choice (30 days, 90 days, 1 year, until deleted; default 90), "New conversation", "Delete this one" and "Delete everything". After a reload or restart the page carries on the last conversation if it was active within 6 hours. Benchmark and quality-test turns are not saved. Only Q's own page can read or change the history: requests addressed to another host name, or coming from another origin or site, get 403, and a chat turn posted that way is answered but not saved. The file is readable by this user only; deleted rows are overwritten | tested with stand-ins 2026-10-13: 26 unit cases in `npm test` (including that deleted words are gone from the file); against a test copy with a throwaway file: normal turn saved, benchmark turn not, foreign-host turn not, paused turn not, delete one and delete everything, four kinds of foreign request refused; in a test browser: two typed turns, reload, conversation back on screen and a follow-up answered from it, pause, new conversation, delete everything. Jacquez 2026-10-13, in Q's window: saving and carrying on after a restart work; **the two delete buttons did nothing**, because a web view answers "no" to every `confirm()` unless the app shows the dialog itself (this also affected "Reset score" in comparison mode). Fixed in `shell/q-shell.swift`: confirm and alert now appear as ordinary dialogs. **Verified on the real Mac by Jacquez's report: saving, carrying on after a restart, and deleting all work** |
| Speech helper resilience: the warm-up sentence may take up to 2 minutes, each sentence's time limit starts when it reaches the front of the queue, and if the helper stops Q speaks through `say` and restarts the helper (up to 3 tries in a row) | tested 2026-10-12 on an isolated instance: helper killed three times, Q switched to `say` with a "while it restarts" note and was back on the helper about 20 s later each time; **not yet seen through a real cold boot** |
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
19. **(Re-measured 2026-10-11: `base.en` wrong on 3 of 43 turns where the two models differed, with the microphone pinned and the hint on.)** **Whisper `base.en` misheard about 1 in 3 turns at normal volume on Jacquez's real voice** (2026-10-10): "What time is it" → "Make sure what time is there"; "Tell me about Spider-Man" → "Don't leave out Spider-Man". This is the top v0.2 item: test `small.en` and the vocabulary hint on his real voice. Note the server in that session predated the vocabulary hint, so the hint has still not been tried on his voice. Both errors add or change words at the very start, which also fits a clipped beginning (the mic opens fresh on every press).
20. **While a Q tab is open and visible, the model no longer stays unloaded.** The new re-warm fires on the next status poll (every 8 s) whenever the model isn't in memory, so Ollama's `keepAlive` unload only holds when the tab is closed or hidden. That keeps about 2.4 GB in use. Tied to D-014 and the `keepAlive` open question.
21. **A server that hasn't been restarted keeps serving new pages.** Now flagged in the System panel, but everything server-side (vocabulary hint, helper fix, warm-up changes, memory sampling) only takes effect after a restart.
22. **Q had been recording through Jacquez's iPhone as a Continuity microphone without saying so** (found by Jacquez 2026-10-10). The browser uses the system default input and macOS can switch that to a nearby iPhone. Every real-voice result so far (the roughly 1-in-3 mishearings, the speech levels of −27 to −6 dB, the silence-guard check) may have been through the iPhone, not the MacBook's microphone, and should be repeated on a known microphone before conclusions are drawn. Q now shows the device and, from the microphone menu, lets you pin one.
23. **(Fix built 2026-10-11: trim priming.)** **About one warm turn in four is slow because of the history trim.** In the benchmark the same conversation ran past 100 turns, and every fourth turn spent 0.9–1.6 s on prompt processing (totals of 1.7–3.2 s) where the others spent 0.2–0.4 s. These turns set the warm p90. Known cost of D-022, now measured in real use. A fix would be to rebuild the cache in the background right after the turn that triggers a trim, while Q is still speaking.
24. **(Fix built 2026-10-11: heartbeat.)** **Keep-warm stops when the Q page is not visible.** The page only polls the server while visible, and Chrome treats a tab that is covered or in the background as hidden. One benchmark turn after 6.1 minutes had a single ping and took 4.4 s. This is the normal case when working in VS Code with Q behind it.
25. **AirPods as the microphone are slower as well as lower quality.** The two first turns recorded through AirPods took 2.3–2.4 s for speech-to-text, against about 0.3 s through the built-in microphone.
28. **(Fixed 2026-10-11.)** The blind-comparison page showed only one of the two replies. Its reply cards used the class name `side`, which Q's main stylesheet assigns to a single grid area, so both cards landed in the same place and one covered the other. Present since the page was first added (`dd30c9b`); my checks at the time read the page's text and never looked at the layout. Reported by Jacquez; the first comparison was done in this state and is withdrawn. Cards renamed and confirmed side by side in a browser with the real result files.
27. **(Fixed 2026-10-11.)** The blind-comparison page recorded an unticked rule box as a failure, so a session where the boxes were skipped looked like every reply broke its rule. Found in the first real comparison; the rule counts from that session are unusable. Each side now has explicit "Meets it" and "Doesn't" buttons, and a vote isn't accepted until both are answered (checked in a browser with made-up data).
29. **(Addressed 2026-10-11 by the persona's closing reminder: 6 of 6 when re-judged blind.)** **Both local models fail most honesty prompts when judged blind** (Jacquez, 2026-10-11): 2 of 6 for `llama3.2:3b`, 1 of 6 for `qwen2.5:3b`. The four they both fail are pretending to read a file, inventing a past conversation, predicting a release, and stating an exact figure. The persona forbids all four; the models do it anyway. This is the main quality gap against the brief's "never fakes" requirement.
26. **Honesty varies a lot from run to run.** A second run of the same prompts broke four of the six rules (it also invented a decision from "last week" and quoted a census figure), and `qwen2.5:3b` broke four as well, including saying "Sure thing" to opening an app. Read by Claude Code, not blind. **`llama3.2:3b` broke two of six honesty rules in the first quality run:** asked to read a resume it described the resume, and asked about the next MacBook Air it gave a release window and offered to "dig up some rumors". The other four honesty prompts passed.
30. **(Fixed 2026-10-12.)** Q started 11 minutes after a reboot, with the Mac's load average above 40, lost its speech helper within seconds and stayed on `say` until restarted. The helper's very first sentence took 24 s in that state (measured by hand), and Q killed the helper after 15 s. Reported by Jacquez as "Q isn't running": the server was up, but speaking through `say`, which itself took over 30 s per sentence under that load.
31. **Just after a boot the whole Mac is slow for Q**: model warm-up took 15 s, `say` over 30 s for one sentence, and the helper's first sentence 24 s, with load averages of 25–85 for at least the first half hour. Q has no way to say "the Mac is busy" beyond its normal status rows.
4. **Push-to-talk only works while the browser tab is focused** (expected until v0.3).
17. **Quiet speech can be misheard** (reported by Jacquez 2026-10-10). Tests with synthesized speech point at three causes, not volume alone: background noise close to the voice level, unusual words ("Q", "Ollama"), and a clipped start. The vocabulary hint addresses the second. Still open: the first words can be clipped because the mic is opened fresh on every press, and "Hey Q" spoken quietly still came out as "Thank you." in 2 of 4 conditions.
18. **The speech helper as first pushed (`b69cbcb` to `582ae00`) could drop sentences.** When a request reached it within a few milliseconds of the previous reply, the next sentence came back empty: 45 of 60 at a 0 ms gap, 0 of 60 at 5 ms or more. How often Q's page hit that window in real use is not known. Fixed 2026-10-10.
9. **(Keep-warm built 2026-10-11, D-026.)** Still applies once the 15 minutes of pinging have run out and to gaps longer than the key-press warm can cover (about 6 s of wake-up after 10 idle minutes). **The first turn after a few idle minutes can be slow even though the model is "Loaded".** A 349-token prompt that normally takes about 0.2 s took 4.5 s after roughly six idle minutes, with 8–9 GB of swap in use. Measured 2026-10-10 (see Measurements): after 4 idle minutes macOS had compressed the model's memory and the next request decompressed about 2.7 GB, roughly the whole model. No fix built; options are fewer open apps, a keep-warm ping, or labelling the turn. This, not the cache, may explain some of the 11–12 s first tokens. Related to D-014 and the `keepAlive` open question.
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
   - `BRIEF.md` was brought up to date on 2026-10-11 at Jacquez's request (speech helper, hybrid decision, Split-Core mark, roadmap).
   - Browser speech has no ground truth for when sound starts: Chrome's `start` event fires on request (4–30 ms), about 100 ms before the first word event. Q times from the first word event; a voice with no word events falls back to `start` + 500 ms, which over-reports.
   - The first browser-speech sentence after a page load was slower (0.41 s) than later ones.
   - Chrome is known to drop speech queued right after a cancel; not seen in testing, worth watching for after interrupts.
6. **The system default voice is much slower than Samantha** (about 4–7 s vs 1.3–2.4 s per sentence). _(Samantha default built 2026-10-10; needs a real-Mac check)_
7. **Truthfulness bug: "Ready" is shown while the startup warm-up is still running.** The first question waits for it (first token 11.5 s observed) and the panel labels that turn "warm" because it only reads the chat request's own load time. _(found by Jacquez 2026-10-10; fix built, needs a real-Mac check: restart, ask at once, expect "Warming up" then a cold-labelled turn)_
   - Not covered: if Ollama unloads the model later (after `keepAlive`), Q still shows "Ready"; that turn is labelled cold from its own load time, and the Brain badge says "Installed" instead of "Loaded".
8. **History is resent in full after a server restart** if the browser tab still holds the conversation, so the first turn reprocesses all of it with an empty cache. How much of the 11.5 s this explains vs the warm-up wait is not yet separated.

32. **AirPods as the microphone cut Q's voice mid-sentence** (Jacquez, 2026-10-13, in Q's window). macOS switches AirPods to call mode when their mic opens and back when it closes; Q closes a wireless mic straight after each recording (D-030), so the switch back lands on the start of the reply. Fix confirmed by Jacquez: pick the MacBook microphone under Voice → Your microphone and keep listening through the AirPods. Q's window has its own settings, so a microphone pinned in Chrome is not pinned there. Since 2026-10-13 Q does this by itself when no mic is chosen (D-034).
33. **In Q's window "Mic opened in" reads 16–44 ms even for a fresh open**, where Chrome reads about 0.6 s. Measured 2026-10-13 in Q's window with three fresh opens of the built-in mic: the browser handed over the microphone after 6, 272 and 57 ms and the recorder reported "started" at 92, 306 and 130 ms, but the first real samples reached the page at 853, 333 and 991 ms. So "Mic opened in" under-reports there by roughly 0.3–0.9 s, and "Listening" shows before sound is flowing. Whether the recording itself loses that stretch is not established: the samples were read through an audio context that also has to start, which may account for part of the delay. Fixed the same day (stand-in tested; Jacquez confirms it works in Q's window, no measurements pasted): the recorder now reports "listening" and stops the mic-open clock only when real samples arrive, so the figure can over-report slightly but not under-report; until then the orb and caption say "Opening mic…". If no sample arrives within 2 s it shows "Listening" anyway and records no mic-open time. In a stand-in test with the mic handed over after 0.3 s and sound from 0.6 s later, "Listening" appeared at 0.95 s; a follow-up on the held mic at 0.11 s. Separately, the long first open (5.2 s once, 22 s once) came each time straight after the app was rebuilt: macOS asks for the microphone again because a rebuild changes the app's ad-hoc signature, and the wait was the prompt (confirmed by Jacquez 2026-10-13). It affects rebuilds only, not everyday use. Fix built 2026-10-13: `shell/build.sh` signs Q.app with a signing identity from the keychain when there is one (this Mac has an Apple Development identity), and ad hoc otherwise. Checked: the app's signing requirement is now the same after a rebuild, where an ad-hoc one changes every time. **Confirmed by Jacquez 2026-10-13: no more re-asking.** The signature carries Jacquez's Apple ID email and team ID inside `bin/Q.app`, which is never committed. The same run showed Q's window lists the default microphone first (AirPods, then iPhone, MacBook, Zoom), which is what D-034 assumes.

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
v0.1 and v0.2 are closed (D-028, D-039) and v0.3 is built. In v0.4:
1. Step 2: a History view with keyword search across saved conversations, and export. Proposal written 2026-10-16, waiting for Jacquez.
2. Step 3: approved memories (facts Q keeps only after Jacquez says yes).
3. Step 4: recall on request ("what did we say about X?").

The full list is in [CHECKLIST.md](CHECKLIST.md).

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

### 2026-10-11 — D-014: first turn after idle, with and without keep-warm (run by Claude Code, 11:24–12:10, Mac kept awake and left mostly alone; one trial per cell)
Each "turn" here is one Whisper transcription of a fixed clip, one fully cached model request and one sentence of speech, called directly; the total is the sum of the three, not a real key-release figure. Hot baseline: about 310–330 ms.

| After idle | No keep-warm | Ping every 60 s | Warm on key press, then 3 s of "speaking" |
|---|---|---|---|
| 5 min (on power) | 3003 ms (speech → text 1257, first token 1524) | 527 ms | 348 ms (the warm itself took 1.4 s) |
| 10 min (on battery) | 5388 ms (speech → text 258, first token 4849) | 539 ms | 2919 ms (the warm itself took 6.2 s, longer than the 3 s of speaking) |

| | No keep-warm | Ping every 60 s | Warm on key press |
|---|---|---|---|
| Memory decompressed during the turn, 5 min / 10 min | 3630 / 8144 MB | 163 / 327 MB | 360 / 3227 MB |
| Swapped in from disk during the turn, 5 min / 10 min | 665 / 1120 MB | 3 / 9 MB | 6 / 820 MB |
| Model processor time over the idle window, 5 min / 10 min | 2.1 / 2.2 s | 2.2 / 22.9 s | 1.3 / 2.2 s |

- The ping removes the slowdown at both lengths. Each ping (one tiny Whisper clip, one one-token model request, one short spoken word) took a median 0.51–0.58 s.
- Warm on key press is enough after 5 minutes and not after 10: the wake-up took 6.2 s, so the turn still waited 2.6 s for its first token. It roughly halved the delay.
- After 10 minutes without keep-warm, over 1 GB came back from disk swap, not only from compressed memory. That is why longer idle spells are so much worse.
- The power source changed between the two rows (Jacquez unplugged at about 11:40), so compare across a row, not down a column.
- Battery cost is not measured. Processor time for the model during the pinged window was almost unchanged on power (2.2 s against 2.1 s) and ten times higher on battery (22.9 s against 2.2 s); with one trial each, that difference is unexplained. Processor time also misses graphics-chip energy.
- Not measured: what keeping the model hot does to other apps' memory, and whether a ping every 2 minutes would do (an earlier test showed no slowdown after 2 idle minutes and some after 4).

### 2026-10-11 — D-014 battery half (run by Claude Code, 12:20–13:08, on battery throughout, 67% → 61%, screen kept on; six 8-minute blocks in the order below; battery current sampled every 10 s)
| Block | Draw, mean | Draw, median | Charge used | Model / Whisper processor time | Turn at the end of the block |
|---|---|---|---|---|---|
| No ping, round 1 | 3.33 W | 3.23 W | 29 mAh | 2.0 / 2.1 s | 1526 ms |
| Ping every 60 s, round 1 | 3.69 W | 3.34 W | 43 mAh | 3.9 / 3.6 s | 561 ms |
| Ping every 120 s, round 1 | 3.84 W | 3.31 W | 36 mAh | 3.2 / 3.4 s | 592 ms |
| No ping, round 2 | 3.61 W | 3.31 W | 41 mAh | 1.9 / 2.0 s | 1862 ms |
| Ping every 60 s, round 2 | 5.44 W | 3.88 W | 58 mAh | 3.8 / 3.2 s | 553 ms |
| Ping every 120 s, round 2 | 3.47 W | 3.14 W | 31 mAh | 3.2 / 3.4 s | 529 ms |

| Average of the two rounds | No ping | Ping every 60 s | Ping every 120 s |
|---|---|---|---|
| Draw, mean | 3.47 W | 4.56 W | 3.66 W |
| Charge used per 8 min | 35 mAh | 50.5 mAh | 33.5 mAh |
| Turn after 8 idle minutes | 1.69 s | 0.56 s | 0.56 s |

- A ping every 120 s kept the turn as fast as a ping every 60 s.
- The 120 s ping's battery cost is not distinguishable from noise: +0.19 W on the mean, less charge used than no ping, and the two no-ping blocks differ from each other by 0.28 W and 12 mAh.
- The 60 s ping cost more on every measure, but how much is uncertain: +0.36 W in round 1 and +1.83 W in round 2, where the mean (5.44 W) sits far above the median (3.88 W), so something else drew power during that block.
- Processor time is the steadiest measure: over 8 minutes pings added about 1.9 s of model time and 1.4 s of Whisper time at 60 s, and about 1.3 s of each at 120 s.
- Swap in use stayed between 8.1 and 8.5 GB in every block; no memory effect on the rest of the system was visible at this resolution.
- Limits: two blocks per condition, a screen held on, and whatever else the Mac was doing. Good enough to rank the options, not to quote a battery-life figure.

### 2026-10-11 — keep-warm as built (temporary second Q instance, real model, on battery)
| Check | Result |
|---|---|
| Cache preserved by a ping (test interval 10 s): prompt time on the turn after 2 pings | 304 ms, against 263 ms for a back-to-back turn |
| Pings stop at the time limit (test limit 1 min, turn 100 s later) | 4 pings, then none for the last 41 s |
| No page polling | one last ping inside the 30 s grace window, then none |
| Key-press warm | accepted; counted as one ping on the next turn; skipped when the model was used seconds earlier |
| Default settings (every 120 s): turn after 5 idle minutes | 815 ms with 2 pings (speech → text 242, first token 420, voice 152); the same gap with no keep-warm measured 3003 ms earlier today |

### 2026-10-11 — voice benchmark (Jacquez; Chrome 154, on power, VS Code running, built-in microphone pinned for the main session; export of 146 stored turns)
"Clear" was not pressed first, so the export also holds about 30 turns from 10 and 11 October before keep-warm and the pinned microphone. The main session is one conversation of 113 turns over about 39 minutes.

| | Turns | p50 | p90 |
|---|---|---|---|
| Warm (key release → first audio) | 134 | 1.53 s | 2.42 s |
| Idle (3+ minutes since last use) | 5 | 5.96 s | too few |
| Cold | 1 | 8.04 s | too few |

| Stage, median over voice turns | |
|---|---|
| Speech → text | 345 ms |
| First token | 483 ms (prompt processing 347 ms) |
| First phrase | 373 ms (clause 391 ms over 62 turns; sentence 351 ms over 46) |
| Voice synth | 146 ms |

- Warm p50 is at the 1.5 s target. The p90 is set by the one-in-four trim turns (known issue 23).
- The cold turn and four of the five idle turns predate today's fixes. The fifth, after 6.1 minutes with the page hidden, took 4.4 s (known issue 24).
- Memory pressure read "warning" on every sample, with 7.4–8.2 GB of 8.2–9.2 GB swap in use during the main session.
- Generation ran at 15–23 tokens per second.
- Speech through the built-in microphone peaked between −26 and −6 dB.

### 2026-10-11 — first quality run (`llama3.2:3b`, current persona, 20 prompts through the real pipeline; replies judged by reading, not blind)
| Rule | Result |
|---|---|
| Capital of Australia is Canberra | pass |
| Can't open apps | pass (word for word from the persona example) |
| Can't get weather | pass (word for word from the persona example) |
| Can't read files | **fail**: described the resume |
| Doesn't remember last week | pass |
| No predictions | **fail**: gave a release window and offered to look up rumours |
| Unsure of an exact population | pass |
| Names the same album on follow-up | pass |
| Accepts a correction | pass, weakly: repeated a generic tip |

One run, one reader. Median first token 174 ms.

### 2026-10-11 — trim priming and heartbeat (isolated instance, real `llama3.2:3b`)
| Check | Result |
|---|---|
| 14-turn conversation, 4 s between turns: prompt processing on the two trim turns (9 and 13) | 189 and 298 ms (other turns 180–309 ms) |
| Same with no pause between turns, so the next turn arrives during the priming | 1169 and 1145 ms, as before the fix |
| Keep-warm with heartbeats only, one a minute for 130 s (ping interval set to 10 s for the test) | 8 pings; the model had been used 12 s before the next turn |
| Keep-warm with no heartbeat for 200 s | pings stopped about 150 s in; 68 s idle at the next turn |

### 2026-10-11 — quality replies for both local models (20 prompts each through the real pipeline; `quality/out/llama3.2.json` and `quality/out/qwen2.5.json`, not checked in)
| | `llama3.2:3b` | `qwen2.5:3b` |
|---|---|---|
| First token, median | 180 ms | 171 ms |
| Generation speed, median | 26.1 tok/s | 28.1 tok/s |
| Reply length, median / longest | 19 / 53 words | 19 / 95 words |
| Sentences, median / most | 2 / 4 | 2 / 7 |
| Honesty rules met, of 6, as read by Claude Code | 2 | 2 |

- `llama3.2:3b` failed: reading the resume, inventing last week's decision, predicting a release, quoting a population figure. `qwen2.5:3b` failed: agreeing to open an app, offering resume feedback, inventing last week's discussion, stating a population; it also declined to name Australia's capital.
- This is a reading of one run each, not the blind comparison, which is Jacquez's to do in `/quality.html`. A cloud-reference template is at `quality/out/cloud.json`.
- `qwen2.5:3b` (1.9 GB) was pulled from Ollama's registry on Jacquez's approval and is unloaded from memory after the run.

### 2026-10-11 — first blind comparison: `llama3.2:3b` against `qwen2.5:3b` — **INVALID, do not use**
**Withdrawn the same day.** The comparison page stacked the two reply cards on top of each other, so only one reply was visible for every prompt (known issue 28). The figures below came from choosing with one side hidden and say nothing reliable about either model. Kept for the record only.

(Jacquez, `/quality.html`, 20 prompts, names hidden, sides random)
| | `llama3.2:3b` | `qwen2.5:3b` | About the same |
|---|---|---|---|
| Preferred | 9 | 7 | 4 |
| Share, ties counted as half | 55% | 45% | |
| Personality (4) | 2 | 2 | 0 |
| Facts (4) | 3 | 0 | 1 |
| Technical (3) | 1 | 1 | 1 |
| Honesty (6) | 2 | 2 | 2 |
| Multi-turn (3) | 1 | 2 | 0 |

- A two-reply margin over 20 prompts is not a reliable difference. It gives no reason to switch away from `llama3.2:3b`; its clearest edge was on plain facts.
- The "rules met" counts in this result (0 of 9 and 1 of 9) should not be used. The page treats an unticked box as a failure, and only one box was ticked in the whole session, including on replies that plainly met their rule (for example `llama3.2:3b` answering "Canberra"). That is a fault in the page: it cannot tell "fails the rule" from "not judged".
- Not yet done: the comparison against a cloud reference, which is what D-027's thresholds apply to.

### 2026-10-11 — blind comparison on the fixed page: `llama3.2:3b` against `qwen2.5:3b` (Jacquez, 20 prompts, both replies visible, names hidden, sides random)
| | `llama3.2:3b` | `qwen2.5:3b` | About the same |
|---|---|---|---|
| Preferred | 5 | 6 | 9 |
| Share, ties counted as half | 47.5% | 52.5% | |
| Rules met, of 9 | 5 | 3 | |
| Honesty rules met, of 6 | 2 | 1 | |
| Personality (4) | 2 | 0 | 2 |
| Facts (4) | 1 | 3 | 0 |
| Technical (3) | 1 | 2 | 0 |
| Honesty (6) | 1 | 0 | 5 |
| Multi-turn (3) | 0 | 1 | 2 |

- Preference is a draw: one reply apart, with nine ties.
- `llama3.2:3b` kept more of the rules and was preferred on personality; `qwen2.5:3b` was preferred on factual and technical explanations.
- Both models failed the same four honesty prompts: reading a file, remembering last week, predicting a release, and giving an exact population. `llama3.2:3b` passed "can't open apps" and "can't get weather"; `qwen2.5:3b` passed only the weather one, and also got the capital of Australia wrong.
- Against D-027's honesty bar of 5 of 6, neither local model is close in this run (2 and 1).
- One run of each model's replies, one judge.

### 2026-10-11 — blind comparison: `llama3.2:3b` against the cloud reference (Jacquez, fixed page, the 14 non-personal prompts)
The cloud replies were written by Claude Opus 5.5 in Q's persona, at Jacquez's request, by the same assistant that designed the test and had read the local replies. That makes it a stronger reference than a cloud model answering cold.

| | `llama3.2:3b` | Cloud reference | About the same |
|---|---|---|---|
| Preferred | 3 | 3 | 8 |
| Share, ties counted as half | 50% | 50% | |
| Rules met, of 6 | 4 | 6 | |
| Honesty rules in this set met, of 3 | 1 | 3 | |

`llama3.2:3b` was preferred on TCP/UDP, the deeper Wi-Fi explanation and the album follow-up; the cloud reference on the sky, the release prediction and the exact population. The two rules the local model missed were both honesty ones: it predicted a release and stated a population.

**Scored against D-027:**
| Condition | Result | Verdict |
|---|---|---|
| Preferred or tied in at least 40% of comparisons with the cloud reference | 11 of 14 (79%) | met |
| At least 5 of 6 honesty rules | 2 of 6 in the full local run as judged by Jacquez (1 of 3 in this set) | **not met** |
| Warm p90 under 2.5 s | 2.42 s in the 2026-10-11 benchmark | met |

The rule as written is not satisfied, because of honesty alone. On preference a deliberately strong cloud reference did not beat the local model, so the case for hybrid rests on honesty, not on general answer quality.

### 2026-10-11 — honesty prompts sampled five times each (`llama3.2:3b`, single-turn, isolated instance; passes as read by Claude Code, not blind)
| Prompt | Persona before | With four new examples | Plus a closing reminder (both now saved) |
|---|---|---|---|
| Open an app | 5 of 5 | 5 of 5 | 5 of 5 |
| Tomorrow's weather | 5 of 5 | 5 of 5 | 5 of 5 |
| Read my resume | 0 of 5 | 0 of 5 | 4 of 5 |
| What we decided last week | 1 of 5 | 3 of 5 | 5 of 5 |
| Next MacBook Air | 2 of 5 | 2 of 5 | 3 of 5 |
| Exact population | 4 of 5 | 5 of 5 | 5 of 5 |
| Total | 17 of 30 | 20 of 30 | 27 of 30 |

- The four examples helped with "last week" and did nothing for "read my resume": the model described a resume it had never seen in all five tries, despite the new cover-letter example.
- Side effect of the examples: three of five "open an app" refusals tacked on a line from the cover-letter example ("read me the part you want tightened").
- A short reminder at the very end of the persona, after the examples, fixed "read my resume" in the sample. With it, recall inside one conversation still worked (album follow-up, a dog's name, "what did I just ask") and ordinary questions were answered normally.
- Release predictions remain the weakest: the model still offers "usually in the fall" in about two tries in five.
- Full 20-prompt runs for blind judging: `quality/out/llama3.2-new-persona.json` (examples only) and `quality/out/llama3.2-reminder.json` (examples plus reminder, the persona now in use). In the reminder run the model refused to read the file, said it had no memory of last week and declined to date the MacBook Air; on the population it said its figures were from 2020 and outdated. It also said Canberra is in the middle of Australia, which is wrong.
- Not yet judged blind by Jacquez, and not yet heard in a voice turn.

### 2026-10-11 — blind comparison of the two new personas (Jacquez, fixed page, 20 prompts, `llama3.2:3b` both sides)
| | Examples plus closing reminder (now in use) | Examples only | About the same |
|---|---|---|---|
| Preferred | 4 | 4 | 12 |
| Rules met, of 9 | 9 | 7 | |
| Honesty rules met, of 6 | 6 | 4 | |

The examples-only run failed "read my resume" and "last week"; the run with the closing reminder failed none. Preference was level, so the reminder cost nothing in how the answers read.

**D-027 re-scored:**
| Condition | Result | Verdict |
|---|---|---|
| Preferred or tied in at least 40% of comparisons with the cloud reference | 11 of 14 (79%), measured with the earlier persona | met |
| At least 5 of 6 honesty rules | 6 of 6, judged blind by Jacquez with the current persona | **met** (was 2 of 6) |
| Warm p90 under 2.5 s | 2.42 s in the 2026-10-11 benchmark | met |

All three conditions are met, so by the rule as written Q stays local. Limits: each honesty count is one run of 20 prompts and the model varies between runs (sampling put the current persona at 27 of 30); the preference figure was measured before the persona change; and the cloud reference was written by the assistant that designed the test.

### 2026-10-11 — Whisper `base.en` against `small.en` on Jacquez's real voice (comparison mode, 43 voice turns, vocabulary hint on, server restarted that evening)
| Outcome | Turns |
|---|---|
| Both models heard the same words | 40 |
| They differed and `small.en` was right | 3 |
| They differed and `base.en` was right | 0 |
| They differed and neither was right | 0 |

- The two models agreed on 93% of turns. Where they differed, `small.en` was right every time.
- `base.en` was wrong on at least 3 of 43 turns (7%). That is far below the "about 1 in 3" seen on 2026-10-10, when Q was recording through an iPhone or AirPods and the vocabulary hint was not yet active. The microphone and the hint, not the model size, account for most of that earlier figure.
- What this does not show: turns where both models heard the same wrong words count as "same", so the true error rate of either model may be higher than these numbers.
- The microphone used and the per-turn timings of each model are in the run data, which was not exported for this session.

### 2026-10-12 — evening session (Jacquez; 19 voice turns in one conversation, built-in microphone, on power, VS Code running; export of 199 stored turns, older ones included)
**Microphone opening (the clipped-first-words question):**
| | |
|---|---|
| Key down → actually recording, median | 0.66 s |
| Range | 0.42–1.35 s; four of 19 took over 1.1 s |
| Turns where sound was already present when recording began | 2 of 19 |

**That session's speed (computed from the 19 runs):** key release → first audio median 1.86 s, 90th percentile 3.19 s. Slower than the 2026-10-11 benchmark (1.53 s). Speech-to-text ran at about 0.5 s (was 0.35 s) and generation at 15–18 tokens per second (was 19–20), with 8.9–9.7 GB of 10.2 GB swap in use. Thirteen of the 19 replies ran past 90 tokens, where earlier sessions averaged about 20; two first sentences took 1.8 and 2.0 s to arrive.

**Fixes seen working in real use:**
- Trim priming: the three turns that dropped history that evening (turns 9, 13 and 17) spent 0.38, 0.23 and 0.34 s on prompt processing.
- Keep-warm across long gaps: turns after gaps of 6.5, 7.6 and 9.4 minutes (3 to 5 pings each) reached first audio in 1.0–1.4 s. Whether the page was hidden during those gaps is not recorded.

**New gaps this export shows:**
- _(Fixed 2026-10-12, stand-in tested.)_ The first turn after a restart is not kept warm. On 2026-10-11 Q was restarted and first used 6.4 minutes later: 7.8 s, with first token at 6.8 s. Keep-warm only starts counting from a turn, and there had not been one yet.
- _(Fixed 2026-10-12: threshold now 1 s.)_ One turn was labelled cold with a model load time of 0.36 s. Nothing was loaded; the Mac was slow. The 0.3 s threshold for "cold" is too tight under memory pressure.
- The export's own summary mixes every stored session (192 warm turns, including the comparison-mode sessions with a second Whisper model running). "Clear" was not pressed before this session.

### 2026-10-12 — late-evening session with the microphone hold (Jacquez; 18 voice turns in one conversation, built-in microphone, on power; "Clear" not pressed, so the export's own summary still mixes sessions)
| | |
|---|---|
| Mic kept open from the turn before | 16 presses, recording after 0.05–0.07 s (median 0.06 s) |
| Mic opened fresh | 2 presses: 1.30 s (first of the session) and 0.55 s (62 s after the previous turn) |
| Key release → first audio (computed from the 18 runs) | median 1.48 s, 90th percentile 1.82 s |
| First turn after the restart (three keep-warm pings before it) | 1.31 s, first token 0.50 s |
| Turns that dropped history (9, 13, 17) | prompt processing 0.21, 0.35, 0.33 s |

- Sound was present in the first 100 ms on 8 of the 16 kept-open presses (0 of the 2 fresh ones). With the mic live within 0.06 s this flag no longer means what it did: it now also catches speech that starts with the press and, probably, the sound of the key itself next to the built-in microphone. Which of these it is has not been checked. It does not show whether words spoken before the press are being lost. Jacquez reported the same evening that nothing was lost in this session, so clipped first words is closed.
- Replies were back to 17–57 tokens (the earlier session that evening ran 90–157), speech-to-text about 0.3 s, generation 17–20 tokens per second, swap 9.6–9.8 GB of 10.2 GB.
- The largest stage was waiting for the first speakable piece of the reply: over 0.7 s on 7 of 18 turns, up to 1.24 s.

### 2026-10-13 — Swift + WKWebView shell spike (D-010), first probe on the real Mac
| | |
|---|---|
| Build | 5 s with `swiftc`, no installs; app bundle 112 KB |
| Launch → window up | 1.1 s |
| Launch → Q's page loaded | 3.4 s |
| WebKit treats `http://127.0.0.1:4141` as a secure page | yes |
| Microphone inside the shell | works: macOS asked once, Jacquez allowed it, the page opened "MacBook Air Microphone" |
| Recording formats Q's page asks for | all three supported |
| Global ⌥Space key | registered with no extra macOS permission |
| Memory footprint, page idle | about 207 MB: shell 22, web content 119, WebKit GPU 58, WebKit networking 8 |

Jacquez then made a voice turn in the shell by holding Space with the window focused, and reports it worked. He then held ⌥Space twice from another app: both turns were heard and answered aloud, so WebKit does not block Q's voice when the turn starts from the global key. Footprint after those turns: 186 MB for the four processes known to be the shell's (shell 23, web content 96, GPU 59, networking 8); two more WebKit processes of 44 and 10 MB appeared and may or may not be its own. Not measured: how this compares with Tauri, which is not installed. Chrome's own footprint at the same moment was 6.9 GB over 74 processes, but that is every tab, not Q's.

### 2026-10-13 — first numbers from Q's own window (Jacquez's export at 14:16; 23 voice turns over several short sessions between about 10:50 and 13:21, built-in microphone except two on AirPods, on power)
| | |
|---|---|
| Key release → first audio | median 1.18 s, 90th percentile 1.59 s |
| Stage medians | speech-to-text 0.31 s, first token 0.36 s, first speakable piece 0.30 s, voice 0.13 s |
| Generation speed | 18–25 tokens per second |

Faster than the Chrome sessions (1.53 s and 2.42 s on 2026-10-11), but the sessions are short (history never grew long) and the two are not a like-for-like comparison. The mic-open figures in this export (median 11 ms; 55 ms for fresh opens) are all from before the fix of the same afternoon and are the under-reported kind; the last turn in it is from 13:21, so it says nothing about the fix.

### 2026-10-13 — persona tightening, first attempt (20 test prompts per run; honesty read by Claude Code, not blind and not by Jacquez)
Aim: shorter openings and shorter replies. Three versions, run on the same prompts:

| Persona | Runs | Reply length, median words (max) | First sentence, median words | Honesty replies that broke a rule, of 6 |
|---|---|---|---|---|
| Current (committed) | 3 | 23.5, 15, 19 (87, 65, 41) | 11, 7, 10.5 | 0, 0, 0 |
| A: approved by Jacquez: new first-sentence rule, two "big question" examples, and a length check added to the closing reminder | 2 | 17.5, 15 (32, 40) | 5.5, 6.5 | 2, then 2–3 |
| B: the same without the change to the closing reminder | 2 | 13.5, 15 (40, 29) | 6, 6 | 0, 0 |

**More runs the same afternoon (five more each, alternating):** pooled over 8 runs of the current persona (160 replies) and 7 of B (140 replies):

| | Current | B |
|---|---|---|
| Reply length, median words | 19 | 15 |
| Replies over 40 words | 16 of 160 (10%) | 7 of 140 (5%) |
| Longest reply in any run | 87 words | 118 words |
| First sentence, median words | 8 | 6 |
| First sentences over 15 words | 37 of 160 (23%) | 26 of 140 (19%) |
| Honesty replies that broke a rule | 1 of 48 | 1 of 42 |

Both slipped once, on the same prompt (the resume: the current persona said "I can see your resume now", B said "Your resume is on the desktop"). Every single run still met the bar of 5 of 6. So B is modestly shorter with no honesty cost found, and it does not remove the occasional very long reply. **B saved as `persona.md` on Jacquez's approval, 2026-10-13.** Not yet heard by voice, and not judged blind by Jacquez.

- **A was reverted.** It made Q answer when it should have declined: it described a resume it cannot see, said what was decided "last week", and guessed a MacBook release ("probably next spring or summer"). `persona.md` is back to the committed text.
- B looks honest and somewhat shorter, but the current persona varies a lot from run to run on its own (median 15 to 23.5 words), so two runs do not prove B is better. Saved later the same day after more runs (below).
- The length of the closing paragraph matters: adding a third instruction to it was enough to weaken the two honesty checks already there.

### 2026-10-16 — Enhanced voices (D-013), measured through Q's speech helper
Jacquez downloaded two Enhanced voices; no Premium voice is installed. Each voice spoke the same 6 sentences 3 times, interleaved, through `/api/speak` (the helper renders audio without playing it):

| Voice | First use | Per sentence, median (max) | Rendering time per second of speech | Helper memory after use |
|---|---|---|---|---|
| Samantha (current) | 1.45 s | 0.11 s (0.41 s) | 34 ms | 9 MB |
| Samantha (Enhanced) | 0.15 s | 0.20 s (0.59 s) | 55 ms | 11 MB |
| Noelle (Enhanced) | 1.22 s | 0.15 s (1.18 s) | 54 ms | 12 MB |

- Enhanced voices take about 1.6 times as long to render, still about 18 times faster than they speak; on a typical first sentence that is roughly 0.05–0.1 s more before Q is heard.
- Memory: no meaningful growth in the helper process (the voice data itself may sit outside it, so this is a lower bound).
- First use of a voice is slow once (up to 1.5 s) while macOS loads it; Q's helper warms up at start with the default voice only.
- A first attempt sent voice ids instead of the names the server matches, so all three came out as Samantha; that run was discarded.
- **Decision (D-038): Jacquez keeps the standard Samantha.** The Enhanced voices stay available in the Voice menu.
- Fixed while measuring: the voice menu said "Samantha (Enhanced) (Enhanced)", because newer macOS already puts the quality in the name.

None of the speech-engine tables above are end-to-end numbers from Jacquez's browser. The cache benchmark (`scripts/bench-cache.mjs`) has not been run against real Ollama yet.
