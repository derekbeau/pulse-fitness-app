# Adaptive TDEE v1 Verification Report

**Status:** MILESTONES 7–11 AUTHORIZED AS ONE CODEX GOAL<br>
**Branch:** `feat/adaptive-tdee-v1`<br>
**Reviewer:** Vector specification extension and single-goal handoff preparation complete<br>
**Last verified state:** Gate 6 remains approved; Milestones 7–11 are authorized but unimplemented

This report must contain observed results, not intended commands or agent self-reports.

## Baseline

| Check      | Command                                                                  | Result                                                                                                     | State/date                |
| ---------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------- |
| Formatting | Pre-commit `prettier --write` on Gate 0 repair files; `git diff --check` | Pass; all changed files were normalized by the commit hook                                                 | Gate 0 repair, 2026-08-12 |
| Lint       | `TURBO_FORCE=true pnpm lint`                                             | Pass, exit 0; 3/3 tasks, 0 cached; 0 errors and 4 pre-existing Fast Refresh warnings; 13.13 s              | Gate 0 repair, 2026-08-12 |
| Typecheck  | `TURBO_FORCE=true pnpm typecheck`                                        | Pass, exit 0; 3/3 tasks, 0 cached; 12.11 s                                                                 | Gate 0 repair, 2026-08-12 |
| Tests      | `TURBO_FORCE=true pnpm test`                                             | Pass, exit 0; 3 isolation tests plus 6/6 Turbo tasks, 0 cached; 243 files and 1,863 package tests; 77.88 s | Gate 0 repair, 2026-08-12 |
| Build      | `TURBO_FORCE=true pnpm build`                                            | Pass, exit 0; 3/3 tasks, 0 cached; Vite transformed 3,830 modules; 13.51 s                                 | Gate 0 repair, 2026-08-12 |

Package test totals: shared 30 files/331 tests, API 51 files/586 tests, web 162 files/946 tests. The tracked Gate 0 startup guard adds 3 passing Node tests.

## Milestone verification

For each milestone, record targeted test results, Codex self-review findings and resolutions, built-in-browser scenarios, console/network inspection, commit SHA, and one verdict: `AWAITING VECTOR GATE N REVIEW`, `VECTOR GATE N APPROVED`, or `VECTOR GATE N CHANGES REQUIRED`.

### Milestone 0: baseline and development isolation

Verdict: `VECTOR GATE 0 APPROVED`

#### Dependency and database isolation

- `pnpm install --frozen-lockfile --offline` passed in 802 ms; the lockfile and dependency graph were unchanged.
- Read-only copied seed: `apps/api/data/pulse-prod-snapshot-20260812.db` (`0400`).
- Writable development database: `apps/api/data/pulse-tdee-dev.db` (`0600`).
- Before development writes, both files had SHA-256 `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`.
- After browser QA, the seed hash was still `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`; the active copy changed as expected to `3adf3caef86a5462830339bcaf6df3df3ca4bdd834a000fb32a0036d3f0bdd4c`.
- SQLite `PRAGMA quick_check` returned `ok` for both files. The existing migration journal contains 42 migrations.
- The isolated API process on port 3102 had only `pulse-tdee-dev.db`, its WAL, and its SHM open. It did not open the seed or `/data/pulse.db`.
- `pnpm dev:gate0` is the tracked, repeatable startup path. It enforces API 3102, web 5274, proxy 3102, and the exact writable `apps/api/data/pulse-tdee-dev.db` path. Focused tests prove it rejects the default database, `/data/pulse.db`, the read-only snapshot, production-named paths, arbitrary paths, missing/read-only files, and symlinks.
- The isolated test user `tdee-gate0` was registered through the real UI. A browser-created `Milestone 0 isolated write` weight row was confirmed for that user in the active database only. Credentials remain ignored and are not recorded here.
- The copied baseline has 37 pre-existing foreign-key violations: 34 `session_sets -> exercises` and 3 `template_exercises -> exercises`. Repair is outside Milestone 0 and tracked in GitHub issue #101.

#### Built-in-browser smoke test

The app ran on isolated ports (web 5274, API 3102). Web, direct API health, and proxied API health each returned HTTP 200.

Clean rerun scenarios:

| Route/view               | Observed result                      | Console/request diagnostics |
| ------------------------ | ------------------------------------ | --------------------------- |
| Dashboard `/`            | Dashboard and populated weight trend | None                        |
| Workouts `/workouts`     | Calendar view and Workouts heading   | None                        |
| Nutrition log            | Nutrition log empty state            | None                        |
| Nutrition foods          | Saved-foods empty state              | None                        |
| Nutrition trends         | Macro trends empty state             | None                        |
| Weight `/weight/history` | Local-date form and persisted entry  | None                        |
| Habits `/habits`         | Five isolated starter habits         | None                        |
| Activity `/activity`     | Activity list                        | None                        |
| Journal `/journal`       | Journal list                         | None                        |
| Profile `/profile`       | Isolated test-user profile           | None                        |
| Settings `/settings`     | Settings sections                    | None                        |

Developer-console inspection returned zero warnings/errors on the clean rerun. Vector independently repeated Dashboard -> Nutrition -> Dashboard after the repair and captured `{"console":[],"failed":[]}`. Navigation, authentication, the weight POST, and the subsequent read all completed; there were no console failed-resource/request messages. The local API and web health checks remained HTTP 200.

#### Findings resolved during self-review

1. Weight entry defaults, weight-range filtering/cache logic, and settings target effective dates used the UTC calendar date. At 21:09 America/Detroit on August 12, the UI showed August 13. These paths now use the local date key, with a UTC-boundary component regression test.
2. Weight history, dashboard weight trend, and nutrition trend charts initialized at `-1 x -1`, producing Recharts warnings. Explicit mobile-first initial dimensions eliminate the warnings while the resize observer takes over.
3. Focused final checks passed: 25/25 tests across weight history, settings, and dashboard weight trend; nutrition page 16/16. The full suite then passed without the Recharts stderr warnings.
4. A pre-existing Exercise Library debounce assertion timed out once under heavy full-suite load. The test now waits for the filtered API request and resulting UI state with the file's established four-second async bound.

#### Codex self-review

- Compared the final diff to the Milestone 0 checklist and specification boundary.
- Confirmed no Adaptive TDEE schema, migration, algorithm, API, or Coach UI work from Milestone 1 or later was started.
- Confirmed ignored `.env` credentials/database files are not in the tracked diff.
- Confirmed production Docker services, volume, database, deployment, and user records were not changed.
- No unresolved Codex-found blocking issues remain.

### Milestone 1: canonical weight foundation

Verdict: `VECTOR GATE 1 APPROVED`

#### Migration preflight and storage invariants

- Migration 0041 adds required `weight_kg` and `unit_at_entry` columns and rebuilds the compatibility `weight` column as pounds. A database constraint enforces `abs(weight - weight_kg / 0.45359237) < 0.000001`; canonical weight is constrained to 25-350 kg and provenance to `lbs | kg`.
- Startup inventories legacy rows before Drizzle runs. Non-empty legacy databases require a reviewed JSON map with an exact assignment for every affected user. Missing, partial, extra-user, invalid-unit, out-of-range, and partially canonicalized states fail before the migration mutates the table.
- The SQL migration has an independent temporary-table guard, so running it without a populated preflight map aborts rather than dropping or ambiguously copying rows.
- The tracked `pnpm dev:gate0 --review-weight-migration=lbs` workflow created the ignored mode-0600 map only after inventory validation. Observed aggregate: 2 affected users, 20 legacy rows, all explicitly mapped to pounds; both current preferences happened to be pounds but were not used as migration evidence. Map SHA-256: `0e6bc85344e6843815f4f0a190eeb6f986ed0d9b20ff7ebbce899282dfbd9d12`.
- Post-migration isolated database: `PRAGMA quick_check = ok`; 22 rows across 2 users after browser QA; 0 null canonical weights; 0 invalid provenance values; maximum compatibility delta `0.0`; 21 pounds-origin and 1 kilogram-origin row; migration journal count 43.
- The read-only copied seed remained unchanged at SHA-256 `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`. Production containers, volume, database, and users were not touched.

#### Reader and response-boundary audit

- Active application readers use `weightKg`: weight store/routes, dashboard snapshot and trend/EWMA, agent context, referential habit resolver, and static import. A source audit found no active application read of the compatibility column; remaining direct `body_weight.weight` references are migration inventory and compatibility assertions.
- Weight requests accept explicit `lbs` or `kg`; omitted units resolve to the current user preference. Every write stores canonical kilograms, pounds compatibility, and the write unit. Responses carry an explicit current display unit and convert only at the boundary.
- Preference changes do not rewrite history. Display-sensitive weight/dashboard caches are removed, and the unit-dependent weight-trend response revalidates instead of serving an hour-old representation.
- The repository has no weight export endpoint or export surface; no new API was invented. Shared API schemas, OpenAPI generation inputs, agent context, and the documented weight contract now expose the unit explicitly.

#### Automated coverage

- Targeted Milestone 1 suite passed: API 129/129, shared 39/39, web 70/70, and Gate 0 launcher 3/3 (241 total). Coverage includes old pounds, old kilograms, mixed users, current-preference mismatch, missing/partial/extra ambiguous maps, SQL-without-preflight abort, empty legacy, already-canonical, and fresh complete migration-chain cases.
- Store/route coverage exercises pounds writes, kilograms writes, omitted-unit preference behavior, cross-unit patches, exact compatibility pounds, canonical range rejection, response conversion, and user scoping.
- Reader regression coverage includes dashboard storage/routes, server-side kg EWMA, agent context, referential habits, static import, schemas, middleware enrichment, web weight history, dashboard snapshot, compact/detailed trends, and preference cache invalidation.

