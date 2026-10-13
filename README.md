# Q — v0.1 voice loop

You hold Space and talk. Q transcribes what you said, thinks, and talks back. Everything runs on this Mac.

```
mic → whisper.cpp → Ollama (llama3.2:3b) → macOS voice → speakers
```

The point of this version is to **measure how fast Q answers on your actual Mac**. The Latency panel times every stage of every turn.

## First run (one time, needs internet)

1. Install **Ollama** from https://ollama.com/download and open it once.
2. Install **Homebrew** from https://brew.sh if you don't have it.
3. In this folder:

```bash
npm run setup     # installs whisper.cpp, downloads the speech model, pulls llama3.2:3b, builds the speech helper
npm start
```

4. Open http://127.0.0.1:4141 and allow the microphone when the browser asks.

After the first run you can start Q by double-clicking **`Start Q.command`** in this folder. It makes sure Ollama is running, starts the server in a Terminal window and opens Q in its own window; if Q is already running it just brings Q forward. Close the Terminal window or press Ctrl+C in it to stop Q.

**Q's window** (`bin/Q.app`, built from `shell/` by setup or `npm run build:shell`) floats above other windows and adds a **Q** item to the menu bar. Hold **⌥Space** in any app to talk; inside the window plain Space works too. macOS asks for the microphone once. Quitting the window from the menu bar leaves the server running, and the same page is still at http://127.0.0.1:4141 in a browser. While the window is running, ⌥Space no longer types a non-breaking space in other apps. If the window isn't built, the launcher opens the browser instead.

After setup, you can turn Wi-Fi off and Q still works.

## Using it

| | |
|---|---|
| Hold **Space** (or hold the mic button) | Talk. Let go to send. |
| **Esc**, Stop, or click the core | Interrupt Q mid-thought or mid-sentence. |
| Type in the box + Enter | Same loop without the mic. |

## How to read the Latency panel

**Key release → first audio** is the time from letting go of Space to hearing Q's first word. (Typed turns are timed from Enter and kept out of the statistics.)

- under 1.5 s: feels live
- 1.5–3 s: noticeable
- over 3 s: sluggish

The bar breaks that time into four stages:

- **Speech → text**: whisper.cpp transcribing you.
- **First token**: the model starting to reply (watch for a cold start on the first turn).
- **First phrase**: the model producing the first piece Q can speak. That is the first sentence, or, with "Start speaking at the first pause" on in the Voice panel, the first clause of at least three words.
- **Voice synth**: the macOS voice rendering that sentence to audio.

Under the bars, the panel shows p50 and p90 for warm and cold voice turns separately (p90 appears once a group has ten turns). **Copy run data** puts the timings for up to the last 200 turns on the clipboard as JSON, with memory and power figures sampled by the server: numbers only, never what was said. **Clear** deletes the stored timings.

Try it with VS Code and your browser open too, because that's how you'll actually use it.

## Making Q yours

- **Personality:** edit `persona.md`. Q re-reads it every turn, so you don't need to restart.
- **Voice:** pick one in the Voice panel. Q speaks through a small helper (`bin/q-speak`, built from `speech/q-speak.swift` by setup or `npm run build:speech`) that keeps the macOS voice loaded. Without it Q falls back to `say`, which adds over a second per sentence, and the System panel says so. The Voice engine menu can also switch to the browser's own speech, which only ever uses voices installed on this Mac. For better voices, go to System Settings → Accessibility → Spoken Content → System Voice → Manage Voices and download a Premium or Enhanced voice. It will show up in the list.
- **Comparing Whisper models:** tick "Compare Whisper models on my voice" in the Voice panel and a second model (`small.en`, if it is in `models/`) hears each recording too. When the two disagree you see both and mark which was right; Q keeps the score, not the words. It uses about 600 MB more memory, so switch it off when benchmarking.
- **Quality test:** `node scripts/quality-run.mjs --label NAME` runs the prompts in `quality/prompts.json` through Q and saves the replies to `quality/out/` (not checked in). Run it twice, or once plus `--template cloud` filled in by hand, then open `/quality.html` to compare the two blind.
- **Staying responsive after a pause:** for 15 minutes after your last turn, while the Q page is open, Q pings the model, Whisper and the voice every 2 minutes so macOS doesn't compress their memory, and it wakes them the moment you press the talk key. Change `keepWarmSeconds` and `keepWarmMinutes` in `q.config.json`; set `keepWarmMinutes` to 0 to turn it off.
- **Model and other settings:** copy `q.config.example.json` to `q.config.json` and edit it. For example, set `"model": "qwen2.5:3b"` after running `ollama pull qwen2.5:3b`. Restart Q after you change it.

## What's honest about the UI

The core animates only for real events:

- It pulses for listening only while the mic is recording.
- It shows thinking only while whisper or the model is working.
- It shows speaking only while audio is playing.

The System panel names the microphone Q is recording through, because the browser uses the system default and macOS can switch that without asking (a nearby iPhone becomes a Continuity microphone). If it changes mid-session, Q says so in the conversation. When the default becomes a wireless mic (AirPods, an iPhone), Q uses the Mac's built-in mic by itself and tells you, because a wireless mic cuts Q's voice mid-sentence. To fix the microphone yourself, pick a device under **Your microphone** in the Voice panel: Q then records from that device only, and tells you if it isn't connected instead of quietly using another.

Memory figures come from Ollama and the server process. The network note says what the code does: the server binds to 127.0.0.1 and calls no cloud services. It doesn't claim outbound traffic has been verified, because it hasn't been yet.

## Files

```
server.js          local server: /api/transcribe, /api/chat (streamed), /api/speak, /api/status
persona.md         Q's personality (system prompt)
public/core.js     the Q core renderer (Canvas 2D, ~30 fps when idle, honors Reduce Motion)
public/audio.js    push-to-talk capture → 16 kHz WAV, and ordered sentence playback
public/chunk.js    cuts the streaming reply into pieces to speak (npm test covers it)
echo.js            removes a timestamp the model copies back at the start of a reply
public/stats.js    p50/p90, cold vs warm, and the run-data export (npm test covers it)
public/level.js    loudness check that skips Whisper on near-silent recordings (npm test covers it)
public/app.js      state machine, streaming, timing
speech/q-speak.swift  speech helper source (compiled to bin/q-speak, which is not checked in)
Start Q.command    double-click launcher (checks Ollama, runs npm start, opens Q's window)
shell/             Q's window: Swift source, Info.plist and build script for bin/Q.app
scripts/setup.sh   one-time install/download
scripts/bench-cache.mjs  prompt-cache benchmark (timings only)
scripts/quality-run.mjs  runs the quality-test prompts through Q and saves the replies
quality/prompts.json     the 20 quality-test prompts
public/quality.html      blind side-by-side comparison of two quality runs
```

There are no npm dependencies. You need Node 20+. The speech helper needs `swiftc`, which comes with Xcode or its command line tools.
