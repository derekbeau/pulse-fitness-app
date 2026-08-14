# Adaptive TDEE v1 Agent Workspace

This directory is the durable handoff surface for the Adaptive TDEE implementation. The repository, not any individual chat transcript, is the source of truth.

## Start here

1. Read `../AGENTS.md`.
2. Read `../docs/specs/adaptive-tdee-v1.md` completely.
3. Read `current-status.md`, `implementation-plan.md`, and `decision-log.md`.
4. Follow the active bounded repair in `codex-kickoff.md`; Milestones 0–11 are historical checkpoints.
5. Update `current-status.md` after each meaningful work session and milestone commit.
6. Record genuine design decisions or spec deviations in `decision-log.md` before implementation.
7. Record final commands and observed results in `verification-report.md`; never claim a check passed without real output.

## Operating rules

- Primary implementation worktree: `/Users/meridian/Projects/pulse-fitness-app-adaptive-tdee`
- Branch: `feat/adaptive-tdee-v1`
- Base: `main`
- No production deployment without Derek's explicit approval.
- Do not use production data for development writes.
- One primary implementation owner integrates changes in this worktree.
- Subagents may investigate or review in parallel, but they must not edit this same checkout concurrently.
- Use separate worktrees for concurrent editors and merge only reviewed commits.
- Write tests during each milestone, not after the feature is assembled.
- Commit the current final-QA repair as exactly one Conventional Commit.
- After complete automated and browser verification, stop at `AWAITING VECTOR FINAL GOAL-STRATEGY RE-REVIEW`; Vector owns the independent re-review.

## Durable artifacts

- `implementation-plan.md`: milestone gates and completion criteria
- `current-status.md`: live state, last verified commit, next action, blockers
- `decision-log.md`: durable decisions and approved spec deviations
- `verification-report.md`: command output summary and browser acceptance evidence
- `codex-kickoff.md`: self-contained mission prompt for Codex Desktop
