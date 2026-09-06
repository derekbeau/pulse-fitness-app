# Workout Domain Conventions

This document defines the prototype workout data model used across templates, sessions, mock data, and future API contracts.

## Template Structure

Workout templates represent repeatable plans that users can schedule and launch into live sessions.

- `name`: concise program label such as "Upper Push" or "Full Body"
- `description`: short summary of training intent
- `tags`: searchable labels such as `strength`, `gym`, `push`, or `beginner-friendly`
- `sections`: ordered blocks that always appear in training order

Template sections use this fixed sequence:

1. `warmup`
2. `main`
3. `cooldown`
4. `supplemental` — optional add-on exercises; tracked identically to other sections but only shown in history/receipts if at least one set was completed

Each section contains an ordered `exercises` array. Preserve order exactly as authored; the UI should not reorder template exercises automatically.

## Scheduled Workout Detail Surface

The scheduled-workout detail page should mirror template-detail exercise rendering and only add scheduling controls.

- Exercise rows render through shared `WorkoutExerciseCard` in `readonly-scheduled` mode.
- Header controls are schedule-specific: scheduled date, source template link, `Start workout`, `Reschedule`, and `Cancel`.
- `programmingNotes` shown on scheduled cards comes from the scheduled snapshot exercise row.
- Reserve a page-level `bannerSlot` area above the header for future scheduled-workout warning banners. Leave it empty unless a warning feature explicitly populates it.

### Scheduled Workout Structural Edits

Scheduled-workout structural edits are plan-time snapshot edits and never mutate the source
template.

- `PATCH /api/v1/scheduled-workouts/:id/reorder`: reorder snapshot exercises while preserving the
  existing exercise set.
- `PATCH /api/v1/scheduled-workouts/:id/exercises`: patch per-exercise snapshot fields
  (`supersetGroup`, `section`, `tempo`, `restSeconds`, `programmingNotes`).
- `PATCH /api/v1/scheduled-workouts/:id/exercise-sets`: patch per-set target fields for one
  snapshot exercise, including `remove: true` and add-by-setNumber behavior.

Plan vs live run invariant:

- Scheduled workouts are the editable plan snapshot that seeds session start.
- Once a session is started/linked for that schedule, the session is the live run and further live
  edits must use workout-session endpoints (for example set logging/deletion/corrections), not
  scheduled-workout structural mutation routes.

## Three-layer notes model

Workout exercise note content is split into three channels and should stay separate in API,
storage, and UI rendering.

| Field              | Source                                              | Mutable after session-start? | Rendered as                    |
| ------------------ | --------------------------------------------------- | ---------------------------- | ------------------------------ |
| `programmingNotes` | Template, snapshotted on schedule or session-create | No                           | Read-only "programming" block  |
| `agentNotes`       | Agent PATCH between schedule and session-start      | No (client)                  | Read-only "✨ For today" block |
| `notes` (user)     | User textarea on session                            | Yes                          | User textarea                  |

Lifecycle rules:

- Template edit before scheduling applies to future snapshots automatically.
- Template edit after scheduling does not mutate existing snapshots; scheduled detail computes
  `templateDrift` and shows the drift banner.
- Cancelled linked sessions clear `scheduled_workouts.sessionId` so the schedule is startable again
  from the same snapshot.
- Reschedule marks existing `agentNotesMeta.stale = true` when the date shift diverges by more than
  2 days from `scheduledDateAtGeneration`.

### Scheduled Start Lifecycle

`POST /api/v1/workout-sessions` accepts exactly one source selector:

1. `scheduledWorkoutId`: materialize that owned snapshot.
2. `templateId` or AgentToken `templateName`: create an independent template session.
3. `name` without either selector: create an independent ad-hoc session.

Template and ad-hoc starts never claim a schedule, including the explicit “Create another
anyway” action. No same-day template matching or post-create auto-link is performed. Missing,
malformed, foreign and nonexistent scheduled selectors cannot fall through to a template start.

List, calendar and scheduled detail use `buildScheduledStartPayload`; dashboard links to scheduled
detail. Scheduled requests omit `templateId` and `sets`, including after schema validation.
The date-authority hook supplies the current local day and is rechecked after confirmations.
The API intentionally retains `schedule.date`; `startedAt` records when the early start occurs.
If local midnight passes or date authority locks while a confirmation is open, the pending start
is aborted. Browser timezone is never used to select a schedule.

Session creation, all set inserts and reverse schedule linking are one transaction. Both link
columns must agree. A live linked session returns `409 SCHEDULED_WORKOUT_ALREADY_STARTED`;
a competing transaction returns `409 SCHEDULED_WORKOUT_LINK_CONFLICT`. A cancelled/deleted
link is replaced atomically only if it still has the observed value. Failed inserts/links preserve
that old link and leave no new session or sets. Stored prescriptions are validated before
creation; invalid targets return `400 INVALID_SCHEDULED_SNAPSHOT` with no writes. Cancellation permits another start of the same
snapshot without changing its source rows.