Final uncached gates, all exit 0:

| Command                           | Observed result                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `TURBO_FORCE=true pnpm lint`      | 3/3 tasks, 0 cached, 0 errors; 4 pre-existing Fast Refresh warnings                                                  |
| `TURBO_FORCE=true pnpm typecheck` | 3/3 tasks, 0 cached                                                                                                  |
| `TURBO_FORCE=true pnpm test`      | Gate 0 isolation 3/3; 6/6 Turbo tasks, 0 cached; shared 334, API 598, web 947 package tests (1,879 across 245 files) |
| `TURBO_FORCE=true pnpm build`     | 3/3 tasks, 0 cached; API/shared TypeScript and Vite production build passed                                          |
| `git diff --check`                | Pass                                                                                                                 |

#### Built-in-browser acceptance

Only the tracked `pnpm dev:gate0` isolated environment was used (web 5274, API 3102, writable ignored database). Observed scenarios:

| Surface/flow                     | Observed result                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard in pounds              | Migrated history and a new 179.8 lb write rendered correctly                                                                                                              |
| Settings lbs -> kg               | Current preference persisted; returning dashboard data refreshed rather than relabeling cached pounds                                                                     |
| Dashboard in kilograms           | Snapshot 81.6 kg, logged card 81.8 kg, compact trend 81.6 kg, and detailed trend 81.6 kg agreed                                                                           |
| Weight history                   | Existing pound-origin rows converted to kg; a new 81.7 kg entry persisted and rendered                                                                                    |
| Cross-unit database verification | Pound write: 81.55590813 kg canonical / 179.8 lb compatibility / `lbs`; kg write: 81.7 kg canonical / 180.11766821 lb compatibility / `kg`; both had conversion delta 0.0 |
| Habits                           | Primary and history views loaded normally after canonical resolver migration                                                                                              |

Browser QA found three presentation/cache defects and fixed them before the final rerun: a hard-coded pound label on the dashboard log card, a compact trend fallback that could relabel stale values, and HTTP/browser caching that preserved the old unit after a preference change. In-app developer logs contained zero error entries. The API request log for the clean affected-surface run contained only successful 200/201 responses and no failed requests.

#### Codex self-review

- Reviewed the entire tracked diff against the specification and every Milestone 1 implementation-plan checkbox.
- Removed a temporary test type-suppression and converted route fixtures to the canonical store contract.
- Confirmed migration map, isolated databases, credentials, generated build output, and production data are ignored and absent from the diff.
- Confirmed no Milestone 2 nutrition-completeness/provenance schema, API, or UI work was introduced.
- `git diff --check` passed; no unresolved Codex-found blocking issue remains.

#### Vector independent Gate 1 review

Independent reruns at the original Gate 1 commit passed 167 targeted tests and the then-current uncached lint, typecheck, full-test, and build pipeline. Vector also verified pounds-origin and kilograms-origin rows through the live isolated app, canonical/compatibility storage invariants, preference-change rendering, clean in-app console/request diagnostics, and an unchanged production snapshot hash.

Vector nevertheless rejected that commit for the eight blockers recorded in `vector-gate-1-review.md`. The following section records their repair and re-review evidence.

#### Gate 1 repair and re-review evidence

All eight blockers in `vector-gate-1-review.md` were repaired and verified on 2026-08-13:

1. Production startup now uses a read-only host secret mount plus an image entrypoint that distinguishes fresh/empty/canonical databases from non-empty legacy databases and fails closed unless a secure reviewed map is available.
2. AgentToken weight enrichment includes the response unit in natural-language hints and `relatedState` for pounds and kilograms.
3. Map writes use mode-0600 temporary creation, atomic replacement, and final chmod, including overwrite of permissive files.
4. Already-canonical preflight validates null rows, required column invariants, named checks, user/date uniqueness, and cascading user foreign key.
5. Agent weight writes reuse `createWeightInputSchema`, including converted 25-350 kg bounds, and the agent documentation carries output units.
6. History add/edit controls visibly identify pounds/kilograms and use unit-specific placeholders.
7. History and detailed trends derive units from response entries and reject mixed-unit responses rather than silently relabeling values.
8. Weight hooks parse shared runtime schemas for latest/list/paginated/create/patch/delete responses.

Focused checks passed: startup/container 6/6, migration/enrichment 18/18, agent schemas 10/10, weight boundary hooks 15/15, history/trend 16/16. Real container preflight rejected a non-empty legacy database without a map (exit 1) and accepted it with a regular mode-0600 reviewed map.

Final browser QA saved the kilogram edit, persisted the real Settings kg-to-pounds switch, verified converted history/dashboard/detailed-trend values, and inspected pounds and kilograms labels/placeholders. The final pounds dashboard showed logged `182.6 lbs`, compact trend `180.4 lbs`, and detailed trend values consistently in pounds. Diagnostics recorded zero console warnings/errors, zero window errors/unhandled rejections, and zero non-abort failed resources.

The API process opened only `pulse-tdee-dev.db` plus WAL/SHM. SQLite `quick_check` returned `ok`; 25 rows had 0 invalid canonical rows, max compatibility delta `0.000000000000`, 23 pounds-origin and 2 kilogram-origin rows. Production snapshot SHA-256 remained `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`. The dev process was stopped through the process tool and ports 3102/5274 were free.

Final exact uncached pipeline, all exit 0:

| Command                           | Observed result                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `TURBO_FORCE=true pnpm lint`      | 3/3, 0 cached, zero errors; four pre-existing Fast Refresh warnings                                             |
| `TURBO_FORCE=true pnpm typecheck` | 3/3, 0 cached                                                                                                   |
| `TURBO_FORCE=true pnpm test`      | Startup isolation 6/6; Turbo 6/6, 0 cached; shared 342, API 602, web 955 (1,899 package tests across 245 files) |
| `TURBO_FORCE=true pnpm build`     | 3/3, 0 cached; Vite transformed 3,830 modules                                                                   |

Complete diff self-review found no Milestone 2, deploy, merge, or PR-ready scope. Current state is `AWAITING VECTOR GATE 1 RE-REVIEW`; approval is intentionally withheld.

#### Remaining finding-4 one-bug repair

Vector's independent re-review reproduced an already-canonical false positive by replacing all five correctly named checks with `CHECK (1)`. The preflight now clones the exact live `sqlite_master` table definition into an isolated in-memory SQLite database and verifies behavior without writing production data. Valid migration-0041 boundary rows at 25 kg and 350 kg must insert, while malformed dates, non-positive compatibility pounds, values immediately outside 25–350 kg, invalid provenance, and pounds compatibility outside the `< 0.000001` tolerance must fail with `SQLITE_CONSTRAINT_CHECK`.

Regression coverage rejects the correctly named no-op schema. It also verifies the real migration-0041 result remains `already-canonical` after populated legacy migration; the existing empty-legacy and complete fresh-chain tests continue to pass.

Targeted repair checks, all exit 0:

| Command                                                                                                   | Observed result |
| --------------------------------------------------------------------------------------------------------- | --------------- |
| `pnpm --filter @pulse/api exec vitest run src/db/canonical-weight-migration.test.ts src/db/index.test.ts` | 16/16 passed    |
| `pnpm test:gate0-isolation`                                                                               | 6/6 passed      |

Exact uncached repair pipeline, all exit 0:

| Command                           | Observed result                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `TURBO_FORCE=true pnpm lint`      | 3/3, 0 cached, zero errors; four pre-existing Fast Refresh warnings                                             |
| `TURBO_FORCE=true pnpm typecheck` | 3/3, 0 cached                                                                                                   |
| `TURBO_FORCE=true pnpm test`      | Startup isolation 6/6; Turbo 6/6, 0 cached; shared 342, API 603, web 955 (1,900 package tests across 245 files) |
| `TURBO_FORCE=true pnpm build`     | 3/3, 0 cached; Vite transformed 3,830 modules                                                                   |

No UI code changed, so browser QA was not repeated. No Milestone 2, deployment, merge, or PR-ready work was performed. Current state is `AWAITING VECTOR GATE 1 RE-REVIEW`; approval remains intentionally withheld.

#### Final three-class Gate 1 follow-up

The final independent follow-up confirmed three remaining classes, all repaired on 2026-08-13:

1. Git and Docker now root-ignore `/runtime-secrets/`. A behavioral Node regression creates the exact `runtime-secrets/body-weight-legacy-unit-map.json` fixture in disposable contexts, proves `git check-ignore` matches it, exports a real BuildKit `COPY .` context, and proves the map/directory are absent while a control fixture is present. No map or secret is tracked.
2. Canonical preflight reads the SQLite `PRAGMA index_list.partial` field and accepts only a non-partial unique `(user_id,date)` index. Existing canonical dates are additionally validated with shared `dateSchema` semantics, rejecting impossible dates and non-ISO formats that can survive or bypass the schema's shape check. Adversarial regressions cover `WHERE 0`, `2026-02-30`, and `2026/02/28`; real migration 0041 and the complete fresh migration chain continue to pass.
3. Paginated weight hooks now treat `apiRequestWithMeta` data and metadata as unknown, parse entries as before (including mixed-unit rejection), and parse metadata with shared `apiMetaSchema`. Regressions reject page zero and negative totals.

Focused and runtime checks, all exit 0:

