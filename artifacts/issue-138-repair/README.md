# Issue #138 independent-review repair

Starting executor worktree: `/Users/meridian/Projects/pulse-food-reuse`, branch `feat/ranked-food-reuse`, HEAD `f9154993989c8aa3b1db59a3bbcf802d52975d7c`, clean. Literal preflight is retained in `preflight.txt`.

The authoritative frozen contract is unchanged. The latest parent instruction grants the exclusive full/browser slot and authorizes updating draft PR #160; merge/deploy remain prohibited. Launcher model/Fast UI is not an executor gate.

## Repair

- IR-1: removed ranked-match numeric score from saved, frequent, and nested promotion responses, shared schemas/types, fixtures, and active docs. Categorical evidence, ambiguity, deterministic order and advisory-only decisions remain. Separate shorthand scoring is unchanged. Raw response and generated OpenAPI exact-key assertions prevent numeric ranking fields from returning.
- IR-2: Drizzle passes `{ behavior: 'immediate' }` to better-sqlite3's native `BEGIN IMMEDIATE`. Both meal-create surfaces share `createMealForDate`; append uses `addItemsToMeal`. Both acquire the writer before the final owner-local recheck, create food/current meal/items and update usage within one transaction. Four attempts use 25/50/100ms backoff (175ms total); per-attempt busy_timeout=0 is restored synchronously before yielding. Only SQLite BUSY/LOCKED driver codes (including wrapped causes) retry the entire write unit. Created outcomes publish only after commit.
- No migration/unique index, alias-model redesign, automatic promotion, history relink/backfill, or #154 edit. Frozen #143 usage and #133 note tests remain unchanged.

## Evidence status

See JSON command receipts and corresponding raw logs. Every full-gate command uses Turbo's supported `--force` flag, whose help states it ignores existing cache. Direct Vitest checks do not invoke Turbo. No global timeout, concurrency, quarantine, test-retry, or assertion weakening.

The original full run and first lint run were red and are retained, with diagnosis and repair in `review.md`. The final uncached gates and isolated browser receipt are pending at this source checkpoint. This is not acceptance or approval to merge.

The two-process proof uses two spawned Node processes, two real API instances and separate SQLite connections to one disposable file, with IPC after request staging. A third fixture connection deterministically holds the writer until both report actual SQLITE_BUSY. It checks all three mutation surfaces, created/reused outcomes, one definition, linked items, replay, owner isolation, correct counts/recency, four-attempt exhaustion, duplicates present initially and arriving after staging, non-lock no-retry and full usage-failure rollback. Teardown closes children/connections and removes the fixture.

Internal review: explicit Luna medium consolidated pass plus bounded follow-up; disposition in `review.md`. No runtime Fast toggle was available or claimed.
