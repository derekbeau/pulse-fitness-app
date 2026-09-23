# Activity and Journal agent operating guide (#183)

Pulse captures Activity, Journal, body context, and check-in writes through AgentToken routes. The authenticated token supplies the subject and actor; never put a user id or actor in a write body. JWTs may read these records, and authenticated user approval may execute a proposal. Keep every `idempotencyKey` stable only for an exact replay. Copy current owned source `id` and `revisionId` values from `GET /api/v1/daily-context?date=YYYY-MM-DD`, or another registered owned read, before a new linked write. Examples below are fictional. Send `Authorization: AgentToken <token>` for agent writes, `Authorization: Bearer <jwt>` for direct user approval.

## Capture from conversation or voice transcription

A conversation or voice transcription may say, “I did five minutes of PT this morning. My shoulder felt tight afterward; I'm not sure why.” Correct grammar, not meaning. Preserve the reported local date and time, the uncertainty, and the source. If time or timezone is material and missing, ask rather than invent it.

1. `POST /api/v1/activities` with `kind`, `name`, `goalIds`, `structuredWorkoutSessionId`, `source`, and `idempotencyKey`. Use `source.class: user_observation`, a conversation/source id and label, `sourceOccurredAt`, `capturedAt`, `uncertainty: unknown`, and a factual `freshness`. The server supplies `capturedBy`.
2. `POST /api/v1/activities/:id/executions` with `actualOccurredAt`, subject-local `actualLocalDate`, `timeZone`, `durationMinutes: 5`, `outcome: completed`, `assignmentId: null` if unassigned, the original source, and a fresh key. Read `GET /api/v1/activities/:id` to verify the distinct canonical Activity and execution ids.
3. If the observation is meaningful beyond the Activity log, read a current owned source revision from `GET /api/v1/daily-context?date=YYYY-MM-DD`, then `POST /api/v1/journal` with `localDate`, `title`, `content`, `category: health`, `sourceReferences: [{kind: "activity_execution", id: "<execution id>", revisionId: "<current source revision>"}]`, source provenance, and a fresh key. Journal source input omits `capturedAt` and `capturedBy`; Pulse supplies them. `GET /api/v1/journal/:id` confirms the source link, uncertainty, and immutable history. Use `agent_suggestion` for an agent's own suggestion; never label it `clinician_authored`. `user_relayed_clinician` records a user's relay, not direct clinician authorship.

## Grounded follow-up and cross-thread resume

Read `GET /api/v1/daily-context?date=YYYY-MM-DD`. Ask only its `pendingQuestions`, and avoid asking one whose answer is already in `currentAnswers`. When a grounded question is needed, `POST /api/v1/check-in/questions` with `localDate`, `semanticTopic`, `prompt`, current owned `sourceReferences`, `followUpQuestionId: null`, and an idempotency key. A second AgentToken in another thread reads the same daily context and may repeat the same semantic question/source set with its own key; the registered endpoint resumes one canonical question. Answer through `POST /api/v1/check-in/questions/:id/answers` with the exact `expectedQuestionRevisionId`, `expectedAnswerRevision`, `state`, `source`, and key. `unknown` or `skipped` has no `value` and is distinct from an explicit `denied` symptom finding. Read the question and daily context again rather than relying on thread memory.

## Explicit routine reschedule

For “move my walk to tomorrow,” read `GET /api/v1/activities/:id`, select the exact planned assignment, and `PATCH /api/v1/activity-assignments/:id/reschedule` with `expectedRevision`, new `plannedLocalDate`, `timeZone`, `reason`, and idempotency key. This direct primitive records revision history. It does not move any completed execution or change the canonical Activity id. Calendar assignment/execution ids are occurrence ids, so resolve their `activityId` before opening `/activity/:id`.

## Flare first, proposed plan change second

For a reported flare, `POST /api/v1/body-context/concerns/:id/flares` with `occurredAt`, matching `localDate` and `timeZone`, the user's `observation`, provenance, optional focused `followUpQuestions`, and key. Read the concern back before considering a plan change. The flare does not move a schedule. An unanswered safety question may remain pending.

If the user has not directly instructed a routine move, `POST /api/v1/plan-change-proposals` with a typed `activity_assignment_reschedule` or `scheduled_workout_reschedule` effect, exact expected target revision, summary, current body-context `sourceReferences`, and key. `GET /api/v1/plan-change-proposals/:id` reports `proposed` with `approval: null` until approval. A trusted chat relay may use `POST /api/v1/plan-change-proposals/:id/approval-statements` with the exact `proposalRevisionId`, `targetRevisionFingerprint`, verbatim user statement, source id/time, and key. Statement capture alone does not execute. `POST /api/v1/plan-change-proposals/:id/approval` with the same revision/fingerprint and statement id executes only after the existing direct-JWT or authorized trusted-relay policy revalidates the target. Read the proposal and Calendar after execution. `approvedBy` remains the user; `relayedBy` separately names the AgentToken or is null for direct JWT approval. The statement is an attestation of the outside chat, not independent proof of it.

## Weekly grounding and session-specific planning

Read `GET /api/v1/journal/weekly-reflection?start=YYYY-MM-DD&end=YYYY-MM-DD` and cite its saved `facts` separately from explicit `gaps`. An unstarted scheduled workout is not actual workout coverage. For the next workout read `GET /api/v1/workout-sessions/:id/session-context`; for a date without a selected session use `GET /api/v1/planning/what-matters?date=YYYY-MM-DD`. Keep `positiveFocus`, relevant and tracked irrelevant concerns, uncertain relevance, guidance, source provenance/freshness, native workload durations, and `missingInputs` intact. `same_local_date` is co-occurrence only.

## Safe boundary

Do not diagnose, infer clearance or healing, assign pain causality, fabricate load/recovery scores, invent sleep or a training phase, create reminders or cron, place an LLM or voice recorder inside Pulse, or send the user to a manual Activity/Journal capture form. `GET /api/v1/context` and `GET /api/v1/context/feedback` retain their separate workout-feedback ownership.