| Command/check                                                                     | Observed result                                                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm test:gate0-isolation`                                                       | 7/7 passed, including real Git-ignore and Docker BuildKit context export                          |
| API migration/database/enrichment Vitest                                          | 25/25 passed; migration 0041 index reported `partial: 0`, adversarial partial/date cases rejected |
| Web weight boundary/history Vitest                                                | 26/26 passed; malformed metadata and existing mixed-unit behavior covered                         |
| `docker build --target api -t pulse-gate1-final:local .`                          | Pass; image `sha256:c6e6b4a2031770ea7b6498def6228d6905a98ce223263238200f041bf6eb0c69`             |
| Real image legacy preflight                                                       | Without map exit 1; with read-only mode-0600 map exit 0                                           |
| Real image fresh startup                                                          | `/health` returned `{"status":"ok"}`                                                              |
| `git check-ignore -v --no-index runtime-secrets/body-weight-legacy-unit-map.json` | Matched `.gitignore:19:/runtime-secrets/`; `git ls-files runtime-secrets` was empty               |

Exact uncached pipeline, all exit 0 on the final tree:

| Command                           | Observed result                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `TURBO_FORCE=true pnpm lint`      | 3/3, 0 cached, zero errors; four pre-existing Fast Refresh warnings                                            |
| `TURBO_FORCE=true pnpm typecheck` | 3/3, 0 cached                                                                                                  |
| `TURBO_FORCE=true pnpm test`      | Startup/security 7/7; Turbo 6/6, 0 cached; shared 342, API 606, web 957 (1,905 package tests across 245 files) |
| `TURBO_FORCE=true pnpm build`     | 3/3, 0 cached; Vite transformed 3,830 modules                                                                  |

The first exact run exposed the root monorepo-script assertion that records the startup test list; it was updated to include the new behavioral isolation test, and the complete exact command was rerun from lint through build successfully. `git diff --check` passed. Self-review found no secret fixture, Milestone 2, deployment, merge, or PR-ready scope. No browser QA was run because no UI changed.

### Nutrition completeness and target provenance

Implemented and self-reviewed on 2026-08-13:

- Added explicit nutrition-log `unknown | partial | complete` status, legacy migration to `unknown`, audit timestamps, and authenticated status mutation. Complete status rejects future dates in the user's program timezone and missing nutrition logs.
- Added a shared transactional downgrade primitive and applied it to meal create/edit/delete, item append/edit/delete, food merge, permanent food purge, and static reimport. Real SQLite tests prove complete-to-partial downgrades and rollback atomicity.
- Added manual/adaptive nutrition-target provenance, server-derived macro calories, restricted check-in linkage, and immutable target snapshots. Public target writes always persist manual provenance; the internal adaptive writer requires an owned check-in, exact snapshot matching, and explicit same-date replacement.
- Added only the adaptive program/check-in tables needed by Milestone 2's foreign key and snapshot contract. No adaptive calculation, preview, acceptance, or other Milestone 3/4 behavior is present.
- Old/fresh migration coverage verifies legacy defaults, constraints, foreign keys, restricted target deletion, immutable check-ins, and the complete migration chain.
- Web response boundaries parse the new nutrition and target fields. Status, meal, target, dashboard, trend, and future adaptive query invalidation paths are regression-covered.

Targeted verification, all exit 0:

| Command/check                                     | Observed result                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @pulse/api test -- --run`          | 56 files, 623 tests passed                                                                                                                           |
| Migration/schema/store/route integration coverage | Old/fresh databases, defaults, constraints, restricted linkage, snapshots, downgrade cases, rollback, status validation, and provenance cases passed |
| Shared and web targeted regressions               | Runtime schemas, target/status hooks, cache invalidation, Nutrition, and Settings regressions passed                                                 |

Built-in-browser QA used only `pnpm dev:gate0` on isolated ports 3102/5274 and `apps/api/data/pulse-tdee-dev.db`. Settings saved and refetched a manual 2,175-calorie target with macros. Nutrition displayed the isolated test meal; after marking the day complete, editing the meal through the UI changed its persisted status to partial. A future-day completion attempt returned the expected HTTP 400 `FUTURE_NUTRITION_DATE`. Browser diagnostics contained zero console warnings/errors and no unexpected failed requests; the only non-2xx request was that intentional validation probe. The ephemeral QA agent token was deleted and the development process was stopped.

The first full runs exposed one unused import and stale Settings response fixtures; both were repaired and covered before the final exact rerun. Final exact uncached pipeline, all exit 0:

| Command                           | Observed result                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `TURBO_FORCE=true pnpm lint`      | 3/3, 0 cached, zero errors; four pre-existing Fast Refresh warnings                                            |
| `TURBO_FORCE=true pnpm typecheck` | 3/3, 0 cached                                                                                                  |
| `TURBO_FORCE=true pnpm test`      | Startup/security 7/7; Turbo 6/6, 0 cached; shared 350, API 623, web 959 (1,932 package tests across 249 files) |
| `TURBO_FORCE=true pnpm build`     | 3/3, 0 cached; Vite transformed 3,830 modules                                                                  |

Complete diff self-review found no Milestone 3 algorithm, deployment, merge, or PR-ready scope. `git diff --check` passed. Verdict: `AWAITING VECTOR GATE 2 REVIEW`.

#### Gate 2 integrity repair

The confirmed review failures were reproduced and repaired. Migration 0042 now blocks every check-in delete unless a user-specific account-deletion scope row exists inside the same transaction. Account deletion explicitly removes targets, check-ins, programs, then user; a forced late FK failure proves full rollback, and a second user's rows remain untouched. A composite program/user foreign key rejects cross-user check-in ownership at the database layer.

The adaptive target writer now joins through the owned program, requires a pending non-holding check-in, parses the persisted proposal through `createNutritionTargetInputSchema`, rejects missing/null/malformed/extra proposal data, and requires exact calories, macros, and effective date equality.

Observed focused checks: API migration/auth/nutrition/target 116/116; shared schemas 49/49; web nutrition/settings/invalidation 63/63. Exact final gates all exited 0: `git diff --check`; lint 3/3 uncached with only four pre-existing warnings; typecheck 3/3 uncached; tests startup/security 7/7 plus shared 350, API 635, web 959 (1,944 package tests across 249 files), Turbo 6/6 uncached; build 3/3 uncached with 3,830 Vite modules transformed.

No UI changed, so the repair writer did not repeat browser QA. No Milestone 3+ behavior or production change was introduced. Writer verdict: `AWAITING VECTOR GATE 2 RE-REVIEW`.

#### Vector independent Gate 2 re-review

Vector did not accept the repair agent's report at face value. The repair agent had stopped before commit/push because `git diff --cached --check` found two trailing-space defects; Vector corrected those defects, inspected every staged repair file, and independently repeated the gate.

- Focused/full package reruns passed: API 635/635, shared 350/350, and web 959/959.
- A freshly migrated disposable SQLite database rejected direct check-in deletion and cross-user program linkage, retained the audit row, returned `quick_check = ok`, and had zero foreign-key violations.
- The isolated app ran on API 3102 and web 5274. Nutrition and Settings rendered normally, health returned HTTP 200, no failed API resources appeared, and `lsof` showed only `pulse-tdee-dev.db` plus WAL/SHM open by the API. The preview was stopped and both ports were free.
- The copied production snapshot hash remained `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`; production was not accessed or changed. The 37 known copied-baseline foreign-key violations remain separately tracked in issue #101.
- Exact final sequence exited 0: `git diff --cached --check`; uncached lint 3/3 with zero errors and four pre-existing warnings; uncached typecheck 3/3; startup/security 7/7 plus Turbo tests 6/6 with shared 350, API 635, web 959; uncached build 3/3 with 3,830 Vite modules transformed.

Complete repair scope review found no adaptive algorithm, acceptance lifecycle, Milestone 3+, deployment, merge, or PR-ready behavior. Verdict: `VECTOR GATE 2 APPROVED`.

### Pure adaptive algorithm

Implemented and self-reviewed on 2026-08-13:

- Added a pure shared Adaptive TDEE v1 module with no database, ambient-clock, locale, or network dependencies. All algorithm inputs, constants, and calendar boundaries are explicit.
- Implemented canonical lb/kg conversions, calendar-date age, both Mifflin-St Jeor equations, activity multipliers, manual baseline override, and replayable unrounded baseline intermediates.
- Implemented 21-day eligibility with 21-day weight warmup, incomplete-day exclusion, suspect-entry identification, interpolation without extrapolation, seven-day-half-life EWMA, OLS regression, observed TDEE, persisted-RMR plausibility, confidence components, smoothing, no-op behavior, and the +/-150 kcal limiter.
- Implemented signed goal-rate calories, 25% deficit and calorie-floor guardrails, upward constrained-loss rounding, achievable-rate recalculation, goal completion, maintenance behavior, and whole-number macro allocation within two calories.
- Added recursively key-sorted canonical JSON, date/ID-sorted source arrays, eight-decimal canonical kilograms, source-range filtering, and a web-safe pure SHA-256 implementation. Incomplete-day calories cannot affect either the calculation or fingerprint, while source corrections and current-target changes do.
- Added strict calculation/setup/response schemas covering every enum, numeric boundary, conditional field, persisted baseline intermediate, target provenance rule, and baseline/learning/holding/updating union.

Required deterministic vectors and invariants are executable in the 34 algorithm tests. Independent arithmetic, performed separately from the implementation, reproduced:

| Vector | Independent result                                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| A      | observed TDEE 2,500; adaptive TDEE 2,500; maintenance goal 2,500                                                                  |
| B      | slope -0.032399455 kg/day; observed TDEE 2,599.4758035; requested delta 34.816531225; adaptive TDEE 2,530; raw loss goal 2,080.43 |
| C      | stored energy 275 kcal/day; observed TDEE 2,725                                                                                   |
| D      | requested delta 350; limited delta 150; adaptive TDEE 2,350                                                                       |
| K      | binding minimum 1,801; persisted goal 1,810; achievable rate recomputed as -0.5363636%/week                                       |

