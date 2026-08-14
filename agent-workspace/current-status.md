# Adaptive TDEE v1 Current Status

**Overall:** MILESTONES 7–11 AUTHORIZED AS ONE CODEX GOAL<br>
**Branch:** `feat/adaptive-tdee-v1`
**Execution checkout:** `/Users/meridian/Projects/pulse-fitness-app-adaptive-tdee`
**Last updated:** 2026-08-13 (goal-strategy specification and Milestones 7–11 authorized)

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
- Milestone 4 activates the lifetime program and immutable check-in foundation with strict shared request, snapshot, state, history, detail, and acceptance contracts.
- JWT/AgentToken callers may read state/history/detail and create previews; program changes, acceptance, and decline are JWT-only. Cross-user identifiers fail closed as not found.
- Setup persists an entered canonical weight or requires a saved weight no more than seven local days old. Ordinary updates preserve baseline fields; only explicit rebaseline recalculates them.
- Preview and acceptance use explicit SQLite immediate transactions. Pending fingerprint reuse, held kind/date reuse, pending supersession, terminal-row non-reopening, idempotent accept/decline, stale rejection, same-date replacement, goal-to-maintenance, and weekly due scheduling are implemented.
- Real two-connection SQLite tests prove immediate-lock serialization, identical-preview convergence, and repeated acceptance convergence. The 15 store tests also cover absent/old/recent/entered weight, aggregation boundaries, reverted data, midnight acceptance, pagination, and user scoping.
- Targeted Milestone 4 checks passed 20 shared schema/docs, 22 API route/store, and 6 web invalidation tests. Exact uncached lint, typecheck, test, and build gates passed with startup/security 7, shared 402, API 657, and web 960 tests; Turbo reported zero cached tasks. Lint retained only four pre-existing Fast Refresh warnings.
- Real isolated API QA covered setup-required, pending baseline, repeated acceptance, held weekly preview reuse, held acceptance conflict, history, and detail. Built-in-browser QA covered Dashboard, Nutrition, Weight History, Settings, and the live Swagger lifecycle docs with no console warnings/errors; all UI requests were 200 and the intentional held-accept probe returned 409. The isolated process was stopped.
- Production was not accessed, deployed, or changed. Milestone 5 UI work was not started.
- Gate 4 repair fixes the confirmed pending-to-held replacement defect: after identical-pending reuse is ruled out, preview now supersedes any pending row before either held-row reuse/new held persistence or actionable persistence, all inside the existing explicit immediate transaction.
- A real SQLite regression proves an accepted update followed by an actionable pending recommendation and changed inputs producing a held preview leaves the stale proposal superseded, exposes no pending check-in, reports `holding`, and reuses the identical held row without adding history.
- Repair verification passed 23/23 focused store/route tests, API lint/typecheck, `git diff --check`, and the exact uncached repository lint/typecheck/test/build sequence. Full tests passed startup/security 7, shared 402, API 658, and web 960; Turbo reported zero cached tasks. Lint retained only four pre-existing Fast Refresh warnings.
- Vector independently inspected the complete five-file repair and confirmed identical pending reuse still precedes bounded supersession, while changed pending-to-held/actionable transitions remain atomic inside the existing immediate transaction.
- Vector independently reran 23/23 focused API lifecycle tests, 15/15 shared schema tests, 6/6 web invalidation tests, the fresh migration integrity checks, and the exact uncached repository pipeline. Startup/security 7, shared 402, API 658, and web 960 tests passed; lint, typecheck, and all three builds passed with zero cached tasks.
- Vector repeated isolated runtime QA on ports 3102/5274. Health, Dashboard, Nutrition, and all seven live adaptive Swagger endpoints rendered; the API opened only `pulse-tdee-dev.db` and not the production snapshot. The copied production snapshot hash remained `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`; both ports were free after shutdown.
- Milestone 5 adds the Nutrition Coach tab, dashboard review badge, guided baseline setup, explicit setup/baseline/learning/updating/holding/pending states, calculation disclosure, accept/decline flows, immutable history detail, same-date confirmation, and stale-preview recovery.
- Nutrition Log now exposes accessible unknown/partial/complete controls, confirms completion for today, and reflects the existing server-side complete-to-partial downgrade after meal changes.
- Adaptive frontend hooks parse shared schemas at response boundaries and invalidate program, check-in, targets, nutrition, weight, and dashboard query families after each lifecycle mutation.
- Final self-review found and repaired a cross-unit setup comparison that could compare a saved kilogram weight directly with a pound target; direction validation now compares canonical kilograms and has a permanent regression.
- Focused frontend verification passed 70 tests across adaptive components, API hooks, formatting, Nutrition, Dashboard, and confirmation behavior. The exact uncached repository pipeline passed startup/security 7 plus shared 402, API 658, and web 987 tests (2,047 package tests; 2,054 total), plus lint, typecheck, and all three production builds with zero cached Turbo tasks.
- Playwright passed 7/7 major adaptive paths in installed Chrome: setup/baseline/history, learning, actionable preview/acceptance, stale recovery, completion/downgrade, narrow responsive plus tab keyboard behavior, and keyboard-only setup/acceptance.
- Built-in-browser QA used only `pnpm dev:gate0` and the isolated database. All six Coach states, day-status changes, comparison/details, confirmation focus trap/restoration, history, and dashboard review link were exercised. Widths 320, 375, 390, 430, 768, and 1280 had no horizontal overflow; final console error/warning logs were empty and no unexpected network request failed.
- Production was not accessed, deployed, or changed. Milestone 6 backtest, deterministic state fixtures, staging/Tailscale preview, and final acceptance review have not started.
- Gate 5 repair adds the missing post-submit equation-baseline disclosure: Estimated RMR and activity multiplier are now visible in the existing calculation details before acceptance, while starting expenditure and proposed calories/macros remain in their existing review surfaces.
- Manual-TDEE baselines explicitly say the starting expenditure was entered manually and do not display or invent Estimated RMR/activity values. Both baseline modes show that personalization generally requires multiple weeks of complete nutrition and weight data.
- Permanent RTL coverage passes for equation and manual baseline paths, including all required setup-preview outputs. The installed-Chrome adaptive Playwright suite passes 8/8, including equation inputs and outputs visible before `Use these targets`.
- Repair verification passed `git diff --check`, 44/44 focused adaptive/Nutrition web tests, web lint/typecheck, and the exact uncached repository lint/typecheck/test/build sequence. Full tests passed startup/security 7, shared 402, API 658, and web 989; Turbo reported zero cached tasks. Lint retained only four pre-existing Fast Refresh warnings.
- Complete scope review found changes only in the Milestone 5 web disclosure, its RTL/Playwright coverage, and writer evidence. No API, shared, database, schema, Milestone 6, production, deploy, commit, or push work was introduced.
- Vector independently inspected the complete six-file repair and confirmed the new disclosure reads immutable snapshot values, adds no client-side calculation, preserves manual-mode honesty, and does not duplicate the existing target comparison.
- Vector independently reran 53/53 focused RTL tests and 8/8 installed-Chrome Playwright scenarios, then repeated the exact uncached repository pipeline. Startup/security 7, shared 402, API 658, and web 989 tests passed; lint, typecheck, and all three builds passed with zero cached tasks.
- Production isolation remained intact: the copied snapshot hash stayed `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`, no production access or deployment occurred, and all test/runtime ports were free afterward.
- Milestone 6 adds a read-only JSON/SQLite backtest with JSON/CSV output, strict canonical-schema checks, in-memory completion overrides, `query_only` enforcement, zero-connection-write enforcement, and before/after source hashing.
- The private production-copy replay generated a March–April estimate only after 20 dates were explicitly labeled complete in memory. Its August row held with zero current weight inputs and no observed or proposed TDEE; the source hash remained unchanged and stored unknown labels were not modified.
- An idempotent Gate 0 seeder creates setup, baseline, learning, updating, holding, pending, and goal-reached fixtures. It is restricted to the exact regular non-symlink `pulse-tdee-dev.db`; permanent tests verify every state, goal-to-maintenance acceptance, and deterministic rebuild behavior.
- The network preview was rebuilt from a fresh migrated database containing exactly seven synthetic fixture users and zero non-fixture users before binding to the exact Tailscale address. Production-derived history remained in a private local file and was never network-exposed.
- Installed-Chrome acceptance passed the existing 8 adaptive flows plus 4 deterministic fixture flows. The fixture suite fails on console warnings/errors, page errors, transport failures, or any HTTP status at or above 400. It covered every Coach state, decline/history/re-preview/acceptance, goal completion, and all six required widths.
- Built-in-browser acceptance repeated every Coach state, decline/history/acceptance, goal completion, same-date replacement, and widths 320/375/390/430/768/1280. Every width had exact client/scroll width equality and a 44 px primary action; console warnings/errors were empty.
- Browser diagnostics found one real missing `/favicon.ico` resource. A tracked SVG favicon and document link repaired it; the strict Playwright suite passed clean afterward.
- The exact uncached pipeline passed from detached clean verification commit `88fa83e`: lint and typecheck 3/3, startup/security 8/8, shared 402, API 662, web 989, and production build 3/3, with zero cached Turbo tasks. Lint retained only four pre-existing Fast Refresh warnings.
- Fresh Codex self-review against all 16 definition-of-done items found no unresolved blocker. Item 16 remains intentionally unperformed: production deployment requires separate explicit approval after Vector acceptance and a verified backup.
- Tailscale preview `http://100.87.91.127:5274` and proxied health both returned HTTP 200; direct isolated API health at `http://127.0.0.1:3102/health` returned HTTP 200. PR #100 remains draft.
- Gate 6 repair prevents SQLite from opening the source database family: `.db`, `-wal`, and `-shm`
  bytes are copied to a private temporary directory, queried read-only/query-only there, and source-family
  presence plus bytes are verified unchanged. A live WAL-mode regression covers all three files without
  deleting or normalizing sidecars.
