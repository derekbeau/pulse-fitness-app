---
name: pulse-app-usage
description: Pulse app API usage patterns for workout, habit, and nutrition agent workflows
---

# Pulse App Usage Skill

## Authentication

Agents call the unified `/api/v1/*` API surface with `Authorization: AgentToken <token>`.

- Agent-specific convenience features such as name resolution, auto-create behavior, and other workflow shortcuts activate automatically on `/api/v1/*` when the request uses AgentToken auth.
- Responses for AgentToken callers can include an optional `agent` field with hints, suggested actions, and related state to help drive the next step.
- Sensitive routes such as auth management and agent token CRUD remain JWT-only.

## Workout Workflow

Use this flow when an agent creates exercises/templates and then logs workout sessions.

1. Search first: call `GET /api/v1/exercises?q=<name>&limit=<n>`.
2. Create with dedup guard: call `POST /api/v1/exercises`.
3. If the response is `{ "data": { "created": false, "candidates": [...] } }`, inspect candidates and only retry with `force: true` when a true new exercise is required.
4. Create template with `POST /api/v1/workout-templates`.
5. Schedule the template on calendar date(s) with `POST /api/v1/scheduled-workouts`.
6. Review upcoming scheduled workouts via `GET /api/v1/scheduled-workouts?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>`.
7. Read `data.newExercises` from template creation response.
8. For each new exercise id in `newExercises`, call `PATCH /api/v1/exercises/:id` to enrich:
   - `muscleGroups`
   - `equipment`
   - `category`
   - `trackingType`
   - `instructions`
   - `formCues`
   - `tags`
9. Start session via `POST /api/v1/workout-sessions`.
10. During the session, use `PATCH /api/v1/workout-sessions/:id` for:
   - set logs: `sets: [{ exerciseName, setNumber, weight, reps }]`
   - add exercises: `addExercises: [{ name, sets, reps, section }]`
   - remove unstarted exercises: `removeExercises: [exerciseId]`
   - reorder exercises: `reorderExercises: [exerciseId, ...]`
11. Do not remove exercises that already have completed sets (`409 WORKOUT_SESSION_EXERCISE_HAS_LOGGED_SETS`).
12. To correct mistakes in a completed session, use `PATCH /api/v1/workout-sessions/:id/corrections` with an array of set corrections.

## Habits

Use referential habits when completion should be inferred from other tracked data.

1. Create a habit with `POST /api/v1/habits`.
2. For referential habits, include:
   - `referenceSource`: `weight | nutrition_daily | nutrition_meal | workout`
   - `referenceConfig`:
     - `weight`: `{ "condition": "exists_today" }`
     - `nutrition_daily`: `{ "field": "protein|calories|carbs|fat", "op": "gte|lte|eq", "value": number }`
     - `nutrition_meal`: `{ "mealType": string, "field": "protein|calories|carbs|fat", "op": "gte|lte|eq", "value": number }`
     - `workout`: `{ "condition": "session_completed_today" }`
3. Read habits with `GET /api/v1/habits`; referential habits auto-resolve completion for today.
4. Manually override a referential habit with `PATCH /api/v1/habits/:id/entries`; override entries are marked with `isOverride: true` and take precedence over resolver output.

## Nutrition (Meal Logging)

Use `POST /api/v1/meals` with one of two item modes:

1. **Saved-food mode (default):**
   - Send `foodName` + `quantity` (+ optional display fields).
   - The API resolves `foodName` to an existing food and snapshots scaled macros.
   - `usageCount` and `lastUsedAt` are updated automatically by the meal store layer; agents do not need any separate usage-tracking step.

2. **Ad-hoc mode (no foods library write):**
   - Set either `adhoc: true` or `saveToFoods: false`.
   - Include inline snapshots: `foodName`, `quantity`, `unit`, `calories`, `protein`, `carbs`, `fat`.
   - Item is stored with `foodId: null`.

Decision heuristic:

- **Create/save food (reusable):** staple ingredients, frequently repeated meals, branded/packaged products, anything likely to be logged again.
- **Log ad-hoc (one-off):** restaurant estimates, custom recipes that will not be reused, temporary experiments, uncertain approximations.
- If unsure, prefer ad-hoc first; promote to a saved food only after repeated use.

## Notes

- User-facing records in habits, workout templates, exercises, foods, and workout sessions are soft-deleted via `deletedAt`; deleted records are hidden from normal list/search/get endpoints.
- Use `GET /api/v1/trash` to inspect deleted items, `POST /api/v1/trash/:type/:id/restore` to restore, and `DELETE /api/v1/trash/:type/:id` to permanently purge.
- New exercises auto-created during template creation intentionally use placeholder metadata (`muscleGroups: []`, `equipment: ""`, `instructions: null`) until enriched.
- Template creation is non-blocking: possible duplicate hints are returned in `newExercises[*].possibleDuplicates`.
- Workout session status transitions:
  - `in-progress -> paused`: closes the current open `timeSegments` entry.
  - `paused -> in-progress`: appends a new open `timeSegments` entry.
  - `in-progress|paused -> cancelled`: closes any open segment and keeps the session row for history.
  - `in-progress|paused -> completed`: closes the final segment and computes duration from summed segment time.
  - Completed sessions support set corrections via `PATCH /api/v1/workout-sessions/:id/corrections` with `{ corrections: [{ setId, weight?, reps?, rpe? }] }`.
  - The correction endpoint only works on completed sessions (`409` on other statuses).
  - Corrections do not change session status, `completedAt`, or duration.
  - Manual correction is supported via `PATCH /api/v1/workout-sessions/:id/time-segments` with full segment array replacement.
- Form-cue routing for agent template create/update:
  - `formCues` are durable and persist to `exercises.formCues`.
  - `cues` are template-scoped and persist to `template_exercises.cues`.
  - If only `cues` are provided, timeless technique cues are promoted to `exercises.formCues`, while clearly program/timeline cues (for example references to weeks/RPE blocks) stay on `template_exercises.cues`.
