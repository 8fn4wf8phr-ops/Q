# Q — Decisions Log

_One row per decision. Jacquez approves every row. To change a decision, add a new row that supersedes the old one; don't delete history. "Proposed" and "Open" rows are not decided yet._

| ID | Decision | Status | Why / conditions | Suggested by | Approved |
|---|---|---|---|---|---|
| D-001 | One primary local model + deterministic, permission-controlled tools, not six required agents | Adopted | Less coordination and memory overhead on 8 GB; agents optional after v1.0 only if proven better | Claude Chat | Jacquez · 2026-10-09 |
| D-002 | The model proposes actions; code checks permissions, executes and verifies, then Q reports | Adopted | Never report unverified success; no arbitrary shell access | Claude Chat / ChatGPT | Jacquez · 2026-10-09 |
| D-003 | Voice, personality and desktop presence before advanced automation | Adopted | Goal is the Jarvis feeling ("building my own Jarvis"), not a coding agent | Jacquez | Jacquez · 2026-10-08 |
| D-004 | Persistent selective memory before Mac actions | Adopted | Continuity matters more to the feel; keep prompts small | Claude Chat | Jacquez · 2026-10-09 |
| D-005 | v1.0 limited to voice, persona, floating UI, memory and a few safe actions | Adopted | Reach daily use sooner; productivity, retrieval, cloning and workflows come after 1.0 | Claude Chat | Jacquez · 2026-10-09 |
| D-006 | Investigate the minute-changing timestamp in the system prompt | Pending repo test | It may break Ollama's prompt-cache reuse and inflate latency; not proven until benchmarked | Claude Chat | — |
| D-007 | ~30-turn benchmark, cold/warm split, server-side resource metrics, "key release → first audio" as the main metric | Proposed for v0.1 | Credible measurements; separate system swap/pressure from Q's own process memory | Claude Chat / ChatGPT | — |
| D-008 | Blind pairwise quality comparisons plus scenario checks, some heard aloud | Proposed for v0.1/v0.2 | Fast but dull doesn't meet the vision | Claude Chat | — |
| D-009 | Compare 2–3 viable local models before any cloud decision; cloud only with explicit consent and evidence | Adopted | Cheapest improvement first; no silent cloud fallback, ever | Jacquez / Claude Chat | Jacquez · 2026-10-09 |
| D-010 | Thin Swift + WKWebView shell preferred for evaluation, not selected | Open until the pre-v0.3 gate | Compare with Tauri (also WKWebView) on measured overhead; Electron likely too heavy | Claude Chat | — |
| D-011 | Memory starts small with keyword search; Node's built-in SQLite only if the Node version supports it well | Proposed for v0.4 | Avoid embeddings and a second model at first | Claude Chat / ChatGPT | — |
| D-012 | Add a silence guard before Whisper; express persona as example replies, not percentages | Proposed | Reduce Whisper hallucinations; a 3B model ignores "humor 70%" | Claude Chat | — |
| D-013 | Evaluate macOS Enhanced/Premium voices early | Proposed | Possible quality gain with no new TTS model | Claude Chat | — |
| D-014 | Resource-pressure behavior must be explicit | Open | Define when Q lowers animation work, shortens context or unloads an idle model; no silent data loss | ChatGPT | — |
| D-015 | Shared files (`BRIEF.md`, `DECISIONS.md`, `STATUS.md`) are the source of truth; separate lanes: ChatGPT = vision and feel, Claude Chat = technical review, Claude Code = implementation, Jacquez = decisions | Adopted | Stops copy-pasting between chats and keeps two reviewers from overlapping | Claude Chat | Jacquez · 2026-10-09 |
| D-016 | Slow latency triggers bottleneck analysis, not an automatic cloud switch | Adopted | Privacy-first unless the evidence says otherwise | ChatGPT | Jacquez · 2026-10-09 |
| D-017 | Split-Core Q selected as the visual identity direction | Adopted | Integrated geometric tail avoids the magnifying-glass look; preserve cyan → blue → violet and refine for 26px readability | ChatGPT | Jacquez · 2026-10-09 |
| D-018 | Samantha is Q's default voice | Adopted | Real-Mac runs 2026-10-10: voice-to-voice 10–18 s with the system default voice vs 5.46 s best with Samantha; D-013 (Enhanced/Premium voices) still to evaluate | Jacquez | Jacquez · 2026-10-10 |
| D-019 | Speak through the browser's Web Speech API, restricted to local macOS voices, with per-sentence `say` kept as the fallback; build a persistent Swift speech helper only if the browser route measures badly or the event-driven core isn't good enough | Proposed | Each `say` process costs 1.3–4 s of startup; browser speech has no process to start but its audio can't feed the core's level meter, so "speaking" would be driven by real start/word/end events instead of loudness; never use a non-local voice. Built 2026-10-10 as a selectable engine (default still `say`); see D-021 for what the measurements suggest instead | Claude Code | — |
| D-021 | Make a persistent Swift speech helper Q's main voice path, replacing per-sentence `say`; keep browser speech as an option | Proposed | Spike on this Mac 2026-10-10: first audio buffer in 13–19 ms and a whole sentence in under 50 ms after a one-time 0.5–0.8 s start, vs 1.3–2.4 s per sentence for `say` and roughly 0.1 s for browser speech; keeps the loudness-reactive core and has no network-voice risk. Costs: about 80 lines of Swift, a compile step in setup (needs Xcode's `swiftc`), and it changes the stack listed in BRIEF.md | Claude Code | — |
| D-020 | Show "Warming up" until the startup model load finishes, and count a turn as cold if it waited on that load | Adopted | "Ready" during warm-up is a false status; cold/warm split in D-007 is wrong without it; built 2026-10-10, tested with stand-ins only | Jacquez | Jacquez · 2026-10-10 |

## Open questions (decide before the gate that needs them)
- **Local vs hybrid rule:** write the exact thresholds down before the first quality test (e.g. "stay local if the best local model wins ≥ X% of blind comparisons vs a cloud reference and warm p90 < 3 s").
- **Which local model:** llama3.2:3b vs qwen2.5:3b vs a 4B if it fits in 8 GB.
- **Global push-to-talk key:** needs a modifier combo such as ⌥Space (bare Space can't be global); check what permissions macOS requires.
- **How long to keep the model loaded (`keepAlive`):** RAM held while idle vs cold-start delay; measure on this Mac.

## Change control
For each change: date, Jacquez's approval, evidence (test run or commit) and tradeoffs. This log records decisions; it is not proof that anything is implemented. `STATUS.md` says what actually works.
