# Activity / Journal release status

## Checkpoint

- Accepted predecessors: #176 canonical foundation and #177 Activity runtime through `265e6c7c9f31a4c807a2140dbae7a409c2f04bdd`
- Current checkpoint: #178 body concerns, guidance, safe flare handling, and meaningful-change approval
- Review state: changes required; the scheduled-workout date bypass is repaired in this follow-up, while approval-relay authority remains pending a user product decision
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
- Direct JWT approval records the authenticated user. Agent relay requires a separately persisted exact user statement and records `approvedBy` user plus `relayedBy` agent. Recording a statement alone does not execute.
- Scheduled-workout execution uses a guarded domain primitive, rejects started/completed occurrences, preserves snapshots/programming notes, and applies the existing greater-than-two-day agent-note staleness policy. Activity execution appends the existing assignment revision shape, preserving planned and actual history.
- The legacy generic scheduled-workout PATCH now uses that same guarded primitive for date changes. Callers provide `expectedUpdatedAt`; owner/revision/link eligibility, date mutation, agent-note staleness, and mixed feedback-question writes share one transaction. Same-date writes preserve a linked occurrence without changing its revision.
- Independent finding #1 about AgentToken approval relay remains open for Derek's product decision. This repair does not redesign relay, add conversation-proof infrastructure, or claim #178 acceptance.

## Requirements to executable evidence

| Requirement                                   | Executable evidence                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict provenance and source readback         | API acceptance captures all four provenance classes and verifies auth-derived capture identity                                                                                                                                        |
| Immutable concern/capability/guidance history | API/store tests read current records with ordered revisions and stale compare-and-swap rejection                                                                                                                                      |
| Explicit resolution authority                 | API rejects symptom-derived resolution and accepts an authenticated-user decision with audit history                                                                                                                                  |
| Flare-first partial capture                   | API records a flare with a pending optional follow-up and no plan mutation; same-key replay returns the original result                                                                                                               |
| Local date / instant / timezone               | shared schema test covers Detroit DST and rejects a mismatched occurrence date                                                                                                                                                        |
| Typed meaningful changes only                 | strict shared schema rejects additional diagnosis/clearance/arbitrary mutation keys                                                                                                                                                   |
| Exact direct and relayed approval             | API verifies JWT approval and separately persisted AgentToken relay with distinct user/agent identities                                                                                                                               |
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

## Deferred owners and explicit gaps

- #179: daily context, canonical check-in claims/answers, and cross-thread state.
- #180: canonical Journal persistence, routes, corrections, and weekly reflection.
- #181: session-specific context.
- #182: shared Calendar aggregation.
- #183: Activity/Journal/Context/Calendar UI and integrated release acceptance.

No #178 evidence establishes production-data compatibility, production deployment, UI behavior, or any downstream checkpoint.
