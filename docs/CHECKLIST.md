# Q — roadmap checklist

_Checked against the code on 2026-10-10 (after the silence guard, the Whisper vocabulary hint and the speech-helper fix), not against the plan. "Built" means it is in the code. "Confirmed" means it was seen working on Jacquez's Mac with the real pipeline. `STATUS.md` has the measurements._

Covers the whole roadmap in `BRIEF.md`, v0.1 through v1.1+. v0.1 is itemised because it is the version in progress; later versions list what the code already has and what it doesn't.

# v0.1 — validate on the real Mac — CLOSED 2026-10-11 (D-028)

**Goal (BRIEF.md):** latency (p50/p90, cold vs warm), memory pressure, swap, export, first quality test.

## Summary
| # | Item | Built | Confirmed on the real Mac |
|---|---|---|---|
| 1 | Voice-speed fix | Done | Done |
| 2 | Timestamp fix | Done | Done |
| 3 | Warm-up "Ready" truthfulness bug | Done (second fix after a failed real test) | Done |
| 4 | Silence guard | Done | Done (threshold kept at −50 dB; silent-hold levels not written down) |
| 5 | Run-data export | Done | Done |
| 6 | ~30-turn benchmark | Done | Done: 140 voice turns, warm p50 1.53 s, p90 2.42 s |
| 7 | New persona is in | Done | Done |

## 1. Voice-speed fix — done and confirmed
- [x] Speech helper is the default voice path (`server.js`: `tts: 'helper'`; `speech/q-speak.swift`; `bin/q-speak` is built on this Mac).
- [x] Falls back to `say` if the helper is missing or stops, and says so in the System panel.
- [x] Samantha is the default voice.
- [x] Confirmed: one real voice turn by Jacquez, voice synth 0.21 s (was 3.40 s).
- [x] Fixed a helper bug that could return a sentence with no audio when requests came back to back (`speech/q-speak.swift`; 40 of 40 queued runs and 120 of 120 sequential sentences at full length after the fix).
- [x] After a restart, a reply of three or more sentences played with none missing (Jacquez, 2026-10-10).

## 2. Timestamp fix — done and confirmed
- [x] The time is no longer in the system prompt; each user message carries the time it was sent (`server.js` `stamped()`, `public/app.js` `at: Date.now()`).
- [x] History is capped at 8 turns or 6000 characters and trimmed 4 turns at a time (`server.js` `trimHistory()`).
- [x] "Prompt processing" row is in the latency panel code.
- [x] Benchmarked on real Ollama: first token when every turn crosses a minute went from 0.61–1.85 s to 0.34–0.85 s.
- [x] Seen in real voice turns by Jacquez, 2026-10-10: "Prompt processing 0.23 s · 949 tokens" on a warm turn.

## 3. Warm-up "Ready" truthfulness bug — done and confirmed
- [x] Server tracks the warm-up and reports it (`server.js` `warm`, `warmupWaitMs`).
- [x] UI shows "Warming up" and labels a turn that waited on it as cold (`public/app.js`).
- [x] Real check by Jacquez, 2026-10-10: **failed**. After quitting and reopening Ollama, Q showed "Ready" while Brain said "Installed", and the first turn paid the load plus 3.39 s of prompt processing.
- [x] Fix: the warm-up re-runs whenever the model isn't in memory, and primes the real system prompt (`server.js` `warmIfNeeded()`, `warmModel()`). Cold first turn went from 3.2–5.1 s to 0.32–0.38 s in the benchmark.
- [x] Q-restart path confirmed in Jacquez's export, 2026-10-10: first turn after the restart processed its prompt in 0.36 s.
- [x] Ollama path re-tested by Jacquez, 2026-10-10: passed ("Warming up" shown after quitting and reopening Ollama, then a fast turn).

## 4. Silence guard — done and confirmed
- [x] Near-silent recordings skip Whisper (`public/level.js` `measureLevel()`, used in `public/audio.js` and `public/app.js`).
- [x] `npm test` passes: silence, low noise and clicks are rejected; real synthesized speech turned down 20 and 30 dB is accepted.
- [x] Checked on the real microphone, 2026-10-10: real speech peaked between −27 and −6 dB in ten exported turns, well above the −50 dB threshold, so the threshold stays. The exact levels of the silent holds were not recorded.
- [x] Silent holds are skipped with no phantom reply (Jacquez, 2026-10-10).

