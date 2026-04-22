---
name: pulse-app-usage
description: |
  Use this skill to interact with the Pulse fitness app via its agent API — log meals and foods, track body weight, plan and manage workouts (templates, sessions, sets), track habits, search exercises, look up macros, and review fitness/nutrition context. Trigger whenever the user mentions anything related to food logging, meal tracking, macros, nutrition, body weight, workouts, exercises, habits, or fitness tracking in the context of their Pulse app. Also trigger for food photos, "I ate...", "log breakfast/lunch/dinner", "what are the macros for X", "plan a workout", "log my weight", or any health/fitness data entry request.

  USE FOR: food logging, meal tracking, macros, nutrition, body weight, workouts, exercises, habits, fitness tracking, food photos, "I ate...", "log breakfast/lunch/dinner", "what are the macros for X", "plan a workout", "log my weight", health/fitness data entry.
  DO NOT USE FOR: family meal planning or recipe management (use family-meals skill), general health questions unrelated to Pulse data entry.
---

# Pulse App Usage

Use this skill to operate the Pulse fitness app through its agent API. This covers all domains: nutrition/food logging, body weight, workouts, exercises, and habits.

## Start Here

1. Load your agent token from `.env` at the project root (`AGENT_TOKEN_CLAUDE_CODE`).
2. API base URL: `http://meridian.tail408570.ts.net:8147`
3. Auth header: `Authorization: AgentToken <token>`
4. OpenAPI spec: `GET /api/docs/json` (no auth required)
5. Swagger UI: `/api/docs` (browsable in browser)
6. For the full list of endpoints, request/response schemas, and auth requirements, fetch the OpenAPI spec.
7. OpenAPI-generated clients using the `agentToken` security scheme must still send the full `Authorization: AgentToken <token>` header manually; the prefix is not implied by the spec metadata.
8. Always read context first: `GET /api/v1/context/` — returns user profile, recent workouts, today's nutrition, weight trend, habits, and scheduled workouts.
9. Web UI navigation: Foods now lives inside Nutrition tabs at `/nutrition?view=foods`; `/foods` redirects there.

### Core Rules

- All writes go through the `/api/v1/*` API — no direct DB or file editing.
- Agent-specific convenience features (name resolution, auto-create, workflow hints) activate automatically on `/api/v1/*` when the request uses AgentToken auth.
- Endpoints use unified shared schemas; middleware expands convenience fields (`foodName`, `exerciseName`, `templateName`, `reps`) into canonical payloads before handlers run.
- Responses for AgentToken callers can include an optional `agent` field with hints, suggested actions, and related state.
- Date format: `YYYY-MM-DD`. Time format: `HH:MM` (24h).
- Before adding new data, inspect recent entries via `/api/v1/context/` for consistency.
- If user input conflicts with recent data, ask a brief clarification question instead of guessing.

## Nutrition & Food Logging

### Logging Workflow

1. **Check recent food logs first.** Before asking clarifying questions, look at the last 2-3 days of nutrition logs. If the user gives vague or fuzzy details ("had some of that rice," "more chicken," "same as yesterday"), assume they mean something recently logged. Recent logs represent what is currently in the fridge/pantry.
2. Parse meal or food request into concrete items, amounts, and units.
3. Search existing foods first (`GET /api/v1/foods/?q=<term>&sort=<sort>&page=<page>&limit=<limit>`) before creating new entries.
   - `sort` options: `recently-updated` (default), `newest`, `oldest`, `name-asc`, `name-desc`, `most-used`, `least-used`
   - `page` default: `1`; `limit` default: `50` (max `100`)
4. For missing foods, follow lookup rules in `references/macro-lookup.md`, then create via `POST /api/v1/foods/`.
5. Log the meal via `POST /api/v1/meals/` with food name references and quantities.
6. If any food names fail to resolve (422 UNRESOLVED_FOODS), create the missing foods first, then retry.
7. Return concise confirmation with item macros and updated day totals.

