# Activity / Journal canonical contracts

Status: checkpoint #176 contract foundation. The exported `activity-journal-v1` Zod schemas are implemented in `packages/shared/src/schemas/activity-journal-contracts.ts`. Every route below that is assigned to #177–#183 is planned and **not implemented** by this checkpoint.

## Canonical ownership and records

- `subjectUserId` is the owner whose health record is affected. It is never inferred from a linked record.
- `actor` is the authenticated user, agent token, or system process that performed the write. An agent acting for a user remains an agent actor; provenance records what the user actually said or supplied.
- Every cross-record reference carries its own `subjectUserId`. The backend must load both sides under the authenticated subject in one transaction. A missing or foreign side returns the same `OWNED_LINK_NOT_FOUND` shape, without disclosing the foreign id.
- Activities, planned assignments, and actual executions are separate identities. A structured workout may be referenced, but it never becomes an Activity or shares its identity.
- All captured facts retain exactly one provenance class: `clinician_authored`, `user_relayed_clinician`, `user_observation`, or `agent_suggestion`. Uncertainty and freshness remain independent fields.
- `unknown`, `not_asked`, `denied`, and `affirmed` are distinct. Missing input must not be serialized as a negative finding.

## Fixed decisions

### Concern state

Current symptoms (`affirmed | denied | unknown | not_asked`) are independent from management state (`active | monitoring | maintenance | resolved | archived`). Allowed state moves are:

- `active -> monitoring | maintenance | resolved`
- `monitoring -> active | maintenance | resolved`
- `maintenance -> active | monitoring | resolved`
- `resolved -> active | archived`
- `archived` is terminal in v1

A same-state write may add a revision but cannot erase history. `resolved` records an explicit user-authorized management decision; it does not assert healing or clearance. New evidence reopens it as `active`. Maintenance preserves the concern and its prior evidence.

### Dates, recurrence, and corrections

- Calendar intent uses `YYYY-MM-DD` plus the recorded IANA timezone. Occurrences use an offset-bearing instant plus a derived local date and timezone; the contract rejects disagreement between them.
- Rescheduling creates a new assignment revision. Planned Tuesday and actual Thursday remain queryable as separate fields and records.
- Recurrence revisions have an `effectiveFromLocalDate` and may affect only unmaterialized assignments on or after that date. The literal policy is `unassigned_on_or_after_effective_date`; existing assignments retain their original recurrence revision and date until explicitly rescheduled.
- Corrections append an immutable revision with `priorRevisionId`. The prior revision is never updated in place. A mismatched expected revision returns `STALE_REVISION` with expected/current numbers and makes no write.

### Idempotency and approval

- Idempotency uniqueness is scoped by `(subjectUserId, route, operation, key)`. The stored request fingerprint is part of the receipt.
- A retry with the same scope, key, and fingerprint replays the original result. Reusing a key with a different payload in the same scope returns `IDEMPOTENCY_KEY_REUSE`; a different declared scope is a distinct key namespace.
- A direct routine instruction may execute once through `routinePlanInstructionSchema`, retaining its target revision and idempotency receipt.
- A meaningful change starts as `proposed` and cannot be represented as approved without an explicit approval object. Approval binds to the exact `proposalRevisionId`, exact target revision fingerprint, and approving user actor.
- If the proposal has changed, return `STALE_PROPOSAL`. If any target revision has changed, return `STALE_TARGET`. Neither conflict silently reapplies, rebases, or partially approves the proposal.

## Existing runtime inventory

| Area                     | Current implementation                                                                                                                                       | Reuse / gap                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy Activity          | `apps/api/src/db/schema/activities.ts`; flat date/type/duration row                                                                                          | Table exists, but no registered Activity route/store. It lacks assignment/execution, recurrence, revision, provenance, ownership-actor, goal, and idempotency runtime. #177 owns additive runtime/migration decisions. |
| Legacy Journal           | `apps/api/src/db/schema/journal.ts`; flat entry row                                                                                                          | Table exists, but no registered Journal route/store. It lacks immutable revisions and canonical source links. #180 owns runtime. Existing rows/migrations remain immutable.                                            |
| Generic links            | `apps/api/src/db/schema/entity-links.ts` and shared `entity-links.ts`                                                                                        | User-scoped primitive exists but has a smaller type vocabulary and no revision-bearing target refs. Runtime slices may extend or replace it additively; never create cross-user links.                                 |
| Workout question/answers | `workout_feedback_question_lists`, immutable question-list revisions, answer revisions/current projection; routes embedded in workout template/session flows | Reuse the revision/current-projection pattern and visible `WORKOUT_FEEDBACK_REVISION_CONFLICT`; do not reuse workout-specific identity for daily check-in. #179 owns canonical check-in storage.                       |
| Feedback planning        | `GET /api/v1/context/feedback`, `POST /api/v1/context/feedback/precaution-decisions`                                                                         | Reuse dependency fingerprints, source locators, stale evaluation, and idempotent decision receipts. It remains workout-feedback-specific, not the canonical concern/guidance store. #178/#181 own their runtime.       |
| Scheduled snapshots      | `scheduled_workouts` plus scheduled exercise/set snapshots; `/api/v1/scheduled-workouts`                                                                     | Reuse snapshot/history principles. Activity recurrence and assignment identities remain separate. #177 owns Activity schedules; #182 reads both domains.                                                               |
| Workout sessions         | `/api/v1/workout-sessions`; completed correction endpoint and separate scheduled/session identities                                                          | Keep workout identity and its correction behavior separate. Activities may link to a workout but never impersonate it.                                                                                                 |
| Nutrition day            | nutrition records keyed by local date; timezone resolved from the user's date authority                                                                      | Reuse the authoritative timezone/day resolver. Do not derive a day by truncating UTC. #179/#182 consume it.                                                                                                            |
| Agent context            | `GET /api/v1/context` reads workouts, nutrition, weight, habits, scheduled workouts, and body progress                                                       | It does not include Activity, Journal, concerns/guidance, or shared check-in state. #179 replaces/extends with the daily-context read model.                                                                           |
| Current web surfaces     | Activity and Journal import `mock-data.ts`; Session Context shows preview cards; Workouts owns its own calendar                                              | These are previews, not runtime proof. #181–#183 replace them only after owning APIs exist.                                                                                                                            |

