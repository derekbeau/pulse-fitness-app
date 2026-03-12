# Agent Integration Conventions

This document defines how external AI agents should authenticate, call `/api/agent/*` endpoints, and handle common success/error patterns.

## Purpose

- Use `/api/agent/*` for programmatic assistant workflows (meal logging, workout logging, daily updates, context retrieval).
- Use `/api/v1/*` for user-facing app flows and settings management.
- Treat `GET /api/agent/context` as the first call in most agent sessions.

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

Both are accepted on `/api/agent/*` by `requireAuth` in `apps/api/src/middleware/auth.ts`:

- `Authorization: Bearer <jwt>` (normal app JWT from register/login)
- `Authorization: AgentToken <token>` (programmatic token)

Sensitive user-only routes use `requireUserAuth` (JWT-only), including `/api/v1/agent-tokens`.

### Auth Failure Contract

On missing/invalid credentials:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

## Endpoint Reference

### Auth Check

#### `GET /api/agent/ping`

Minimal authenticated probe route.

Response:

```json
{
  "data": {
    "userId": "user-123"
  }
}
```

### Context

#### `GET /api/agent/context`

Returns a planning snapshot with user profile, recent workouts, today nutrition, weight trend, habits, and upcoming scheduled workouts.

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
      "meals": [
        {
          "name": "Lunch",
          "items": [
            {
              "name": "Chicken Breast",
              "amount": 1.5,
              "unit": "serving",
              "calories": 248,
              "protein": 46.5,
              "carbs": 0,
              "fat": 5.4
            }
          ]
        }
      ]
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

- Missing data still returns stable defaults (zeros/empty arrays/null name).
- Scheduled workouts whose template was deleted return `"Unknown template"`.

### Foods And Meals

#### `GET /api/agent/foods/search?q=<term>&limit=<n>`

Searches user foods by name/brand with recency-aware ordering.

Response:

```json
{
  "data": [
    {
      "id": "food-1",
      "name": "Chicken Breast",
      "brand": null,
      "servingSize": "100 g",
      "calories": 165,
      "protein": 31,
      "carbs": 0,
      "fat": 3.6
    }
  ]
}
```

#### `POST /api/agent/foods`

Creates a user-scoped food entry.

Request:

```json
{
  "name": "Chicken Breast",
  "servingSize": "100 g",
  "calories": 165,
  "protein": 31,
  "carbs": 0,
  "fat": 3.6
}
```

Response (`201`):

```json
{
  "data": {
    "id": "food-1",
    "name": "Chicken Breast",
    "brand": null,
    "servingSize": "100 g",
    "calories": 165,
    "protein": 31,
    "carbs": 0,
    "fat": 3.6
  }
}
```

#### `POST /api/agent/meals`

Logs a meal for a date from food-name references.

Request:

```json
{
  "name": "Lunch",
  "date": "2026-03-09",
  "time": "12:00",
  "items": [
    { "foodName": "Chicken Breast", "quantity": 2, "unit": "serving" },
    { "foodName": "White Rice", "quantity": 1, "unit": "serving" }
  ]
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
  }
}
```

Behavior notes:

- Quantity scales food macros directly (`scaled = foodMacro * quantity`).
- If any food name cannot be resolved, returns `422 UNRESOLVED_FOODS`.

### Exercises And Workouts

#### `POST /api/agent/exercises`

Creates an exercise with fuzzy dedup protection.

Request:

```json
{
  "name": "Dumbbell Row",
  "force": false
}
```

Response (`201`, created):

```json
{
  "data": {
    "created": true,
    "exercise": {
      "id": "exercise-1",
      "name": "Dumbbell Row",
      "category": "compound",
      "trackingType": "weight_reps",
      "muscleGroups": [],
      "equipment": "",
      "instructions": null,
      "tags": [],
      "formCues": []
    }
  }
}
```

Response (`200`, dedup candidate found and `force` omitted/false):

```json
{
  "data": {
    "created": false,
    "candidates": [
      {
        "id": "exercise-existing-1",
        "name": "Barbell Row",
        "similarity": 0.83
      }
    ]
  }
}
```

