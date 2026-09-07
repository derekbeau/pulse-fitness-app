# Food Usage Integrity: Goal-Mode Implementation Contract

## Goal

Complete issue #143 100%. Continue until every in-scope requirement and acceptance criterion is implemented, adversarially reviewed, fixed, verified, committed, and documented with literal evidence. Do not stop at a plan, partial implementation, happy-path result, status summary, or known failing check.

## Exact execution context

- Repository: `/Users/meridian/Projects/pulse-food-usage-integrity`
- Approved base: `origin/main` at exact SHA `b64e8191ba4dc0415e05eedbbb8050fc56ebbc9e` (already deployed main; do not deploy)
- Working branch/worktree: `fix/food-usage-integrity` at `/Users/meridian/Projects/pulse-food-usage-integrity`
- Launch mode: fresh Pulse project/chat in Codex App Goal Mode; primary model GPT-6 Astra, lowest effort; internal review/support model GPT-5.6 Luna, medium effort
- Required first reads: `AGENTS.md`, this contract, the issue #143 body/comments, relevant nutrition/foods/trash/auth tests and stores
- The original `/Users/meridian/Projects/pulse-fitness-app` worktree remains on `main` with its pre-existing untracked files; do not modify, clean, stage, or switch it.
- Fail before editing if the worktree, branch, base SHA, or contract state does not match this context.

## User outcome

Food usage metadata remains an exact, user-isolated projection of linked meal items regardless of which supported meal or food lifecycle path produced the current links. `usageCount` equals the count of linked meal-item rows for the owner, and `lastUsedAt` is the newest linked meal-item timestamp under the documented semantics. Drift can be safely previewed and explicitly repaired for one authenticated user without broad or production mutation.

## Current behavior and inspected evidence

- `apps/api/src/routes/nutrition/index.ts` date-scoped `POST /:date/meals` calls `createMealForDate`, which already invokes `applyFoodUsageTrackingEffects`, then separately calls `trackFoodUsage` once per distinct linked food. This is the reported duplicate increment.
- `apps/api/src/routes/meals/index.ts` preferred `POST /api/v1/meals` delegates to the same `createMealForDate` and does not add that second tracking call.
- `apps/api/src/routes/nutrition/store.ts` currently applies usage effects after create and append transactions; meal deletion decrements after deleting rows; item patch compares old/new food links and applies decrement/increment after the transaction. These effects are not presently one atomic transaction with the row mutation and must be audited and corrected.
- `apps/api/src/routes/foods/store.ts` contains `trackFoodUsage`, `decrementFoodUsage`, merge logic, and the existing `reconcileFoodUsage` helper around the observed line 590. Reuse and strengthen that helper; do not create a parallel reconciliation algorithm.
- Existing `reconcileFoodUsage` scopes foods by `foods.userId` and active `deletedAt IS NULL`, counts `meal_items` by `foodId`, and derives `lastUsedAt` with `MAX(meal_items.createdAt)`. Verify whether joins need additional owner constraints and make the final invariant explicit.
- `apps/api/src/routes/trash/index.ts` restores foods by owner scope but currently does not itself recompute usage metadata. Food merge relinks loser meal items to winner and currently combines stored counters, which can preserve drift.
- Existing focused tests include `apps/api/src/routes/nutrition/store.food-usage.test.ts`, `apps/api/src/routes/nutrition/completeness-mutations.integration.test.ts`, `apps/api/src/routes/foods/store.test.ts`, and `apps/api/src/__tests__/food-usage-reconciliation.test.ts`. Treat them as evidence to inspect, not proof of complete acceptance.

## Fixed product and architecture decisions

