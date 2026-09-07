# Issue 137 — Keep Review TDEE Learning: Goal-Mode Implementation Contract

## Goal

Complete this specification 100%. Implement, adversarially review, repair, verify, commit, and document the forward lifecycle fix for issue 137. An eligible Adaptive Nutrition `updating` check-in accepted through an immaterial-target `keep` review must advance learned expenditure state without creating or mutating a nutrition target. Do not stop at a plan, partial implementation, happy-path test, or status summary.

## Exact execution context

- Repository: `/Users/meridian/Projects/pulse-tdee-learning-fix`
- Approved base: `origin/main` at exact SHA `21c980a581859ba19e1ca2f48c7bd0e77314ae7e`
- Working branch/worktree: `fix/keep-review-tdee-learning` at this contract's committed HEAD
- GitHub issue: `https://github.com/derekbeau/pulse-fitness-app/issues/137`
- Required context: `AGENTS.md`, `docs/specs/adaptive-tdee-v1.md`, `docs/conventions/api-conventions.md`, current adaptive nutrition store/review lifecycle/schema/analytics/UI/tests, and the live issue body/comments.
- Main worktree pre-existing state: unrelated untracked `CODEX-ISSUE-*.md`, `apps/web/artifacts/`, and `artifacts/issue-*` files exist in `/Users/meridian/Projects/pulse-fitness-app`; preserve them and do not edit, stage, delete, or repair them.
- This isolated worktree starts clean from the approved SHA. Do not import untracked main artifacts or depend on files outside the repository manifest.

Fail before editing if the repository, branch, worktree, starting SHA, or clean/dirty assumptions do not match.

## User outcome

When the weekly review says **Keep the current plan** because the proposed nutrition-target calorie delta is immaterial, the user can accept it and Pulse will:

1. accept a valid learned Adaptive TDEE update as the next prior expenditure state;
2. leave the current nutrition target and target-event history unchanged;
3. show an honest accepted model update / target unchanged audit projection;
4. use that accepted TDEE in the next preview/check-in and analytics;
5. retain existing material adjustment behavior through the explicit proposal path.

## Current behavior and inspected evidence

- `apps/api/src/routes/adaptive-nutrition/review-store.ts` currently maps `Math.abs(calorieDelta) >= 25` to `adjust`, otherwise `keep`.
- The same review store currently calls `adaptiveStore.declineCheckIn()` for accepted `keep`, so a real `updating` TDEE proposal cannot become the next prior.
- `apps/api/src/routes/adaptive-nutrition/store.ts` currently selects the latest prior only from `status = accepted` check-ins with non-null `proposedTdeeKcal`; its acceptance path requires and writes a nutrition target plus target event.
- `packages/shared/src/utils/adaptive-tdee.ts` rounds TDEE to the configured 10-kcal increment and preserves a nonzero movement when rounded movement is at least 10 kcal; this behavior and exact boundary behavior must be preserved and tested, not silently changed.
- `apps/api/src/routes/adaptive-nutrition/analytics-store.ts` already projects accepted expenditure separately from target events; extend/repair it so model-only accepted expenditure is newest accepted provenance while target calories remain the unchanged target.
- Existing integration/UI tests encode the old keep→declined behavior and must be updated with mandatory compatibility coverage rather than deleted.

## Fixed product and architecture decisions

