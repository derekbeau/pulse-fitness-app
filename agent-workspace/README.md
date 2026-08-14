# Adaptive TDEE v1 Agent Workspace

This directory is the durable handoff surface for the Adaptive TDEE implementation. The repository, not any individual chat transcript, is the source of truth.

## Historical handoff index

The implementation and final goal-strategy repair described in this directory are completed historical work.
`codex-kickoff.md` and the milestone gates preserve the instructions used for that work; they are evidence, not
authorization to repeat it.

The bounded legacy-history correction has been integrated and the current review state is
`AWAITING VECTOR FINAL GOAL-STRATEGY RE-REVIEW`. See `current-status.md` for the repaired findings and current
evidence. This index does not authorize duplicate implementation, commit, or push work.

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
- Do not repeat the completed final-QA repair or its commit/push sequence from these historical artifacts.
- Vector owns the independent re-review; this workspace does not self-approve the correction.

## Durable artifacts

- `implementation-plan.md`: milestone gates and completion criteria
- `current-status.md`: live state, last verified commit, next action, blockers
- `decision-log.md`: durable decisions and approved spec deviations
- `verification-report.md`: command output summary and browser acceptance evidence
- `codex-kickoff.md`: historical mission prompt for the completed final-QA repair