## 5. Run-data export — done and confirmed
- [x] p50 and p90, warm and cold separately; p90 from 10 turns up (`public/stats.js`).
- [x] Every turn stored as numbers only, with a cold flag and idle time, up to 200 turns (`public/app.js` `recordTurn()`).
- [x] Swap, memory pressure and process memory sampled on the server per turn (`server.js` `/api/system`).
- [x] "Copy run data" button; the export is built from an allowlist and `npm test` checks no message text can get in.
- [x] Main metric labelled "Key release → first audio" and timed from key release.
- [x] Real voice turns by Jacquez, 2026-10-10: timings look right.
- [x] Turns after 3+ minutes idle get their own label and their own line in the summary (`public/stats.js` `kindOf()`).
- [x] Exported again after the restart, 2026-10-10: header complete, memory figures present on all four new turns, copied from Chrome.
- [x] "Copy run data" works in Chrome (Jacquez pasted the export, 2026-10-10).

## 6. ~30-turn benchmark — done
- [x] Run by Jacquez, 2026-10-11: 140 voice turns exported (113 in one session with VS Code open, on power, built-in mic). Warm p50 1.53 s, p90 2.42 s. Results in `STATUS.md`.
- [x] Follow-ups it exposed, both built 2026-10-11: trim priming (trim turns 1.15 s → 0.19–0.30 s of prompt processing) and a heartbeat so keep-warm continues when the page is hidden.
- [x] Trim priming confirmed in a real session (2026-10-12 export: trim turns at 0.23–0.38 s of prompt processing).
- [x] Keep-warm confirmed across 6–9 minute gaps in real use (first audio in 1.0–1.4 s). Not confirmed specifically with the page hidden.
- Unblocked: the export exists. Confirm item 5 with a few turns first.
- `scripts/bench-cache.mjs` is not this benchmark. It measures prompt-cache behaviour with typed turns.

## 7. New persona is in — done and confirmed
- [x] `persona.md` is byte-identical to the file Jacquez supplied, committed in `21c0809` and pushed.
- [x] The server reads it on every turn, so it is live without a restart.
- [x] One ten-turn typed run on the real model (results in `STATUS.md`).
- [x] Confirmed working by Jacquez, 2026-10-10.

## Added along the way (not one of the seven)
- [x] Whisper vocabulary hint for names and jargon (`whisperPrompt` in `server.js`); 23 → 33 of 40 exact transcripts on synthesized speech.
- [ ] Try it with Jacquez's own quiet speech.
- [x] The first words could be clipped because the mic opened fresh on every press. Closed 2026-10-12 by the 60 s mic hold (D-030); Jacquez reports nothing lost in a real session.

