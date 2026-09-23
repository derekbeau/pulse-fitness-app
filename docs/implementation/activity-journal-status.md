# #183 checkpoint status (consolidated repair candidate)

## Consolidated repair after independent review

- Independent `review-183-sol6/report.md` marked candidate `799d2884353da33093efd9292e3855a0f3d17be3` changes required. Parent-authorized repair scope is `qa-reports/pulse-activity-journal-release/repair-183-sol6.md`.
- The sole backend contract exception is an owner-scoped, read-only `GET /api/v1/plan-change-proposals/:id/approval-statements`. It reads existing persisted claims, including exact statement/source/time/recording actor/revision/fingerprint. A claim remains distinct from approval and execution; no new write, registry, migration, or approval path is introduced.
- Journal current and immutable revision source references now retain navigable identity and version. Existing owned body-context reads expose exact recorded revisions in a compact source panel; the raw snapshot remains available on demand. Session Context exposes the same owned source audit for focus, guidance, and concerns, plus labeled workload source identity. Where an owned detail cannot be shown, the UI names that limitation and does not treat a current record as a historical snapshot.
- Registered Chromium acceptance now observes the same Activity before and after flare, pending statement, and direct JWT approval; verifies Journal correction history, scheduled-only weekly workout gap, a real owner-scoped 422, and visibly uncertain muscle mapping. The 422 and missing-muscle probes use labeled fixture-DB rows in isolated temporary SQLite after registered primary seeding, with restoration. Captured raw GET bodies match the committed HTML fixture on disk. Earlier failures remain in repair evidence.
- The affected browser, API, focused web, typecheck, lint, and build checks passed before commit. The mandatory hook runs at commit time; independent delta review remains pending. No merge, deployment, production access, issue closure, or release-wide browser audit occurred.

- Parent Astra approved `activity-journal-183.md` at `fcd2a2179f4cb63748db5da5ccd5317d4bcfbc78` with the occurrence-id clarification recorded in that spec before coding.
- The isolated worktree began clean and writable on `feat/activity-journal-release` at that SHA. Activity, Journal, and Session Context now read strict registered APIs; Calendar deep links preserve canonical Activity ownership and exact occurrence selection.
- Registered API-seeded fictional browser acceptance passed with desktop/mobile deep links, hard reloads, owner isolation, empty/error/login states, and the API-envelope HTML fixture. Focused web tests, repository scripts, typecheck, lint, and build passed. The mandatory pre-commit suite runs at commit time. Earlier failures and superseding runs are retained separately. No merge, deployment, production data, issue closure, or broad release audit has occurred.

---

# #182 checkpoint status (ready for independent review)

- Parent Astra approved the frozen #182 contract at `5aae3bd1bab11d6057c935a1b1f95629208cc458`. Worktree was clean and writable on `feat/activity-journal-release` at that SHA before edits.
- The registered Calendar GET, strict runtime projection, top-level Calendar page, workout-only shared-record adapter, and fictional browser fixture are implemented on this branch. #183 preview surfaces remain unchanged.
- Target-only nutrition has a stable date read identity, null actual, and no source token. This is a read projection required by the foundation `nutrition_log` kind, never a persisted log.
- A reverse-linked completed workout exposed an existing scheduled-date guard gap; the guarded primitive now checks both session link directions. Focused API and populated browser gates passed. Final matrix receipts are in `/Users/meridian/Projects/qa-reports/pulse-activity-journal-release/checkpoint-182`; independent acceptance remains pending.
- No new table, migration, Calendar write route, production action, merge, or issue closure.

---

# #181 checkpoint status (repair ready for independent review)

- Parent Astra approved `activity-journal-181.md` at `de7c0d6ee1f49e4c2de2bd6fcf5ce36372681228`. The foundation projection, canonical active duration, and linked date/status mismatch clarifications were recorded before code changes.
- Starting worktree `/Users/meridian/Projects/pulse-activity-journal-release` was clean, writable, on `feat/activity-journal-release`, and at `de7c0d6ee1f49e4c2de2bd6fcf5ce36372681228`.
- #181 adds strict additive shared runtime schema, two owner-scoped read routes with subject-local dates, workload identity/duration and missing-fact boundaries, a typed #183 migration adapter, and a self-contained fictional HTML fixture. The live Session Context cards remain preview UI.
- No database migration, write route, #182, merge, deployment, production access, or issue closure is part of this checkpoint. Independent review remains required before acceptance.
- Parent resolved workout relevance: a guidance/capability link needs target muscle, flare, or explicit Journal evidence for a workout; date targets may use the broader same-day link. Repair now preserves muscle authority for soft-deleted exercises, flags missing exercise identity as uncertain relevance, caps owner-scoped source scans with typed 422, and binds the browser fixture to registered API GET payloads. See the #181 spec and repair receipts.
- Focused shared/API/web evidence covers strict projection and fixture parse, registered JWT/AgentToken reads, owner-only limits, native load units, linked mismatches, DST windows, provenance, and a mock-free adapter. The root test gate passed 64 shared files/872 tests, 196 web files/1,470 tests, and 124 API files/1,372 tests. Typecheck, lint, and build passed across all three packages. Raw first-run failures and superseding runs are indexed in `/Users/meridian/Projects/qa-reports/pulse-activity-journal-release/checkpoint-181/README.md`.