No #176 database migration is needed: this checkpoint defines executable shared contracts only. Runtime migrations belong to the owning child and must be rehearsed against fictional predecessor and fresh databases there.

## Planned route and read-model ownership

All routes use existing `/api/v1` authentication conventions and user scoping. Agent-managed capture writes accept AgentToken authentication; user-facing reads accept JWT or AgentToken where the existing shared-auth policy allows it. Sensitive token/auth management remains JWT-only.

| Exact planned route                                                     | Canonical shape / result                                   | Implementing child | Runtime status at #176 |
| ----------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------ | ---------------------- |
| `GET /api/v1/activities`                                                | activities with assignment/execution summary               | #177               | Unimplemented          |
| `POST /api/v1/activities`                                               | `createActivityInputSchema` -> `canonicalActivitySchema`   | #177               | Unimplemented          |
| `GET /api/v1/activities/:id`                                            | activity, goals, assignments, executions, revisions        | #177               | Unimplemented          |
| `PATCH /api/v1/activities/:id`                                          | expected-revision correction -> immutable revision         | #177               | Unimplemented          |
| `POST /api/v1/activities/:id/assignments`                               | `createActivityAssignmentInputSchema`                      | #177               | Unimplemented          |
| `PATCH /api/v1/activity-assignments/:id/reschedule`                     | `rescheduleActivityAssignmentInputSchema`                  | #177               | Unimplemented          |
| `POST /api/v1/activities/:id/executions`                                | `recordActivityExecutionInputSchema`                       | #177               | Unimplemented          |
| `POST /api/v1/activity-executions/:id/corrections`                      | `correctOwnedRecordInputSchema`                            | #177               | Unimplemented          |
| `POST /api/v1/activity-recurrences/:id/revisions`                       | `createActivityRecurrenceRevisionInputSchema`              | #177               | Unimplemented          |
| `GET /api/v1/body-context/concerns`                                     | concerns, current revisions, source/freshness              | #178               | Unimplemented          |
| `POST /api/v1/body-context/concerns`                                    | `recordConcernInputSchema`                                 | #178               | Unimplemented          |
| `POST /api/v1/body-context/concerns/:id/transitions`                    | `transitionConcernInputSchema`                             | #178               | Unimplemented          |
| `POST /api/v1/body-context/concerns/:id/flares`                         | `recordFlareInputSchema`; record before follow-up          | #178               | Unimplemented          |
| `GET /api/v1/body-context/capabilities`                                 | capability revisions                                       | #178               | Unimplemented          |
| `POST /api/v1/body-context/guidance`                                    | `recordGuidanceInputSchema`                                | #178               | Unimplemented          |
| `POST /api/v1/plan-change-proposals`                                    | meaningful proposal revision                               | #178               | Unimplemented          |
| `POST /api/v1/plan-change-proposals/:id/approval`                       | `approveMeaningfulProposalInputSchema`                     | #178               | Unimplemented          |
| `GET /api/v1/daily-context?date=YYYY-MM-DD`                             | `dailyContextReadModelSchema`                              | #179               | Unimplemented          |
| `POST /api/v1/check-in/questions`                                       | `createCheckInQuestionInputSchema`, canonical dedupe key   | #179               | Unimplemented          |
| `POST /api/v1/check-in/questions/:id/answers`                           | `answerCheckInQuestionInputSchema`                         | #179               | Unimplemented          |
| `POST /api/v1/check-in/answers/:id/corrections`                         | immutable answer revision / stale failure                  | #179               | Unimplemented          |
| `GET /api/v1/journal`                                                   | source-linked observation feed                             | #180               | Unimplemented          |
| `POST /api/v1/journal`                                                  | `createJournalObservationInputSchema`                      | #180               | Unimplemented          |
| `GET /api/v1/journal/:id`                                               | entry plus current/history revisions and source refs       | #180               | Unimplemented          |
| `POST /api/v1/journal/:id/corrections`                                  | immutable entry correction                                 | #180               | Unimplemented          |
| `GET /api/v1/journal/weekly-reflection?start=YYYY-MM-DD&end=YYYY-MM-DD` | `weeklyReflectionReadModelSchema`                          | #180               | Unimplemented          |
| `GET /api/v1/workout-sessions/:id/session-context`                      | `sessionContextReadModelSchema`                            | #181               | Unimplemented          |
| `GET /api/v1/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`                    | `calendarReadModelSchema`; cross-domain filters may repeat | #182               | Unimplemented          |

#183 owns the final Activity/Journal/Context/Calendar UI, agent operating examples, and integrated acceptance. It does not become the fallback owner for missing runtime obligations above.

## Contract evidence boundary

The #176 fixtures and tests prove only shared-schema semantics and pure retry/transition policy. They do not prove database persistence, authorization, concurrency, OpenAPI registration, migration behavior, API readback, UI behavior, or production deployment. Those gates stay with the named runtime children and the final integrated release checkpoint.