## Also in the v0.1 goal, not started
- [x] Quality test tooling built: 20 prompts, a runner through Q's real pipeline, a hand-filled cloud-reference template, and a blind comparison page.
- [x] First quality test run blind (D-008), 2026-10-11, against both a second local model and a cloud reference. Results in `STATUS.md`.
- [x] Local-vs-hybrid thresholds written down and adopted (D-027): 40% preferred or tied, 5 of 6 honesty rules, warm p90 under 2.5 s.
- [x] Replies generated for `llama3.2:3b` and `qwen2.5:3b`; cloud-reference template created.
- [x] Jacquez: blind comparison of the two local models redone on the fixed page (see v0.2).
- [x] Cloud reference filled in (by Claude, at Jacquez's request) and compared blind against `llama3.2.json`, 2026-10-11: preferred 3 each, same 8.
- [x] D-027 scored: preference met (79% preferred or tied), warm p90 met (2.42 s), **honesty not met (2 of 6)**.
- [x] First change for honesty: four example exchanges added to the persona (2026-10-11). Sampled: 17 → 20 of 30 honesty passes; "read my resume" still fails every time.
- [x] Closing reminder added to the persona on Jacquez's approval (2026-10-11): 27 of 30 honesty passes in sampling.
- [x] New persona judged blind by Jacquez, 2026-10-11: 9 of 9 rules, 6 of 6 honesty rules. D-027 re-scored: all three conditions met, Q stays local.

# v0.2 — tune personality, continuity and speed; blind quality evaluation; better macOS voice

Nothing here is finished. Some of it was started early while fixing v0.1.

- [x] **Top item: Whisper accuracy.** Settled 2026-10-11: with the built-in microphone pinned and the vocabulary hint on, `base.en` differed from `small.en` on 3 of 43 turns, and Jacquez chose to stay on `base.en` (D-029). Original note: `base.en` misheard about 1 turn in 3 at normal volume on Jacquez's real voice. Test `small.en` and the vocabulary hint on his real voice, and check whether clipped beginnings are part of it.
  - [x] `small.en` downloaded, verified and compared on synthesized speech (2026-10-10): 68% exact with the hint against 58% for `base.en` with the hint, for about 0.29 s and 350 MB more. His real failures were not reproduced.
  - [x] Q shows which microphone it is recording through and records it in the export. Found 2026-10-10: it had been using his iPhone as a Continuity microphone.
  - [x] Microphone menu in the Voice panel, so Q can be pinned to one device (2026-10-10; tested with simulated devices only).
  - [x] MacBook's own microphone pinned in the menu and shown "In use" after a recording (Jacquez, 2026-10-11).
  - [x] Real-voice check repeated (2026-10-11, 43 turns): `base.en` differed from `small.en` on only 3. The earlier 1-in-3 figure was mostly the phone or AirPods microphone and the missing hint.
  - [x] Side-by-side comparison mode built (2026-10-11): both models hear each recording and he marks which was right.
  - [x] Compared on his real voice, 2026-10-11, 43 turns: same 40, `small.en` right 3, `base.en` right 0, neither 0.
  - [x] Decided 2026-10-11 (D-029): stay on `base.en`.

- [x] Persona written as example replies, not percentages (`persona.md`, D-012).
- [ ] Persona followed reliably. One typed run showed long first sentences, example lines copied word for word, and one invented claim.
- [x] Speed: persistent speech helper (D-021) and stable prompt prefix (D-006, D-022) are in the code.
- [x] Speed: first turn after a few idle minutes was slow because macOS compresses the model's memory. Measured and decided (D-026): ping every 120 s for 15 minutes after the last turn, plus warm on key press. Built 2026-10-11; 0.82 s after 5 idle minutes against 3.0 s without.
- [x] Keep-warm confirmed in real use by Jacquez, 2026-10-11: a turn after an idle gap with the tab open was fast.
- [x] Speed: Q can start speaking at the first clause instead of the first full sentence (`public/chunk.js`, D-025); about 0.5 s sooner on roughly half of replies in a 30-prompt test.
- [x] First-clause speech heard by Jacquez, 2026-10-10: keep it on.
- [x] Clipped first words, step 1 (2026-10-12): Q now measures how long the mic takes to open and flags recordings where speech had already started.
- [x] Real numbers in (2026-10-12): the mic takes a median 0.66 s to open, up to 1.35 s; sound was already present on 2 of 19 turns.
- [x] Clipped first words, step 2 built (2026-10-12, D-030): the mic stays open for 60 s after each turn. Tested with a stand-in microphone.
- [x] Mic hold checked on the real microphone (2026-10-12): 16 follow-up presses recorded after a median 0.06 s.
- [x] Jacquez (2026-10-12): no first words lost in the session with the mic hold. The "already speaking" flag on 8 of 16 kept-open presses is therefore not a sign of lost speech.
- [ ] Still open: the first press after a pause of more than 60 s pays the full 0.66 s.
- [x] Keep Q warm from startup, not only after the first turn (built 2026-10-12, D-031; first turn 6.4 minutes after a restart had taken 7.8 s).
- [x] Seen in real use (2026-10-12): first turn after a restart, three pings before it, 1.31 s.
- [x] A turn is labelled cold only when the model load took over 1 s (was 0.3 s, which mislabelled a slow warm turn).
- [ ] Continuity within a conversation is limited to the last 4–8 turns (`trimHistory()`); nothing carries across sessions.
- [x] Blind pairwise quality evaluation (D-008): tooling built and first comparisons done, 2026-10-11 (two local models, a cloud reference, and old against new persona).
- [x] Compare local models (D-009), first valid pass: blind comparison by Jacquez on the fixed page, 2026-10-11. Preference a draw (`qwen2.5:3b` 6, `llama3.2:3b` 5, same 9); `llama3.2:3b` met more rules (5 of 9 against 3) and won on personality. No case for switching. (An earlier attempt the same day is withdrawn: the page was showing only one reply.)
- [x] Honesty: both models met only 1–2 of 6 honesty rules with the earlier persona. Fixed for `llama3.2:3b` by the persona's examples and closing reminder (6 of 6 blind, 27 of 30 in sampling).
- [x] Comparison page fixed so a rule has to be judged explicitly, and so both replies are actually visible (2026-10-11).
- [x] Rule checks redone with the fixed page (2026-10-11).
- [x] Local-vs-hybrid thresholds written down (D-027) and met on 2026-10-11.
- [x] Better voice, first step: Samantha is the default (D-018).
- [ ] Better voice, second step: evaluate Enhanced or Premium voices (D-013). None are installed on this Mac; the helper already labels them when they are.

# v0.3 — native wrapper, floating core, menu bar, global push-to-talk

Not started. Q runs only as a page in a browser tab.

- [x] Native wrapper chosen: Swift + WKWebView (D-032, 2026-10-13), for now and without a Tauri measurement.
  - [x] Swift shell spike built and probed (2026-10-13): mic works, ⌥Space registers, about 207 MB idle.
  - [x] A real voice turn inside the Swift shell (Jacquez 2026-10-13, Space with the window focused).
  - [x] Voice turns from the global ⌥Space key with another app in front (Jacquez 2026-10-13, two turns, both in the shell's log).
  - [x] Tauri comparison not run: Jacquez chose to stay with Swift for now (2026-10-13). Nothing was downloaded.
- [ ] Floating Q Core window. No code.
- [ ] Menu bar item. No code.
- [ ] Global push-to-talk. No code; the key is undecided, and today Space only works while the tab is focused.
- [ ] Split-Core Q mark (D-017, adopted). Not in the code: `public/index.html` still draws the ring-and-stick mark.
- [x] Related, already built: `Start Q.command` double-click launcher. It is a convenience, not the wrapper.
- [x] Related, already built: the speech helper is Swift, which a Swift shell could absorb.

# v0.4 — persistent history, approved memories, session continuity

Not started. Nothing Q hears or says is saved.

- [ ] Searchable local history. No code; the conversation lives in the page's memory and is gone on reload.
- [ ] Long-term memories saved only after Jacquez approves them. No code.
- [ ] Session continuity. No code.
- [ ] Deletion, retention and export controls for memory. No code.
- [ ] Storage choice (D-011, proposed: keyword search first, Node's built-in SQLite if it holds up).
- The only things stored today are settings and latency numbers in the browser's local storage.

# v0.5 — a few approved, verified Mac actions

Not started. Q cannot act on the Mac, and the persona says so.

- [ ] Fast deterministic matcher for common commands ("open X", "timer for 10 min"). No code.
- [ ] Structured action proposals from the model, validated and executed by code (D-002). No code.
- [ ] Permission checks and scopes. No code.
- [ ] Verification that an action worked before Q reports it. No code.
- [ ] First actions: open apps, folders, VS Code projects. No code.
- [x] Already true: every external program Q runs is started with a fixed argument list, never a shell string, and nothing is built from model output.

# v1.0 — stable daily use

Depends on v0.2 through v0.5. The success scenario in `BRIEF.md` ("remember the portfolio project?" then "open it in VS Code") needs memory (v0.4) and actions (v0.5), neither of which exists.

- [ ] Fast voice: best real turn so far is 5.46 s before the helper; no full real-Mac benchmark since.
- [ ] Good personality: no quality test yet.
- [ ] Floating presence: v0.3.
- [ ] Memory: v0.4.
- [ ] Safe basic actions: v0.5.
- [ ] Explicit resource-pressure behaviour (D-014, open).
- [ ] Outbound network traffic independently verified. The UI says it hasn't been.
- [x] Emergency stop for speech and generation: Esc, the Stop button or clicking the core.
- [x] No telemetry: there is none in the code.

# v1.1+ — reminders and notes, document retrieval, advanced voice, workflows, optional hybrid

Not started, and deliberately so (D-005).

- [ ] Reminders and notes.
- [ ] Document retrieval.
- [ ] Advanced voice or cloning.
- [ ] Workflows.
- [ ] Optional hybrid (cloud reasoning). Requires measurements and Jacquez's explicit opt-in (D-009); there is no cloud code path of any kind today.
