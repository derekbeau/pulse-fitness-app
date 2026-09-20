# Activity / Journal canonical contracts

Status: checkpoint #178 body-context runtime. The exported `activity-journal-v1` foundation remains in `packages/shared/src/schemas/activity-journal-contracts.ts`; strict external Activity and body-context request/read schemas are in `activity-runtime.ts` and `body-context-runtime.ts`. #176 and #177 are accepted predecessors. Routes assigned to #179–#183 remain planned and unimplemented.

## Canonical ownership and records

- `subjectUserId` is the owner whose health record is affected. It is never inferred from a linked record.
- `actor` is the authenticated user, agent token, or system process that performed the write. An agent acting for a user remains an agent actor; provenance records what the user actually said or supplied.
- Every cross-record reference carries its own `subjectUserId`. The backend must load both sides under the authenticated subject in one transaction. A missing or foreign side returns the same `OWNED_LINK_NOT_FOUND` shape, without disclosing the foreign id.
- Shared write schemas reject an idempotency scope whose `subjectUserId` differs from the write subject, and reject nested owned references whose subject differs from their enclosing record. Shared daily, session, weekly-reflection, and calendar read models apply the same nested-subject invariant. These structural checks supplement rather than replace backend authentication and transactional user scoping; actor identity is not treated as the subject identity.
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

- Calendar intent uses `YYYY-MM-DD` plus the recorded IANA timezone. Occurrences use an offset-bearing instant plus a derived local date and timezone; execution, health-observation, flare, and timestamped calendar contracts reject disagreement between them, including across DST boundaries. Date-only calendar items keep a null occurrence instant. Provenance capture/source timestamps are independent evidence metadata and are not used to derive the occurrence date.
- Rescheduling creates a new assignment revision. Planned Tuesday and actual Thursday remain queryable as separate fields and records.
- Recurrence revisions have an `effectiveFromLocalDate` and may affect only unmaterialized assignments on or after that date. The literal policy is `unassigned_on_or_after_effective_date`; existing assignments retain their original recurrence revision and date until explicitly rescheduled.
- Corrections append an immutable revision with `priorRevisionId`. The prior revision is never updated in place. Empty `correctedFields` objects are rejected conservatively because they cannot represent a correction. A mismatched expected revision returns `STALE_REVISION` with expected/current numbers and makes no write.
- `PATCH /api/v1/scheduled-workouts/:id` date changes require `expectedUpdatedAt`. The owned row, revision, and unstarted eligibility are rechecked inside the same transaction as the date write and any feedback-question update. A changed date never detaches a linked started/completed session; an exact same-date request is a no-op that preserves identity. Snapshot rows and programming/agent-note channels remain intact, and the existing greater-than-two-day agent-note staleness rule commits atomically with an eligible move.

### Idempotency and approval

- Idempotency uniqueness is scoped by `(subjectUserId, route, operation, key)`. Every exported idempotent write contract requires that scope subject to equal the write's declared subject. The stored request fingerprint is part of the receipt.
- A retry with the same scope, key, and fingerprint replays the original result. Reusing a key with a different payload in the same scope returns `IDEMPOTENCY_KEY_REUSE`; a different declared scope is a distinct key namespace.
- A direct routine instruction may execute once through `routinePlanInstructionSchema`, retaining its target revision and idempotency receipt.
- A meaningful change starts as `proposed` and cannot be represented as approved without an explicit approval object. Approval binds to the exact `proposalRevisionId`, exact target revision fingerprint, and approving user actor.
- An authenticated user may approve directly. An AgentToken may only execute approval by first persisting an exact user approval statement bound to that proposal revision and server-derived target fingerprint. The approval audit keeps `approvedBy` as the user and `relayedBy` as the agent; recording a statement alone never executes a proposal.
- Independent review identified the trust boundary behind AgentToken-relayed approval as a pending product decision. The current relay implementation is preserved for that decision and is not an accepted #178 authority policy.
- #178 supports only typed prospective `activity_assignment_reschedule` and `scheduled_workout_reschedule` effects. The server derives targets and their fingerprint, validates every target before any write, and commits all effects, approval, execution audit, and receipt together. Unsupported arbitrary JSON is rejected.
- If the proposal has changed, return `STALE_PROPOSAL`. If any target revision has changed, return `STALE_TARGET`. Neither conflict silently reapplies, rebases, or partially approves the proposal.

## Existing runtime inventory

