# Q — Project Brief

_Source of truth for everyone working on Q. If this file and a conversation disagree, this file wins until Jacquez updates it._

## What Q is
Q is Jacquez's private, original AI companion for macOS, named after his nickname. The goal is the Jarvis feeling: fast spoken replies, a personality he recognizes, and a presence that's always on his desktop. Over time Q remembers approved context and performs approved Mac actions. **It is not primarily a coding agent.**

## Who does what
| Who | Lane | Question they own |
|---|---|---|
| **Jacquez** | Vision, decisions, approvals | "What do I want, and is this done?" |
| **ChatGPT** | Vision and feel: personality, naming, visuals, UX ideas, brainstorming | "What's missing? What would make Q feel more alive?" |
| **Claude Chat** | Technical review: risks, measurement, architecture tradeoffs | "What will break? What's unmeasured? What's overbuilt?" |
| **Claude Code** | Implementation: inspects the repo, proposes small plans, writes approved code, reports verified tests | "What exactly changes, and how do we know it works?" |

**Rules for the lanes**
- Give ChatGPT and Claude Chat *different questions*, not the same document.
- Every decision gets one line in `DECISIONS.md`, whoever suggested it.
- Claude Code updates `STATUS.md` after each change, and only marks something "verified" when there's test evidence.
- Plans, mockups and roadmaps are not features. Don't describe anything as working until it has been run on the real Mac.

## Hardware and stack
- Apple M1 MacBook Air, 8 GB unified memory, usually with VS Code open.
- Plain Node.js server (no npm dependencies), Ollama with `llama3.2:3b`, whisper.cpp (speech to text), a small Swift helper that keeps a macOS voice loaded (text to speech; falls back to `say`), Canvas 2D for the Q Core.
- Runs locally and binds to 127.0.0.1. That alone does **not** prove there's no outbound network traffic.
- Offline-first. Hybrid (cloud reasoning) was measured against a written rule on 2026-10-11 and **Q stays local** (D-027). Revisiting it requires new measurements and Jacquez's explicit opt-in. There is never a silent cloud fallback.

## Architecture
- **One primary model** with modular capabilities: conversation manager, voice pipeline, local memory, permission-controlled Mac tools, resource monitor.
- The model may *propose* a structured action. **Code** validates scope and permission, executes it, verifies the result, then Q reports it. No model-generated shell commands.
- Common commands ("open X", "timer for 10 min") go through a fast deterministic matcher before reaching the model.
- No multi-agent system. Agents are a post-v1.0 experiment, only if real evidence justifies them.

## Personality and visuals
- Q is confident, warm, witty, concise, observant, and honest about its limits. It never fakes feelings, actions or capabilities.
- Personality lives in `persona.md`. Express traits as **example replies**, not percentages, because small models ignore numbers like "humor 70%".
- Profiles (Personal, Professional, Mentor, Operator) come later. **Profiles never change permissions.**
- Q Core: a cyan/blue/violet Q-shaped ring on a dark UI. It animates only for real events. Mockups are mood references, not specs. The chosen identity direction is the Split-Core Q (D-017); it is not in the UI yet.

## Memory and privacy
- Three separate layers: short-term context (recent turns), searchable local history, and long-term memories saved only after Jacquez approves them.
- Deletion, retention and export controls are required.
- Keep memory small and selective. Every fact added to the prompt delays Q's first word.
- No telemetry. Any future cloud use has to say exactly what gets sent.

## Roadmap (capabilities, not dates)
| Version | Goal |
|---|---|
| **v0.1** | Validate on the real Mac: latency (p50/p90, cold vs warm), memory pressure, swap, export, first quality test. **Closed 2026-10-11 (D-028).** |
| **v0.2** (current) | Speech recognition accuracy on Jacquez's real voice first; then personality, continuity and speed; better macOS voice. Blind quality evaluation started in v0.1 and continues here |
| v0.3 | **Decide the native wrapper first** (Swift + WKWebView vs Tauri vs Electron), then build the floating core, menu bar and global push-to-talk |
| v0.4 | Persistent history, approved memories, session continuity |
| v0.5 | A few approved, verified Mac actions (open apps, folders, VS Code projects) |
| **v1.0** | Stable daily use: fast voice, good personality, floating presence, memory, safe basic actions |
| v1.1+ | Reminders and notes, document retrieval, advanced voice/cloning, workflows, optional hybrid |

**v1.0 success scenario:** "Q, remember the portfolio project?" Q recalls approved context. "Open it in VS Code." Q checks permission, opens the right project, confirms it worked, and replies naturally.

## Standing principles
1. Experience first: fast speech, consistent personality, a visible Q Core.
2. Measure on the real Mac with VS Code open before expanding anything.
3. Privacy first: local by default, cloud only by explicit choice.
4. Truthful UI: no fake status, progress, readiness or connectivity.
5. Permission boundaries: approved actions only.
6. One version at a time. Pass the gate, then move on.
7. Change the roadmap when the measurements say to.

## Safety and workflow (for Claude Code)
- Inspect the repo and `git status` before proposing work.
- Preserve existing changes. No destructive Git operations, surprise installs, silent commits or pushes, or unapproved edits.
- Propose small, scoped plans with risks and tests, then wait for approval.
- The emergency stop halts pending work. It doesn't pretend to undo completed actions.
