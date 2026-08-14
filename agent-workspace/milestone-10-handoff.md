# Milestone 10 Handoff

> Historical checkpoint for the Milestone 10 commit. Historical progress semantics, completion ownership,
> and first-page-only history are superseded by the final-QA repair.

**State:** `MILESTONE 10 COMPLETE; MILESTONE 11 IN PROGRESS`
**Branch:** `feat/adaptive-tdee-v1`
**Environment:** tracked isolated `pnpm dev:gate0` only; production unchanged

## Delivered

- On-demand current/prior goal detail with canonical weekly seven-day-EWMA trend samples, separately
  identified scale entries, loss/gain distance semantics, and maintenance range history.
- Accessible Recharts trend presentation with semantic progress/range companions and a native-table text
  equivalent for every chart value and status.
- Immutable strategy revision audit, linked accepted check-ins, lifecycle labels, preferred-unit conversion,
  and responsive overflow containment.
- A separate reviewed completion-to-maintenance dialog that preserves the accepted nutrition target and all
  Adaptive TDEE, weight, nutrition, goal, and check-in history.
- Stale-source recovery, stable idempotent retry after a lost response, focus restoration, deterministic
  fixtures, RTL, and installed-Chrome acceptance.

## Runtime findings repaired

1. Eager goal-detail loading was aborted when a new direction changed the active goal. Detail is now fetched
   only on demand.
2. Completion invalidation refetched the obsolete goal detail and produced an aborted request. Completion now
   uses the canonical goal revision already present in Coach state and performs no redundant detail request.
3. Controlled Radix dialogs raced manual focus restoration. Both detail and completion dialogs now use
   `onCloseAutoFocus` with the invoking trigger reference.
4. Browser acceptance exposed strict-locator ambiguity and expected synthetic 409/503 diagnostic noise; the
   locators are exact and the monitor permits only those explicitly asserted synthetic responses.
5. In-app visual QA found revision 1 saying “Started at” the target weight. It now says “Targeted,” preserving
   the distinction from the canonical starting trend shown above it.

## Verification

- Focused adaptive Coach RTL: 25/25; focused shared/API/seeder coverage also passed during implementation.
- Installed Chrome: 11/11 strict serial journeys; exact 320/375/390/430/768/1280 width matrix.
- Full uncached tests: startup/isolation 9, shared 412, API 684, web 1004.
- Uncached lint, typecheck, and build: 3/3 each, zero cached Turbo tasks; four pre-existing lint warnings.
- Built-in browser: current/prior history, revision 1/2, chart/table equivalents, maintenance range, completion
  evidence, focus restoration, and maintenance transition passed. Gate0 logs show the completion POST and
  every observed product request returned 200. Exact multi-width evidence remains the installed-Chrome run
  because the in-app viewport remains fixed at 1280.
- Isolated database restored: `quick_check=ok`, no FK violations, 13 preview users, 13 active goals, and 3
  pending check-ins.

## Milestone 11 boundary

Milestone 11 may rehearse migration on a fresh isolated production clone, run complete original-plus-goal
acceptance and backtest compatibility, finish docs/OpenAPI/agent guidance/release evidence, synchronize the
draft PR, and verify remote CI. Production access, deployment, merge, and PR-ready promotion remain out of
scope.