- Keep the user-facing target materiality dead-band at **25 kcal after the repository's canonical target rounding**. Name and document the product constant; do not lower it to 10 kcal.
- Exact named dead-band cases must cover target deltas **20, 24, 25, and 30 kcal** after rounding: 20 and 24 are `keep`; 25 and 30 are `adjust` (with sign symmetry).
- A `keep` accepted review may accept model learning only when the source check-in is genuinely eligible and `calculationState === 'updating'` with a real, non-null proposed TDEE update. It must not fabricate an update for `holding` or `learning` states, and must not turn an ineligible/held/deferred calculation into accepted learning.
- Model-only acceptance records the check-in as accepted with resolved audit state, but creates **no** nutrition target row, target update, or nutrition-target event; current target remains unchanged.
- A model-only acceptance must be atomic, idempotent on retry, safe under concurrent accept attempts, stale/fingerprint guarded, and scoped by authenticated `userId` for both JWT and AgentToken callers.
- Review and check-in projections must clearly represent accepted model update / target unchanged; no contradictory accepted-review + declined-source projection for new forward behavior.
- Material target adjustments continue through the existing explicit `acceptCheckIn` proposal path, including same-date conflict and replacement safety rules.
- Existing historical accepted keep reviews whose source check-ins are `declined` remain unchanged by default. No historical rewrite, backfill, repair, or accepted-target mutation is authorized.
- Existing accepted targets and baseline check-ins remain unchanged. No baseline-checkin mutation.
- No production access, environment changes, canonical data repair, deployment, merge, or cron scheduling.

## Complete implementation surface

### Production behavior

- Introduce a named, shared/documented 25-kcal target materiality constant used by review classification and covered at 20/24/25/30 boundaries.
- Add an explicit model-only accepted path (or an equivalent safely factored path) that persists the eligible proposed TDEE and resolves the source check-in as accepted without target materialization.
- Ensure target-changing accept still writes exactly the existing target/event lifecycle and only when the decision is material or explicitly edited.
- Ensure future check-in preview seeds `priorTdee` from the newest accepted expenditure state, including model-only acceptance, with deterministic ordering and no cross-user/program leakage.
- Preserve true `holding`/`learning` semantics: no accepted expenditure update when there is no real proposed update.

### Contracts, persistence, and audit

- Update shared Zod schemas/types only if needed, preserving backward compatibility for existing snapshots and API responses. Any new discriminator/field must be strict, documented, and safely parse historical snapshots.
- Preserve check-in snapshots and immutable review snapshots. Do not rewrite source snapshots.
- Model-only acceptance must leave `acceptedNutritionTargetId` null and target tables/events byte-for-byte logically unchanged.
- Audit action payload must identify the applied model-only acceptance and target-unchanged result; exactly one accept action is created for the first request and retries return the same terminal review.
- Enforce optimistic stale checks against source fingerprint and action sequence, atomic transaction boundaries, concurrency behavior, user ownership, JWT and AgentToken auth schemas/routes.

### Analytics and UI

- Analytics current adaptive expenditure and `expenditureSourceCheckInId`/fingerprint use the newest accepted expenditure state, including model-only acceptance.
- Analytics current calorie target and target provenance remain the existing target; no target marker/event is fabricated.
- Review UI must honestly distinguish “accepted model update; targets unchanged” from true holding/learning and from material adjustment. Keep action labels accessible and mobile-safe.
- Verify isolated meaningful UI flows in installed Chrome: model-only keep, material adjust, true hold/defer, and analytics target/expenditure continuity. This UI verification is **launcher-only evidence and never an executor acceptance blocker**; do not waste the implementation loop on unrelated browser/runtime failures.

## Invariants that must not regress

- All adaptive rows, reviews, actions, targets, events, analytics, and contexts remain user-scoped; JWT and `Authorization: AgentToken <token>` behavior remains equivalent where routes are shared.
- Exact input fingerprint, stale source, same-date target, idempotency, transaction rollback, and concurrency protections remain fail-closed.
- No target event is inserted or target row mutated for model-only keep acceptance.
- No historical accepted target, historical review, declined source row, or baseline check-in is rewritten or backfilled.
- TDEE rounding, 10/20 movement learning, floor-bound nonzero learning, and material target arithmetic remain deterministic.
- Existing API schema compatibility and historical snapshot parsing remain intact.

## Acceptance matrix

