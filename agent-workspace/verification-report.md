# Adaptive TDEE v1 Verification Report

**Status:** VECTOR GATE 2 APPROVED<br>
**Branch:** `feat/adaptive-tdee-v1`<br>
**Reviewer:** Vector independent Gate 2 re-review complete<br>
**Last verified state:** Gate 2 approved repair tree; final commit recorded after publication

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

### Coach UI and completion controls

Pending.

### Backtest and stale-data behavior

Pending.

## Final clean-run quality gates

Record exact commands, exit codes, test counts, duration, and commit SHA.

- [x] Formatting
- [x] Lint
- [x] Typecheck
- [x] Full tests
- [x] Production build
- [x] Fresh migration chain
- [x] Legacy migration fixture
- [x] Real SQLite concurrency tests
- [ ] Playwright/E2E suite

## Browser acceptance matrix

Use an isolated development database. Capture screenshots when they clarify a result. Inspect console errors and failed network requests for every flow.

| Flow                                        | Result  | Evidence/notes |
| ------------------------------------------- | ------- | -------------- |
| New-user setup and baseline preview         | Pending |                |
| Setup without current weight                | Pending |                |
| Learning/insufficient-data state            | Pending |                |
| Held stale-weight state                     | Pending |                |
| Complete/partial/unknown day behavior       | Pending |                |
| Complete day downgraded after food mutation | Pending |                |
| Eligible manual check-in                    | Pending |                |
| Same-date target conflict                   | Pending |                |
| Stale preview rejection                     | Pending |                |
| Accept and target invalidation              | Pending |                |
| Decline and repeated decline                | Pending |                |
| History and calculation details             | Pending |                |
| Goal-reached maintenance transition         | Pending |                |
| Due badge after held weekly attempt         | Pending |                |

## Responsive and accessibility checks

- [ ] 320 px
- [ ] 375 px
- [ ] 390 px
- [ ] 430 px
- [ ] 768 px
- [ ] 1280 px
- [ ] Keyboard-only setup and acceptance
- [ ] Focus trapping/restoration
- [ ] Status not communicated by color alone
- [ ] No horizontal overflow

## Development preview

| Item                           | Value                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Local URL                      | `http://127.0.0.1:5274` during Gate 0 verification; local process stopped after QA                          |
| Tailscale URL                  | Not required for Milestone 0                                                                                |
| API health                     | HTTP 200 at `http://127.0.0.1:3102/health`                                                                  |
| Web health                     | HTTP 200 at `http://127.0.0.1:5274/`; proxied `/health` also HTTP 200                                       |
| Development database path      | `apps/api/data/pulse-tdee-dev.db`                                                                           |
| Seed/test workflow             | Read-only copied seed -> writable ignored copy -> UI-registered isolated test user                          |
| Production isolation confirmed | Yes; unchanged seed hash, active-process open-file proof, no production volume/database/process interaction |

## Vector independent review

After Codex completes and stops, Hermes/Vector must independently compare the implementation against every item in specification section 27 and inspect migrations, concurrency, data isolation, browser behavior, and the complete branch diff.

**Blocking findings:** None. Both findings in `agent-workspace/vector-gate-0-review.md` are resolved and independently verified.<br>
**Non-blocking findings:** Four pre-existing Fast Refresh lint warnings and 37 pre-existing copied-baseline foreign-key violations remain documented and out of Gate 0 scope.<br>
**Resolution commits:** Gate 0 repair and approval commit recorded in branch history.

## Final verdict

`AWAITING VECTOR GATE 4 REVIEW`

Codex may change milestone verdicts only to `AWAITING VECTOR GATE N REVIEW` after that milestone's implementation, automated checks, self-review, and built-in-browser QA pass. Codex must then stop, push, and hand off without starting later work.

After Milestone 6, Codex may set the final verdict only to `AWAITING VECTOR FINAL REVIEW`. Only Hermes/Vector may change that to `READY FOR DEREK PREVIEW`, after independently rerunning acceptance and verifying the preview. Codex must not self-approve a gate, mark the feature ready for Derek, make the PR ready for review, merge, or deploy.
