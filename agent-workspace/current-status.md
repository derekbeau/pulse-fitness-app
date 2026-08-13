# Adaptive TDEE v1 Current Status

**Overall:** VECTOR GATE 3 APPROVED<br>
**Branch:** `feat/adaptive-tdee-v1`
**Execution checkout:** `/Users/meridian/Projects/pulse-fitness-app-adaptive-tdee`
**Last updated:** 2026-08-13 (Gate 3 bounded repair complete)

## Completed

- Milestone 0 isolation remains Vector-approved; production data and deployment were not touched.
- Milestone 1 canonical-weight implementation remains complete.
- All eight Vector Gate 1 findings have been repaired and regression-covered:
  1. Production API startup now receives the reviewed map through a read-only secret bind mount and fails closed for insecure/missing legacy maps.
  2. AgentToken weight enrichment includes `lbs`/`kg` in hints and related state.
  3. Reviewed-map writes atomically replace the destination and force mode `0600` for new and existing files.
  4. Canonical preflight validates nulls, columns, behavioral check contracts, unique index, and cascading foreign key.
  5. Agent writes reuse the canonical weight schema and documented examples include output units.
  6. Weight-history add/edit controls expose the active unit and unit-specific placeholders.
  7. History and detailed trends render response units and reject mixed-unit collections instead of relabeling stale values.
  8. Weight hooks parse list/latest/paginated/create/patch/delete responses at the runtime boundary.