- Directly constructed replay sources are now deterministic: check-ins are sorted before sequential
  simulation, emitted nutrition/weight dates are sorted, target selection is ordered by effective date
  with deterministic tie-breaking, and duplicate date/kind check-ins fail closed.
- A later persisted target now supersedes an earlier simulated target for current goal inputs. The prior
  Adaptive TDEE remains the latest simulated accepted Adaptive TDEE, matching production semantics;
  manual targets never become Adaptive TDEE history. Rows expose current-target calories/source/date so
  this distinction is auditable in JSON/CSV.
- Unknown and duplicate CLI flags fail closed. README and the Milestone 6 runbook use
  `pnpm --silent backtest:adaptive-tdee ... > file` for clean machine-readable redirects.
- Repair verification passed: 9/9 focused backtest tests, API 668/668, API lint/typecheck,
  `git diff --check`, and Prettier. The exact uncached repository pipeline passed lint/typecheck/test/build
  with zero cached tasks: startup/security 8, shared 402, API 668, web 989; lint retained only four
  pre-existing Fast Refresh warnings.
- Vector independently inspected the complete repair tree and reran ordering, target-history, CLI, clean
  JSON/CSV, and success/failure-path WAL-family regressions. The private migrated-history replay produced
  an eligible April estimate and an August hold with zero weight inputs and no observed/proposed TDEE;
  source-family bytes remained unchanged.