---

# #180 checkpoint status (prior)

- Parent Astra approved the complete frozen spec `docs/implementation/activity-journal-180.md` at `a7347934f2d2af766221dd5ec911f4e49cab7052`.
- Worktree: `/Users/meridian/Projects/pulse-activity-journal-release`; branch `feat/activity-journal-release`; starting HEAD `a7347934f2d2af766221dd5ec911f4e49cab7052`; writable and clean before edits.
- Scope: canonical Journal observations, immutable corrections, owner-scoped list/detail, additive daily-context field, derived weekly reflection, 0072 migration, registered OpenAPI. No UI, #181, merge, deployment, production, or issue closure.
- Review state: independent GPT-6 Sol medium review at `5194873f3e0653e94ad1cefcc920aa911a8c3f02` requested two bounded repairs; completeness and workout-gap delta review pending after repair commit and push.
- Source-bound verification: the initial #180 commit `3ccd4ade338a7ec033e943c8a86b42540539e14a` passed its focused matrix and mandatory full-suite hook, then was pushed. A follow-up audit added direct Activity/concern, skipped-answer, source-row immutability, and nested ownership acceptance evidence; its final matrix, commit hook, and push receipts are recorded in `checkpoint-180/README.md` in the release QA reports directory.
- Consolidated repair: Journal daily and list reads signal owned limit overflow through documented typed 422 responses; weekly workout coverage requires `in-progress`, `paused`, or `completed` status. Exact below/at/above limit and workout-state tests preserve owner isolation. The prior implementation, #179 identity, historical replay, and immutable corrections remain in scope. Delta receipts and final SHA are in `checkpoint-180/README.md`.

---

# Activity / Journal release status

## Checkpoint

- Accepted predecessors: #176 canonical foundation and #177 Activity runtime through `265e6c7c9f31a4c807a2140dbae7a409c2f04bdd`
- Current checkpoint: #178 body concerns, guidance, safe flare handling, and meaningful-change approval
- Review state: targeted acceptance pending; the scheduled-workout date bypass is repaired and the user-selected trusted approval-relay policy is represented honestly
- Branch: `feat/activity-journal-release`
- Checkpoint starting HEAD: `265e6c7c9f31a4c807a2140dbae7a409c2f04bdd`
- Checkpoint commit: the commit containing this status file; resolve its exact SHA in the independent-review handoff
- Runtime claim: additive shared/backend persistence and API only; no #179+, browser UI, production migration, PR, merge, or deployment

## Implemented boundary

- `0070_body_context_runtime.sql` adds canonical concerns, capabilities, guidance, immutable revision tables, durable flares and pending follow-ups, plan-change proposal revisions, relayed approval statements, and idempotency receipts.
- Legacy `health_conditions` rows are unchanged. A concern may retain an explicit owner-checked `legacyHealthConditionId`; no legacy row is converted and no clinician provenance is fabricated.
- AgentToken capture covers concerns, capabilities, guidance, corrections, flares, proposals, revisions, and approval-statement relay. Shared-auth reads remain owner-scoped. User identity and agent identity come only from authentication.
- Symptom state and management state remain separate. Maintenance and irrelevance never delete history. `resolved`/`archived` require an audited explicit user decision; a later flare appends history and reopens a resolved concern without diagnosing cause or healing.
- Flare, source, and optional pending follow-ups commit before the response. Missing optional answers do not reject or erase the flare and do not mutate a plan.
- Proposal effects are a closed union: `activity_assignment_reschedule` and `scheduled_workout_reschedule`. Target revisions, subject, eligibility, and semantic fingerprint are server-derived and rechecked before all effects execute in one immediate transaction.
- Direct JWT approval records the authenticated user. Derek explicitly authorized trusted AgentToken relay for chat approval without a second in-app approval. Relay requires a separately persisted exact user statement bound to the proposal; `approvedBy` is the user whose decision is attested, `relayedBy` is the authenticated API caller, and readback retains the statement/source/time. Recording a statement alone does not execute.
- Scheduled-workout execution uses a guarded domain primitive, rejects started/completed occurrences, preserves snapshots/programming notes, and applies the existing greater-than-two-day agent-note staleness policy. Activity execution appends the existing assignment revision shape, preserving planned and actual history.
- The legacy generic scheduled-workout PATCH now uses that same guarded primitive for date changes. Callers provide `expectedUpdatedAt`; owner/revision/link eligibility, date mutation, agent-note staleness, and mixed feedback-question writes share one transaction. Same-date writes preserve a linked occurrence without changing its revision.
- Independent finding #1 is resolved by Derek's product decision to trust honest agent relay. The backend authenticates the AgentToken and preserves its attestation audit; it does not verify the external conversation or classify arbitrary text as approval. This closeout adds no conversation-proof infrastructure and does not claim #178 acceptance before targeted review.