Behavior notes:

- Dedup checks user-visible exercises with normalized matching (case-insensitive plus prefix normalization such as `barbell`/`dumbbell`).
- If candidates are returned, no exercise is created unless `force: true` is provided.

#### `PATCH /api/agent/exercises/:id`

Enriches metadata for a user-owned exercise after creation.

Patchable fields:

- `muscleGroups`
- `equipment`
- `category`
- `trackingType`
- `instructions`
- `formCues`
- `tags`

`404 EXERCISE_NOT_FOUND` is returned when the row is missing or not owned by the caller.

#### `GET /api/agent/exercises/search?q=<term>&limit=<n>`

Searches visible exercises (shared + user-scoped).

Response:

```json
{
  "data": [
    {
      "id": "exercise-1",
      "name": "Barbell Bench Press",
      "category": "compound",
      "muscleGroups": ["Chest", "Triceps"],
      "equipment": "Barbell"
    }
  ]
}
```

#### `POST /api/agent/workout-templates`

Creates a template from plain-text sections/exercises.

Request:

```json
{
  "name": "Push Day",
  "sections": [
    {
      "name": "Main",
      "exercises": [{ "name": "Bench Press", "sets": 4, "reps": 8, "restSeconds": 120 }]
    }
  ]
}
```

Response (`201`):

```json
{
  "data": {
    "template": {
      "id": "template-1",
      "userId": "user-1",
      "name": "Push Day",
      "description": null,
      "tags": [],
      "sections": [
        {
          "type": "main",
          "exercises": [
            {
              "id": "template-exercise-1",
              "exerciseId": "exercise-1",
              "exerciseName": "Bench Press",
              "sets": 4,
              "repsMin": 8,
              "repsMax": 8,
              "tempo": null,
              "restSeconds": 120,
              "supersetGroup": null,
              "notes": null,
              "cues": []
            }
          ]
        }
      ]
    },
    "newExercises": [
      {
        "id": "exercise-1",
        "name": "Bench Press",
        "possibleDuplicates": ["exercise-existing-1"]
      }
    ]
  }
}
```

Behavior notes:

- Unknown exercise names are auto-created with placeholder metadata (`muscleGroups: []`, `equipment: ""`, `instructions: null`) and then returned in `newExercises` for enrichment.
- Template creation never blocks on dedup candidates; candidate ids are surfaced in `newExercises[*].possibleDuplicates`.
- Section names are normalized to `warmup | main | cooldown` by keyword inference.

#### `PUT /api/agent/workout-templates/:id`

Replaces template content.

Response (`200`):

```json
{
  "data": {
    "id": "template-1",
    "userId": "user-1",
    "name": "Upper A",
    "description": null,
    "tags": [],
    "sections": [
      {
        "type": "main",
        "exercises": [
          {
            "id": "template-exercise-2",
            "exerciseId": "exercise-2",
            "exerciseName": "Incline Press",
            "sets": 3,
            "repsMin": 10,
            "repsMax": 10,
            "tempo": null,
            "restSeconds": null,
            "supersetGroup": null,
            "notes": null,
            "cues": []
          }
        ]
      }
    ]
  }
}
```

- `404 WORKOUT_TEMPLATE_NOT_FOUND` if template is missing or not user-owned.

#### `POST /api/agent/scheduled-workouts`

Schedules a template for a specific date.

Request:

```json
{
  "templateId": "template-1",
  "date": "2026-03-12"
}
```

Response (`201`):

```json
{
  "data": {
    "id": "schedule-1",
    "userId": "user-1",
    "templateId": "template-1",
    "date": "2026-03-12",
    "sessionId": null,
    "createdAt": 1700000000000,
    "updatedAt": 1700000000000
  }
}
```

- `404 WORKOUT_TEMPLATE_NOT_FOUND` if template is missing, not user-owned, or soft-deleted.

#### `GET /api/agent/scheduled-workouts?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>`

Lists scheduled workouts in the requested date window.

Response (`200`):

