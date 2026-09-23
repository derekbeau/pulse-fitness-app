# Pulse Activity, Journal, Body Context, and Calendar — Consolidated Planning Proposal

**Status:** Implementation kickoff authorized. See `../implementation/activity-journal-release.md` for checkpoint scope and approval gates. Epic #175 and children #176–183 track the release. Production deployment/data changes and merge remain gated.

## 1. Product outcome

Pulse should turn a natural conversation or voice capture into a faithful record, relevant follow-up, grounded daily context, a weekly reflection, and a better next plan:

> voice capture → record → follow-up → daily facts → weekly reflection → next plan

The initial experience is agent-managed, like food logging: no manual-entry UI. The agent may correct grammar and typos but must preserve the user's meaning, timing, uncertainty, and provenance. Unknown is unknown, not a negative finding. Pulse must not manufacture diagnoses, healing, recovery, clearance, or medical causality.

## 2. Fixed product contract

### Activities and workouts

An **Activity** is movement outside a structured workout, including a five-minute PT item. Activities can support conditioning, fat loss, PT, mobility, fun, family/kids, or multiple goals, with future-compatible dual rewards. Full sports management is out of scope.

A prescribed activity has a planned identity and a planned/assigned day. It may be rescheduled without losing that identity or revision history. The actual record keeps its own execution date/time and outcome; planned and actual records are linked, not conflated. This supports “the Tuesday mobility item happened Thursday,” retrospective capture (“did five minutes of PT this morning, log it”), and agent suggestions accepted and added on demand. Recurrences and revisions must preserve prior assignments rather than silently rewriting history.

Structured workouts remain a separate record type. Combined workout and activity load is available for planning and review; co-occurrence is not proof that load caused a symptom.

### Body concerns and guidance

Body context covers injuries, limitations, restricted motion, recurring tightness, movement confidence, goals, and maintenance. A concern's current symptoms are distinct from its management/recovery state. Maintenance does not erase history.

The source distinction is mandatory: clinician-authored material, user-relayed clinician guidance, user observation, and agent-generated suggestion must remain distinguishable and linked to the relevant concern or capability. The agent organizes supplied notes/documents/images and may suggest independently, but may not invent missing instructions or present its suggestion as prescribed. Ask a focused clarification only when ambiguity materially affects safe use.

A reported flare-up is recorded immediately with only necessary targeted questions. A symptom report alone does not authorize a silent meaningful plan change. The agent proposes meaningful changes to upcoming activities/workouts for explicit user approval. Explicit routine instructions such as “move my walk to tomorrow” may be executed directly, retaining activity identity and rescheduling history. No automatic diagnosis, inferred clearance, or pain-causality claim is allowed.

### Journal and daily check-in

The Journal is limited to health, nutrition, movement, injuries, and meaningful daily observations. It is not a broad personal diary and must not copy every activity or workout log; entries link to source facts, workout feedback, concerns, and clinician provenance. Immutable history is preserved.

A brief daily check-in is canonical inside Pulse, not only in chat/session memory. In any thread, “check context and ask questions” retrieves the same app state: pending questions, answers, recent observations, planned and completed activities, workouts, nutrition, current body concerns, and relevant guidance. Questions are dynamically generated from grounded context, relevant to the current situation, and deduplicated across threads. An answered question is not repeated. Answers, corrections, follow-up state, source, time, and provenance links are saved in a resumable shared record; concurrent threads must not create duplicate questions or conflicting updates. The check-in grounds a weekly reflection in recorded daily facts, never unaided recall of the week.

### Session Context

Session Context must be actionable and relevant rather than generic or falsely reassuring. The existing Recent Training, Recovery Status, Active Injuries, and Training Phase cards are inventory, not a requirement to preserve their layout or labels. Redesign this surface around “What matters today,” replacing preview/mock claims with relevant source-linked facts; do not introduce unsupported recovery or training-phase claims merely to fill an old card. “What matters today” includes a brief positive session focus (a capability being developed or a recorded improvement) alongside applicable cautions, current-body guidance, and relevant concerns. Focus and guidance must show stale/source provenance where applicable; missing data is shown as missing, not symptom-free or cleared. Concerns remain tracked even when irrelevant to this session.

### Unified Calendar

The approved navigation decision is a top-level **Calendar** with calendar and agenda views, cross-domain filters, and one shared underlying data set. It combines planned and completed workouts/activities, journal observations, body-context events where appropriate, and daily nutrition summaries including calories and macros. Retain the existing Workouts calendar as a workout-only view over the same records, not a separately maintained schedule. View density and interaction details remain design work; domain records are never duplicated.

## 3. Responsibility and authority

The **agent** interprets conversation/voice, extracts faithful records, asks relevant unanswered questions, links source facts, proposes suggestions and meaningful plan changes, and executes explicit routine instructions. The **app/backend** owns persistence, canonical identity, date/time semantics, recurrence/revision history, source links, immutable records, authorization, idempotency, conflict handling, and derived calendar/load/context reads. The user remains the authority for meaning, corrections, approval of meaningful changes, and clinician-originated facts they relay. No reminder time, proactive schedule, or cron behavior is approved.