## Requirements to executable evidence

| Requirement                                   | Executable evidence                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict provenance and source readback         | API acceptance captures all four provenance classes and verifies auth-derived capture identity                                                                                                                                        |
| Immutable concern/capability/guidance history | API/store tests read current records with ordered revisions and stale compare-and-swap rejection                                                                                                                                      |
| Explicit resolution authority                 | API rejects symptom-derived resolution and accepts an authenticated-user decision with audit history                                                                                                                                  |
| Flare-first partial capture                   | API records a flare with a pending optional follow-up and no plan mutation; same-key replay returns the original result                                                                                                               |
| Local date / instant / timezone               | shared schema test covers Detroit DST and rejects a mismatched occurrence date                                                                                                                                                        |
| Typed meaningful changes only                 | strict shared schema rejects additional diagnosis/clearance/arbitrary mutation keys                                                                                                                                                   |
| Exact direct and relayed approval             | API distinguishes direct JWT approval from trusted AgentToken relay, reads back exact statement/source/time after restart, and proves capture alone does not execute                                                                  |
| Atomic multi-target execution                 | API moves an upcoming Activity assignment and scheduled workout together; a stale second target leaves the first and receipt untouched                                                                                                |
| Completed/stale target protection             | store rechecks planned/unstarted/current-or-future eligibility and exact target revisions before mutation                                                                                                                             |
| Legacy scheduled-date bypass                  | registered API tests reject started/completed date changes without detaching `sessionId`, preserve same-date identity, move an unstarted target with CAS, reject stale/foreign writes, and roll mixed PATCH conflicts back atomically |
| Routine instruction remains narrow            | existing #177 assignment-reschedule route remains the direct primitive with strict payload and immutable revision history                                                                                                             |
| Durable semantic idempotency                  | same scope/key/payload replays; altered payload conflicts; failed writes leave no receipt                                                                                                                                             |
| Genuine independent-process races             | two child API processes with distinct WAL handles cross a deterministic barrier for duplicate flare, stale correction, competing approval/execution, and stale-target proof                                                           |
| Additive migration lifecycle                  | production migration runner covers fresh and populated exact predecessor, legacy preservation, rerun no-op, forced rollback, account erasure, FK and integrity checks                                                                 |
| Registered OpenAPI                            | routes are registered through the typed Fastify provider with exact request/response/error schemas and auth policies                                                                                                                  |

Focused tests:

- `packages/shared/src/schemas/body-context-runtime.test.ts`
- `apps/api/src/db/body-context-migration.test.ts`
- `apps/api/src/routes/body-context/api.integration.test.ts`
- `apps/api/src/routes/body-context/independent-writer.integration.test.ts`
- affected #177 Activity and scheduled-workout regression tests

Repair evidence directory: `/Users/meridian/Projects/qa-reports/pulse-activity-journal-release/checkpoint-178-repair-1`

| Repair receipt                 | Result                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `first-failures.md`            | first shared/web fixture-contract failures preserved with definitive-rerun pointers  |
| `shared-tests.txt`             | scheduled-workout and body-context shared contracts passed, 27 tests                 |
| `api-tests.txt`                | registered scheduled-workout and affected proposal/Activity API regression, 81 tests |
| `scheduled-api-final.txt`      | final registered scheduled-workout API boundary passed, 49 tests                     |
| `independent-writer-tests.txt` | body-context and Activity independent-process concurrency passed, 6 tests            |
| `web-tests.txt`                | all affected scheduled-workout callers and surfaces passed, 90 tests                 |
| `lint.txt`                     | root lint passed with seven pre-existing web warnings and zero errors                |
| `typecheck.txt`                | root API/shared/web typecheck passed                                                 |
| `build.txt`                    | root API/shared/web build passed with the existing Vite chunk-size warning           |
| `root-tests.txt`               | full repository run preserved three unrelated load timeouts; affected tests passed   |
| `root-timeout-api-rerun.txt`   | the two timed-out API files passed alone with one worker, 21 tests                   |
| `root-timeout-web-rerun.txt`   | the timed-out active-workout file passed alone with one worker, 41 tests             |