```json
{
  "data": [
    {
      "id": "schedule-1",
      "date": "2026-03-12",
      "templateId": "template-1",
      "templateName": "Upper Push",
      "sessionId": null,
      "createdAt": 1700000000000
    }
  ]
}
```

Notes:

- If a referenced template has been soft-deleted, `templateName` is `null`.

#### `POST /api/agent/workout-sessions`

Starts an in-progress session.

Request options:

- `{ "templateId": "..." }` to start from template (prebuilds sets), or
- `{ "name": "Ad hoc Session" }` for a named non-template session.

Example request:

```json
{
  "templateId": "template-1"
}
```

Response (`201`):

```json
{
  "data": {
    "id": "session-1",
    "userId": "user-1",
    "templateId": "template-1",
    "name": "Leg Day",
    "date": "2026-03-09",
    "status": "in-progress",
    "startedAt": 1700000000000,
    "completedAt": null,
    "duration": null,
    "feedback": null,
    "notes": null,
    "sets": [
      {
        "id": "set-1",
        "exerciseId": "exercise-squat",
        "setNumber": 1,
        "weight": null,
        "reps": null,
        "completed": false,
        "skipped": false,
        "section": "main",
        "notes": null
      }
    ]
  }
}
```

#### `PATCH /api/agent/workout-sessions/:id`

Updates session status/notes and upserts set logs by `exerciseName + setNumber`.

Request:

```json
{
  "status": "completed",
  "notes": "Solid session",
  "sets": [
    { "exerciseName": "Bench Press", "setNumber": 1, "weight": 105, "reps": 7 },
    { "exerciseName": "Squat", "setNumber": 1, "weight": 225, "reps": 5 }
  ]
}
```

Response (`200`):

```json
{
  "data": {
    "id": "session-1",
    "userId": "user-1",
    "templateId": "template-1",
    "name": "Leg Day",
    "date": "2026-03-09",
    "status": "completed",
    "startedAt": 1700000000000,
    "completedAt": 1700003720000,
    "duration": 62,
    "feedback": null,
    "notes": "Solid session",
    "sets": [
      {
        "id": "set-1",
        "exerciseId": "exercise-bench-press",
        "setNumber": 1,
        "weight": 105,
        "reps": 7,
        "completed": true,
        "skipped": false,
        "section": "main",
        "notes": null,
        "createdAt": 1700000000000
      },
      {
        "id": "set-2",
        "exerciseId": "exercise-squat",
        "setNumber": 1,
        "weight": 225,
        "reps": 5,
        "completed": true,
        "skipped": false,
        "section": "main",
        "notes": null,
        "createdAt": 1700000000000
      }
    ],
    "createdAt": 1700000000000,
    "updatedAt": 1700003720000
  }
}
```

Behavior notes:

- Unknown exercise names are auto-created.
- Upserted sets are marked `completed: true`, `skipped: false`.
- Completing a session sets `completedAt` and duration.
- `404 WORKOUT_SESSION_NOT_FOUND` if missing.

### Daily Tracking

#### `POST /api/agent/weight`

Creates or updates weight entry by date.

Request:

```json
{
  "date": "2026-03-09",
  "weight": 182.4,
  "notes": "fasted"
}
```

Response:

- `201` when row is created
- `200` when existing row is updated

Example response:

```json
{
  "data": {
    "id": "weight-1",
    "date": "2026-03-09",
    "weight": 182.4,
    "notes": "fasted",
    "createdAt": 1700000000000,
    "updatedAt": 1700000000000
  }
}
```

#### `GET /api/agent/habits`

Returns active habits with today entry projection:

```json
{
  "data": [
    {
      "id": "habit-1",
      "name": "Supplements",
      "trackingType": "boolean",
      "todayEntry": null
    },
    {
      "id": "habit-2",
      "name": "Sleep",
      "trackingType": "time",
      "todayEntry": { "value": 8, "completed": true }
    }
  ]
}
```

#### `PATCH /api/agent/habits/:id/entries`

Upserts one day for one habit.

Request:

```json
{
  "date": "2026-03-09",
  "value": 8
}
```

Response (`200` or `201`):