Vectors E-H are covered by direct eligibility/recommendation assertions. Vector I's algorithm-level requirement proves identical fingerprint and output for reordered identical inputs; persistence-level check-in-ID reuse remains Milestone 4. Vector J proves the fingerprint changes after a complete-day source correction; the HTTP 409 acceptance transaction remains Milestone 4. All listed section 22.1 conversion, age, baseline, interpolation, EWMA, regression, sign, confidence, boundary, limiter, guardrail, completion, macro, and canonicalization cases pass. The 13 schema tests cover the complete section 22.3 matrix.

Targeted checks, all exit 0:

| Command/check                               | Observed result                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm --filter @pulse/shared lint`          | Passed                                                                           |
| `pnpm --filter @pulse/shared typecheck`     | Passed                                                                           |
| `pnpm --filter @pulse/shared test -- --run` | 32 files, 397 tests; includes 13 adaptive schema and 34 adaptive algorithm tests |

Exact uncached pipeline, all exit 0 on the final code tree:

| Command                           | Observed result                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `TURBO_FORCE=true pnpm lint`      | 3/3, 0 cached, zero errors; four pre-existing Fast Refresh warnings                                            |
| `TURBO_FORCE=true pnpm typecheck` | 3/3, 0 cached                                                                                                  |
| `TURBO_FORCE=true pnpm test`      | Startup/security 7/7; Turbo 6/6, 0 cached; shared 397, API 635, web 959 (1,991 package tests across 251 files) |
| `TURBO_FORCE=true pnpm build`     | 3/3, 0 cached; Vite transformed 3,832 modules                                                                  |

Built-in-browser smoke used only `pnpm dev:gate0` on isolated ports 3102/5274 and `apps/api/data/pulse-tdee-dev.db`. Dashboard, Nutrition, Weight History, and Settings rendered with the isolated `Gate 2 QA` user. Browser console warnings/errors were empty, and every observed API request completed with HTTP 200. The process was stopped after verification.

Complete diff self-review found no database/API lifecycle, UI, Milestone 4+, deployment, merge, or PR-ready behavior. Formatting and whitespace checks passed. The copied production snapshot SHA-256 remains `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`; production was not accessed or changed. Verdict: `AWAITING VECTOR GATE 3 REVIEW`.

#### Gate 3 bounded repair evidence

Vector's adversarial probes reproduced three defects before repair: an explicit 2,000 kcal floor was silently reduced to a 1,800 kcal Adaptive TDEE, the 2,000 kcal macro vector with 2,001 macro-derived kcal reported `+1` instead of `-1`, and 12 rows for one date manufactured nutrition eligibility. The temporary untracked probe file was folded into the permanent shared algorithm suite and removed.

The bounded repair:

1. Implements section 12.4 literally by retaining `max(system floor, user floor, minimumByDeficit)` without capping it to Adaptive TDEE. The explicit stored floor wins at the exceptional boundary; ordinary loss configurations remain at or below Adaptive TDEE.
2. Implements section 13.2's `goalCalories - macroCalories` sign.
3. Selects one nutrition row per calendar date before eligibility and averaging, using greatest `updatedAt` then greatest `id` as a deterministic tie-break. Regressions prove duplicate rows cannot satisfy 12 dates, a stale high-calorie duplicate cannot distort intake, and reversed input yields identical output.

Observed repair checks, all exit 0:

| Command                                                                                                              | Observed result                                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `git diff --check`                                                                                                   | Pass                                                                                                           |
| `pnpm --filter @pulse/shared exec vitest run src/utils/adaptive-tdee.test.ts src/schemas/adaptive-nutrition.test.ts` | 2 files, 50/50 tests passed                                                                                    |
| `pnpm --filter @pulse/shared test`                                                                                   | 32 files, 400/400 tests passed                                                                                 |
| `pnpm --filter @pulse/shared lint` / `typecheck`                                                                     | Both passed                                                                                                    |
| `TURBO_FORCE=true pnpm lint`                                                                                         | 3/3 tasks, 0 cached, zero errors; four pre-existing Fast Refresh warnings                                      |
| `TURBO_FORCE=true pnpm typecheck`                                                                                    | 3/3 tasks, 0 cached                                                                                            |
| `TURBO_FORCE=true pnpm test`                                                                                         | Startup/security 7/7; shared 400, API 635, web 959 (1,994 package tests across 251 files); 6/6 tasks, 0 cached |
| `TURBO_FORCE=true pnpm build`                                                                                        | 3/3 tasks, 0 cached; Vite transformed 3,832 modules                                                            |

No browser QA was repeated by the repair writer because the repair changes only pure shared calculation logic and unit tests. No commit, push, merge, deployment, PR-readiness change, production access, or Milestone 4+ work was performed. Writer verdict: `AWAITING VECTOR GATE 3 RE-REVIEW`.

#### Vector independent Gate 3 re-review

Vector inspected the complete repair rather than accepting the writer report. The source diff is limited to deterministic nutrition-date selection, literal calorie-floor preservation, macro-difference sign correction, permanent regressions, and truthful workspace evidence. No database/API lifecycle, UI, Milestone 4+, deployment, merge, or PR-ready behavior was introduced.

Independent evidence:

- Focused schemas and algorithm regressions passed 50/50.
- Exact sequence exited 0: `git diff --check`; uncached lint 3/3 with zero errors and four pre-existing warnings; uncached typecheck 3/3; startup/security 7/7 plus shared 400, API 635, and web 959 tests; uncached build 3/3 with 3,832 Vite modules transformed. Turbo reported zero cached tasks throughout.
- Isolated Gate 0 API/web acceptance used ports 3102/5274 and only `pulse-tdee-dev.db`. `/health` returned 200; Dashboard, Nutrition, Weight History, and Settings rendered without an application error; the API opened only the isolated database plus WAL/SHM. The process was stopped and both ports were released.
- SQLite `quick_check` was `ok`. The copied production snapshot SHA-256 remained `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`; the 37 known copied-baseline foreign-key violations remain separately tracked in issue #101.

Verdict: `VECTOR GATE 3 APPROVED`.

### Check-in/API lifecycle and concurrency

Milestone 4 implements the full program/check-in API lifecycle on the existing migration-0042
persistence foundation. Shared Zod contracts cover program mutation/read state, eligibility,
versioned input snapshots, preview/accept bodies, compact history, full detail, and accepted target
responses. The API exposes read/preview to JWT and AgentToken callers while preserving JWT-only
program, accept, and decline decisions.

The store uses `better-sqlite3` immediate transactions for setup/update, preview, acceptance, and
decline. It reads exact local-date ranges and canonical kilograms, reuses identical pending or
same-kind/date held calculations, supersedes changed actionable pending rows, never reopens terminal
rows, and revalidates the fingerprint against the preview's persisted date before acceptance.
Acceptance atomically resolves same-date policy, adaptive target provenance, goal-to-maintenance,
and check-in status.

Focused checks passed 48/48: shared schema/docs 20, API routes/store 22, and web invalidation 6.
The 15 real-store tests include two separate SQLite connections, explicit lock contention, convergent
preview/accept behavior, setup weight age cases, rebaseline stability, held due scheduling, source
change/revert, midnight pinning, conflict replacement, decline and accept idempotency, pagination,
goal completion, and cross-user isolation. Seven route tests cover response serialization, OpenAPI,
JWT/AgentToken access, validation, and stable lifecycle error codes.

Exact uncached gates all exited 0: lint 3/3 with zero errors and four pre-existing warnings;
typecheck 3/3; startup/security 7/7 plus shared 402, API 657, and web 960 tests (2,019 package tests);
build 3/3 with 3,832 Vite modules. Turbo reported zero cached tasks.

Real `pnpm dev:gate0` API exercise covered setup-required, program/baseline creation, pending state,
accept and repeated accept, held weekly preview and repeated preview, the expected held-accept 409,
paginated history, and full detail. Built-in-browser smoke rendered Dashboard, Nutrition, Weight
History, Settings, and live Swagger lifecycle documentation. Browser console warnings/errors were
empty; every observed UI/docs request was HTTP 200, apart from the intentional API conflict probe.
The isolated servers were stopped. Production was not accessed or changed.

#### Gate 4 pending-to-held lifecycle repair

The confirmed failure reproduced before repair: the temporary adversarial store regression ran 16
tests with 15 passing and failed because the older actionable row remained `pending` after a changed-
fingerprint held preview. That stale row took priority in `getState`, contradicting the newly persisted
hold.

The minimal repair keeps preview inside the existing `better-sqlite3` immediate transaction. It first
returns an identical pending row unchanged; otherwise it supersedes the program's pending row before
the held/actionable branch. The existing same-kind, same-local-date, same-fingerprint held lookup still
reuses its row, and a new held or actionable row is inserted in the same transaction as supersession.
No schema, route, shared contract, web invalidation, or UI code changed.

The durable real-SQLite regression creates and accepts an update, creates a later actionable pending
recommendation, changes source completeness until the next preview is held, and proves the pending row
is superseded, `pendingCheckIn` is null, state is `holding`, and repeating the identical held preview
reuses the held ID without adding history. Existing unchanged-pending and held-reuse tests remain green.

Observed repair checks, all exit 0 after repair:

| Command                                                                                                                                        | Observed result                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm --filter @pulse/api exec vitest run src/routes/adaptive-nutrition/store.integration.test.ts src/routes/adaptive-nutrition/index.test.ts` | 2 files, 23/23 tests passed                                                                   |
| `pnpm --filter @pulse/api lint` / `pnpm --filter @pulse/api typecheck`                                                                         | Both passed                                                                                   |
| `git diff --check`                                                                                                                             | Passed                                                                                        |
| `TURBO_FORCE=true pnpm lint`                                                                                                                   | 3/3 tasks, 0 cached, zero errors; four pre-existing Fast Refresh warnings                     |
| `TURBO_FORCE=true pnpm typecheck`                                                                                                              | 3/3 tasks, 0 cached                                                                           |
| `TURBO_FORCE=true pnpm test`                                                                                                                   | Startup/security 7/7; shared 402, API 658, web 960 (2,020 package tests); 6/6 tasks, 0 cached |
| `TURBO_FORCE=true pnpm build`                                                                                                                  | 3/3 tasks, 0 cached; Vite transformed 3,832 modules                                           |

