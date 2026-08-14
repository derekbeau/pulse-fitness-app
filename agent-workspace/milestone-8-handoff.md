# Milestone 8 Handoff

> Historical checkpoint for the Milestone 8 commit. The state and counts below are not current; completion
> ownership and final-trend behavior are superseded by the final-QA repair evidence.

**State:** `MILESTONE 8 COMPLETE; MILESTONE 9 IN PROGRESS`
**Branch:** `feat/adaptive-tdee-v1`
**Environment:** tracked isolated `pnpm dev:gate0` only; production unchanged

## Delivered

- Pure server-owned goal progress and projection calculations for loss, gain, and maintenance.
- Strict shared schemas for progress, projections, mutations, current-goal state, and additive program state.
- JWT-only edit, start, cancel, and complete routes with optimistic revision checks and stable errors.
- Immutable `goal_change` recommendations for edits/new goals; nutrition targets remain unchanged until
  explicit acceptance.
- Explicit completion from an accepted goal-reached check-in to one maintenance goal/revision, with
  idempotent real-connection retry and no duplicate target.
- Goal-aware fingerprints, state integration, backtest compatibility, and 13 deterministic preview fixtures.

## Runtime findings repaired

1. The original fixture UUID namespace collided with an unrelated user in the isolated database copy.
   Fixtures now use a reserved namespace and cleanup is scoped to fixture usernames or that namespace.
2. Three fixture usernames exceeded the application's 30-character contract. Explicit short aliases keep
   every deterministic account usable through the real login route.

## Verification

- Shared: 412 tests passed.
- API: 684 tests passed, including 22 Adaptive store integration cases with real two-connection contention.
- Web: 989 regression tests passed; Milestone 8 contains no production UI implementation.
- Startup/isolation: 9 tests passed.
- Exact uncached lint, typecheck, test, and build commands passed with zero cached Turbo tasks.
- Built-in-browser signed-in Dashboard, Nutrition Log, and Coach smoke passed with no console warnings/errors.
- Isolated JWT walkthrough covered current/history/detail, edit, accept, start, cancel, blocked preview,
  completion, and retry. The preview DB was restored; `quick_check=ok`, 13 fixtures were present, the unrelated
  copied user remained present, and ports 3102/5274 were free.

## Milestone 9 boundary

Milestone 9 may add the persistent goal card, progress displays, edit/new flows, pending replacement UX,
query invalidation, RTL, installed-Chrome coverage, and required responsive checks. Detailed goal history,
revision timelines, and completion-to-maintenance UX remain Milestone 10 scope.