**Fuzzy input resolution:** When the user references food vaguely, resolve it from recent context before asking. Check recent meal logs, saved foods, and conversation history. Only ask if there is genuine ambiguity that could change the macros meaningfully.

### Meal Item Patterns

`POST /api/v1/meals/` uses one unified meal-item schema with two common patterns:

1. **Saved-food mode (default):**
   - Send `foodName` + `quantity` (+ optional display fields).
   - The API resolves `foodName` to an existing food and snapshots scaled macros.
   - `usageCount` and `lastUsedAt` are updated automatically; agents do not need any separate usage-tracking step.

2. **Ad-hoc mode (no foods library write):**
   - Set either `adhoc: true` or `saveToFoods: false`.
   - Include inline snapshots: `foodName`, `quantity`, `unit`, `calories`, `protein`, `carbs`, `fat`.
   - Item is stored with `foodId: null`.

**Decision heuristic:**

- **Create/save food (reusable):** staple ingredients, frequently repeated meals, branded/packaged products, anything likely to be logged again.
- **Log ad-hoc (one-off):** restaurant estimates, custom recipes that will not be reused, temporary experiments, uncertain approximations.
- If unsure, prefer ad-hoc first; promote to a saved food only after repeated use.

### Food Merge Workflow

Use this when duplicate foods exist and one canonical record should remain.

**When to use:**

- Same food was created twice (name/brand variants, spelling duplicates, accidental duplicate entries).
- You want historical meal items and usage stats consolidated under one winner food.

**Request format:**

```json
POST /api/v1/foods/:winnerId/merge
{
  "loserId": "<food-uuid>"
}
```

**Behavior notes:**

- `winnerId` (path) and `loserId` (body) must be different.
- Meal-item references are re-linked automatically.
- Loser food is soft-deleted; winner usage metadata is merged.

### Meal Item Addition Workflow

Use this to append items to an existing meal without recreating or replacing the meal.

**When to use:**

- User says "add this to lunch/breakfast/dinner" after the meal already exists.
- You need to keep existing meal metadata (`name`, `time`, `notes`) and only append new rows.

**Request format:**

```json
POST /api/v1/meals/:id/items
{
  "items": [
    { "foodName": "Jasmine Rice", "quantity": 1.5 },
    { "foodName": "Chicken Breast", "quantity": 1 }
  ]
}
```

**Behavior notes:**

- Uses the same unified item schema as `POST /api/v1/meals/`.
- Returns the full updated meal snapshot (all items), not only appended items.
- If any food cannot be resolved, the route returns `422 UNRESOLVED_FOODS`.

### Hydration Tracking

When a meal includes water or any water-based liquid (protein shakes, electrolyte drinks, plain water, etc.), automatically log the water volume to the "Water" habit.

1. Identify water content in oz from the meal.
2. Fetch today's current water entry via `GET /api/v1/habits/` to get the habit ID and current value.
3. Add the new oz to the existing value and update via `PATCH /api/v1/habits/:id/entries` with `{ "date": "YYYY-MM-DD", "value": <new total> }`.
4. Include water logged in the response (e.g., "Water: +12oz (44/100oz)").

### One-Off Homemade Recipe Workflow

When logging a one-off homemade dish (not a reusable saved food):

1. **Deconstruct** the recipe into components from the user's description / photo.
2. **Look up macros** for each component from saved foods or generic references.
3. **Estimate proportions** from description, photo, and total weight if provided.
4. **Sum macros** into one composite number for the whole serving.
5. **Log as a single ad-hoc meal item** with `adhoc: true` — do NOT save as a food.
6. **Include a meal note** capturing the ingredient breakdown for future reference.
7. Do **NOT** log as multiple separate ingredient rows — keep the food log clean.
8. If unsure about proportions, show the breakdown and ask before logging.

**When to use this vs saving a food:**

