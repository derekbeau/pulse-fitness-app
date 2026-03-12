# Pulse App Usage Skill

## Workout Workflow

Use this flow when an agent creates exercises/templates and then logs workout sessions.

1. Search first: call `GET /api/agent/exercises/search?q=<name>&limit=<n>`.
2. Create with dedup guard: call `POST /api/agent/exercises`.
3. If the response is `{ "data": { "created": false, "candidates": [...] } }`, inspect candidates and only retry with `force: true` when a true new exercise is required.
4. Create template with `POST /api/agent/workout-templates`.
5. Read `data.newExercises` from template creation response.
6. For each new exercise id in `newExercises`, call `PATCH /api/agent/exercises/:id` to enrich:
   - `muscleGroups`
   - `equipment`
   - `category`
   - `trackingType`
   - `instructions`
   - `formCues`
   - `tags`
7. Start session via `POST /api/agent/workout-sessions` and log progress via `PATCH /api/agent/workout-sessions/:id`.

## Notes

- New exercises auto-created during template creation intentionally use placeholder metadata (`muscleGroups: []`, `equipment: ""`, `instructions: null`) until enriched.
- Template creation is non-blocking: possible duplicate hints are returned in `newExercises[*].possibleDuplicates`.
- Workout session status transitions:
  - `in-progress -> paused`: closes the current open `timeSegments` entry.
  - `paused -> in-progress`: appends a new open `timeSegments` entry.
  - `in-progress|paused -> cancelled`: closes any open segment and keeps the session row for history.
  - `in-progress|paused -> completed`: closes the final segment and computes duration from summed segment time.
  - Manual correction is supported via `PATCH /api/v1/workout-sessions/:id/time-segments` with full segment array replacement.
- Form-cue routing for agent template create/update:
  - `formCues` are durable and persist to `exercises.formCues`.
  - `cues` are template-scoped and persist to `template_exercises.cues`.
  - If only `cues` are provided, timeless technique cues are promoted to `exercises.formCues`, while clearly program/timeline cues (for example references to weeks/RPE blocks) stay on `template_exercises.cues`.