Every write must carry ownership and provenance and be safe under retries and concurrent threads. A cross-thread check-in update should atomically claim/answer the same canonical question or observation rather than create a duplicate. Stale revisions must fail visibly and preserve the prior source record.

## 4. Proposed implementation sequence (provisional issue grouping)

1. **Canonical domain contracts and ownership.** Define shared concepts and links for activities, planned-vs-actual execution, concerns/guidance, journal observations, questions/answers, provenance, revisions, and actor ownership. Outcome: one vocabulary and source-of-truth map before UI work.
2. **Activity lifecycle.** Persist agent-created activities, prescribed-day assignment, rescheduling, recurrence/revision history, actual execution date/time, retrospective capture, goal links, and workout separation. Acceptance: Tuesday-planned/Thursday-done and five-minute PT remain queryable without duplication.
3. **Body concerns, guidance, and flare handling.** Persist source class, current state versus maintenance, history, stale markers, targeted follow-up, and proposal-versus-explicit-execution authority. Acceptance: flare is immediate; meaningful change requires approval; explicit routine move executes idempotently.
4. **Canonical daily context and check-in concurrency.** Build the shared retrieval/write path for questions, answers, observations, activities, workouts, nutrition, concerns, guidance, ownership, and provenance. Acceptance: any thread resumes the same check-in, deduplicates questions, and handles stale/conflicting writes safely.
5. **Journal and weekly grounding.** Link meaningful health/nutrition/movement observations to source facts and workout feedback, then produce daily-grounded weekly reflection without copying logs or requiring recall. Acceptance: source links and immutable history survive correction and repeated generation.
6. **Planning and Session Context.** Derive combined load and relevant current-body context, including positive focus, cautions, guidance, and stale/missing provenance. Acceptance: context is session-specific and never implies diagnosis, causality, or clearance.
7. **Calendar read model and navigation.** Expose one cross-domain calendar/agenda read surface with filters, calories/macros, planned/completed distinctions, and links back to canonical records; retain the workout-only view. Acceptance: each event appears once and a reschedule does not rewrite actual history.
8. **UI, agent operating examples, and end-to-end verification.** Replace mock Activity/Journal and preview Session Context surfaces only after their contracts exist; add voice/conversation flows, responsive calendar views, persistence/readback, concurrency, error, stale-source, and populated-fixture checks. No production deployment or proactive reminder is included.

Dependencies run in order where contracts are required, while UI exploration may proceed against agreed shapes. Do not repeat UI slices that lack backend support or claim a feature complete when it only renders mock data.

## 5. Remaining design choices

Nonblocking choices include final concern vocabulary/labels, confidence/provenance presentation, calendar density/filter ordering, and the exact weekly reflection wording. Consequential gaps to resolve before freezing implementation contracts are the final lifecycle transitions for concerns, the authoritative recurrence/revision semantics, and the exact conflict policy for simultaneous corrections. These choices must not weaken the fixed source, approval, history, or no-diagnosis rules. Reminder timing and delivery remain deliberately unapproved.

## 6. Explicit non-goals

No initial manual-entry UI; broad personal reflection; duplicated routine logs or symptom sources; automatic diagnoses; inferred healing/clearance; unsupported pain-causality claims; erasure of maintenance history; unaided weekly recall; full sport analytics or a full sports module; or production migrations, configuration, cron, deployment, and external side effects as part of this planning record.

## 7. Current repository grounding

Current code has `/activity` and `/journal` routes but both are preview/mock-driven; Activity state is page-local and Journal exports static data. The API has a basic `journal_entries` table and existing source-linked feedback/context routes, while agent context already reads workouts, nutrition, habits, schedules, and body-progress analytics. `/workouts` owns a workout-specific calendar; navigation has no top-level Calendar. Existing workout conventions distinguish scheduled snapshots from live sessions, preserve completed history, and keep note channels separate. These are constraints and reuse points, not proof that the proposed cross-domain persistence exists.

## Published GitHub issue map

The approved proposal is tracked by parent epic [#175](https://github.com/derekbeau/pulse-fitness-app/issues/175) and implementation children [#176](https://github.com/derekbeau/pulse-fitness-app/issues/176), [#177](https://github.com/derekbeau/pulse-fitness-app/issues/177), [#178](https://github.com/derekbeau/pulse-fitness-app/issues/178), [#179](https://github.com/derekbeau/pulse-fitness-app/issues/179), [#180](https://github.com/derekbeau/pulse-fitness-app/issues/180), [#181](https://github.com/derekbeau/pulse-fitness-app/issues/181), [#182](https://github.com/derekbeau/pulse-fitness-app/issues/182), and [#183](https://github.com/derekbeau/pulse-fitness-app/issues/183), in sequence. The exact mapping and dependency graph are retained in `/Users/meridian/Projects/qa-reports/pulse-activity-journal-planning/mapping.json`. This section records planning coordination only; it makes no product or implementation change.
