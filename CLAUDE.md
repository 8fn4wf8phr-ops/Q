# Instructions for Claude Code — Project Q

Before doing anything in this repo:
1. Read `docs/BRIEF.md` (the source of truth), `docs/DECISIONS.md` and `docs/STATUS.md`.
2. Run `git status` and preserve any existing changes.

While working:
- Stay in your lane: implementation. Propose small, scoped plans with risks and tests, then **wait for Jacquez's approval** before editing.
- Follow every decision in `DECISIONS.md`. If a task conflicts with one, stop and say so rather than working around it.
- No destructive Git operations, surprise installs, silent commits or pushes, or model-generated shell commands in Q's runtime.

After every change:
- Update `docs/STATUS.md`: what changed, its state label (built / tested with stand-ins / verified on the real Mac), and any new known issues.
- Never mark something "verified" without real test evidence from Jacquez's Mac.
- If you made or recommended a decision, add a proposed line to `docs/DECISIONS.md` marked `(pending Jacquez)`.
