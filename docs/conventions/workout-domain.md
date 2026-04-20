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
- `programmingNotes` shown on scheduled cards comes from the resolved template exercise data.
- Reserve a page-level `bannerSlot` area above the header for future scheduled-workout warning banners. Leave it empty unless a warning feature explicitly populates it.

## Completed Session Detail Surface

The completed-session detail page should render each exercise through shared `WorkoutExerciseCard` primitives in `readonly-completed` mode.

- Exercise rows render through shared `WorkoutExerciseCard` in `readonly-completed` mode.
- Completed-mode set rows must show logged values (weight/reps/seconds/distance) and must not fall back to template target values.
- Session-level composition (history button, comparison blocks, correction editors, and exercise-note markdown) should be injected via card slots from `session-detail.tsx`, not reimplemented as a separate card layout.
- `programmingNotes` on completed cards comes from the session-exercise snapshot (`session_exercises.programmingNotes`) and is rendered by the primitive `ProgrammingNotesBlock`.

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
  `{ warmup, main, cooldown, supplemental }`

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

### Session Exercise Notes Layers

Session exercises intentionally keep two separate note channels:

- `programmingNotes` (read-only): a snapshot of `template_exercises.notes` taken when the session starts from a template. This does not change if the template is edited later.
- user exercise notes (editable): the workout-time notes entered during the session via the existing exercise-notes flow.

Do not merge these two layers into one textarea; template prescription context and user observations must remain distinct.

When a completed session is saved as a new template (`POST /api/v1/workout-sessions/:id/save-as-template`), only `programmingNotes` round-trips onto `template_exercises.notes`. Session-specific note channels (user exercise notes, and agent notes when present) must be dropped so transient workout context is not promoted into reusable programming.

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