- **Save as food:** staples, branded items, things eaten repeatedly
- **Ad-hoc item:** one-off recipes, restaurant estimates, random homemade combos
- **When in doubt:** ask the user whether they want it saved

### Editing Meals

Meals support editing via PATCH:

- `PATCH /api/v1/meals/:id` — edit meal-level fields
- `PATCH /api/v1/nutrition/:date/meals/:mealId` — edit meal by date
- `PATCH /api/v1/meals/:id/items/:itemId` — edit individual meal items
- `DELETE /api/v1/nutrition/:date/meals/:mealId` — delete a meal entirely
- Meal-level PATCH supports `summary`: send text to override, send `null` to clear, omit to leave unchanged.

### Maintenance (JWT-only)

- `POST /api/v1/admin/reconcile-food-usage` recomputes each food's `usageCount` from actual `meal_items` references and resets unreferenced foods to `usageCount: 0`.
- This endpoint is JWT-only and is intended for maintenance/admin sessions, not AgentToken calls.

### Nutrition Summaries

- `GET /api/v1/nutrition/:date/summary` — macro totals/targets summary for a date (with optional agent guidance)
- `GET /api/v1/nutrition/week-summary` — weekly summary

### Meal Response Format

When a meal or food log is written, respond with:

```text
Added
- <food name> - <amount> <unit>

Item macros
- <food name>: <cal> kcal, <protein>p, <carbs>c, <fat>f

Day totals (<YYYY-MM-DD>)
- Calories: <total>
- Protein: <total> g
- Carbs: <total> g
- Fat: <total> g
```

If no new foods were created, explicitly say that existing food entries were reused.

## Workout Workflow

### Exercise Management

- **Search**: `GET /api/v1/exercises/?q=<term>&sort=<sort>&page=<page>&limit=<limit>` — always search before creating.
  - `sort` options: `name-asc` (default), `name-desc`, `newest`, `oldest`, `recently-updated`
  - `page` default: `1`; `limit` default: `20` (max `100`)
- **Create with dedup guard**: `POST /api/v1/exercises/` — if the response is `{ "data": { "created": false, "candidates": [...] } }`, inspect candidates and only retry with `force: true` when a true new exercise is required.
- **Enrich exercises**: Use `PATCH /api/v1/exercises/:id` any time you need to improve metadata (`muscleGroups`, `equipment`, `category`, `trackingType`, `instructions`, `formCues`, `tags`).
- **Last performance**: `GET /api/v1/exercises/:id/last-performance?limit=<n>` — useful for programming progression.
  - `limit` range: `1-10` (default `3`) for quick recent-history lookups.
  - If `includeRelated=true`, the endpoint returns the related-history response shape and ignores `limit`.

### Templates

- **List**: `GET /api/v1/workout-templates/?sort=<sort>&page=<page>&limit=<limit>`
  - `sort` options: `newest` (default), `oldest`, `name-asc`, `name-desc`, `recently-updated`
  - `page` default: `1`; `limit` default: `25` (max `100`)
  - Response is paginated: `{ data: WorkoutTemplate[], meta: { page, limit, total } }`
- **Create**: `POST /api/v1/workout-templates/` — sections (warmup/main/cooldown/supplemental) with exercises, sets, reps, rest times. Unknown exercise names are auto-created. The `reps` field accepts a number (e.g., `12`) or a string range (e.g., `"8-12"`). See `references/workout-workflow.md` for section type details.
- **Update**: `PUT /api/v1/workout-templates/:id` or `PATCH /api/v1/workout-templates/:id`
- **Swap exercise**: `PATCH /api/v1/workout-templates/:id/exercises/:exerciseId/swap`
- **Reorder exercises**: `PATCH /api/v1/workout-templates/:id/reorder`

**Form-cue routing** for template create/update:

- `formCues` are durable and persist to `exercises.formCues`.
- `cues` are template-scoped and persist to `template_exercises.cues`.
- If only `cues` are provided, timeless technique cues are promoted to `exercises.formCues`, while program/timeline cues stay on `template_exercises.cues`.

