# Q — roadmap checklist

_Checked against the code on 2026-10-10 (after the silence guard, the Whisper vocabulary hint and the speech-helper fix), not against the plan. "Built" means it is in the code. "Confirmed" means it was seen working on Jacquez's Mac with the real pipeline. `STATUS.md` has the measurements._

Covers the whole roadmap in `BRIEF.md`, v0.1 through v1.1+. v0.1 is itemised because it is the version in progress; later versions list what the code already has and what it doesn't.

# v0.1 — validate on the real Mac

**Goal (BRIEF.md):** latency (p50/p90, cold vs warm), memory pressure, swap, export, first quality test.

## Summary
| # | Item | Built | Confirmed on the real Mac |
|---|---|---|---|
| 1 | Voice-speed fix | Done | Partly: speed confirmed; the dropped-sentence fix is not yet heard |
| 2 | Timestamp fix | Done | Partly: benchmarked, not yet in a voice turn |
| 3 | Warm-up "Ready" truthfulness bug | Done | Not done |
| 4 | Silence guard | Done | Not done: needs calibrating on the real mic |
| 5 | Run-data export | Done | Not done: needs real voice turns and the clipboard tried in Chrome |
| 6 | ~30-turn benchmark | Not done | — |
| 7 | New persona is in | Done | Done |

## 1. Voice-speed fix — built, partly confirmed
- [x] Speech helper is the default voice path (`server.js`: `tts: 'helper'`; `speech/q-speak.swift`; `bin/q-speak` is built on this Mac).
- [x] Falls back to `say` if the helper is missing or stops, and says so in the System panel.
- [x] Samantha is the default voice.
- [x] Confirmed: one real voice turn by Jacquez, voice synth 0.21 s (was 3.40 s).
- [x] Fixed a helper bug that could return a sentence with no audio when requests came back to back (`speech/q-speak.swift`; 40 of 40 queued runs and 120 of 120 sequential sentences at full length after the fix).
- [ ] After a restart, hear a reply of three or more sentences with none missing.

## 2. Timestamp fix — built, partly confirmed
- [x] The time is no longer in the system prompt; each user message carries the time it was sent (`server.js` `stamped()`, `public/app.js` `at: Date.now()`).
- [x] History is capped at 8 turns or 6000 characters and trimmed 4 turns at a time (`server.js` `trimHistory()`).
- [x] "Prompt processing" row is in the latency panel code.
- [x] Benchmarked on real Ollama: first token when every turn crosses a minute went from 0.61–1.85 s to 0.34–0.85 s.
- [ ] See it in a real voice turn, including the "Prompt processing" row in the browser.

## 3. Warm-up "Ready" truthfulness bug — built, not confirmed
- [x] Server tracks the warm-up and reports it (`server.js` `warm`, `warmupWaitMs`).
- [x] UI shows "Warming up" and labels a turn that waited on it as cold (`public/app.js`).
- [ ] Real check: quit and reopen Ollama, start Q, ask at once. Expect "Warming up", then a turn labelled cold. Only stand-in tests so far.

## 4. Silence guard — built, not confirmed
- [x] Near-silent recordings skip Whisper (`public/level.js` `measureLevel()`, used in `public/audio.js` and `public/app.js`).
- [x] `npm test` passes: silence, low noise and clicks are rejected; real synthesized speech turned down 20 and 30 dB is accepted.
- [ ] Calibrate on the real microphone: a few silent holds and a few quiet sentences, then set the threshold from the levels Q reports.
- [ ] Confirm a silent hold no longer produces a phantom reply.

## 5. Run-data export — built, not confirmed
- [x] p50 and p90, warm and cold separately; p90 from 10 turns up (`public/stats.js`).
- [x] Every turn stored as numbers only, with a cold flag and idle time, up to 200 turns (`public/app.js` `recordTurn()`).
- [x] Swap, memory pressure and process memory sampled on the server per turn (`server.js` `/api/system`).
- [x] "Copy run data" button; the export is built from an allowlist and `npm test` checks no message text can get in.
- [x] Main metric labelled "Key release → first audio" and timed from key release.
- [ ] Do a few real voice turns and check the numbers look right.
- [ ] Press "Copy run data" in Chrome and confirm it lands on the clipboard.

## 6. ~30-turn benchmark — not done
- [ ] About 30 voice turns over two sessions with VS Code open; record the browser, VS Code's workload and whether the Mac is plugged in.
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
- [ ] Open: the first words can be clipped because the mic opens fresh on every press.

## Also in the v0.1 goal, not started
- [ ] First quality test (20-prompt blind comparison, D-008).
- [ ] Write down the local-vs-hybrid thresholds before that test (open question in `DECISIONS.md`).

# v0.2 — tune personality, continuity and speed; blind quality evaluation; better macOS voice

Nothing here is finished. Some of it was started early while fixing v0.1.

- [x] Persona written as example replies, not percentages (`persona.md`, D-012).
- [ ] Persona followed reliably. One typed run showed long first sentences, example lines copied word for word, and one invented claim.
- [x] Speed: persistent speech helper (D-021) and stable prompt prefix (D-006, D-022) are in the code.
- [ ] Speed: first turn after a few idle minutes is slow because macOS compresses the model's memory. Measured, no fix chosen (D-014).
- [ ] Speed: the first words can be clipped because the mic opens fresh on every press.
- [ ] Continuity within a conversation is limited to the last 4–8 turns (`trimHistory()`); nothing carries across sessions.
- [ ] Blind pairwise quality evaluation (D-008). Not started; no prompts, no harness.
- [ ] Compare 2–3 local models (D-009). Only `llama3.2:3b` has been run.
- [ ] Local-vs-hybrid thresholds written down before the quality test. Still an open question in `DECISIONS.md`.
- [x] Better voice, first step: Samantha is the default (D-018).
- [ ] Better voice, second step: evaluate Enhanced or Premium voices (D-013). None are installed on this Mac; the helper already labels them when they are.

# v0.3 — native wrapper, floating core, menu bar, global push-to-talk

Not started. Q runs only as a page in a browser tab.

- [ ] Choose the native wrapper: Swift + WKWebView vs Tauri vs Electron (D-010, open). This comes first.
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
