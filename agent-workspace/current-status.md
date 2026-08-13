# Adaptive TDEE v1 Current Status

**Overall:** Ready for implementation<br>
**Branch:** `feat/adaptive-tdee-v1`<br>
**ChatGPT project:** `pulse-fitness-app`<br>
**Execution checkout:** `/Users/meridian/Projects/pulse-fitness-app-adaptive-tdee` on `feat/adaptive-tdee-v1`<br>
**Base commit:** `019e185` (`origin/main` when worktree was created)<br>
**Specification commit:** `59eefa3`<br>
**Last updated:** 2026-08-12

## Completed

- Full repository-specific product, algorithm, data-model, API, UI, migration, and testing specification written at `docs/specs/adaptive-tdee-v1.md`.
- Independent technical review completed and material findings incorporated.
- Specification math vectors independently recalculated.
- Specification citations, formatting, typecheck, build, and existing test suite passed before worktree creation.
- Dedicated feature branch created and selected in the existing ChatGPT `pulse-fitness-app` project.
- Durable execution/handoff documents created under `agent-workspace/`.

## Current milestone

**Milestone 0: Baseline and development isolation**

No application implementation has started.

## Next actions

1. Confirm dependency availability in this worktree.
2. Run and record a fresh baseline (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`).
3. Inspect `.env.example`, database path selection, migration startup, and seed/test-user tooling.
4. Establish an isolated development SQLite database and confirm production data cannot be touched.
5. Stop at `AWAITING VECTOR GATE 0 REVIEW`; do not begin Milestone 1 until Vector approves it.

## Blocking issues

None currently known.

## Non-blocking warnings

- Production deployment is explicitly out of scope until Derek approves it.
- The legacy body-weight unit migration must abort on ambiguity; never infer all users from a preference flag.
- Existing current user data are sparse/stale, so current adaptive state should be Learning/Holding until sufficient new data exist.

## Required update protocol

After each work session or milestone commit, update:

- `Overall`
- `Last updated`
- `Completed`
- `Current milestone`
- `Next actions`
- `Blocking issues`
- Latest commit and verification results when available

## Vector review handoff protocol

Every milestone is a separate Codex goal. Codex completes implementation, automated checks, self-review, built-in-browser QA, evidence, commit, and push for only the currently authorized milestone, then:

1. Set `Overall` to `AWAITING VECTOR GATE N REVIEW` (or `AWAITING VECTOR FINAL REVIEW` after Milestone 6).
2. Record the same milestone verdict in `verification-report.md`.
3. Push the feature branch and update draft PR #100.
4. Stop the goal. Do not begin the next milestone, self-approve the gate, mark the feature `READY FOR DEREK PREVIEW`, make the PR ready for review, merge, or deploy.
5. Derek returns to Hermes/Vector. Vector independently reviews that gate and either records blocking findings or authorizes the next milestone. Only the final Vector review may change the verdict to `READY FOR DEREK PREVIEW`.