```json
{
  "data": {
    "id": "entry-1",
    "habitId": "habit-2",
    "userId": "user-1",
    "date": "2026-03-09",
    "completed": true,
    "value": 8,
    "createdAt": 1700000000000
  }
}
```

Behavior notes:

- At least one of `completed` or `value` is required.
- Omitted fields merge from existing entry if present.
- `201` on insert, `200` on update.
- `404 HABIT_NOT_FOUND` when habit is missing.

#### `GET /api/agent/nutrition/:date/summary`

Returns aggregate summary + expanded meal rows for one day.

Response:

```json
{
  "data": {
    "summary": {
      "date": "2026-03-09",
      "meals": 1,
      "actual": { "calories": 450, "protein": 40, "carbs": 30, "fat": 15 },
      "target": { "calories": 2500, "protein": 180, "carbs": 260, "fat": 80 }
    },
    "meals": [
      {
        "meal": {
          "id": "meal-1",
          "nutritionLogId": "log-1",
          "name": "Lunch",
          "time": "12:00",
          "notes": null,
          "createdAt": 1700000000000,
          "updatedAt": 1700000000000
        },
        "items": [
          {
            "id": "item-1",
            "mealId": "meal-1",
            "foodId": "food-1",
            "name": "Chicken Breast",
            "amount": 1,
            "unit": "serving",
            "calories": 165,
            "protein": 31,
            "carbs": 0,
            "fat": 3.6,
            "fiber": null,
            "sugar": null,
            "createdAt": 1700000000000
          }
        ]
      }
    ]
  }
}
```

## Required Workflow Patterns

### 1) Context-First Pattern

1. Call `GET /api/agent/context`.
2. Derive plan from current nutrition/workout/habit/weight state.
3. Execute one or more write operations (`/api/agent/meals`, `/api/agent/weight`, `/api/agent/workout-sessions`, `/api/agent/habits/:id/entries`).
4. Optionally re-read context for confirmation.

### 2) Food Search + Meal Logging

1. Call `GET /api/agent/foods/search?q=<food>`.
2. If missing, create via `POST /api/agent/foods`.
3. Submit all meal items using `POST /api/agent/meals`.
4. Handle `UNRESOLVED_FOODS` by creating missing foods and retrying.

### 3) Workout Creation + Session Logging

1. Search/create exercises (`GET /api/agent/exercises/search`, `POST /api/agent/exercises`).
2. If `POST /api/agent/exercises` returns `created: false`, review `candidates` and retry with `force: true` only when intentional.
3. Create/update template (`POST/PUT /api/agent/workout-templates`).
4. Schedule template (`POST /api/agent/scheduled-workouts`) and review upcoming plan (`GET /api/agent/scheduled-workouts`).
5. Read `newExercises` from template create response and enrich each via `PATCH /api/agent/exercises/:id`.
6. Start session (`POST /api/agent/workout-sessions`).
7. Log sets and status (`PATCH /api/agent/workout-sessions/:id`).

## Error Handling Conventions

Standard error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": {}
  }
}
```

`details` is optional and may be omitted.

Common base codes:

- `UNAUTHORIZED`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `CONFLICT`
- `INTERNAL_ERROR`

Agent-route-specific codes in current implementation:

- `UNRESOLVED_FOODS`
- `HABIT_NOT_FOUND`
- `WORKOUT_TEMPLATE_NOT_FOUND`
- `WORKOUT_SESSION_NOT_FOUND`

## Request Validation Rules

- Dates must be `YYYY-MM-DD` and valid calendar dates.
- Time fields use `HH:MM` 24-hour format.
- All writes are user-scoped from `request.userId`.
- Validation failures return `400 VALIDATION_ERROR`.

## Rate Limiting

Current status:

- No explicit rate-limit middleware is applied to `/api/agent/*` yet.

Planned approach:

- Add per-user/token rate limiting at the Fastify layer (request identity derived from auth).
- Return `429` with the standard error envelope when limits are exceeded.
- Start with conservative write limits (`/meals`, `/workout-sessions`, `/weight`, habit entry patch), then tune using production telemetry.
