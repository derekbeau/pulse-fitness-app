# Adaptive TDEE v1 Current Status

**Overall:** AWAITING VECTOR GATE 1 REVIEW<br>
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
- Dependencies verified with `pnpm install --frozen-lockfile --offline`.
- Isolated read-only seed and writable development copies established under `apps/api/data/`; the production volume was not opened or changed.
- Isolated test user registered through the real UI and a weight entry written/read through the running app.
- Final uncached lint, typecheck, test, and build gates passed (3 isolation tests plus 1,863 package tests across 243 files).
- Built-in-browser smoke testing passed on 11 primary routes, and Vector's repaired Dashboard -> Nutrition -> Dashboard rerun produced no console warnings/errors or failed requests.
- Browser-discovered local-date rollover and Recharts initialization warnings were fixed and regression-tested.
- A tracked `pnpm dev:gate0` command now enforces the isolated writable database and ports 3102/5274, rejects default/production/snapshot paths, and shuts down both child servers together.
- Vector independently resolved and verified both Gate 0 blockers before Milestone 1 began.
- Canonical body-weight migration preflight now requires an exact reviewed per-user legacy-unit map and fails closed for absent, partial, extra-user, out-of-range, and partially canonicalized inputs.
- Migration 0041 adds non-null canonical `weightKg` and `unitAtEntry`; the compatibility `weight` column is fixed in pounds with an exact-conversion constraint.
- Weight routes, dashboard snapshots/trends, referential habit reads, agent context, static import, shared schemas, and all web weight surfaces now read canonical kilograms and convert only at response/display boundaries.
- The tracked `pnpm dev:gate0` path owns the ignored reviewed-map location and is the only runtime/browser environment used for Milestone 1.
- Browser QA covered pounds and kilograms writes, preference changes, dashboard weight surfaces, weight history, settings, and habits. It found and resolved stale display-unit caches plus two hard-coded dashboard unit labels; the final rerun had no console errors or failed API requests.
- Targeted Milestone 1 regression coverage passed 241 tests. Uncached lint, typecheck, full tests, and build passed; full package tests now total 1,879 across 245 files, plus 3 Gate 0 isolation tests.

## Current milestone

**Milestone 1: Canonical weight foundation — awaiting independent review**

Milestone 1 implementation, self-review, automated checks, and built-in-browser QA are complete. No Milestone 2 work has started.

## Next actions

1. Hermes/Vector independently reviews the complete Milestone 1 diff, migration safety, reader audit, tests, and browser evidence.
2. Vector records either `VECTOR GATE 1 APPROVED` or blocking findings.
3. Milestone 2 remains prohibited until Derek explicitly authorizes a new Codex goal after Gate 1 approval.

## Blocking issues

None.

## Non-blocking warnings

- The copied production baseline contains 37 pre-existing foreign-key violations (34 `session_sets -> exercises`, 3 `template_exercises -> exercises`); tracked separately in GitHub issue #101. Milestone 0 did not repair or write production data.
- Lint passes with four pre-existing Fast Refresh warnings in workout files; there are zero lint errors.
- The repository has no configured format-check script. A whole-repository Prettier diagnostic found 107 historical mismatches outside this milestone; changed files are checked separately.
- Production deployment is explicitly out of scope until Derek approves it.

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