| Area                     | Current implementation                                                                                                                                       | Reuse / gap                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy Activity          | `apps/api/src/db/schema/activities.ts`; flat date/type/duration row                                                                                          | Preserved unchanged. Unified Activity reads return these rows as `legacy_date_only` with an explicit statement that occurrence time, timezone, actor, and provenance were never recorded. No conversion is attempted. |
| Canonical Activity       | Additive `0069_activity_runtime.sql`, Activity store, and registered `/api/v1` routes                                                                        | #177 implements goals, immutable Activity revisions, assignments/reschedules, executions/corrections, recurrence revisions/materialization, owned links, and durable idempotency receipts.                            |
| Canonical body context   | Additive `0070_body_context_runtime.sql`, body-context store, and registered `/api/v1` routes                                                                | #178 implements concerns, capabilities, guidance, immutable corrections/transitions, flares/follow-up state, typed proposals, bound approvals, and durable receipts. Legacy health-condition rows are unchanged.      |
| Legacy Journal           | `apps/api/src/db/schema/journal.ts`; flat entry row                                                                                                          | Table exists, but no registered Journal route/store. It lacks immutable revisions and canonical source links. #180 owns runtime. Existing rows/migrations remain immutable.                                           |
| Generic links            | `apps/api/src/db/schema/entity-links.ts` and shared `entity-links.ts`                                                                                        | User-scoped primitive exists but has a smaller type vocabulary and no revision-bearing target refs. Runtime slices may extend or replace it additively; never create cross-user links.                                |
| Workout question/answers | `workout_feedback_question_lists`, immutable question-list revisions, answer revisions/current projection; routes embedded in workout template/session flows | Reuse the revision/current-projection pattern and visible `WORKOUT_FEEDBACK_REVISION_CONFLICT`; do not reuse workout-specific identity for daily check-in. #179 owns canonical check-in storage.                      |
| Feedback planning        | `GET /api/v1/context/feedback`, `POST /api/v1/context/feedback/precaution-decisions`                                                                         | Reuse dependency fingerprints, source locators, stale evaluation, and idempotent decision receipts. It remains workout-feedback-specific, not the canonical concern/guidance store. #178/#181 own their runtime.      |
| Scheduled snapshots      | `scheduled_workouts` plus scheduled exercise/set snapshots; `/api/v1/scheduled-workouts`                                                                     | Reuse snapshot/history principles. Activity recurrence and assignment identities remain separate. #177 owns Activity schedules; #182 reads both domains.                                                              |
| Workout sessions         | `/api/v1/workout-sessions`; completed correction endpoint and separate scheduled/session identities                                                          | Keep workout identity and its correction behavior separate. Activities may link to a workout but never impersonate it.                                                                                                |
| Nutrition day            | nutrition records keyed by local date; timezone resolved from the user's date authority                                                                      | Reuse the authoritative timezone/day resolver. Do not derive a day by truncating UTC. #179/#182 consume it.                                                                                                           |
| Agent context            | `GET /api/v1/context` reads workouts, nutrition, weight, habits, scheduled workouts, and body progress                                                       | It does not include Activity, Journal, concerns/guidance, or shared check-in state. #179 replaces/extends with the daily-context read model.                                                                          |
| Current web surfaces     | Activity and Journal import `mock-data.ts`; Session Context shows preview cards; Workouts owns its own calendar                                              | These are previews, not runtime proof. #181–#183 replace them only after owning APIs exist.                                                                                                                           |

The #176 foundation required no database migration. #177 and #178 add their owning migrations and rehearse them against fictional exact predecessors and fresh databases.

## Planned route and read-model ownership

All routes use existing `/api/v1` authentication conventions and user scoping. Agent-managed capture writes accept AgentToken authentication; user-facing reads accept JWT or AgentToken where the existing shared-auth policy allows it. Sensitive token/auth management remains JWT-only.

