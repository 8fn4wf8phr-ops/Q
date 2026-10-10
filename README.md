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

After the first run you can start Q by double-clicking **`Start Q.command`** in this folder. It makes sure Ollama is running, starts the server in a Terminal window and opens the page; if Q is already running it just opens the page. Close that window or press Ctrl+C in it to stop Q.

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
- **First sentence**: the model finishing its first sentence. Q starts speaking after one sentence, not after the whole reply.
- **Voice synth**: the macOS voice rendering that sentence to audio.

Under the bars, the panel shows p50 and p90 for warm and cold voice turns separately (p90 appears once a group has ten turns). **Copy run data** puts the timings for up to the last 200 turns on the clipboard as JSON, with memory and power figures sampled by the server: numbers only, never what was said. **Clear** deletes the stored timings.

Try it with VS Code and your browser open too, because that's how you'll actually use it.

## Making Q yours

- **Personality:** edit `persona.md`. Q re-reads it every turn, so you don't need to restart.
- **Voice:** pick one in the Voice panel. Q speaks through a small helper (`bin/q-speak`, built from `speech/q-speak.swift` by setup or `npm run build:speech`) that keeps the macOS voice loaded. Without it Q falls back to `say`, which adds over a second per sentence, and the System panel says so. The Voice engine menu can also switch to the browser's own speech, which only ever uses voices installed on this Mac. For better voices, go to System Settings → Accessibility → Spoken Content → System Voice → Manage Voices and download a Premium or Enhanced voice. It will show up in the list.
- **Model and other settings:** copy `q.config.example.json` to `q.config.json` and edit it. For example, set `"model": "qwen2.5:3b"` after running `ollama pull qwen2.5:3b`. Restart Q after you change it.

## What's honest about the UI

The core animates only for real events:

- It pulses for listening only while the mic is recording.
- It shows thinking only while whisper or the model is working.
- It shows speaking only while audio is playing.

Memory figures come from Ollama and the server process. The network note says what the code does: the server binds to 127.0.0.1 and calls no cloud services. It doesn't claim outbound traffic has been verified, because it hasn't been yet.

## Files

```
server.js          local server: /api/transcribe, /api/chat (streamed), /api/speak, /api/status
persona.md         Q's personality (system prompt)
public/core.js     the Q core renderer (Canvas 2D, ~30 fps when idle, honors Reduce Motion)
public/audio.js    push-to-talk capture → 16 kHz WAV, and ordered sentence playback
public/stats.js    p50/p90, cold vs warm, and the run-data export (npm test covers it)
public/level.js    loudness check that skips Whisper on near-silent recordings (npm test covers it)
public/app.js      state machine, streaming, timing
speech/q-speak.swift  speech helper source (compiled to bin/q-speak, which is not checked in)
Start Q.command    double-click launcher (checks Ollama, runs npm start, opens the page)
scripts/setup.sh   one-time install/download
scripts/bench-cache.mjs  prompt-cache benchmark (timings only)
```

There are no npm dependencies. You need Node 20+. The speech helper needs `swiftc`, which comes with Xcode or its command line tools.