- Focused repair suites passed: container/Gate 0 6/6, migration/enrichment 18/18, agent schemas 10/10, weight boundary hooks 15/15, history/trend 16/16.
- Real API-container preflight rejected a non-empty legacy database without a map and accepted the same database with a regular mode-0600 reviewed map.
- Final isolated browser QA saved the kilogram edit, changed preference through Settings to pounds, verified converted history/dashboard/trend values, and verified pounds add/edit labels and placeholders. Diagnostics were zero console warnings/errors, zero unhandled errors/rejections, and zero non-abort failed resources.
- Live API open files were only `pulse-tdee-dev.db` plus WAL/SHM. SQLite `quick_check` was `ok`; all 25 rows had canonical kg, pounds compatibility, and valid `unitAtEntry`; invalid rows and maximum compatibility delta were both zero.
- Production snapshot SHA-256 remained `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`.
- Exact uncached pipeline passed: lint, typecheck, tests (6 startup isolation + 1,899 package tests), and production build. Lint retained only four pre-existing Fast Refresh warnings.
- The remaining finding-4 gap is repaired: preflight now behaviorally probes a clone of the live SQLite table definition, accepting migration-0041 boundaries while rejecting malformed dates, non-positive compatibility pounds, out-of-range kilograms, invalid provenance, and incompatible pounds. Correctly named `CHECK (1)` no-ops are regression-covered.
- Repair verification passed: migration/startup 22/22 targeted tests; exact uncached lint, typecheck, 1,900 package tests plus 6 startup-isolation tests, and production build all passed with zero cached tasks.
- The final independent follow-up classes are repaired: `/runtime-secrets/` is root-ignored by Git and Docker with a real build-context regression; canonical preflight rejects partial unique indexes and existing impossible/non-ISO dates using shared date semantics; and paginated weight metadata is parsed with `apiMetaSchema` at the HTTP boundary.
- Final follow-up verification passed: startup/security 7/7, API migration/enrichment 25/25, web weight boundary/history 26/26, API Docker image build and real legacy/fresh-container checks, plus the exact uncached lint/typecheck/test/build pipeline (1,905 package tests across 245 files, 7 startup/security tests, and zero cached Turbo tasks).
- Milestone 2 adds explicit `unknown | partial | complete` nutrition-log status, migrates legacy rows to `unknown`, and exposes an authenticated status mutation with future-date and missing-log validation.
- Every in-scope meal, item, food-merge, permanent-food-purge, and static-reimport mutation atomically downgrades an explicitly complete day to partial.
- Nutrition targets now retain manual/adaptive provenance, server-derived macro calories, restricted check-in linkage, and exact same-date replacement snapshots. Manual API writes cannot spoof adaptive provenance.
- Adaptive program/check-in persistence is scaffolded only to support Milestone 2 provenance and immutable snapshots; no Milestone 3 algorithm or later lifecycle was implemented.
- Migration verification covers old and fresh databases, legacy defaults, schema constraints, foreign keys, restricted deletion, and snapshot immutability. Real SQLite store tests cover downgrade behavior and transaction rollback.
- Built-in-browser QA verified target save/refetch, a complete day becoming partial after a meal edit, and future-day completion rejection. The affected Nutrition and Settings surfaces had zero browser console warnings/errors and no unexpected failed requests.
- Final exact uncached pipeline passed: startup/security 7/7; shared 350, API 623, and web 959 tests (1,932 package tests across 249 files); lint and typecheck with zero cached tasks; and all three production builds with zero cached tasks. Lint retained only four pre-existing Fast Refresh warnings.
- Gate 2 repair makes check-in deletion database-immutable with a narrowly scoped transactional account-deletion escape hatch, enforces same-owner program linkage with a composite foreign key, and requires pending actionable check-ins with exact typed persisted proposals before adaptive target persistence.
- Adversarial migration/store tests cover direct deletion, successful isolated account deletion, rollback, cross-user isolation/linkage, terminal/held states, and malformed/null/mismatched proposals.
- Repair gates passed: focused API 116, shared 49, and web 63 tests; exact uncached lint/typecheck/test/build passed with 1,944 package tests plus 7 startup/security tests and zero cached Turbo tasks.
- Vector independently inspected the full staged repair, corrected two documentation whitespace defects, reran API 635/635, shared 350/350, web 959/959, and the 7 startup/security tests, and repeated the exact uncached lint/typecheck/test/build pipeline with zero cached tasks.
- Vector independently migrated a fresh database and proved direct check-in deletion and cross-user program linkage fail while the audit row remains; `quick_check` returned `ok` with zero foreign-key violations.
- Vector repeated isolated API/browser acceptance on ports 3102/5274. Nutrition and Settings rendered, health returned HTTP 200, no failed API resources appeared, and the API opened only `pulse-tdee-dev.db` plus WAL/SHM. The process was stopped and both ports were free.
- Milestone 3 adds the pure shared Adaptive TDEE v1 module: explicit calendar-date boundaries, canonical conversions, Mifflin-St Jeor/manual baselines, eligibility and suspect holds, interpolation, seven-day-half-life EWMA, OLS trend slope, observed expenditure, confidence, smoothing, limits, goal guardrails, macro allocation, and deterministic SHA-256 fingerprints.
- Shared schemas now validate calculation inputs, constants, every enum and numeric boundary, persisted baseline conditionals, target provenance, and all baseline/learning/holding/updating response shapes.
- Required vectors A-K and invariants are covered, including incomplete-day exclusion, stale/spike holds, input-order independence, source-correction staleness, constrained-loss upward rounding, goal completion, out-of-range-history exclusion, and clock-independent output. Independent arithmetic reproduced vectors A-D and K.
- Milestone 3 verification passed 13 schema tests and 34 algorithm tests; the exact uncached pipeline passed startup/security 7/7 plus 1,991 package tests across 251 files, lint, typecheck, and all three builds with zero cached Turbo tasks.
- Built-in-browser smoke used only `pnpm dev:gate0` and the isolated `pulse-tdee-dev.db`. Dashboard, Nutrition, Weight History, and Settings rendered; browser console diagnostics were empty and every observed API request returned HTTP 200. The isolated process was stopped afterward.
- Production was not accessed or changed; the copied production snapshot SHA-256 remains `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`.
- Gate 3 repair now preserves an explicit loss calorie floor even when it exceeds Adaptive TDEE, reports macro calorie difference as goal minus macro-derived calories, and counts/averages deterministic unique complete nutrition dates rather than source rows.
- Permanent regressions cover the above-TDEE floor boundary, the exact `2000 -> 2001` macro sign case, duplicate rows failing the 12-date threshold, duplicate rows not distorting intake, and input-order determinism.
- Repair verification passed 50/50 focused shared tests and 400/400 full shared tests. Exact uncached repository lint, typecheck, tests (400 shared + 635 API + 959 web, plus 7 startup/security), and all three builds passed with zero cached tasks. Lint retained only four pre-existing Fast Refresh warnings.
- Vector independently inspected the complete five-file repair, reran the 50 focused tests, and repeated the exact uncached repository pipeline with 400 shared, 635 API, 959 web, and 7 startup/security tests passing and zero cached tasks.
- Vector repeated isolated API/browser smoke on ports 3102/5274. Dashboard, Nutrition, Weight History, and Settings rendered without application errors, `/health` returned 200, and the API opened only `pulse-tdee-dev.db` plus WAL/SHM. The process was stopped afterward.
- The copied production snapshot SHA-256 remained `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`. No Milestone 4+, production, deployment, merge, or PR-ready work was introduced.

## Current milestone

**Milestone 3: pure adaptive algorithm — VECTOR GATE 3 APPROVED**

The deterministic calculation module, shared contracts, required vectors, invariants, full gates, and isolated browser smoke are complete. Milestone 4 has not started.

## Next actions

1. Keep PR #100 draft.
2. Await the separate Goal-format Milestone 4 authorization prompt.
3. Do not deploy, merge, make PR #100 ready, or begin Milestone 4 without that separate authorization.

## Blocking issues

No writer-found Milestone 3 blockers remain after the bounded Gate 3 repair.

## Non-blocking warnings

- The copied production baseline contains 37 pre-existing foreign-key violations tracked in issue #101.
- Lint reports four pre-existing Fast Refresh warnings and zero errors.
- Production deployment is explicitly out of scope.

## Vector review handoff protocol

PR #100 remains draft. Milestone 3 is `VECTOR GATE 3 APPROVED`; Milestone 4 has not started.
