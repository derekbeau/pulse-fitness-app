# Agent Integration Conventions

This document defines how external AI agents should authenticate, call unified `/api/v1/*` endpoints, and handle common success and error patterns.

## Purpose

- Use `/api/v1/*` for both app flows and programmatic agent workflows.
- Agent-specific conveniences such as name resolution, auto-create behavior, and response hints activate automatically for `Authorization: AgentToken <token>` requests.
- Convenience request fields (for example `foodName`, `exerciseName`, `templateName`, `reps`) are normalized by middleware; route handlers persist canonical fields.
- Treat `GET /api/v1/context` as the first call in most agent sessions. It is on the unified route surface but remains AgentToken-only.
- The second major agent-integrated workflow (after nutrition logging) is scheduled-workout
  enrichment via per-exercise `agentNotes`.

## Authentication

### How Agent Tokens Are Created

Agent tokens are created by an authenticated app user:

- In the app settings UI, or
- Via `POST /api/v1/agent-tokens`

Creation response returns the plain token once:

```json
{
  "data": {
    "id": "agent-token-id",
    "name": "Meal Logger",
    "token": "plain-token-value"
  }
}
```

Storage model:

- Plain token is shown only at creation time.
- API stores only SHA-256 hash in `agent_tokens.tokenHash`.

### Supported Auth Schemes

Most unified routes use `requireAuth` and accept both:

- `Authorization: Bearer <jwt>` for interactive app sessions
- `Authorization: AgentToken <token>` for programmatic agents

Important exceptions:

- `GET /api/v1/context` also uses `requireAgentOnly`, so JWT callers receive `403 FORBIDDEN`.
- Sensitive user-only routes use `requireUserAuth` and stay JWT-only, including `/api/v1/agent-tokens`.

JWT requirements:

- Pulse-issued session JWTs include `type: "session"` and `iss: "pulse-api"`.
- Hand-crafted JWTs without those claims are rejected.

### Auth Failure Contract

On missing or invalid credentials:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

