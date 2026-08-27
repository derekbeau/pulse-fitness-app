# Foods API — Agent Guide

How to create, list, update, and delete foods in a user's personal food database via the Pulse API.

## Authentication

All foods endpoints require auth via the `Authorization` header. Two schemes are supported:

- **JWT** (user sessions): `Authorization: Bearer <jwt_token>`
- **AgentToken** (agent integrations): `Authorization: AgentToken <token>`

### Getting a JWT token (dev)

The frontend auto-logs in as the `pulse-dev` user. To get a token manually:

```bash
# Register (first time)
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username": "pulse-dev", "password": "pulse-dev-password", "name": "Pulse Dev"}'

# Login (subsequent)
curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username": "pulse-dev", "password": "pulse-dev-password"}'
```

Both return `{ data: { token: "<jwt>", user: { ... } } }`. Use the token in subsequent requests.

## Endpoints

Base URL: `http://localhost:3001/api/v1/foods`

### Create a food — `POST /api/v1/foods`

Returns `201` with `{ data: Food }`.

```bash
curl -s -X POST http://localhost:3001/api/v1/foods \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Chicken Breast (grilled)",
    "brand": null,
    "servingSize": "4 oz",
    "servingGrams": 113,
    "calories": 187,
    "protein": 35,
    "carbs": 0,
    "fat": 4,
    "fiber": null,
    "sugar": null,
    "verified": true,
    "source": "USDA",
    "notes": null
  }'
```

**Required fields:** `name`, `calories`, `protein`, `carbs`, `fat`

**Optional fields:** `brand`, `servingSize`, `servingGrams`, `fiber`, `sugar`, `verified` (defaults `false`), `source`, `notes`

**Constraints:**

- `name`: 1–255 chars, trimmed
- `servingSize`: max 100 chars
- `servingGrams`: must be positive
- `calories`, `protein`, `carbs`, `fat`: non-negative numbers
- `fiber`, `sugar`: non-negative when provided
- `source`: max 255 chars
- `notes`: max 2000 chars

### List foods — `GET /api/v1/foods`

Returns `200` with `{ data: Food[], meta: { page, limit, total } }`.

```bash
# All foods, alphabetical
curl -s 'http://localhost:3001/api/v1/foods?sort=name' \
  -H 'Authorization: Bearer <token>'

# Search by name/brand
curl -s 'http://localhost:3001/api/v1/foods?q=chicken&sort=name' \
  -H 'Authorization: Bearer <token>'

# Highest-calorie definitions
curl -s 'http://localhost:3001/api/v1/foods?sort=calories&limit=10' \
  -H 'Authorization: Bearer <token>'
```

**Query params:**

| Param   | Default | Description                              |
| ------- | ------- | ---------------------------------------- |
| `q`     | —       | Search name and brand (case-insensitive) |
| `sort`  | `name`  | `name`, `recent`, `usage`, or `calories` |
| `page`  | `1`     | Page number (min 1)                      |
| `limit` | `50`    | Items per page (1–100)                   |

**Sort modes:**

- `name` — alphabetical (case-insensitive)
- `recent` — by definition `updatedAt` descending, then name
- `usage` — by lifetime usage counter descending, then name
- `calories` — by the current definition's calories descending, then name

These list fields describe the current saved-food library. They are not selected-range analytics.
Use the analytics endpoints below for historical usage, contribution, and protein-density facts.

### Food analytics — `GET /api/v1/foods/analytics`

Returns a pagination-independent selected-range summary and a server-filtered, server-sorted page of
active saved foods. `30d` and `90d` are inclusive program-local calendar ranges; `all` begins with
the user's first nutrition log. Historical totals always come from meal-item calorie and macro
snapshots and are linked only by `foodId`. Current definitions are returned separately.

```bash
curl -s 'http://localhost:3001/api/v1/foods/analytics?range=30d&sort=most_used&page=1&limit=25' \
  -H 'Authorization: Bearer <token>'
```

Supported filters are `usage`, `verification`, `review`, `grams` (`any`, `has_grams`, or
`missing_grams`), normalized `tags`, and text search `q`. Supported sorts are `most_used`,
`most_recent`, `calorie_contribution`,
`protein_contribution`, `protein_density`, `calorie_density`, `needs_review`, and `name`. Every sort
has deterministic name, brand, and food-ID tie breakers, so pagination cannot duplicate or skip a
food.

The summary distinguishes active linked, unlinked, inactive-linked, and unresolved meal items. Its
linked calorie share uses all meal-item calories as the denominator. Each row's share uses only
active linked-food calories as the denominator.

### Food analytics detail — `GET /api/v1/foods/:id/analytics`

Returns the same current-definition and selected-range observed facts for one active owned food,
plus a bounded page of recent linked occurrences. Occurrences expose the nutrition-log local date,
day status, meal identity, recorded portion, and immutable calorie/macro snapshot. A missing,
foreign, or soft-deleted food returns `404 FOOD_NOT_FOUND`.

### Update a food — `PUT /api/v1/foods/:id`

Returns `200` with `{ data: Food }`. All fields are optional but at least one must be provided.

```bash
curl -s -X PUT 'http://localhost:3001/api/v1/foods/<food-id>' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"calories": 95, "notes": "Updated from nutrition label"}'
```

Returns `404` with `FOOD_NOT_FOUND` if the food doesn't exist or belongs to another user.

### Delete a food — `DELETE /api/v1/foods/:id`

Returns `200` with `{ data: { success: true } }`.

```bash
curl -s -X DELETE 'http://localhost:3001/api/v1/foods/<food-id>' \
  -H 'Authorization: Bearer <token>'
```

Returns `404` with `FOOD_NOT_FOUND` if not found.

## Food Object

```json
{
  "id": "uuid",
  "userId": "uuid",
  "name": "Greek Yogurt",
  "brand": "Fage 0%",
  "servingSize": "170 g",
  "servingGrams": 170,
  "calories": 90,
  "protein": 18,
  "carbs": 5,
  "fat": 0,
  "fiber": 0,
  "sugar": 5,
  "verified": true,
  "source": "Manufacturer label",
  "notes": null,
  "lastUsedAt": null,
  "createdAt": 1772936869000,
  "updatedAt": 1772936869000
}
```

Timestamps are Unix epoch in milliseconds. `lastUsedAt` is updated separately when a food is used in a meal entry — agents should not set it during creation.

## Key Source Files

- **Routes:** `apps/api/src/routes/foods/index.ts`
- **Store (DB queries):** `apps/api/src/routes/foods/store.ts`
- **Zod schemas:** `packages/shared/src/schemas/foods.ts`
- **DB schema:** `apps/api/src/db/schema/foods.ts`
- **Tests:** `apps/api/src/routes/foods/index.test.ts`, `store.test.ts`