1. **Keep/model-only success:** eligible `updating` check-in with rounded target delta 10 kcal is accepted; TDEE persists; no target/event is created or mutated; check-in is accepted; review audit says target unchanged.
2. Same for rounded target delta 20 kcal.
3. **Dead-band boundaries:** exact rounded deltas 20, 24 → `keep`; 25, 30 → `adjust`, including positive/negative signs and no floating-point drift.
4. **TDEE movement:** ±10 and ±20 learned movements persist; floor-bound target with zero/immaterial target delta still persists a nonzero proposed TDEE.
5. **No fabrication:** `holding`, `learning`, missing proposal, null proposal, or ineligible source cannot be accepted as a model-only update; true hold/defer remains distinct.
6. **Next prior:** subsequent preview/check-in uses the model-only accepted TDEE as `priorTdeeKcal` and its source fingerprint/ID.
7. **Material path:** 25/30-kcal and edited material proposals use existing target/event acceptance, preserving same-date conflict/replacement behavior.
8. **Audit/idempotency:** repeated accept returns the same result and one accept action; concurrent attempts yield one committed transition with no duplicate target/event/action; rollback leaves all state unchanged on failure.
9. **Stale:** changed source facts, algorithm/version/program/goal, fingerprint, or action sequence fail closed with no writes.
10. **Isolation/auth:** JWT and AgentToken callers can operate only on their user’s review/check-in; cross-user IDs are not observable or mutable.
11. **Analytics:** newest accepted expenditure is shown after model-only acceptance, while newest/current target calories and target provenance remain unchanged; no target marker/event appears for model-only acceptance.
12. **Compatibility:** historical accepted keep review + declined source remains unchanged; accepted targets, target events, baseline check-ins, legacy snapshots, and API schemas continue to parse and behave as before.
13. **UI/browser:** installed Chrome isolated meaningful keep, adjust, hold/defer, and analytics flows with populated mobile inputs; record screenshots/readbacks. UI result is launcher evidence only, never a blocker for executor acceptance.
14. **Repository gates:** focused adaptive shared/store/review/analytics/API/UI tests; then full **uncached** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; inspect final diff and `git diff --check`.
15. **Evidence/hygiene:** literal exact-SHA raw logs, API readbacks, screenshots, and final status retained under `/Users/meridian/Projects/qa-reports/pulse-pr137-launch/` (or a repo-local evidence path referenced by the report); no secrets.
16. **Prohibited actions:** confirm no production/env/data repair/deploy/merge/cron action was taken.

## Required Codex internal completion loop

1. Read this contract and all required repository context before editing; write a bounded plan.
2. Add or strengthen tests for lifecycle, arithmetic boundaries, state projection, audit, auth/isolation, stale/concurrency, analytics, compatibility, and UI.
3. Implement one coherent forward fix; do not perform historical backfill or unrelated cleanup.
4. Run focused checks during iteration.
5. Spawn distinct internal review assignments for data/contracts/invariants; auth/security/atomicity/concurrency; UI/analytics/product behavior; tests/evidence/repository hygiene.
6. Consolidate every concrete finding, fix all in-scope findings, and rerun affected checks.
7. Run the complete uncached lint/typecheck/test/build matrix and installed Chrome verification; preserve literal evidence tied to final SHA.
8. Inspect final diff, commit coherent Conventional Commit(s), and leave the worktree clean.

## Side-effect and approval boundaries

Implementation, tests, local fixtures, local browser verification, commits, literal evidence, and pushing a **draft PR** are authorized after this launch. Post-launch implementation is explicitly authorized by this contract. Do **not** merge, deploy, mutate production/canonical data, run backfill/repair, alter environments/secrets, or schedule cron. Model selection for the executor: **GPT-6 Astra, lowest visible effort** (previous UI label was “Astra Light”); report the exact visible label selected and do not require any executor-internal mapping. Luna medium is review/support only.

## Final report contract

Return `COMPLETE` or `BLOCKED`; exact branch and full SHA; commits/files; requirement-to-evidence mapping; internal reviewers and finding dispositions; exact commands and literal results; browser/UI evidence; prohibited-action confirmation; final `git status --porcelain`; and any blocker. No executor merge.
