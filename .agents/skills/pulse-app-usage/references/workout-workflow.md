# Workout Workflow (Pulse)

Pulse uses a **Template → Session → Set** model, all managed through `/api/v1/*`.

## Template Lifecycle

Templates define the structure: sections with exercises, sets, reps, and rest times. The `reps` field accepts a number (e.g., `12`) or a string range (e.g., `"8-12"`).

### Section Types

Templates use up to four section types, always rendered in this order:

1. **`warmup`** — mobility, activation, and low-intensity prep work before the main block.
2. **`main`** — the primary working exercises (strength, hypertrophy, skill work).
3. **`cooldown`** — stretching, breathing, or light movement to close the session.
4. **`supplemental`** — optional add-on exercises (accessory work, rehab drills, ATG movements). Tracked with the same set-level inputs as other sections, but only shown in history/receipts if at least one set was actually completed. Use this for exercises that are beneficial but skippable depending on time/energy.

Section names are normalized by keyword during template creation: "warm" → warmup, "cool" → cooldown, "supplemental" / "add-on" → supplemental, else → main.

```
POST /api/v1/workout-templates/
```

- Unknown exercise names are auto-created with placeholder metadata.
- Section type values must be sent exactly as listed above (`warmup`, `main`, `cooldown`, `supplemental`). There is no keyword normalization — send the exact enum value.
- Read `data.newExercises` from the creation response to identify exercises that need enrichment.
- `newExercises[*].possibleDuplicates` hints at potential duplicate exercises.

### Exercise Enrichment

After template creation, enrich each new exercise via `PATCH /api/v1/exercises/:id`:

- `muscleGroups`, `equipment`, `category`, `trackingType`
- `instructions`, `formCues`, `tags`

### Exercise Dedup Guard

When creating exercises via `POST /api/v1/exercises/`:

1. If `{ "data": { "created": false, "candidates": [...] } }` is returned, inspect candidates.
2. Only retry with `force: true` when you're certain this is a genuinely new exercise.
3. Prefer reusing an existing exercise over creating near-duplicates.

### Form-Cue Routing

- `formCues` on exercises — durable, persists to `exercises.formCues`.
- `cues` on template exercises — template-scoped, persists to `template_exercises.cues`.
- If only `cues` are provided, timeless technique cues auto-promote to `exercises.formCues`; program/timeline-specific cues (e.g., references to weeks/RPE blocks) stay template-scoped.

## Session Lifecycle

Sessions are live instances of a template (or standalone).

```
POST /api/v1/workout-sessions/
{ "templateId": "<id>" }   // or { "name": "Ad hoc Session" }
```

### Status Transitions

| From               | To          | Effect                                                       |
| ------------------ | ----------- | ------------------------------------------------------------ |
| in-progress        | paused      | Closes current open time segment                             |
| paused             | in-progress | Appends new open time segment                                |
| in-progress/paused | cancelled   | Closes any open segment, keeps session for history           |
| in-progress/paused | completed   | Closes final segment, computes duration from summed segments |

### Time Segments

Sessions automatically track time via segments (start/stop pairs). For manual correction:

```
PATCH /api/v1/workout-sessions/:id/time-segments
```

Full segment array replacement — provide the complete corrected list.

### Session Exercise Management

During an active session via `PATCH /api/v1/workout-sessions/:id`:

- **Add exercises**: `addExercises: [{ name, sets, reps, section }]`
- **Remove unstarted exercises**: `removeExercises: [exerciseId]` — returns `409 WORKOUT_SESSION_EXERCISE_HAS_LOGGED_SETS` if exercise has completed sets.
- **Reorder exercises**: `reorderExercises: [exerciseId, ...]`
- **Swap exercise**: `PATCH /api/v1/workout-sessions/:id/exercises/:exerciseId/swap`

### Set Corrections (Completed Sessions Only)

```
PATCH /api/v1/workout-sessions/:id/corrections
{ "corrections": [{ "setId": "...", "weight": 185, "reps": 8, "rpe": 7 }] }
```

- Only works on completed sessions (409 on other statuses).
- Does not change session status, `completedAt`, or duration.

## Scheduled Workouts

Schedule templates on calendar dates for planning ahead:

```
POST /api/v1/scheduled-workouts/
GET /api/v1/scheduled-workouts/?from=YYYY-MM-DD&to=YYYY-MM-DD
```

## Editing Rules

- Prefer updating templates for future programming changes.
- Only correct completed sessions to fix data entry errors.
- When creating templates, always search existing exercises first to avoid duplicates.

## Quick Sanity Checklist

1. Verify the session/template loads in the Pulse UI.
2. Confirm exercise names match between template and session sets.
3. If session was completed, verify `completedAt` and duration are set.
4. Check that new exercises have been enriched (not left with placeholder metadata).
