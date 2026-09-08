# Issue #138 independent-review repair

Starting executor worktree: `/Users/meridian/Projects/pulse-food-reuse`, branch `feat/ranked-food-reuse`, HEAD `f9154993989c8aa3b1db59a3bbcf802d52975d7c`, clean. Literal preflight is retained in `preflight.txt`.

The authoritative frozen contract is unchanged. The latest parent instruction grants the exclusive full/browser slot and authorizes updating draft PR #160; merge/deploy remain prohibited. Launcher model/Fast UI is not an executor gate.

## Repair

- IR-1: removed ranked-match numeric score from saved, frequent, and nested promotion responses, shared schemas/types, fixtures, and active docs. Categorical evidence, ambiguity, deterministic order and advisory-only decisions remain. Separate shorthand scoring is unchanged. Raw response and generated OpenAPI exact-key assertions prevent numeric ranking fields from returning.
- IR-2: Drizzle passes `{ behavior: 'immediate' }` to better-sqlite3's native `BEGIN IMMEDIATE`. Both meal-create surfaces share `createMealForDate`; append uses `addItemsToMeal`. Both acquire the writer before the final owner-local recheck, create food/current meal/items and update usage within one transaction. Four attempts use 25/50/100ms backoff (175ms total); per-attempt busy_timeout=0 is restored synchronously before yielding. Only SQLite BUSY/LOCKED driver codes (including wrapped causes) retry the entire write unit. Created outcomes publish only after commit.
- No migration/unique index, alias-model redesign, automatic promotion, history relink/backfill, or #154 edit. Frozen #143 usage and #133 note tests remain unchanged.

## Evidence status

See JSON command receipts and corresponding raw logs. Every full-gate command uses Turbo's supported `--force` flag, whose help states it ignores existing cache. Direct Vitest checks do not invoke Turbo. No global timeout, concurrency, quarantine, test-retry, or assertion weakening.

Final verified source commit: `e25b4c6c0c92151eca01b583ef409c613c25e41f`. Evidence-only commits after it do not change the 14 source/test/doc hashes in `source-hashes.json`; exact paths are in `changed-files.txt`.

| Final command            | Result                                                             | Raw receipt           |
| ------------------------ | ------------------------------------------------------------------ | --------------------- |
| `pnpm lint --force`      | PASS, 13.89s; 0 cache hits, six existing web Fast Refresh warnings | `final-lint.log`      |
| `pnpm typecheck --force` | PASS, 10.88s; 0 cache hits                                         | `final-typecheck.log` |
| `pnpm test --force`      | **FAIL**, 79.89s; 0 cache hits                                     | `final-test.log`      |
| `pnpm build --force`     | PASS, 12.21s; 0 cache hits, existing large-chunk warning           | `final-build.log`     |

Final default-test blockers:

- `apps/api/src/routes/nutrition/store.food-usage.test.ts:345`: existing merge/rollback case timed out at 15 seconds (reported duration 19,406ms).
- `apps/api/src/routes/nutrition/food-reuse-process.integration.test.ts:67`: new independent worker did not report startup within its explicit five-second IPC deadline under full-suite load; seven cases did not execute because setup failed. This is not counted as a full-run concurrency pass.
- Default API summary: 87 files passed, 2 failed; 1,186 tests passed, 1 failed, 7 not executed after setup failure. Turbo stopped the web task after API failure; no default web pass is claimed.

One explicitly authorized uncached serialized diagnostic ran exactly `pnpm test:repo-scripts && pnpm exec turbo run test --concurrency=1 --force`. **PASS:** 47 shared files / 683 tests, 89 API files / 1,194 tests, 188 web files / 1,348 tests; 3,225 workspace tests total, plus repository-script tests. Zero cache hits. The process proof and usage-merge case pass in this run. This supports resource contention as the diagnosis, but does **not** replace the required default `pnpm test` pass. See `serial-diagnostic.log` and `.json`.

Focused final checks: **11 API files / 144 tests**, **3 shared files / 68 tests**, and standalone real two-process proof **7 tests** (included in the API matrix; not additional coverage). Commands, durations and exit codes are in `focused-api-final.json`, `focused-shared.json`, and `process-final.json`. Earlier failed lint/OpenAPI/mock runs remain intact with diagnosis in `review.md`.

**Browser/API/SQLite browser receipt: NOT RUN.** The repair prompt requires stopping/reporting a red final gate. No browser tab or browser fixture server was started. `browser-fixture.mts` and `browser-readback.mts` are prepared, unexecuted fixture tooling, not evidence of a pass. The direct process/integration tests did use disposable SQLite files and removed them on teardown.

**Disposition: acceptance remains blocked.** Source IR-1/IR-2 repairs and internal-review findings are addressed, but a default full-suite pass and the frozen browser receipt are still missing. Awaiting parent/independent-review direction; no further retries, timeout/concurrency edits, merge, deployment, environment or production/history mutation. The exclusive verification run has finished.

The two-process proof uses two spawned Node processes, two real API instances and separate SQLite connections to one disposable file, with IPC after request staging. A third fixture connection deterministically holds the writer until both report actual SQLITE_BUSY. It checks all three mutation surfaces, created/reused outcomes, one definition, linked items, replay, owner isolation, correct counts/recency, four-attempt exhaustion, duplicates present initially and arriving after staging, non-lock no-retry and full usage-failure rollback. Teardown closes children/connections and removes the fixture.

Internal review: explicit Luna medium consolidated pass plus bounded follow-up; disposition in `review.md`. No runtime Fast toggle was available or claimed.
