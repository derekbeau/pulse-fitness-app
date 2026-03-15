# Agent Integration Conventions

This document defines how external AI agents should authenticate, call unified `/api/v1/*` endpoints, and handle common success and error patterns.

## Purpose

- Use `/api/v1/*` for both app flows and programmatic agent workflows.
- Agent-specific conveniences such as name resolution, auto-create behavior, and response hints activate automatically for `Authorization: AgentToken <token>` requests.
- Treat `GET /api/v1/context` as the first call in most agent sessions. It is on the unified route surface but remains AgentToken-only.

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
- List endpoints may omit `meta` for AgentToken callers when the agent-focused shape is intentionally simplified.

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

Searches user foods by name or brand. AgentToken callers receive a compact result shape without pagination metadata.

#### `POST /api/v1/foods`

Creates a user-scoped food entry.

#### `POST /api/v1/meals`

Logs a meal for a date from food-name references. Under AgentToken auth:

- `foodName` values are resolved against the user's foods.
- Foods can be auto-created when inline macros are provided.
- If any food name cannot be resolved, the API returns `422 UNRESOLVED_FOODS`.
- The response may include an `agent` field with nutrition hints and `suggestedActions`.

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

### Exercises And Workouts

#### `POST /api/v1/exercises`

Creates an exercise. Under AgentToken auth the endpoint adds fuzzy dedup protection:

- If close matches exist and `force` is omitted or `false`, the response returns `{ "data": { "created": false, "candidates": [...] } }`.
- If creation proceeds, default metadata is applied for omitted agent fields.

#### `PATCH /api/v1/exercises/:id`

Enriches metadata for a user-owned exercise after creation.

#### `GET /api/v1/exercises?q=<term>&limit=<n>`

Searches visible exercises (shared + user-scoped). AgentToken callers receive the compact exercise list shape.

#### `POST /api/v1/workout-templates`

Creates a template from plain-text sections and exercises. AgentToken auth enables:

- name-based exercise resolution
- auto-create behavior for unknown exercises
- `newExercises` enrichment for follow-up metadata patching

#### `PUT /api/v1/workout-templates/:id`

Replaces template content.

#### `POST /api/v1/scheduled-workouts`

Schedules a template for a specific date.

#### `GET /api/v1/scheduled-workouts?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>`

Lists scheduled workouts in the requested date window.

#### `POST /api/v1/workout-sessions`

Starts an in-progress session. AgentToken responses may include `agent.hints`, `agent.suggestedActions`, and `agent.relatedState` describing the next set and remaining work.

#### `PATCH /api/v1/workout-sessions/:id`

Updates session status, set progress, and agent-driven mid-session changes on the unified route surface.

### Weight And Habits

#### `POST /api/v1/weight`

Creates or updates a weight entry for the provided date. AgentToken responses may include follow-up hints about deltas from the previous entry.

#### `GET /api/v1/habits`

Lists user habits available for agent workflows.

#### `PATCH /api/v1/habits/:id/entries`

Upserts a habit entry for a date. AgentToken responses may include completion hints plus `suggestedActions`.

### Nutrition Summary

#### `GET /api/v1/nutrition/:date/summary`

Returns macro totals, targets, and remaining intake for the requested date.

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
5. Read `newExercises` from template creation responses and enrich each via `PATCH /api/v1/exercises/:id`.
6. Start a session with `POST /api/v1/workout-sessions`.
7. Continue logging via `PATCH /api/v1/workout-sessions/:id` and use returned `agent` hints to identify the next set.

## Operational Notes

- Treat AgentToken secrets like passwords. They are bearer credentials.
- Expect the API to reject invalid JWTs that are missing Pulse session claims.
- AgentToken auth is the switch for agent conveniences on unified routes.
- No explicit rate-limit middleware is applied to agent-token traffic on `/api/v1/*` yet.