- One linked `meal_items` row with a non-null saved-food link contributes exactly one usage count to exactly one owner food. Repeated calls, retries, and concurrent mutation attempts must not double-count.
- All create, append, edit, delete, merge, restore, and food-link correction paths must preserve the same projection invariant. Food-link correction includes saved food -> another saved food and saved food -> ad-hoc/null transitions.
- Usage mutation and the corresponding meal-item/food-link mutation must be transactional/atomic: a failed operation rolls back both the row mutation and usage projection. Do not leave best-effort post-transaction drift as the normal path.
- Preserve strict owner isolation on every read, write, join, merge, restore, and reconciliation. Use the existing JWT/AgentToken auth architecture correctly: ordinary meal routes support the documented auth schemes; the reconciliation command must be explicitly user-scoped and must not permit cross-user selection or unauthenticated execution. Do not weaken JWT claims validation or AgentToken prefix handling.
- Reuse `reconcileFoodUsage` from `apps/api/src/routes/foods/store.ts` as the single canonical reconciliation implementation. Refactor its API if needed for bounded dry-run/apply, but do not maintain a second counting algorithm.
- Reconciliation is bounded and explicit: default is dry-run with no writes; apply requires an explicit opt-in and a single authenticated user scope. Fail closed on missing/invalid scope, invalid mode, malformed limits/cursors, ownership mismatch, or partial/failed work.
- Apply is idempotent. A second apply against unchanged fictional fixtures reports no further changes and leaves values identical. Dry-run must prove/read the projected values without modifying foods, meal items, meals, timestamps, or unrelated users.
- Production reconciliation, backfill, database repair, deployment, and production DB access are not authorized by this contract. Use only isolated temporary/in-memory/test databases and fictional fixtures. Do not run the command against production or include a deployment step.
- Issue #138 ranked reuse, intentional stable-food promotion, matching, provenance/classification/metadata, summary hints, and its historical investigation are explicitly excluded.

## Time semantics and clarification gate

The current canonical helper observes `MAX(meal_items.createdAt)` for linked rows. Unless the repository contains a contradictory established contract, implement and document `lastUsedAt` as the newest surviving linked meal-item `createdAt` in milliseconds, not nutrition-log date, meal display time, request time, or food-update time; a null/unlinked item contributes nothing. Hard-deleted meal/meal-item rows cannot be reconstructed and therefore do not count. Active and soft-deleted food rows are repair targets within the explicitly selected user scope. Surviving linked items continue to count while a food is in Trash; trashing a food never erases historical meal entries.

**Explicit decision from Derek, 2026-09-07 (supersedes the original active-food-only fallback):** Keep `usageCount` and `lastUsedAt` accurate while a food is in Trash. Surviving linked meal items still contribute. Extend the existing canonical reconciliation helper to include soft-deleted foods for the selected owner; do not preserve its prior active-only filter. Restore exposes accurate metadata. Cover trash -> linked-item edits/deletes -> reconciliation -> restore, owner isolation, repeated apply, and dry-run with no writes. Trashing does not erase meal history. No production reconciliation, backfill, or deployment is authorized. Meals/items still have their existing hard-delete semantics; this decision adds no new meal/item soft delete behavior.

## Complete implementation surface

### Production behavior

- Remove the date-scoped duplicate tracking call without removing canonical tracking from the store path.
- Audit and fix preferred/date-scoped create, append, meal edit, meal delete, meal-item edit, saved-food unlink/relink correction, food merge, food restore, and any other actual linked-food usage writers discovered by repository search.
- Ensure duplicate links within one meal count per linked item, not per distinct food ID.
- Ensure concurrency and retries cannot create lost updates or double increments; use database transactions/atomic SQL and deterministic owner-scoped reads.
- Ensure merge relinking produces counts derived from final links, not addition of potentially stale counters; reconcile affected owner food(s) through the canonical helper within the same transactional design where feasible.
- Ensure restore does not manufacture usage and, when restoring a food that has surviving links, restores/recomputes exact metadata without touching foreign users.

### Reconciliation command/API

- Provide a bounded command or API operation with an explicit mode that defaults to dry-run and an explicit apply flag/mode for writes.
- Require one authenticated user scope; never accept an arbitrary broad all-users operation for ordinary invocation.
- Return enough deterministic preview/apply data to prove scope, examined rows, changed rows, projected counts/timestamps, and no-op/idempotent behavior without exposing secrets.
- Make failure atomic and fail closed. Test rollback on injected failure and confirm no partial target or foreign-user writes.
- Keep production execution separately gated/documented as not authorized here.

### Tests and fixtures

Use isolated fictional fixtures only. Cover at minimum:

1. date-scoped and preferred meal creation with one and repeated saved-food links;
2. append to an existing meal;
3. meal metadata edit (must not alter usage);
4. meal-item edit with unchanged food, saved -> saved, saved -> null, null -> saved, and invalid/foreign food;
5. meal deletion including repeated food links and owner isolation;
6. food merge with linked loser rows, stale counters, and rollback/ownership failures;
7. food trash/restore with surviving links and exact recomputation;
8. reconciliation dry-run default with byte-for-byte unchanged database state;
9. explicit apply, repeated apply, and injected failure rollback;
10. hostile fixtures: stale counters, wrong timestamps, duplicate item links, no links, deleted/restore states, foreign foods/meals, malformed scope/mode/limit, and concurrent/retry-shaped calls;
11. JWT session authentication and AgentToken behavior according to the intended endpoint contract; do not bypass auth in route tests;
12. exact invariant queries: `usageCount == COUNT(linked meal_items)` per owner food and `lastUsedAt == MAX(linked meal_items.createdAt)` or null when none.

