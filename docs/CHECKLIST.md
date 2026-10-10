# Q — v0.1 finish checklist

_Checked against the code on 2026-10-10 (after the silence guard, the Whisper vocabulary hint and the speech-helper fix), not against the plan. "Built" means it is in the code. "Confirmed" means it was seen working on Jacquez's Mac with the real pipeline. `STATUS.md` has the measurements._

**v0.1 goal (BRIEF.md):** validate on the real Mac: latency (p50/p90, cold vs warm), memory pressure, swap, export, first quality test.

## Summary
| # | Item | Built | Confirmed on the real Mac |
|---|---|---|---|
| 1 | Voice-speed fix | Done | Partly: speed confirmed; the dropped-sentence fix is not yet heard |
| 2 | Timestamp fix | Done | Partly: benchmarked, not yet in a voice turn |
| 3 | Warm-up "Ready" truthfulness bug | Done | Not done |
| 4 | Silence guard | Done | Not done: needs calibrating on the real mic |
| 5 | Run-data export | Not done | — |
| 6 | ~30-turn benchmark | Not done | — |
| 7 | New persona is in | Done | Partly: typed run only |

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

## 5. Run-data export — not done
- [ ] p90 (the panel shows a median only).
- [ ] Cold vs warm split in the stored runs (each turn is labelled in the panel, but the stored history keeps only time, source and engine for the last 12 turns).
- [ ] Swap and memory-pressure sampling on the server.
- [ ] "Copy run data" button, timings only, no transcripts or audio.
- [ ] Main metric labelled "key release → first audio" and timed from key release (it is still called "Voice to voice", and the clock starts after the recorder has stopped).

## 6. ~30-turn benchmark — not done
- [ ] About 30 voice turns over two sessions with VS Code open; record the browser, VS Code's workload and whether the Mac is plugged in.
- Blocked by item 5: without the export there is nothing to paste into `STATUS.md`.
- `scripts/bench-cache.mjs` is not this benchmark. It measures prompt-cache behaviour with typed turns.

## 7. New persona is in — done
- [x] `persona.md` is byte-identical to the file Jacquez supplied, committed in `21c0809` and pushed.
- [x] The server reads it on every turn, so it is live without a restart.
- [x] One ten-turn typed run on the real model (results in `STATUS.md`).
- [ ] Hear it in a voice turn.

## Added along the way (not one of the seven)
- [x] Whisper vocabulary hint for names and jargon (`whisperPrompt` in `server.js`); 23 → 33 of 40 exact transcripts on synthesized speech.
- [ ] Try it with Jacquez's own quiet speech.
- [ ] Open: the first words can be clipped because the mic opens fresh on every press.

## Also in the v0.1 goal, not started
- [ ] First quality test (20-prompt blind comparison, D-008).
- [ ] Write down the local-vs-hybrid thresholds before that test (open question in `DECISIONS.md`).