On hitting an AgentToken-only route with JWT auth:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Agent token authentication required"
  }
}
```

## Response Patterns

All successful responses use the unified `{ data: ... }` envelope.

AgentToken callers may also receive an optional `agent` field with extra guidance:

```json
{
  "data": {
    "id": "meal-1"
  },
  "agent": {
    "hints": ["Lunch adds 536 kcal and 66.3g protein."],
    "suggestedActions": ["Review today's nutrition summary next."],
    "relatedState": {
      "date": "2026-03-09"
    }
  }
}
```

Notes:

- JWT callers should not depend on `agent`.
- Agent responses are additive. Core resource data still lives under `data`.
- List endpoints use the same paginated envelope for JWT and AgentToken callers: `{ data, meta }` with optional `agent`.

## Endpoint Reference

### Auth Check

#### `GET /api/v1/ping`

Minimal authenticated probe route for either JWT or AgentToken auth.

Response:

```json
{
  "data": {
    "userId": "user-123"
  }
}
```

### Context

#### `GET /api/v1/context`

Returns a planning snapshot with user profile, recent workouts, today nutrition, weight trend, habits, and upcoming scheduled workouts.

Auth note:

- Requires `Authorization: AgentToken <token>`.

Response:

```json
{
  "data": {
    "user": { "name": "Derek" },
    "recentWorkouts": [
      {
        "id": "session-1",
        "name": "Upper A",
        "date": "2026-03-08",
        "completedAt": 1700000000000,
        "exercises": [
          {
            "name": "Bench Press",
            "sets": { "total": 4, "completed": 4, "skipped": 0 }
          }
        ]
      }
    ],
    "todayNutrition": {
      "actual": { "calories": 2100, "protein": 180, "carbs": 210, "fat": 70 },
      "target": { "calories": 2400, "protein": 200, "carbs": 250, "fat": 80 },
      "meals": []
    },
    "weight": { "current": 182.4, "trend7d": -0.8 },
    "habits": [
      { "name": "Hydrate", "trackingType": "numeric", "streak": 5, "todayCompleted": true }
    ],
    "scheduledWorkouts": [{ "date": "2026-03-10", "templateName": "Lower A" }]
  }
}
```

Notes:

- Missing data still returns stable defaults such as zeros, empty arrays, and nullable fields.
- Scheduled workouts whose template was deleted return `"Unknown template"`.

### Foods And Meals

#### `GET /api/v1/foods?q=<term>&limit=<n>`

Searches user foods by name or brand and returns the standard paginated envelope.

#### `POST /api/v1/foods`

Creates a user-scoped food entry.

#### `POST /api/v1/foods/:winnerId/merge`

Merges a duplicate food into a keeper food. The API re-links historical meal items from `loserId` to `winnerId`, combines usage metadata, and soft-deletes the loser food.

Request:

```json
{
  "loserId": "22222222-2222-4222-8222-222222222222"
}
```

Response (`200`):

```json
{
  "data": {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "Chicken Breast",
    "usageCount": 84,
    "lastUsedAt": 1760000000000
  }
}
```

Error notes:

- `400 INVALID_FOOD_MERGE` when `winnerId === loserId`
- `404 FOOD_NOT_FOUND` when either food is missing or not user-accessible

#### `POST /api/v1/meals`

Logs a meal for a date from food-name references. Under AgentToken auth:

- `foodName` values are resolved against the user's foods.
- Foods can be auto-created when inline macros are provided.
- If any food name cannot be resolved, the API returns `422 UNRESOLVED_FOODS`.
- The response may include an `agent` field with nutrition hints and `suggestedActions`.

Unified-schema convenience example:

```json
{
  "date": "2026-03-09",
  "name": "Lunch",
  "items": [{ "foodName": "Chicken Breast", "quantity": 2 }]
}
```

Response (`201`):

```json
{
  "data": {
    "meal": {
      "id": "meal-1",
      "name": "Lunch",
      "date": "2026-03-09",
      "time": "12:00"
    },
    "macros": {
      "calories": 536,
      "protein": 66.3,
      "carbs": 44.5,
      "fat": 7.6
    },
    "items": [
      {
        "id": "item-1",
        "foodId": "food-chicken",
        "name": "Chicken Breast",
        "amount": 2,
        "unit": "serving",
        "calories": 330,
        "protein": 62,
        "carbs": 0,
        "fat": 7.2
      }
    ]
  },
  "agent": {
    "suggestedActions": ["Review today's nutrition summary next."]
  }
}
```

#### `POST /api/v1/meals/:id/items`

Appends one or more items to an existing meal without recreating the meal record. Item inputs follow the same unified schema used by meal creation (saved-food or ad-hoc modes).

Request:

```json
{
  "items": [{ "foodName": "Jasmine Rice", "quantity": 1.5 }]
}
```

Response (`201`):

```json
{
  "data": {
    "meal": {
      "id": "meal-1",
      "name": "Lunch"
    },
    "items": [
      {
        "id": "item-1",
        "name": "Chicken Breast",
        "amount": 2,
        "unit": "serving"
      },
      {
        "id": "item-2",
        "name": "Jasmine Rice",
        "amount": 1.5,
        "unit": "serving"
      }
    ]
  }
}
```

Notes:

- Response includes the full updated meal snapshot (all meal items), not only newly appended items.
- Returns `404 MEAL_NOT_FOUND` if the meal does not exist for the authenticated user.

### Exercises And Workouts

#### `POST /api/v1/exercises`

Creates an exercise. Under AgentToken auth the endpoint adds fuzzy dedup protection:

- If close matches exist and `force` is omitted or `false`, the response returns `{ "data": { "created": false, "candidates": [...] } }`.
- If creation proceeds, default metadata is applied for omitted agent fields.

#### `PATCH /api/v1/exercises/:id`

Enriches metadata for a user-owned exercise after creation.

#### `GET /api/v1/exercises?q=<term>&limit=<n>`

Searches visible exercises (shared + user-scoped) and returns the standard paginated envelope.

#### `POST /api/v1/workout-templates`

Creates a template from unified template schema fields. AgentToken auth enables:

- name-based exercise resolution
- auto-create behavior for unknown exercises
- reps shorthand expansion (`reps` -> `repsMin/repsMax`)

Unified-schema convenience example:

```json
{
  "name": "Upper A",
  "sections": [
    {
      "type": "main",
      "exercises": [{ "exerciseName": "Bench Press", "sets": 4, "reps": "6-8" }]
    }
  ]
}
```

#### `PUT /api/v1/workout-templates/:id`

Replaces template content.

#### `POST /api/v1/scheduled-workouts`

Schedules a template for a specific date.

#### `GET /api/v1/scheduled-workouts?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>`

Lists scheduled workouts in the requested date window.

#### `PATCH /api/v1/scheduled-workouts/:id/exercise-notes`

Writes per-exercise scheduled-workout enrichment notes before session start.

Auth note:

- AgentToken-only route. JWT callers receive `403 FORBIDDEN` with
  `Agent token authentication required`.

Request:

```json
{
  "notes": [
    { "exerciseId": "exercise-1", "agentNotes": "Last session 3x15 @ 53 lb. Try 62 lb today." },
    { "exerciseId": "exercise-2", "agentNotes": null }
  ]
}
```

Behavior notes:

- Route accepts only exercise ids that exist in the scheduled snapshot.
- `agentNotes: null` clears an existing note.
- `agentNotesMeta` is server-authored and returned with this shape:
  `{ author, generatedAt, scheduledDateAtGeneration, stale }`.
- `stale` is `false` on fresh writes and may be flipped to `true` by later reschedules that move
  the scheduled date more than 2 days.

#### `POST /api/v1/workout-sessions`

Starts an in-progress session. AgentToken responses may include `agent.hints`, `agent.suggestedActions`, and `agent.relatedState` describing the next set and remaining work.

#### `PATCH /api/v1/workout-sessions/:id`

Updates session status, set progress, and agent-driven mid-session changes on the unified route surface.

Unified-schema convenience example:

```json
{
  "sets": [{ "exerciseName": "Bench Press", "setNumber": 1, "weight": 185, "reps": 8 }]
}
```

### Weight And Habits

#### `POST /api/v1/weight`

Creates or updates a weight entry for the provided date. AgentToken responses may include follow-up hints about deltas from the previous entry.

#### `GET /api/v1/habits`

Lists user habits available for agent workflows.

#### `PATCH /api/v1/habits/:id/entries`

Upserts a habit entry for a date. AgentToken responses may include completion hints plus `suggestedActions`.

### Nutrition Summary

#### `GET /api/v1/nutrition/:date/summary`

Returns the shared nutrition-summary schema (`date`, `meals`, `actual`, `target`) for both auth modes, with optional agent enrichment containing remaining-macro guidance.

## Recommended Workflows

### General Assistant Session

1. Call `GET /api/v1/context`.
2. Decide whether the user intent maps to meals, workouts, weight, or habits.
3. Execute one or more write operations such as `/api/v1/meals`, `/api/v1/weight`, `/api/v1/workout-sessions`, or `/api/v1/habits/:id/entries`.
4. Read the optional `agent` field after each mutation to drive the next action.

### Meal Logging

1. Call `GET /api/v1/foods?q=<food>`.
2. If needed, create a missing food via `POST /api/v1/foods`.
3. Submit all meal items using `POST /api/v1/meals`.
4. Review `agent.suggestedActions` or `GET /api/v1/nutrition/:date/summary` if remaining macros matter.

### Workout Planning And Logging

1. Search or create exercises using `GET /api/v1/exercises?q=<term>` and `POST /api/v1/exercises`.
2. If `POST /api/v1/exercises` returns `created: false`, review `candidates` before retrying with `force: true`.
3. Create or update templates with `POST` or `PUT /api/v1/workout-templates`.
4. Schedule training using `POST /api/v1/scheduled-workouts`, then review the plan with `GET /api/v1/scheduled-workouts`.
5. Enrich the scheduled snapshot with `PATCH /api/v1/scheduled-workouts/:id/exercise-notes`.
6. Start a session with `POST /api/v1/workout-sessions`.
7. Continue logging via `PATCH /api/v1/workout-sessions/:id` and use returned `agent` hints to identify the next set.

## Operational Notes

- Treat AgentToken secrets like passwords. They are bearer credentials.
- Expect the API to reject invalid JWTs that are missing Pulse session claims.
- AgentToken auth is the switch for agent conveniences on unified routes.
- No explicit rate-limit middleware is applied to agent-token traffic on `/api/v1/*` yet.