Complete repair diff review found only the bounded store lifecycle change, its regression, and writer
evidence. No browser QA was repeated because no route contract or UI changed. No commit, push,
deployment, production access/change, PR-readiness change, self-approval, or Milestone 5 work occurred.
Writer verdict: `AWAITING VECTOR GATE 4 RE-REVIEW`.

#### Vector independent Gate 4 re-review

Vector independently inspected the full five-file repair. The change preserves identical pending-row
reuse before mutation, then supersedes any different pending row before held reuse or new held/actionable
persistence, all inside the existing explicit immediate transaction. No schema, route contract, UI,
Milestone 5, deployment, or production scope entered the repair.

Independent focused checks passed: adaptive store/route 23/23, shared adaptive schemas 15/15, and web
invalidation 6/6. The real SQLite suite includes the repaired pending-to-held transition, unchanged
pending and held reuse, stale rejection, idempotent decisions, ownership, and two-connection lock and
convergence behavior. A fresh migration returned `quick_check=ok`, zero foreign-key violations, both
pending uniqueness indexes, and both immutable-audit triggers.

Vector repeated the exact uncached repository pipeline. `git diff --check`, lint, typecheck, tests, and
build all exited 0; Turbo reported zero cached tasks. Tests passed startup/security 7/7, shared 402/402,
API 658/658, and web 960/960. Lint retained only four pre-existing Fast Refresh warnings; all three
builds passed and Vite transformed 3,832 modules.

Isolated `pnpm dev:gate0` QA returned HTTP 200 for API health and web root. Dashboard and Nutrition
rendered with the isolated QA user, and live Swagger exposed all seven adaptive lifecycle endpoints.
The API process opened only `pulse-tdee-dev.db` plus its SQLite sidecars and did not open the production
snapshot. The copied production snapshot SHA-256 remained
`fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`. The isolated stack was stopped
and ports 3102/5274 were free. PR #100 remained draft and Milestone 5 did not start.

Vector verdict: `VECTOR GATE 4 APPROVED`.

### Coach UI and completion controls

Milestone 5 implements the responsive Nutrition Coach tab, dashboard review link, setup and rebaseline
form, all six program states, day-completion controls, recommendation comparison and calculation
disclosure, accept/decline/history flows, same-date replacement confirmation, and stale-preview recovery.
Shared Zod contracts are parsed at every new HTTP boundary, and lifecycle mutations invalidate all
affected adaptive, target, nutrition, weight, and dashboard query families.

Final whole-diff self-review found one cross-unit goal-direction defect: a saved kilogram weight could be
compared directly with a pound target. Direction validation now compares canonical kilograms, and a
saved-kg/target-lb regression is included.

Focused verification passed 70/70 tests across adaptive API hooks, formatting, setup, state rendering,
day status, Nutrition integration, Dashboard integration, and confirmation focus restoration. The exact
uncached repository sequence passed `git diff --check`, lint, typecheck, tests, and build with zero cached
Turbo tasks: startup/security 7/7, shared 402/402, API 658/658, and web 987/987 (2,047 package tests;
2,054 total including startup/security).
Lint retained only the four documented pre-existing Fast Refresh warnings.

Playwright passed 7/7 adaptive scenarios using installed Chrome against the tracked Gate 0 environment:
setup through accepted baseline and history, learning, actionable manual acceptance, stale-preview
recovery, today's completion plus automatic downgrade, narrow-width/tab keyboard behavior, and
keyboard-only setup and acceptance.

The built-in browser used only `pnpm dev:gate0`, ports 3102/5274, and
`apps/api/data/pulse-tdee-dev.db`. It exercised setup, baseline, learning, updating, holding, and pending
states; completion changes; calculation details; same-date confirmation; history; and the Dashboard
review link. The confirmation dialog trapped focus and restored it to its trigger after cancellation.
At 320, 375, 390, 430, 768, and 1280 px, the document width matched the viewport with no horizontal
overflow and action targets were at least 44 px high. Final console warning/error logs were empty and
no unexpected network request failed. The process was stopped after verification. Production remained
unchanged, and no Milestone 6 work was started.

#### Gate 5 setup-preview disclosure repair

Vector's adversarial equation-baseline RTL regression was reproduced first: the focused test failed on
missing `Estimated RMR` while the persisted baseline and existing starting-expenditure/target review
remained correct. Root cause was bounded to the post-submit UI: the immutable program snapshot already
carried `estimatedRmrKcal` and `activityMultiplier`, but calculation details never rendered them.

The repair adds a baseline-only semantic `Starting estimate details` section inside the existing
calculation disclosure. Equation mode renders snapshot-backed Estimated RMR and activity multiplier;
manual mode instead explains that starting expenditure was entered manually and renders neither formula
value. Both modes display the required multiple-weeks personalization warning on the actual pending
review. Starting expenditure stays in the status card, and initial calories/protein/carbohydrates/fat stay
in the existing comparison, avoiding duplicate targets and client-side business math.

Permanent RTL covers both formula and manual baselines. Equation assertions include Estimated RMR
`1,700 kcal`, multiplier `1.55`, starting expenditure `2,500 kcal`, the existing calorie/macro comparison,
and the personalization warning. Manual assertions prove equation values are omitted. Playwright adds a
real equation setup and proves the inputs/outputs and warning are visible before acceptance.

Final writer verification, all exit 0:

| Command                                                                                                       | Observed result                                                               |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `git diff --check`                                                                                            | Pass                                                                          |
| `pnpm --filter @pulse/web exec vitest run src/features/adaptive-nutrition/components/adaptive-coach.test.tsx` | 13/13                                                                         |
| `pnpm --filter @pulse/web exec vitest run src/features/adaptive-nutrition src/pages/nutrition.test.tsx`       | 44/44 across 6 files                                                          |
| `pnpm --filter @pulse/web lint`                                                                               | Pass; zero errors, four pre-existing Fast Refresh warnings                    |
| `pnpm --filter @pulse/web typecheck`                                                                          | Pass                                                                          |
| `PLAYWRIGHT_CHANNEL=chrome pnpm --filter @pulse/web test:e2e -- e2e/adaptive-nutrition.spec.ts`               | 8/8                                                                           |
| `TURBO_FORCE=true pnpm lint`                                                                                  | 3/3, 0 cached; zero errors, four pre-existing warnings                        |
| `TURBO_FORCE=true pnpm typecheck`                                                                             | 3/3, 0 cached                                                                 |
| `TURBO_FORCE=true pnpm test`                                                                                  | Startup/security 7/7; shared 402, API 658, web 989; 6/6 Turbo tasks, 0 cached |
| `TURBO_FORCE=true pnpm build`                                                                                 | 3/3, 0 cached; Vite transformed 3,843 modules                                 |

Complete diff review found no API, shared, database, schema, Milestone 6, production, deployment, commit,
or push scope. Writer verdict: `AWAITING VECTOR GATE 5 RE-REVIEW`.

#### Vector independent Gate 5 re-review

Vector independently inspected the complete six-file repair. The equation disclosure reads only the
immutable program snapshot, manual mode explicitly avoids invented formula values, existing target
comparison remains the sole calorie/macro review surface, and no client-side business math was added.
No API, shared, database, schema, Milestone 6, production, deployment, or PR-readiness scope entered the
repair.

Independent focused verification passed 53/53 tests across adaptive hooks, setup, Coach states,
completion controls, formatting, Nutrition integration, and confirmation behavior. The installed-Chrome
adaptive Playwright suite passed 8/8, including equation-based Estimated RMR/activity disclosure before
acceptance, immutable history, learning/updating flows, stale refresh, completion downgrade, responsive
tab behavior, and keyboard-only setup/acceptance.

Vector repeated `git diff --check`, Prettier, web lint/typecheck, and the exact uncached repository
lint/typecheck/test/build sequence. All exited 0 with zero cached Turbo tasks. Tests passed
startup/security 7/7, shared 402/402, API 658/658, and web 989/989; lint retained only four pre-existing
Fast Refresh warnings; all three builds passed and Vite transformed 3,843 modules.

The copied production snapshot SHA-256 remained
`fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`. Production was not accessed or
changed, no deployment occurred, all test/runtime ports were free, PR #100 remained draft, and Milestone
6 did not start. Vector verdict: `VECTOR GATE 5 APPROVED`.

### Backtest and stale-data behavior

Milestone 6 adds `scripts/backtest-adaptive-tdee.ts` with strict versioned JSON input and migrated SQLite
input. Each JSON/CSV row includes check-in and analysis dates, nutrition and weight input dates/counts,
average intake, trend weight/slope, observed TDEE, every confidence component, prior/proposed TDEE,
goal calories/macros, state, and reason codes. Sequential eligible rows simulate acceptance in memory so
later rows replay the preceding adaptive estimate without writing a target or check-in.

SQLite replay opens with `readonly: true`, `fileMustExist: true`, and `query_only=ON`; validates the
canonical `weight_kg` column; verifies `total_changes() = 0`; and compares source SHA-256 before and after
close. Explicit completion dates are overlaid only in memory.

Observed replay evidence:

- The tracked deterministic JSON vector produced an `updating` March–April row from 20 complete days
  and eight weights while excluding the one `unknown` low-intake date. The August row was `holding`,
  with zero weight inputs, no observed TDEE, and no proposed TDEE.
- The private production-copy replay used 20 explicit March 18–April 7 completion labels and produced an
  April 8 estimate. Its August 13 row was `holding`, used zero weights, and produced neither observed nor
  proposed TDEE. The source SHA-256 was identical before and after, and all stored nutrition statuses
  remained `unknown`.
- Focused Vitest passed 3/3 backtest cases, including JSON/CSV shape, incomplete-day exclusion,
  stale-history refusal, read-only SQLite bytes, and in-memory-only completion overrides.

### Milestone 6 synthetic preview and browser acceptance

`pnpm seed:adaptive-tdee-preview -- --date 2026-08-13` builds seven deterministic users covering setup,
baseline, learning, updating, holding, pending recommendation, and goal-reached acceptance. The seeder
rejects every database except the exact regular non-symlink Gate 0 path. Its integration test passed 1/1,
including all expected states, goal acceptance changing the program to `maintain`, and an identical
second seed.

Before tailnet binding, the production-derived replay copy was moved to a private ignored file. A fresh
database was migrated and seeded, then verified to contain exactly seven `adaptive-preview-*` users and
zero other users. The Gate 0 host guard accepts only `127.0.0.1` or an exact Tailscale IPv4 in
`100.64.0.0/10`; focused startup/security tests passed 8/8 and reject all-interface, LAN, public,
out-of-range Tailscale, production, arbitrary, missing, read-only, and symlink targets.

Installed Chrome passed the existing 8/8 adaptive scenarios and the new deterministic 4/4 fixture
scenarios. Together they cover setup/baseline, equation disclosure, learning, held stale weight, eligible
preview, stale acceptance/refresh, completion downgrade, keyboard-only acceptance, decline, immutable
history, re-preview/acceptance, goal completion, and responsive behavior. The new suite recorded zero
console warnings/errors, page errors, request failures, or HTTP failure responses. It initially exposed
a real `/favicon.ico` 404; the tracked SVG favicon repair removed it before the green rerun.

The built-in browser independently exercised all six Coach read states plus the goal-reached path,
decline/history, new preview, same-date replacement, acceptance, and goal-to-maintenance acceptance.
Widths 320, 375, 390, 430, 768, and 1280 each had `scrollWidth === clientWidth`; the primary action was
44 px high at every width. Final built-in-browser warning/error logs were empty.

Preview verification:

| Probe                                                 | Result   |
| ----------------------------------------------------- | -------- |
| `http://127.0.0.1:3102/health`                        | HTTP 200 |
| `http://100.87.91.127:5274/`                          | HTTP 200 |
| `http://100.87.91.127:5274/health` through Vite proxy | HTTP 200 |

### Milestone 6 definition-of-done self-review

| #   | Definition-of-done item                        | Codex evidence                                                                 |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Reproducible setup baseline and macros         | Shared vectors, API lifecycle, RTL, Playwright, synthetic setup/baseline       |
| 2   | Canonical kg with preferred-unit display       | Gate 1 migration/store/boundary/unit/browser suites remain green               |
| 3   | Only explicit complete days enter calculations | Shared invariants, SQLite replay, unknown-day exclusion                        |
| 4   | Meal changes invalidate completion             | API transaction tests and existing browser/Playwright downgrade flow           |
| 5   | Eligible data are replayable                   | JSON and private production-copy April estimates plus immutable detail history |
| 6   | Specific ineligible/held states                | Shared vectors, API store tests, held fixture, stale August replay             |
| 7   | Weekly/manual deterministic parity             | Pure calculation and API scheduling/lifecycle tests                            |
| 8   | Unchanged preview idempotence                  | API store/concurrency suite                                                    |
| 9   | Changed sources make pending stale             | API fingerprint/stale tests and installed-Chrome stale refresh                 |
| 10  | Atomic target apply/replace with audit         | SQLite transaction/concurrency tests and browser same-date acceptance          |
| 11  | Decline changes no target/prior                | API lifecycle tests and deterministic decline/history browser flow             |
| 12  | Historical target effectiveness                | Nutrition target store/history tests                                           |
| 13  | Production history does not extrapolate        | Private production-copy August hold with zero current weight inputs            |
| 14  | All required test layers pass                  | Startup, shared, API, web, backtest, Playwright, and browser evidence          |
| 15  | Lint/typecheck/test/build pass                 | Detached clean checkout, exact uncached gates below                            |
| 16  | Deploy only after approval and backup          | No deploy performed; production unchanged; intentionally reserved for later    |

Fresh whole-diff review found no unresolved blocking issue. Scope is limited to read-only replay,
deterministic isolated fixtures, tailnet-safe host validation, permanent acceptance coverage,
operator/evidence documentation, and the favicon repair found by strict browser diagnostics.

## Final clean-run quality gates

Detached clean verification commit: `88fa83e38563ac5afb147a1a752a5e78c9c0f980` (staged code tree
`ddaed72f69842c31c28f1e86c6864a74b97c4e3b`). All commands exited 0.

| Command                           | Observed result                                                           |
| --------------------------------- | ------------------------------------------------------------------------- |
| `TURBO_FORCE=true pnpm lint`      | 3/3 tasks, 0 cached, zero errors; four pre-existing Fast Refresh warnings |
| `TURBO_FORCE=true pnpm typecheck` | 3/3 tasks, 0 cached                                                       |
| `TURBO_FORCE=true pnpm test`      | Startup/security 8; shared 402; API 662; web 989; 6/6 tasks, 0 cached     |
| `TURBO_FORCE=true pnpm build`     | 3/3 tasks, 0 cached; Vite transformed 3,843 modules                       |

- [x] Formatting
- [x] Lint
- [x] Typecheck
- [x] Full tests
- [x] Production build
- [x] Fresh migration chain
- [x] Legacy migration fixture
- [x] Real SQLite concurrency tests
- [x] Playwright/E2E suite

## Browser acceptance matrix

Use an isolated development database. Capture screenshots when they clarify a result. Inspect console errors and failed network requests for every flow.

| Flow                                        | Result | Evidence/notes                              |
| ------------------------------------------- | ------ | ------------------------------------------- |
| New-user setup and baseline preview         | Passed | Browser + Playwright                        |
| Setup without current weight                | Passed | RTL validation                              |
| Learning/insufficient-data state            | Passed | Browser + Playwright                        |
| Held stale-weight state                     | Passed | Browser state + RTL reason/action coverage  |
| Complete/partial/unknown day behavior       | Passed | Browser + RTL                               |
| Complete day downgraded after food mutation | Passed | Browser + Playwright                        |
| Eligible manual check-in                    | Passed | Browser + Playwright                        |
| Same-date target conflict                   | Passed | Browser + RTL                               |
| Stale preview rejection                     | Passed | Playwright + RTL                            |
| Accept and target invalidation              | Passed | Browser + Playwright + hook tests           |
| Decline and repeated decline                | Passed | Browser + Playwright + API lifecycle tests  |
| History and calculation details             | Passed | Browser + Playwright + RTL                  |
| Goal-reached maintenance transition         | Passed | Browser + Playwright + algorithm/API tests  |
| Due badge after held weekly attempt         | Passed | Browser dashboard link + RTL state coverage |

## Responsive and accessibility checks

- [x] 320 px
- [x] 375 px
- [x] 390 px
- [x] 430 px
- [x] 768 px
- [x] 1280 px
- [x] Keyboard-only setup and acceptance
- [x] Focus trapping/restoration
- [x] Status not communicated by color alone
- [x] No horizontal overflow

## Development preview

| Item                           | Value                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Local URL                      | Not bound for final handoff; final web preview uses the exact tailnet-only address                           |
| Tailscale URL                  | `http://100.87.91.127:5274`; exact tailnet bind verified HTTP 200                                            |
| API health                     | HTTP 200 at `http://127.0.0.1:3102/health`                                                                   |
| Web health                     | HTTP 200 at the Tailscale root; proxied `/health` also HTTP 200                                              |
| Development database path      | `apps/api/data/pulse-tdee-dev.db`                                                                            |
| Seed/test workflow             | Fresh migrated DB -> seven deterministic synthetic fixtures -> strict Chrome and built-in-browser acceptance |
| Production isolation confirmed | Yes; unchanged seed hash, active-process open-file proof, no production volume/database/process interaction  |

## Vector independent review

After Codex completes and stops, Hermes/Vector must independently compare the implementation against every item in specification section 27 and inspect migrations, concurrency, data isolation, browser behavior, and the complete branch diff.

**Blocking findings:** None. Both findings in `agent-workspace/vector-gate-0-review.md` are resolved and independently verified.<br>
**Non-blocking findings:** Four pre-existing Fast Refresh lint warnings and 37 pre-existing copied-baseline foreign-key violations remain documented and out of Gate 0 scope.<br>
**Resolution commits:** Gate 0 repair and approval commit recorded in branch history.

## Goal-strategy specification extension

Vector added specification sections 30–38 for the post-v1 goal-strategy extension. The extension defines:

- first-class active/historical goals and immutable goal revisions;
- trend-weight progress, honest projections, and maintenance-range semantics;
- JWT-only edit/new/cancel/complete transactions and AgentToken read-only access;
- goal-change recommendations that never apply nutrition targets before explicit acceptance;
- persistent goal, edit/new-goal, history, and completion user experiences;
- migration/backfill, isolated production-clone rehearsal, concurrency, security, invariant, RTL, Playwright, responsive, and accessibility requirements;
- one uninterrupted Codex goal across Milestones 7–11, exactly one commit and extensive automated/built-in-browser QA per milestone, followed by one independent Vector final review.