Scheduled materialization copies exact source set IDs, identity/tracking snapshots, all targets
(including nulls), section/order/supersets and the three note channels. The session response exposes
`scheduledWorkoutId`, source exercise/set IDs, immutable facts and nullable targets. Migration
`0060_scheduled_session_prescriptions` adds nullable exercise prescription JSON for tempo/rest
and source exercise identity, including exercises with zero source sets. It does not backfill
historical sessions. Legacy responses remain readable without these optional fields.

Active rendering uses session snapshot names, tracking, notes, sets and prescriptions. Scheduled
sessions never union in template supplemental exercises or replace explicit null notes/tempo/rest
with template values. Null rest disables the automatic rest timer; time estimates count it as zero
without changing the prescription. Later live changes to set order/supersets remain session data.

Stale snapshot exercises return `409 STALE_SNAPSHOT_EXERCISES`. The explicit force confirmation
reuses the same scheduled selector and skips only stale exercises, returning
`STALE_EXERCISES_SKIPPED`. Source completeness applies to every non-skipped source set.
An empty snapshot can start an empty session; it never silently loads a template.

## Completed Session Detail Surface

The completed-session detail page should render each exercise through shared `WorkoutExerciseCard` primitives in `readonly-completed` mode.

- Exercise rows render through shared `WorkoutExerciseCard` in `readonly-completed` mode.
- Completed-mode set rows must show logged values (weight/reps/seconds/distance) and must not fall back to template target values.
- Session-level composition (history button, comparison blocks, correction editors, and exercise-note markdown) should be injected via card slots from `session-detail.tsx`, not reimplemented as a separate card layout.
- `programmingNotes` on completed cards comes from the session snapshot map (`workout_sessions.exerciseProgrammingNotes`) and is rendered by the primitive `ProgrammingNotesBlock`.

## Exercise In Template

Each template exercise stores prescription data, not completed performance.

- `exerciseId`: reference to the shared exercise catalog entry
- `sets`: planned number of sets
- `reps`: prescription string such as `8-10`, `12`, `6/side`, or `45 sec`
- `tempo`: 4-digit notation such as `3110`
- `restSeconds`: planned rest period between working sets
- `supersetGroup`: nullable group id (for example `superset-a`); contiguous exercises with the same id are rendered as one superset card
- `cues`: situational prompts scoped to this template/session context
- `badges`: quick-read metadata for chips and filtering

Durable technique coaching is stored on the exercise definition itself:

- `exercise.formCues`: timeless movement cues that should apply anywhere that exercise appears
- `templateExercise.cues`: program-specific reminders for this plan only (for example, "week 1 keep RPE 7")

Example shape:

```ts
{
  exerciseId: 'incline-dumbbell-press',
  sets: 3,
  reps: '8-10',
  tempo: '3110',
  restSeconds: 90,
  supersetGroup: 'superset-a',
  cues: ['Week 1 keep RPE 7'],
  badges: ['compound', 'push']
}
```

## Session Structure

A workout session is the user-specific execution record of a template.

- `templateId`: source template reference
- `status`: `scheduled`, `in-progress`, `paused`, `cancelled`, or `completed`
- `startedAt`: ISO timestamp for session start
- `completedAt`: ISO timestamp for session finish; optional until complete
- `duration`: total elapsed minutes for the session
- `timeSegments`: ordered timing windows where each segment has `start` ISO timestamp, nullable `end`, and a `section` (`warmup`, `main`, `cooldown`, or `supplemental`)
- `sectionDurations`: derived server response field with per-section elapsed milliseconds:
  `{ warmup, main, supplemental, cooldown }`

### Section Ordering And Supplemental Fallback

- API response ordering: `GET /api/v1/workout-sessions/:id` must return both `sets[]` and `exercises[]` ordered as `warmup → main → supplemental → cooldown → null-section orphans → unknown`. This is enforced by `sectionRank` in `apps/api/src/routes/workout-sessions/store.ts`.
- Unknown section values always sort to the end. If a new section type is introduced, add it to `SECTION_ORDER` in `apps/api/src/routes/workout-sessions/store.ts` so it sorts in the intended position.
- Session snapshot rule: section membership is snapshotted at session creation via `buildInitialSessionSets` in `apps/api/src/routes/workout-sessions/session-set-utils.ts`. Later template edits do not backfill an in-flight session. To modify upcoming workouts, edit the scheduled-workout snapshot endpoints instead of the template source.
- Legacy/template-only supplemental UI fallback: `buildTemplateFromSession` in `apps/web/src/pages/active-workout.tsx` unions in fallback-template supplemental exercises when the session snapshot has zero supplemental rows.
- Logging against a fallback-sourced supplemental exercise writes a real supplemental session-set row through the existing bulk `PATCH /api/v1/workout-sessions/:id` path; once logged, that row is part of the session snapshot.
- Warmup/main/cooldown are not unioned from fallback templates. If those sections are empty in a session response, treat it as data corruption, not expected product behavior.

Timer transition rules:

- `PATCH /api/v1/workout-sessions/:id` transitions to `in-progress` from `scheduled` or `paused` must provide `activeSection` so the server can open a section-specific segment.
- Status changes from `in-progress` to `paused` close the currently open segment.
- Status changes to `completed` auto-close any open segment at the completion timestamp before computing duration.
- Section switches while already `in-progress` are done via `PATCH /api/v1/workout-sessions/:id/section-timer` (`{ section, action: 'start' | 'pause' }`), not by re-sending `status: 'in-progress'` with a different section.
- `sectionDurations` intentionally includes only closed segments; open segment live ticking is client-side from the active segment start time.

Active workout timing UI:

- The active-workout page renders one timer control per section header (`Start`, `Resume`, or `Pause`).
- The currently open section segment is the single source of truth for "live" state; the client must not maintain a separate active-section store.
- Section elapsed labels show `sectionDurations` plus a client-side 1s live tick only for the open section.
- The top "Total time" stat is the sum of all section elapsed labels.

Completed sessions should also store exercise-level set logs and post-workout feedback.

Session exercise metadata should preserve `supersetGroup` values so completed receipts and history can render grouped supersets consistently.

Set removal is status-scoped: in-progress/paused sessions remove sets through `DELETE /api/v1/workout-sessions/:sessionId/sets/:setId` (with server-side renumbering), while completed sessions are edited only through `PATCH /api/v1/workout-sessions/:id/corrections`.

### Session Exercise Notes Layers

Session exercises intentionally keep three separate note channels:

- `programmingNotes` (read-only): a snapshot of `template_exercises.notes` taken when the session starts from a template. This does not change if the template is edited later.
- `agentNotes` + `agentNotesMeta` (read-only): snapshot-time session-specific guidance authored through scheduled-workout enrichment (`author`, `generatedAt`, `scheduledDateAtGeneration`, `stale`).
- user exercise notes (editable): the workout-time notes entered during the session via the existing exercise-notes flow.

Do not merge these layers into one textarea; template prescription context, agent context, and user observations must remain distinct.

When a completed session is saved as a new template (`POST /api/v1/workout-sessions/:id/save-as-template`), only `programmingNotes` round-trips onto `template_exercises.notes`. Session-specific note channels (user exercise notes, and agent notes when present) must be dropped so transient workout context is not promoted into reusable programming.

### Cancel Behavior For Scheduled Starts

When a session transitions to `cancelled`, linked schedules are unclaimed but preserved:

- Clear `scheduled_workouts.sessionId` for the linked scheduled workout.
- Preserve the cancelled session row for history.
- Preserve scheduled snapshot rows (`scheduled_workout_exercises`, `scheduled_workout_exercise_sets`) so the workout can be started again later.

## Superset Grouping

- A superset is represented by assigning the same non-null `supersetGroup` id to 2+ exercises in the same section.
- Grouping action: set selected exercises to a shared `supersetGroup` id.
- Ungrouping action: set selected exercises to `supersetGroup: null`.
- Rendering rules:
  - Use a single shared container for each contiguous superset group (no nested visual cards).
  - Apply a deterministic accent left border per group id.
  - Keep grouped exercises separated with internal dividers while still inside one container.
  - Collapse/expand the whole superset as one unit.

## Set Logging

Each logged set captures what actually happened during the session.

- `weight`: optional numeric load
- `reps`: completed reps or seconds performed
- `completed`: boolean completion flag
- `timestamp`: ISO timestamp for when the set was recorded

Recommended additional fields:

- `setNumber`: preserve set order within the exercise

## Exercise Types

Every exercise in the shared catalog belongs to exactly one category:

- `compound`: multi-joint strength lifts
  Example: barbell bench press, high-bar back squat, Romanian deadlift
- `isolation`: single-muscle or single-joint emphasis
  Example: cable lateral raise, leg extension, rope triceps pushdown
- `cardio`: conditioning-focused efforts
  Example: row erg, air bike, jump rope
- `cardio_flow`: continuous duration-based cardio, yoga, flow, and walk efforts
  Example: Yoga Flow, Peloton Zone 2, recovery walk
- `mobility`: range-of-motion or tissue-prep work
  Example: couch stretch, world's greatest stretch, banded shoulder external rotation

## Badge Types

Badges are lightweight descriptors used in template chips, filters, and future summary cards.

Supported badge values:

- `compound`
- `isolation`
- `push`
- `pull`
- `legs`
- `cardio`
- `mobility`

Badges may overlap. For example, a lat pulldown can carry `compound` and `pull`, while a couch stretch can carry `mobility`.

## Feedback Questions

Completed sessions collect a short reflection:

- `energy`: required 1-5 score
- `recovery`: required 1-5 score
- `technique`: required 1-5 score
- `notes`: optional freeform comments

Use whole-number scores only. Treat `1` as poor and `5` as excellent.

## Tempo Notation

Tempo uses four digits in this order:

1. eccentric
2. pause at stretch
3. concentric
4. pause at lockout

Example: `3110` means `3` seconds down, `1` second pause, `1` second up, `0` second pause before the next rep.

## UI Contrast Rule

Workout UI sometimes uses accent-colored cards for schedule, readiness, or completion states. Any text placed on accent-colored backgrounds must use a dark foreground such as `--color-on-accent` or an equivalent dark text token. Do not rely on the default theme foreground on pastel accent surfaces.