### Sessions

- **Start**: `POST /api/v1/workout-sessions/` with `{ "templateId": "<id>" }` or `{ "name": "Ad hoc" }`.
- Session responses order sections as `warmup → main → cooldown → supplemental → null`. Supplemental exercises added to a template after session creation appear in the active-workout UI via a template fallback, but only become real session rows once the user logs against them.
- **Log sets**: `PATCH /api/v1/workout-sessions/:id` with `sets: [{ exerciseName, setNumber, weight, reps }]` (middleware resolves `exerciseName` to canonical `exerciseId`).
- **Add exercises mid-session**: `addExercises: [{ name, sets, reps, section }]`
- **Remove unstarted exercises**: `removeExercises: [exerciseId]` — returns 409 if exercise has logged sets.
- **Reorder exercises**: `reorderExercises: [exerciseId, ...]`
- **Swap exercise**: `PATCH /api/v1/workout-sessions/:id/exercises/:exerciseId/swap`
- **Complete**: set `status: "completed"` in the PATCH body.
- **Save as template**: `POST /api/v1/workout-sessions/:id/save-as-template`
- **Set corrections** (completed sessions only): `PATCH /api/v1/workout-sessions/:id/corrections` with `{ corrections: [{ setId, weight?, reps?, rpe? }] }`. Returns 409 on non-completed sessions.
- **Delete mis-logged in-progress set**: `DELETE /api/v1/workout-sessions/:sessionId/sets/:setId`; once a session is completed/cancelled, use corrections (`PATCH /api/v1/workout-sessions/:id/corrections`) instead of delete.
- **Time segment correction**: `PATCH /api/v1/workout-sessions/:id/time-segments` — full segment array replacement.

**Status transitions:**

- `in-progress → paused`: closes the current open time segment.
- `paused → in-progress`: appends a new open time segment.
- `in-progress|paused → cancelled`: closes any open segment, keeps session for history.
- `in-progress|paused → completed`: closes final segment, computes duration from summed segment time.

### Scheduling

- **Create**: `POST /api/v1/scheduled-workouts/` — schedule a template on calendar date(s).
- **Review**: `GET /api/v1/scheduled-workouts/?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>`
- **Reorder snapshot exercises**: `PATCH /api/v1/scheduled-workouts/:id/reorder`
- **Patch snapshot exercise fields**: `PATCH /api/v1/scheduled-workouts/:id/exercises`
- **Patch snapshot set targets**: `PATCH /api/v1/scheduled-workouts/:id/exercise-sets`
- **Write per-exercise agent notes** (AgentToken-only): `PATCH /api/v1/scheduled-workouts/:id/exercise-notes`

Refining tomorrow's workout: read the scheduled workout snapshot first, then use `/reorder` for exercise sequence, `/exercises` for per-exercise structural fields, `/exercise-sets` for target/remove/add set shaping, and optionally `/exercise-notes` for session-specific coaching notes.

Quick request shapes:

```json
PATCH /api/v1/scheduled-workouts/:id/reorder
{ "order": ["<exercise-uuid-1>", "<exercise-uuid-2>"] }
```

```json
PATCH /api/v1/scheduled-workouts/:id/exercises
{ "updates": [{ "exerciseId": "<exercise-uuid>", "supersetGroup": "A", "section": "main" }] }
```

```json
PATCH /api/v1/scheduled-workouts/:id/exercise-sets
{ "exerciseId": "<exercise-uuid>", "sets": [{ "setNumber": 2, "remove": true }] }
```

### Scheduled-workout enrichment

This step fits between **Scheduling** (`POST /api/v1/scheduled-workouts/`) and **Sessions → Start**
(`POST /api/v1/workout-sessions/` with `scheduledWorkoutId`).

1. Schedule first: `POST /api/v1/scheduled-workouts/` returns a scheduled workout snapshot with
   exercise ids and default prescriptions copied from the template.