- Vector rebuilt the isolated database from an empty regular file and seeded exactly seven synthetic users
  with zero others. Installed-Chrome acceptance passed 4/4 seeded fixture scenarios across all six widths
  and 8/8 lifecycle scenarios. The width harness now waits for `document.fonts.ready` between navigations.
- Vector reran the exact uncached pipeline: lint 3/3, typecheck 3/3, startup/security 8/8, shared 402/402,
  API 668/668, web 989/989, and build 3/3, all with zero cached Turbo tasks. Sensitive SQLite-family hashes
  remained unchanged, all isolated ports were stopped, and PR #100 remained draft.

## Current milestone

**Goal-strategy extension: Milestones 7–11 — AUTHORIZED AS ONE CODEX GOAL**

The original Adaptive TDEE Milestones 1–6 remain approved. Specification sections 30–38 define the
first-class goal strategy extension, progress model, persistent UI, history/completion behavior, testing,
and Milestones 7–11. Codex is authorized to implement all five milestones in one uninterrupted Goal Mode
goal, with exactly one commit and extensive automated/built-in-browser QA per milestone, then stop at
`AWAITING VECTOR FINAL GOAL-STRATEGY REVIEW`.

### Milestone 7 checkpoint

- Added authoritative `adaptive_nutrition_goals` and immutable goal revisions, strict lifecycle and
  ownership constraints, check-in goal/revision provenance, and compatibility-mirror writes.
- Startup runs an idempotent per-user backfill after canonical-weight preflight. Usable trend weight is
  preferred, latest canonical scale weight is the fallback, and users without either fail closed without
  partial writes.
- Added strict shared V1/V2 snapshot contracts and read-only current/history/detail goal APIs for JWT and
  AgentToken callers. Goal completion remains explicit; accepting a goal-reached nutrition recommendation
  does not silently change the goal.
- Isolated snapshot rehearsal mapped 19 reviewed legacy-weight rows, returned `quick_check: ok`, preserved
  every source SQLite-family hash, and introduced zero foreign-key violations. The 37 pre-existing
  violations remain tracked in issue #101.
- Focused verification passed 84 API, 17 shared, and 9 startup/isolation tests. Exact uncached gates passed
  lint 3/3, typecheck 3/3, startup/isolation 9, shared 404, API 677, web 989, and build 3/3 with zero cached
  Turbo tasks. Lint retained only four pre-existing Fast Refresh warnings.
- Built-in-browser QA used only `pnpm dev:gate0`. The signed-in Coach remained healthy, Swagger authenticated
  with a temporary isolated AgentToken, and current/history/detail requests all returned 200. The token was
  deleted, SQLite `quick_check` returned `ok`, and ports 3102/5274 were stopped.

## Next actions

1. Hand off the clean specification commit to the primary Codex chat.
2. Codex implements Milestones 7–11 in order using fresh databases and isolated production clones only.
3. After each milestone Codex runs focused and exact uncached full gates plus extensive built-in-browser QA, fixes its findings, and creates/pushes exactly one milestone commit.
4. After Milestone 11 Codex stops once for Vector's independent final QA. Confirmed defects return to the same Codex goal as one bounded repair pass.
5. Do not deploy, merge, modify production, or make PR #100 ready without separate authorization.

## Blocking issues

None.

## Non-blocking warnings

- The copied production baseline contains 37 pre-existing foreign-key violations tracked in issue #101.
- Lint reports four pre-existing Fast Refresh warnings and zero errors.
- Production deployment is explicitly out of scope.

## Vector review handoff protocol

PR #100 remains draft. Vector Gate 6 remains approved. Milestone 7 is implemented and verified; Milestones
8–11 remain in progress. Codex owns the five milestone commits and per-milestone evidence, while Vector owns one independent final QA,
the bounded defect list, and final re-review after Codex repairs.
