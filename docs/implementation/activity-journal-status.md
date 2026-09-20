# Activity / Journal release status

## Checkpoint

- Accepted predecessor: #176 canonical foundation at `e32812100d73af2cd23be380ce275895c0459488`
- Current checkpoint: #177 Activity persistence and API runtime
- Branch: `feat/activity-journal-release`
- Checkpoint starting HEAD: `459a032bc5fb420f338466e95c68663672f00004`
- Checkpoint commit: the commit containing this status file; resolve its exact SHA in the independent-review handoff
- Runtime claim: additive Activity persistence and backend API only; no #178+, browser UI, production migration, PR, merge, or deployment

## Implemented boundary

- `0069_activity_runtime.sql` adds canonical Activity goals, Activity roots/revisions, goal links, assignments and immutable reschedule revisions, actual executions and immutable corrections, recurrence roots/revisions, owned links, and durable idempotency receipts.
- The legacy `activities` table and its rows are unchanged. Unified reads label those records `legacy_date_only` and explicitly disclose that time, timezone, actor, and provenance were never recorded.
- External Activity inputs are strict. Authentication supplies `subjectUserId` and agent actor identity; the server supplies route, operation, and the canonical semantic-payload fingerprint.
- All Activity mutations require AgentToken auth. List/detail/goal reads use the repository's shared JWT-or-AgentToken auth policy.
- Activity detail exposes planned assignments, actual executions, immutable histories, recurrence revisions, goals, and source links separately.
- Recurrence revisions apply prospectively to newly materialized dates. Existing assignments keep their original recurrence revision until an explicit reschedule.
- Idempotency receipts and writes share one immediate SQLite transaction. Replays survive server restart, changed payloads conflict, and failed writes leave no receipt.

## Requirements to executable evidence

| Requirement                                       | Executable evidence                                                                                                                                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh and populated additive migration            | `activity-runtime-migration.test.ts` runs the production migration runner on both databases                                                                                                                                         |
| Legacy data is byte-for-byte preserved            | populated predecessor test snapshots the exact legacy row before and after 0069                                                                                                                                                     |
| Rerun and atomic failure                          | production runner no-op assertion and intentionally broken copied 0069 rollback rehearsal                                                                                                                                           |
| Agent-only capture and derived ownership          | API test rejects JWT mutation and reads derived agent actor/user subject from persisted response                                                                                                                                    |
| Five-minute PT readback                           | lifecycle test captures a source-labeled PT Activity and reads it back through the registered API                                                                                                                                   |
| Planned Tuesday / rescheduled and actual Thursday | lifecycle test retains all assignment revisions and the distinct execution occurrence                                                                                                                                               |
| Goals and owned links are usable                  | API creates/retrieves multiple goal links and rejects foreign goal/workout links atomically                                                                                                                                         |
| Durable retry and changed-payload conflict        | same result before and after Fastify restart; altered semantic request returns `IDEMPOTENCY_KEY_REUSE`                                                                                                                              |
| Subject isolation without disclosure              | foreign list/detail/correction/reschedule/execution/link probes return empty/404 and leave no partial receipt                                                                                                                       |
| Same-process retry/stale writes                   | one Fastify process converges duplicate creates and rejects one of each competing reschedule/correction pair                                                                                                                        |
| Independent SQLite writers                        | two child API processes and distinct WAL handles cross a deterministic barrier, block behind a third writer, then prove one durable create/materialization receipt and one winner for each same-revision correction/reschedule race |
| Recurrence create/materialize/revise              | test retains old occurrence revision and assigns later dates to the effective revision                                                                                                                                              |
| UTC/local/DST safety                              | execution read schema rejects an instant/local-date disagreement across the Detroit fallback boundary                                                                                                                               |
| Account erasure                                   | deleting the fictional owner cascades Activity roots, revisions, assignments, and receipts with clean foreign keys                                                                                                                  |
| OpenAPI exactness                                 | test verifies registered lifecycle routes, AgentToken mutation security, and absence of spoofable derived fields                                                                                                                    |

Focused tests:

- `apps/api/src/db/activity-runtime-migration.test.ts`
- `apps/api/src/routes/activities/api.integration.test.ts`
- `apps/api/src/routes/activities/independent-writer.integration.test.ts`

## Evidence receipts

Evidence directory: `/Users/meridian/Projects/qa-reports/pulse-activity-journal-release/checkpoint-177`

Concurrency-repair evidence directory: `/Users/meridian/Projects/qa-reports/pulse-activity-journal-release/checkpoint-177-concurrency`

The original API acceptance test's `Promise.all(app.inject(...))` coverage uses one
Fastify process and one synchronous SQLite handle. The focused concurrency repair adds
separate process IDs and connection identities, a shared private WAL database, a
deterministic pre-handler release barrier, and a control-connection writer lock. Both
API processes must cross the barrier and remain blocked before the lock is released;
fresh read-only handles then verify receipts, roots, revisions, occurrences, foreign
keys, and SQLite integrity. This upgrades evidence only; no runtime source changed.

Concurrency-repair receipts:

| Receipt                               | Result                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `00-scope-state.txt`                  | verified target worktree, branch, starting HEAD, upstream delta, and scoped files                  |
| `01-independent-writer-first-run.txt` | preserved harness-first failure before product assertions; transaction method wrapping was invalid |
| `02-focused-final.txt`                | first green focused Activity/migration/concurrency run: 3 files, 11 tests                          |
| `03-api-typecheck.txt`                | API production and test TypeScript projects passed                                                 |
| `04-harness-lint.txt`                 | preserved first lint failure: four test-only non-null assertions                                   |
| `05-harness-lint-final.txt`           | repaired harness lint passed with no findings                                                      |
| `06-api-typecheck-final.txt`          | post-repair API production and test TypeScript projects passed                                     |
| `07-focused-post-lint-final.txt`      | definitive focused run passed: 3 files, 11 tests                                                   |

| Receipt                       | Result                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `00-before-state.txt`         | verified starting branch, HEAD, clean state, runtime identity, and frozen checkpoint hash                                                |
| `01-focused-final.txt`        | 7 files / 43 Activity, migration, auth, and OpenAPI regression tests passed                                                              |
| `02-root-test-final.txt`      | preserved exit 1: the new SQLite writer pragmas correctly exposed one exact bootstrap expectation that still listed only the old pragmas |
| `03-root-test-repaired.txt`   | uncached exit 0: repo scripts 15/15, shared 853/853, API 1318/1318, web 1467/1467; 0 cached                                              |
| `04-root-typecheck-final.txt` | uncached exit 0 across API, shared, and web; 0 cached                                                                                    |
| `05-root-lint-final.txt`      | uncached exit 0; seven pre-existing web warnings, no errors; 0 cached                                                                    |
| `06-root-build-final.txt`     | uncached exit 0 across API, shared, and web; existing Vite large-chunk warning; 0 cached                                                 |
| `07-post-audit-delta.txt`     | exit 0 for final `includeLegacy=false` parsing delta: shared/API typecheck and build, affected lint, Activity tests, exact source hashes |

## Deferred owners and explicit gaps

- #178: body concerns, capabilities, guidance, flare transaction, and meaningful proposal/approval runtime.
- #179: daily context, canonical check-in claims/answers, and cross-thread state.
- #180: canonical Journal persistence, routes, corrections, and weekly reflection.
- #181: session-specific context.
- #182: shared Calendar aggregation.
- #183: Activity/Journal/Context/Calendar UI and integrated release acceptance.

No #177 evidence establishes production-data compatibility, production deployment, UI behavior, or any downstream checkpoint.