2. Pull context before writing notes: check recent sessions for the same template, last
   performance for each exercise, weight trend, habit state, and journal/injury flags when
   available.
3. Decide note-by-note whether enrichment adds value. Many exercises should have no note.
   High-signal examples:
   - progression cues from last session
   - injury accommodations
   - rest-period adjustments based on recent volume/fatigue
4. Write session-specific notes with AgentToken auth:

```json
PATCH /api/v1/scheduled-workouts/:id/exercise-notes
{
  "notes": [
    { "exerciseId": "exercise-uuid", "agentNotes": "Last session: 3x15 at 53 lb. Try 62 lb today." }
  ]
}
```

- Send `agentNotes: null` to clear a previously written note.

5. In the user-facing confirmation message, summarize what changed, for example:
   "I scheduled your workout for Tuesday and added 3 notes: bench progression, shoulder-friendly
   incline option, and longer deadlift rest."

What not to do:

- Do not overwrite programming notes (`programmingNotes` is template-level and read-only from the
  scheduled-workout enrichment surface).
- Do not write notes for completeness; only write notes where context-specific guidance helps.
- Do not include dates inside note text; generation/schedule timestamps live in metadata.

### Planning a Workout

1. Load planning context from `~/Obsidian/Master/2-Areas/Health & Fitness/Workouts` (status, injury notes, equipment, and recent session notes).
2. Also check recent workouts via `GET /api/v1/context/`.
3. Ask brief pre-workout check-in questions: energy/recovery, pain flare-ups, time available, and location/equipment context.
4. Propose session structure that avoids back-to-back overlap with recently trained muscle groups.
5. Apply injury constraints and exercise substitutions from `references/workout-planning.md`.
6. Create workout template via the API, then start a session from it.
7. After completion, capture short post-workout notes via session update.

## Habits

- **List**: `GET /api/v1/habits/` — returns all habits with today's status.
- **Create**: `POST /api/v1/habits/`
- **Update entry**: `PATCH /api/v1/habits/:id/entries` with `{ "date": "YYYY-MM-DD", "completed": true, "value": 8 }`.
  - For boolean habits, only `completed` is needed. For numeric/time habits, use `value`.

### Referential Habits

Use referential habits when completion should be inferred from other tracked data:

- `referenceSource`: `weight | nutrition_daily | nutrition_meal | workout`
- `referenceConfig`:
  - `weight`: `{ "condition": "exists_today" }`
  - `nutrition_daily`: `{ "field": "protein|calories|carbs|fat", "op": "gte|lte|eq", "value": number }`
  - `nutrition_meal`: `{ "mealType": string, "field": "protein|calories|carbs|fat", "op": "gte|lte|eq", "value": number }`
  - `workout`: `{ "condition": "session_completed_today" }`
- Referential habits auto-resolve completion for today.
- Manually override with `PATCH /api/v1/habits/:id/entries`; override entries are marked `isOverride: true`.

## Body Weight

```
POST /api/v1/weight/
{ "date": "2026-03-10", "weight": 182.4, "notes": "fasted" }
```

Upserts by date. Returns 201 (created) or 200 (updated).

## Soft Delete & Trash

User-facing records (habits, workout templates, exercises, foods, workout sessions) are soft-deleted via `deletedAt`; deleted records are hidden from normal list/search/get endpoints.

- `GET /api/v1/trash/` — inspect deleted items
- `POST /api/v1/trash/:type/:id/restore` — restore
- `DELETE /api/v1/trash/:type/:id` — permanently purge

## References

- Macro lookup hierarchy and confidence rules: `references/macro-lookup.md`
- Obsidian recipe nutrition workflow: `references/recipe-lookup.md`
- Workout planning, check-in, and constraints: `references/workout-planning.md`
- Workout template/session conventions: `references/workout-workflow.md`
- Workout programming notes source: `~/Obsidian/Master/2-Areas/Health & Fitness/Workouts`