| Exact planned route                                                     | Canonical shape / result                                            | Implementing child | Runtime status at #178       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------ | ---------------------------- |
| `GET /api/v1/activities`                                                | bounded canonical/legacy list with independent planned/actual dates | #177               | Implemented                  |
| `POST /api/v1/activities`                                               | strict capture input -> canonical detail                            | #177               | Implemented, AgentToken-only |
| `GET /api/v1/activities/:id`                                            | activity, goals, assignments, executions, histories, links          | #177               | Implemented                  |
| `PATCH /api/v1/activities/:id`                                          | expected-revision correction -> immutable revision                  | #177               | Implemented, AgentToken-only |
| `PUT /api/v1/activities/:id/goals`                                      | replace validated goal links with compare-and-swap                  | #177               | Implemented, AgentToken-only |
| `POST /api/v1/activities/:id/assignments`                               | create a date/timezone assignment                                   | #177               | Implemented, AgentToken-only |
| `PATCH /api/v1/activity-assignments/:id/reschedule`                     | reschedule with immutable history                                   | #177               | Implemented, AgentToken-only |
| `POST /api/v1/activities/:id/executions`                                | record actual occurrence independently from plan                    | #177               | Implemented, AgentToken-only |
| `POST /api/v1/activity-executions/:id/corrections`                      | correct execution with immutable history                            | #177               | Implemented, AgentToken-only |
| `POST /api/v1/activities/:id/recurrences`                               | create recurrence root and first revision                           | #177               | Implemented, AgentToken-only |
| `POST /api/v1/activity-recurrences/:id/revisions`                       | append prospective effective-dated revision                         | #177               | Implemented, AgentToken-only |
| `POST /api/v1/activity-recurrences/:id/materialize`                     | bounded deterministic assignment materialization                    | #177               | Implemented, AgentToken-only |
| `GET /api/v1/activity-goals`                                            | retrieve owner-scoped Activity goals                                | #177               | Implemented                  |
| `POST /api/v1/activity-goals`                                           | create a usable goal                                                | #177               | Implemented, AgentToken-only |
| `PATCH /api/v1/activity-goals/:id`                                      | update goal state/label with compare-and-swap                       | #177               | Implemented, AgentToken-only |
| `POST /api/v1/activities/:id/links`                                     | create an ownership-checked canonical link                          | #177               | Implemented, AgentToken-only |
| `GET/POST /api/v1/body-context/concerns`                                | bounded list / strict AgentToken capture                            | #178               | Implemented                  |
| `GET/PATCH /api/v1/body-context/concerns/:id`                           | detail with history / AgentToken correction                         | #178               | Implemented                  |
| `POST /api/v1/body-context/concerns/:id/transitions`                    | explicit management transition with decision audit                  | #178               | Implemented                  |
| `POST /api/v1/body-context/concerns/:id/flares`                         | durable flare before optional pending follow-up                     | #178               | Implemented, AgentToken-only |
| `GET/POST /api/v1/body-context/capabilities`                            | bounded list / strict AgentToken capture                            | #178               | Implemented                  |
| `GET/PATCH /api/v1/body-context/capabilities/:id`                       | detail with history / AgentToken correction                         | #178               | Implemented                  |
| `GET/POST /api/v1/body-context/guidance`                                | bounded sourced list / strict AgentToken capture                    | #178               | Implemented                  |
| `GET/PATCH /api/v1/body-context/guidance/:id`                           | detail with history / AgentToken correction                         | #178               | Implemented                  |
| `POST /api/v1/plan-change-proposals`                                    | server-scoped typed meaningful proposal                             | #178               | Implemented, AgentToken-only |
| `GET/PATCH /api/v1/plan-change-proposals/:id`                           | exact detail / revision invalidating prior approval                 | #178               | Implemented                  |
| `POST /api/v1/plan-change-proposals/:id/approval-statements`            | persist exact user statement relayed by AgentToken                  | #178               | Implemented, no execution    |
| `POST /api/v1/plan-change-proposals/:id/approval`                       | atomically revalidate, approve, and execute exact typed effects     | #178               | Implemented                  |
| `GET /api/v1/daily-context?date=YYYY-MM-DD`                             | `dailyContextReadModelSchema`                                       | #179               | Unimplemented                |
| `POST /api/v1/check-in/questions`                                       | `createCheckInQuestionInputSchema`, canonical dedupe key            | #179               | Unimplemented                |
| `POST /api/v1/check-in/questions/:id/answers`                           | `answerCheckInQuestionInputSchema`                                  | #179               | Unimplemented                |
| `POST /api/v1/check-in/answers/:id/corrections`                         | immutable answer revision / stale failure                           | #179               | Unimplemented                |
| `GET /api/v1/journal`                                                   | source-linked observation feed                                      | #180               | Unimplemented                |
| `POST /api/v1/journal`                                                  | `createJournalObservationInputSchema`                               | #180               | Unimplemented                |
| `GET /api/v1/journal/:id`                                               | entry plus current/history revisions and source refs                | #180               | Unimplemented                |
| `POST /api/v1/journal/:id/corrections`                                  | immutable entry correction                                          | #180               | Unimplemented                |
| `GET /api/v1/journal/weekly-reflection?start=YYYY-MM-DD&end=YYYY-MM-DD` | `weeklyReflectionReadModelSchema`                                   | #180               | Unimplemented                |
| `GET /api/v1/workout-sessions/:id/session-context`                      | `sessionContextReadModelSchema`                                     | #181               | Unimplemented                |
| `GET /api/v1/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`                    | `calendarReadModelSchema`; cross-domain filters may repeat          | #182               | Unimplemented                |

#183 owns the final Activity/Journal/Context/Calendar UI, agent operating examples, and integrated acceptance. It does not become the fallback owner for missing runtime obligations above.

## Contract evidence boundary

The #176 fixtures prove shared-schema semantics and pure retry/transition policy. #177 adds fictional-database proof for Activity persistence. #178 adds registered body-context API, provenance/readback, immutable history, flare ordering, explicit approval, typed atomic execution, migration, account-erasure, and genuine two-process WAL race proof. It does not prove #179–#183 runtime, browser UI, production data compatibility, or deployment.
