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

## Ranked reuse and intentional promotion (v1)

Start a logging write with `GET /api/v1/nutrition/logging-context?date=YYYY-MM-DD&q=...`.
This database-only read supports JWT and AgentToken with the same response schema and
owner scope. It preserves `today`, `recentMealItems`, `savedFoodMatches`, `frequentFoods`,
`shorthandExpansions`, `query`, and `waterHabit`, and adds `promotionCandidates`.

Saved matches expose `reason` and `evidence` categories: `exact_normalized`, `alias_exact`,
`brand_or_tag`, `token_order`, `recent_name`, and `partial_name`. Evidence identifies the
matched field and literal value; recent evidence also identifies the owned meal item.
`ambiguity: multiple_candidates` means multiple foods share that evidence tier, computed
before `limitFoods`. Ranking orders these categories in the listed order, then usage count
descending, normalized name, brand, and food ID in ascending code-point order. Saved matches,
frequent foods, and nested promotion matches expose only categorical ranking evidence and
ambiguity; no numeric rank, confidence, or binding threshold is serialized. A first-ranked
result is advisory and never permission to link. Shorthand-expansion scoring is a separate,
unchanged contract.

Names normalize to lowercase, remove straight/curly apostrophes, and replace remaining
punctuation/whitespace with spaces while preserving Unicode letters and numbers. A bare
`foodName` resolves only when exactly one active owned food has that normalized name.
When a brand is supplied it must also normalize exactly to that definition's brand.
Duplicate exact names remain unresolved even if the supplied brand distinguishes one.
Identity/brand ambiguity returns `422 UNRESOLVED_FOODS`. Alias, reordered-token, partial,
or recent-name evidence alone never resolves a bare name. Inspect the evidence and supply
an intentional owned `foodId`, or use explicit ad hoc input with complete macros.

Aliases are server-owned `FOOD_ALIASES`, version `1` in `reuse-policy.ts`. The literal
reviewed groups are `tj / Trader Joe / Trader Joe's`; `jam / preserves / jelly / raspberry`;
`bread / toast / sourdough / slice`; and `standard shake / protein shake / Orgain /
Orgain Chocolate Protein Powder / Anthony's / Anthony's Premium Pea Protein / pea protein /
protein powder`. They preserve the existing advisory expansions, including broad related
terms; `alias_exact` records the literal expansion that matched, not equivalent nutrition.
Changing a group requires review, a version bump, and the literal alias test. There is no
alias migration, user-managed endpoint, or UI.

Promotion candidates use only owned unlinked snapshots from `[date - 30 days, date)`;
these are nutrition-log calendar dates, not UTC timestamp buckets. At least two distinct
dates are required, regardless of the number of same-day occurrences. The `days` and
`limitRecentItems` display controls never truncate promotion evidence. Each candidate
returns normalized/display name, counts, latest date, all deterministic newest-first
`snapshots`, `stability`, `stabilityReason`, `likelySavedFoodMatch`, and `reason`:

- `REPEATED_ADHOC`: recurrence with no saved candidate.
- `EXACT_SAVED_MATCH`: one adequate exact saved definition; prefer intentional reuse.
- `POSSIBLE_SAVED_MATCH`: inspect advisory matches before creating a duplicate.

`stable_exact` requires identical complete core macros, amount, exact unit, display
quantity/unit identity, fiber, and sugar across every snapshot. No conversions, tolerance,
variance cutoff, or nutritional equivalence is inferred. Differing snapshots or incomplete
serving evidence remain `review_only`, with every occurrence retained. Restaurant, travel,
hotel, and composite/home-cooked names are never approved or excluded by a heuristic.
The agent decides whether the concrete current entry suits reuse. Recurrence is evidence,
never automatic promotion.

### Current meal writes

The preferred `POST /api/v1/meals`, date-scoped `POST /api/v1/nutrition/:date/meals`, and
append `POST /api/v1/meals/:id/items` share input and middleware rules:

- `adhoc: true` or `saveToFoods: false` requires complete inline calories, protein, carbs,
  and fat and produces `foodId: null`, including when an exact saved definition exists.
- Non-null `foodId` with either ad-hoc choice fails schema validation with
  `400 VALIDATION_ERROR` and issue message `ADHOC_FOOD_ID_CONFLICT`. `adhoc: true` with
  `saveToFoods: true` also fails validation. Explicit links must belong to the caller.
- AgentToken reuse resolves the owned food's per-serving core macros, fiber, and sugar,
  multiplied by `amount` (or `quantity`), into the current item snapshot, overriding
  submitted macros. JWT callers retain existing canonical inline-snapshot semantics.
- A current AgentToken `foodName` write with complete inline per-serving macros can create
  a missing definition after exact reuse has been checked. `saveToFoods: true` explicitly
  expresses that intent. Unknown names without complete macros fail unresolved. Creation
  retains `brand`, `source`, `notes`, `fiber`, `sugar`, `servingSize`, `servingGrams`,
  `verified`, and `tags` using the food schema's validation. Inline macros for explicit
  ad hoc items remain totals for the submitted item under the existing convention.
- Agent mutation responses add typed `agent.itemOutcomes: [{ itemId, foodId, outcome }]`,
  where `outcome` is `reused`, `created`, or `adhoc`. Append returns all current items:
  old linked items are `reused`, unlinked items are `adhoc`, and items linked to a definition
  created by this request are `created`. JWT responses have no agent enrichment.
- On both create routes, `returnSummary: true` embeds `data.summary` and suppresses hints
  and actions asking to fetch/review that same summary again. Without it, existing summary
  guidance remains. Append does not support `returnSummary`.

Promotion is an intentional current write using trustworthy prior evidence. Reading
candidates or creating/reusing a definition never relinks past unlinked items, backfills
history, updates a prior food definition, or changes historical macro, amount, or display
snapshots. Later food edits leave every historical snapshot unchanged. Existing explicit
meal-item correction and food-merge routes retain their separately documented semantics.
Food usage remains the #143 owner-scoped count/maximum-createdAt projection, and note-only
activity retains the #133 invariants.

Food definitions planned by AgentToken meal writes are created inside the same transaction as
the current meal/items and usage projection. Exact reuse is rechecked inside that transaction
so concurrent current writes reuse the first committed definition; any persistence failure
rolls back the new definition together with the meal. No history is relinked.

Current meal creation (preferred and date-scoped) and append-items acquire SQLite's writer
with `BEGIN IMMEDIATE` before the final owned-food identity recheck. Food creation, current
meal/items, and usage projection commit or roll back together. Transient SQLite busy/locked
errors retry the entire transaction at most four times, with 25/50/100ms backoff and no
blocking busy wait inside an attempt. Exhaustion returns the existing server error; other
persistence errors are not retried. Created outcomes are published only after commit.
Legacy duplicate identities remain representable and fail closed; no history is relinked.