MacroFactor references for goal editing, new goals, data-reset behavior, dashboard progress, and trend weight are recorded as sources [10]–[14] in the specification. No implementation, migration, deployment, production access, merge, or PR-ready promotion was performed while extending the specification.

## Final verdict

`MILESTONES 7–11 AUTHORIZED AS ONE CODEX GOAL`

Codex continues through Milestones 7–11 without intermediate Vector stops only after each milestone's focused
tests, exact uncached full pipeline, self-review, extensive built-in-browser QA, evidence update, and single
milestone commit are complete. After Milestone 11 it stops at `AWAITING VECTOR FINAL GOAL-STRATEGY REVIEW`.
Only Hermes/Vector may issue the final readiness verdict after independently rerunning acceptance. Confirmed
defects return to the same Codex goal for one bounded repair commit and independent Vector re-review. Codex
must not mark the feature ready, make the PR ready for review, merge, deploy, or modify production.

## Milestone 7: goal domain, migration, and contracts

### Persistence and migration

- Migration `0043_adaptive_goal_strategy.sql` creates authoritative goals and immutable revisions with
  bounded strategy/lifecycle checks, same-owner composite foreign keys, one-active-goal uniqueness, and
  guarded deletion. Check-ins gain nullable historical linkage and require complete goal/revision linkage
  for new rows after migration.
- Program creation writes the initial goal and revision atomically. New check-ins snapshot V2 goal inputs
  and persist their exact goal/revision provenance; historical V1 JSON and nutrition targets remain byte-for-byte
  unchanged. Program goal fields remain compatibility mirrors, while all new goal reads use the goal domain.
- The startup backfill uses one immediate transaction per user, prefers an eligible canonical trend, falls
  back to the latest canonical scale weight, preserves a usable maintenance center, and blocks users with no
  usable weight. Repeated and competing runs converge on one goal/revision; injected per-user failure rolls
  back only that user.
- Goal-reached target acceptance no longer silently switches the program to maintenance. Explicit goal
  completion is intentionally deferred to Milestone 8.

### Isolated snapshot rehearsal

The rehearsal copied the ignored snapshot to a new temporary database and never opened production. A reviewed
per-user map assigned its one affected user and 19 legacy rows to pounds (map SHA-256
`05a058c6e06538616a4eb68e7e912791f78fe27b98bc20657e7c17457fe169ec`). Results:

| Check                      | Observed result                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Canonical-weight preflight | `legacy-mapped`; 1 user, 19 rows                                                    |
| Goal backfill              | 0 created, 0 skipped, 0 blocked; snapshot has no adaptive programs                  |
| SQLite integrity           | `quick_check: ok`                                                                   |
| Goal counts                | 0 goals, 0 revisions, 0 active goals, 0 historical unlinked check-ins               |
| Foreign keys               | 37 baseline violations from issue #101; 37 after; 0 introduced                      |
| Source `.db` SHA-256       | `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4` before and after |
| Source `-wal` SHA-256      | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` before and after |
| Source `-shm` SHA-256      | `fd4c9fda9cd3f9ae7c962b0ddf37232294d55580e1aa165aa06129b8549389eb` before and after |

### Contracts, API, and browser acceptance

- Strict shared schemas cover goals, revisions, lifecycle results, V1/V2 snapshot compatibility, current
  state, pagination, and detail history. OpenAPI exposes authenticated current/history/detail routes, and
  AgentToken reads preserve full-header semantics.
- The tracked Gate 0 launcher now advertises its exact reachable web origin to Swagger while retaining the
  loopback API proxy. This fixed a browser-found hard-coded localhost request failure and has permanent
  loopback/Tailscale launcher coverage.
- Built-in-browser QA used the tracked isolated `pnpm dev:gate0 --web-host=100.87.91.127` environment only.
  The signed-in Coach showed active Adaptive TDEE and check-in history. Swagger authenticated a temporary
  isolated AgentToken and returned 200 for current goal, paginated goal history, and goal detail/revisions.
  The app console had no warnings/errors; Swagger emitted only its bundled deep-link deprecation warning.
  Final server evidence contained no failed product request. The temporary token was deleted, database
  `quick_check` returned `ok`, and ports 3102/5274 were free after shutdown.

### Automated gates

Focused checks passed 84 API tests (schema, migration, backfill, real two-connection contention, goal store,
adaptive store/routes, provenance/account deletion), 17 shared schema tests, and 9 startup/isolation tests.

| Command                           | Observed result                                                              |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `TURBO_FORCE=true pnpm lint`      | 3/3, 0 cached, zero errors; four pre-existing Fast Refresh warnings          |
| `TURBO_FORCE=true pnpm typecheck` | 3/3, 0 cached                                                                |
| `TURBO_FORCE=true pnpm test`      | Startup/isolation 9; shared 404, API 677, web 989; 6/6 Turbo tasks, 0 cached |
| `TURBO_FORCE=true pnpm build`     | 3/3, 0 cached; Vite transformed 3,843 modules                                |
| `git diff --check`                | Pass                                                                         |

No progress calculation, goal mutation, goal UI, production access, deployment, merge, or PR-ready promotion
is included in Milestone 7. PR #100 remains draft. The next authorized work is Milestone 8.

## Milestone 8 Codex verification

Verdict: `MILESTONE 8 COMPLETE; MILESTONE 9 IN PROGRESS`

### Progress, mutation, and acceptance behavior

- Pure progress tests cover loss/gain directionality, clamping before start and beyond target, zero distance,
  desired and actual projected date ranges, low-confidence/stale/moving-away/rate-too-small reasons, and
  maintenance range boundaries without percentage or ETA fields.
- Shared mutation and response schemas are strict. Current-goal and state responses carry authoritative
  progress, active goal, pending goal change, and required lifecycle action.
- Same-direction edits preserve goal ID, start trend, and start date while appending one immutable revision.
  Direction changes create one new progress period. Both preserve accepted expenditure/check-in history and
  create a pending `goal_change` recommendation without writing a nutrition target.
- Explicit acceptance is the only target-write boundary. Fingerprints include goal/revision identity; source
  changes, stale revisions, unapproved pending supersession, cross-user IDs, and AgentToken mutations fail
  closed.
- Cancellation supersedes pending work, leaves targets/history untouched, and blocks further previews until
  a new goal exists. Completion requires an accepted fresh goal-reached check-in, creates maintenance exactly
  once, consumes the already accepted maintenance target without duplicating it, and converges across two
  real SQLite connections.

### Fixtures, backtest, and isolated runtime

- Backtest inputs accept optional goal strategy and expose goal type, target/center, and rate while old input
  remains compatible. Goal-change simulation preserves prior Adaptive TDEE and changes targets only after
  simulated acceptance.
- The Gate 0 seeder deterministically creates 13 original-plus-goal accounts. Browser/API QA found and fixed
  a fixture-ID collision with the isolated copy and three usernames longer than the login schema permits.
  Regression coverage preserves unrelated colliding legacy IDs and enforces usable fixture usernames.
- Built-in-browser QA used only the tracked isolated launcher. Signed-in Dashboard, Nutrition Log, and Coach
  rendered correctly with empty warning/error diagnostics. Loopback JWT smoke exercised current/history/detail,
  edit, explicit acceptance (including same-date confirmation), start, cancel, blocked preview, completion,
  and retry. Only intentional 409 probes failed; observed product navigation requests returned 200.
- The database was reseeded after mutation smoke. SQLite reported `quick_check=ok`, exactly 13 fixture users,
  and preservation of the unrelated copied user. Ports 3102 and 5274 were free after shutdown.

### Automated gates

| Command                           | Observed result                                                        |
| --------------------------------- | ---------------------------------------------------------------------- |
| Focused shared/API                | Shared 412; API 684; Adaptive store integration 22                     |
| `TURBO_FORCE=true pnpm lint`      | 3/3, 0 cached, zero errors; four pre-existing Fast Refresh warnings    |
| `TURBO_FORCE=true pnpm typecheck` | 3/3, 0 cached                                                          |
| `TURBO_FORCE=true pnpm test`      | Startup/isolation 9; shared 412, API 684, web 989; 6/6 tasks, 0 cached |
| `TURBO_FORCE=true pnpm build`     | 3/3, 0 cached                                                          |
| Prettier and `git diff --check`   | Pass                                                                   |

Milestone 8 adds no production UI, production access, deployment, merge, or PR-ready promotion. PR #100
remains draft. The next authorized work is Milestone 9.

### Gate 6 backtest repair

Verdict: `AWAITING VECTOR GATE 6 RE-REVIEW`

Vector's two uncommitted regressions were first reproduced at handoff commit
`930d590f031a4131d2ebb178dc0bd5786eb2204a`: 2 failed and 3 passed. Reversing valid source arrays
replayed August before April and reversed emitted input dates; a June persisted manual target did not
supersede the simulated April adaptive target.

The bounded non-production repair:

1. snapshots source `.db`, `-wal`, and `-shm` presence and bytes, copies present files to a private
   temporary directory, and opens only the copy read-only/query-only; source sidecars are never deleted or
   normalized;
2. sorts directly constructed check-ins and emitted input dates, deterministically orders persisted and
   simulated targets by effective date/updated timestamp/ID, and rejects duplicate date/kind check-ins;
3. keeps latest simulated accepted Adaptive TDEE as `priorTdee` while independently selecting the target
   effective at each check-in for current goal inputs; manual targets remain truthful current-target inputs
   rather than false Adaptive TDEE history;
4. rejects unknown and duplicate CLI flags; and
5. documents `pnpm --silent ... > file` and verifies redirected JSON and CSV are machine-parseable.

Observed verification, all exit 0 on the uncommitted repair tree:

| Command/check                     | Observed result                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Focused Vitest                    | 1 file, 9/9 tests; includes WAL family preservation, ordering, target precedence/ties, duplicate check-ins/flags, and JSON/CSV shape |
| Redirected CLI                    | JSON parsed as two rows (`2026-04-02`, `2026-08-13`); CSV began with `checkInDate,kind,state`                                        |
| API full test                     | 60 files, 668/668 tests                                                                                                              |
| API lint/typecheck                | Pass                                                                                                                                 |
| Prettier + `git diff --check`     | Pass                                                                                                                                 |
| `TURBO_FORCE=true pnpm lint`      | 3/3 tasks, 0 cached, 0 errors; four pre-existing Fast Refresh warnings                                                               |
| `TURBO_FORCE=true pnpm typecheck` | 3/3 tasks, 0 cached                                                                                                                  |
| `TURBO_FORCE=true pnpm test`      | Startup/security 8/8; shared 402, API 668, web 989 (2,059 package tests across 260 files); 6/6 Turbo tasks, 0 cached                 |
| `TURBO_FORCE=true pnpm build`     | 3/3 tasks, 0 cached; Vite transformed 3,843 modules                                                                                  |

No production access, deployment, commit, push, merge, PR-ready promotion, or post-Milestone-6 work was
performed. PR #100 remains draft. Vector owns independent re-review and any later verdict promotion.

#### Vector independent Gate 6 re-review

Vector inspected every changed line and independently reran the confirmed failures. Focused backtest
coverage passed 9/9. A failure-path replay against an invalid WAL family exited 1 while preserving `.db`,
`-wal`, and `-shm` presence and bytes exactly. Redirected JSON and CSV parsed cleanly.

The ignored migrated-history copy was replayed using the original snapshot's sole user without exposing
identity. April 8 produced an eligible estimate from 20 complete days and 19 weights; August 13 held with
zero weight inputs and no observed or proposed TDEE. The source family was byte-identical before/after.

Vector rebuilt the Gate 0 database from an empty regular file, migrated it, and seeded exactly seven
fixture users and zero others. Installed-Chrome acceptance passed 4/4 deterministic fixture scenarios at
320, 375, 390, 430, 768, and 1280 px, then 8/8 adaptive lifecycle scenarios. The width test now waits for
`document.fonts.ready` before navigation to avoid treating expected prior-page font cancellation as a
product transport failure.

| Independent check                | Observed result                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------- |
| Focused backtest                 | 9/9 passed                                                                        |
| Seeded Chrome fixture acceptance | 4/4 passed across six widths                                                      |
| Chrome lifecycle acceptance      | 8/8 passed                                                                        |
| Exact uncached lint/typecheck    | 3/3 each, 0 cached; zero lint errors                                              |
| Exact uncached tests             | startup/security 8; shared 402; API 668; web 989; 0 cached                        |
| Exact uncached build             | 3/3, 0 cached                                                                     |
| Isolation                        | Sensitive SQLite-family hashes unchanged; ports free; no deploy/production action |

## Milestone 9: Persistent goal card and edit/new flows

Milestone 9 renders a persistent `Your goal` card directly after the Coach status for every post-setup
state. Loss/gain paths distinguish trend from scale, expose accessible distance progress, desired/actual
pace, and honest completion windows or reasons. Maintenance exposes a center/range visualization,
distance, status, and days in range without fake completion percentages.

The preferred-unit RHF/Zod editor preserves the original goal origin for same-direction edits and starts a
new progress period only after a reviewed different-direction confirmation. Pending recommendations require
a separate supersession checkbox. Every save reveals the immutable `goal_change` recommendation, attributes
expenditure, strategy, guardrails, and macro preferences separately, and leaves current targets unchanged
until explicit acceptance.

### Defects found and repaired during acceptance

1. E2E exposed that closing the goal editor returned focus to the document instead of its invoking action.
   Trigger refs and explicit post-close restoration fixed the product defect; RTL and keyboard-only Chrome
   scenarios now lock it.
2. Self-review found the `GOAL_REACHED` reason note still claimed accepting targets moved the program into
   maintenance. The note and acceptance success message now require a separate reviewed completion step.
3. The first final Chrome command pointed at Playwright's default E2E database and correctly failed the
   fixture login before running any journey. The accepted rerun explicitly pinned Gate 0 API 3102, web
   5274, and the tracked `pulse-tdee-dev.db`; 9/9 passed.

### Automated and browser evidence

| Check                             | Observed result                                                              |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Focused adaptive RTL/API          | 2 files, 28/28                                                               |
| Installed Chrome fixture journeys | 9/9; strict console, page-error, request-failure, and HTTP >= 400 assertions |
| Responsive acceptance             | 320, 375, 390, 430, 768, and 1280 px; no horizontal overflow; 44 px actions  |
| `TURBO_FORCE=true pnpm lint`      | 3/3, 0 cached, zero errors; four pre-existing Fast Refresh warnings          |
| `TURBO_FORCE=true pnpm typecheck` | 3/3, 0 cached                                                                |
| `TURBO_FORCE=true pnpm test`      | Startup/isolation 9; shared 412, API 684, web 999; 6/6 Turbo tasks, 0 cached |
| `TURBO_FORCE=true pnpm build`     | 3/3, 0 cached                                                                |
| Formatting and diff               | Prettier and `git diff --check` passed                                       |

Built-in-browser QA used only `pnpm dev:gate0`. It exercised loss and maintenance cards, trend-versus-scale
copy, progress/range semantics, edit prefill, reviewed projection, required pending replacement, a saved new
direction with history/TDEE preservation, explicit goal-change comparison, Escape dismissal, and focus
restoration. Final inspected tabs had empty console warning/error logs; observed product requests returned 200. The in-app viewport capability advertised width overrides but remained at 1280 after set/reload/new-tab
attempts. This limitation is recorded rather than misrepresented; exact all-width evidence is the strict
installed-Chrome run.

After browser mutations, the preview seeder restored its deterministic 2026-08-13 state. SQLite returned
`quick_check=ok`, 13 fixture users, 12 active goals, and 3 pending check-ins. No production access,
deployment, merge, or PR-ready promotion occurred. PR #100 remains draft. Milestone 10 is next.

## Milestone 10: Goal detail, history, and completion

Milestone 10 adds on-demand goal detail for current and prior goals. The server constructs canonical weekly
samples from the existing daily interpolation and seven-day-half-life EWMA pipeline, including the immutable
goal origin, weekly observations, and the final observation. The UI converts only at the response/display
boundary and distinguishes scale entries from trend values.

The detail dialog combines a Recharts weekly trend with semantic distance-progress or maintenance-range
history and a native-table text equivalent. It also exposes immutable strategy revisions and accepted
check-ins linked to the goal/revision. The separate completion dialog reviews the accepted target, final
trend, total change, period, maintenance center, source evidence, and the fact that no second nutrition target
will be created. Confirmation rechecks the revision/fingerprint, fails stale data closed, and reuses stable
idempotency identifiers after a lost response.

### Acceptance defects found and repaired

1. Installed Chrome found eager active-goal detail loading could be aborted when a reviewed new direction
   changed the active goal. Detail loading is now strictly on demand.
2. A later full run found completion invalidation refetched the obsolete goal detail before the transition
   settled, producing another aborted request. The completion request now uses the canonical revision already
   in Coach state and performs no redundant detail read.
3. Both controlled dialogs raced Radix's focus handling. `onCloseAutoFocus` now restores the exact invoking
   action and is covered by RTL and keyboard-only Chrome acceptance.
4. Strict role locators were disambiguated. The browser monitor now permits only the exact synthetic 409 and
   503 responses that stale/lost-response tests deliberately inject while still failing every unexpected
   console, page, request, or HTTP diagnostic.
5. Built-in visual QA found revision 1 described the target as “Started at,” which could be mistaken for the
   canonical starting trend. The permanent copy and RTL assertion now say “Targeted.”

### Automated and browser evidence

| Check                             | Observed result                                                         |
| --------------------------------- | ----------------------------------------------------------------------- |
| Focused Adaptive Coach RTL        | 25/25                                                                   |
| Installed Chrome fixture journeys | 11/11; strict console, page-error, request-failure, and HTTP assertions |
| Responsive acceptance             | 320, 375, 390, 430, 768, and 1280 px; no horizontal overflow            |
| `TURBO_FORCE=true pnpm lint`      | 3/3, 0 cached, zero errors; four pre-existing Fast Refresh warnings     |
| `TURBO_FORCE=true pnpm typecheck` | 3/3, 0 cached                                                           |
| `TURBO_FORCE=true pnpm test`      | Startup/isolation 9; shared 412, API 684, web 1004; 6/6 tasks, 0 cached |
| `TURBO_FORCE=true pnpm build`     | 3/3, 0 cached; Vite transformed 3,848 modules                           |
| Formatting and diff               | Prettier and `git diff --check` passed                                  |

Built-in-browser QA used only the tracked `pnpm dev:gate0` runtime. It audited maintenance and prior-goal
weekly charts, complete native-table equivalents, revision 1/2 history, linked accepted check-ins,
preferred-unit output, completion evidence, keyboard focus restoration, and the explicit maintenance
transition. The completion POST and every observed product request returned 200 in the Gate0 log. The in-app
viewport remained 1280; the exact six-width matrix is therefore the strict installed-Chrome evidence rather
than a false viewport claim.

After browser mutation, the tracked seeder restored the deterministic 2026-08-13 fixtures. SQLite
`quick_check` returned `ok`, `foreign_key_check` returned no rows, and counts were 13 preview users, 13 active
goals, and 3 pending check-ins. No production access, deployment, merge, or PR-ready promotion occurred.
PR #100 remains draft. Milestone 11 is next.