### Evidence and repository hygiene

- Record literal exact SHA, branch, worktree, commands, outputs, and invariant readbacks outside tracked source or in an explicitly source-bound evidence artifact as appropriate. Never fabricate counts or test results.
- Do not commit secrets, production URLs, production DB paths, or real personal data.
- Finish with coherent Conventional Commits, a clean worktree, and evidence tied to the exact final commit.

## Invariants that must not regress

- Every food/meal/meal-item query and mutation is scoped to the authenticated owner.
- No foreign data is read, relinked, counted, updated, deleted, restored, or returned.
- Meal writes and usage projection cannot diverge on success or failure.
- Reconciliation is deterministic, bounded, idempotent, and dry-run by default.
- Ad-hoc items with null `foodId` do not affect saved-food usage.
- Existing nutrition completeness behavior and agent enrichment remain intact.
- No production deployment, production reconciliation/backfill, or canonical data mutation occurs.

## Acceptance matrix

1. Inspect actual implementation and all linked-food writers before edits; document the path inventory.
2. Primary route and store tests prove no duplicate date-scoped increment and exact preferred-route behavior.
3. Focused mutation tests cover create, append, edit, delete, merge, restore, and link correction, including repeated links.
4. Transaction tests prove rollback and no partial usage changes on failures.
5. Concurrency/retry-shaped tests prove exactly-once projection and no lost updates.
6. Auth tests prove JWT/AgentToken behavior, user scope, and fail-closed malformed/foreign requests.
7. Reconciliation tests prove default dry-run no writes, explicit apply, idempotent rerun, bounded scope, and rollback.
8. Hostile isolated fixtures prove deleted/restore/merge cases and zero foreign-user touches via before/after snapshots.
9. Run focused checks during iteration, then final full uncached `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` (or report an exact blocker).
10. Run relevant installed Chrome/API/DB readbacks only against isolated local fixtures; no production environment/database.
11. Perform one consolidated internal Luna-medium review with distinct assignments for data/contracts, auth/atomicity, and tests/evidence/hygiene; consolidate and fix every in-scope finding before final gates.
12. Inspect final diff, exact commit SHA, branch, clean status, and literal evidence. Push branch and open a DRAFT PR only; do not merge.

## Required Codex internal completion loop

1. Read all required context and inspect every actual linked-food writer.
2. Write a bounded plan and path inventory before editing.
3. Add/strengthen hostile tests alongside implementation.
4. Implement the complete contract as one coherent work block.
5. Run focused checks, then the full relevant matrix.
6. Run one consolidated Luna-medium adversarial review across data/invariants, auth/failure atomicity, and tests/evidence/hygiene.
7. Consolidate all concrete findings and fix every in-scope finding.
8. Rerun affected checks and the final full uncached matrix.
9. Inspect diff, status, exact head, and evidence.
10. Commit coherent changes and literal evidence; push and open a draft PR if authorized.

## Side-effect and approval boundaries

Do not deploy, merge, mutate production/canonical data, run production reconciliation/backfill, access production DB, contact anyone, accept terms, or spend money. Opening/pushing a DRAFT PR for this branch is authorized. Implementation after this docs-only preparation commit is authorized. Any material product ambiguity described in the clarification gate must be surfaced to the parent rather than silently resolved.

## Git contract

- Never edit the original `main` worktree.
- Keep unrelated main untracked artifacts untouched and out of this branch.
- The preparation commit is docs-only and explicitly authorizes implementation after launch.
- Use coherent Conventional Commits; do not merge.
- Finish executor work clean at the exact reported commit; draft PR only.

## Final report contract

Return `COMPLETE` or `BLOCKED`, exact branch and full SHA, commits, files, requirements-to-evidence mapping, Luna findings/dispositions, exact commands and literal results, isolated browser/API/DB readbacks, draft PR URL/number, remaining blockers, prohibited-action confirmation, and final `git status --porcelain`.