## Evidence receipts

Evidence directory: `/Users/meridian/Projects/qa-reports/pulse-activity-journal-release/checkpoint-178`

The directory retains the verified starting state, exact excerpts for the earliest failures, and raw output for the lint failures and all definitive gates. The excerpts cover the initial guidance-schema composition failure, an initially over-broad API run, the first proposal serialization failure, and the first DST fixture mistake. The mandatory pre-commit suite later identified four older migration lifecycle files whose complete-chain counts needed to advance for additive 0070; those compatibility assertions were repaired and rerun together. Later receipts identify the superseding focused and consolidated checks rather than erasing failures.

| Receipt                                | Result                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `00-before-state.txt`                  | exact worktree, branch, base HEAD, upstream, toolchain, and frozen-source hashes |
| `01-preserved-first-run-failures.txt`  | chronological first-failure excerpts and supersession note                       |
| `02-focused-api-final.txt`             | six affected API/migration/concurrency files passed, 58 tests                    |
| `03-focused-shared-final.txt`          | body-context plus foundation contracts passed, 17 tests                          |
| `04-root-typecheck-final.txt`          | root typecheck passed before final lint repair                                   |
| `05-root-lint-final.txt`               | preserved first root lint failure: one unused shared import                      |
| `06-root-lint-repaired.txt`            | preserved second root lint failure: store-only unused types/non-null assertions  |
| `07-root-lint-final.txt`               | definitive lint passed; seven pre-existing web warnings, zero errors             |
| `08-root-typecheck-post-lint.txt`      | definitive root typecheck passed                                                 |
| `09-root-build-final.txt`              | uncached API/shared/web build passed; existing Vite chunk warning                |
| `10-focused-api-post-lint.txt`         | post-repair affected API/migration/concurrency regression passed, 58 tests       |
| `11-focused-api-definitive.txt`        | preserved teardown-fixture failure from a user-owned restrictive exercise link   |
| `12-focused-api-definitive.txt`        | definitive affected regression with the shared exercise ownership fixture        |
| `13-final-source-hashes.txt`           | pre-guarded-primitive source hash snapshot retained for provenance               |
| `14-focused-api-guarded-final.txt`     | guarded scheduled-workout final regression passed, 58 tests                      |
| `15-root-build-definitive.txt`         | post-guard API build passed; shared/web cache receipts replayed                  |
| `16-final-source-hashes.txt`           | post-guard source hashes before completed-session fixture expansion              |
| `17-focused-api-final.txt`             | definitive regression including completed-session immutability, 58 tests         |
| `18-final-source-hashes.txt`           | definitive implementation, tests, frozen authority, and status hashes            |
| `19-migration-chain-compatibility.txt` | four affected older migration suites passed, 13 tests                            |

Policy-closeout evidence directory: `/Users/meridian/Projects/qa-reports/pulse-activity-journal-release/checkpoint-178-policy`

This focused closeout reuses the unchanged #178 product, migration, concurrency, and browser evidence above. It adds the executable proof required by Derek's selected trusted-relay policy without rerunning unaffected matrices or claiming acceptance.

| Policy receipt                | Result                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `shared-tests.txt`            | approval contract distinguishes direct and relayed audit shapes and rejects a mismatched relay actor, 4 tests    |
| `api-tests.txt`               | direct/relay, capture-only, restart readback/replay, stale-target, and independent-writer guards passed, 3 tests |
| `shared-lint.txt`             | affected shared package lint passed                                                                              |
| `api-lint.txt`                | affected API package lint passed                                                                                 |
| `shared-typecheck.txt`        | affected shared package typecheck passed                                                                         |
| `api-typecheck.txt`           | affected API package production and test typechecks passed                                                       |
| `precommit-failure-rerun.txt` | three unrelated load-sensitive hook failures passed together with one worker, 30 tests                           |
| `source-hashes.txt`           | policy authority plus final implementation, test, contract, API guide, README, and status-file hashes            |
| `final-state.txt`             | final commit, upstream equality, clean worktree, and explicit no-PR/no-merge/no-deployment boundary              |

## Deferred owners and explicit gaps

- #179: daily context, canonical check-in claims/answers, and cross-thread state.
- #180: canonical Journal persistence, routes, corrections, and weekly reflection.
- #181: session-specific context.
- #182: shared Calendar aggregation.
- #183: Activity/Journal/Context/Calendar UI and integrated release acceptance.

No #178 evidence establishes production-data compatibility, production deployment, UI behavior, or any downstream checkpoint.
