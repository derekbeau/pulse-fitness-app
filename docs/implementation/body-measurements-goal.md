# BodyProgress measurement contracts and persistence (121)

Status: frozen implementation handoff; documentation/setup only. This branch contains no BodyProgress source, migration, UI, server launch, deployment, or production change.

## User outcome

An authenticated user can manually paste or enter dated BodyProgress measurements, save one coherent record per user-local date, correct or explicitly delete that record, and retrieve history safely. This milestone covers the API, persistence, and manual logging contract only. It does not build the BodyProgress screen, photos, charts/trends, coaching, reminders, or automatic measurement ingestion/estimation.

## Base and execution contract

- Repository: `/Users/meridian/Projects/pulse-fitness-app`
- Preparation base: `origin/main` at `050ae6b209cc5679ec26efca03c2e540257e781b`
- Implementation branch/worktree: `feat/body-measurements`, `/Users/meridian/Projects/pulse-body-measurements`
- Handoff starting commit: `0cb3a380e83f880a15230ef1117604a6ca3fd6e0`
- Runtime policy: primary GPT-5.6 Sol, medium, Fast OFF; bounded review GPT-5.6 Luna, medium, Fast OFF. Runtime settings are not acceptance gates.
- Manual-paste execution is authorized by this handoff; do not launch Codex/app-server. The next agent must read this file, inspect the named source contracts and live git status, preserve the existing untracked main worktree, and make one bounded implementation plan.

## Existing contracts to reuse

- Weight persistence/date-scoped CRUD: `apps/api/src/routes/weight/index.ts`, `apps/api/src/routes/weight/store.ts`, `packages/shared/src/schemas/weight.ts`, `apps/api/src/db/schema/body-weight.ts`.
- Weight canonical-unit conventions: `packages/shared/src/utils/weight-unit.ts`, `apps/api/drizzle/0041_canonical_body_weight.sql`, `apps/api/src/db/canonical-weight-migration.ts`.
- Auth and unified JWT/AgentToken semantics: `apps/api/src/middleware/auth.ts`, `apps/api/src/routes/weight/index.ts`, `docs/conventions/api-conventions.md`.
- User-local date authority and precedence: `apps/api/src/lib/user-time-zone.ts`, `apps/api/src/lib/date.ts`, `docs/specs/user-time-zone-v1.md`. The effective program time zone overrides the persisted profile time zone; otherwise the profile time zone is authoritative; unresolved authority fails closed with `TIME_ZONE_REQUIRED`.
- Ownership/account deletion: `apps/api/src/routes/auth/store.ts` and user foreign-key/cascade patterns in `apps/api/src/db/schema/*`.
- Migration/integration shape: `apps/api/src/routes/weight/trend-store.integration.test.ts`; use fresh migrated SQLite, realistic populated rows, a second user, restart/readback, and rollback checks.

Do not copy weight into the BodyProgress record. Do not create another date, timezone, auth, export, or weight engine. If the live repository has no canonical account-export route, do not invent one in 121; retain the established account-deletion cascade and document export as a follow-up integration point rather than claiming it is implemented.

## Frozen v1 product contract

### Fields and semantics

The strict shared schema and database contract contain exactly these user-reported fields:

- `waist`, `hips`, `chest`, `neck`
- `left_arm`, `right_arm`
- `left_thigh`, `right_thigh`
- optional `body_fat_percent`

Every field is independently optional. A record is a log-only fact container: missing fields mean not recorded, not zero, not unchanged, and not inferred from weight or another field. Body fat is user-reported percentage points only; never diagnose, derive, estimate, trend, or infer it in 121.

A non-empty create/upsert is required: at least one measurement must be present. A patch must include at least one field or notes change. An explicit `null` clears an optional measurement; omitted fields are untouched. A patch that would leave the record with no measurements is rejected with a named validation error; use delete to remove the record. Empty strings and whitespace-only numeric values are invalid, not implicit clears.

### Units, canonical storage, and precision

- Circumferences accept `cm` or `in`; one `unit` applies to every circumference value in a create/upsert or patch. `body_fat_percent` is unitless percentage points and is not converted.
- Store circumferences canonically in millimetres as integers (`circumferenceMm`), converting from the declared request unit with a single shared conversion utility. Return values in the established user display unit only when the existing API convention supports that presentation; otherwise return canonical values plus the declared `unitAtEntry` without a second floating-point source of truth.
- Preserve `unitAtEntry` for the write that established/updated each stored circumference set, following the weight provenance convention. A patch containing circumferences must include `unit`; a unit without a circumference value is invalid. Do not silently reinterpret omitted fields.
- Accepted circumference range is 20.0 cm through 300.0 cm inclusive after conversion. Accepted body-fat range is 1.0 through 70.0 percentage points inclusive. Inputs must be finite, positive, and no more precise than one decimal place in the declared unit. Canonical conversion rounds once to the nearest millimetre and rejects any result outside the bounds; responses use stable numeric rounding appropriate to the established API pattern. These are technical data-quality bounds, not user-design guidance.

### Date, cadence, and same-date behavior

- `date` is an explicit valid `YYYY-MM-DD` user-local calendar date. It is never shifted through UTC. Future-date handling must match the nearest existing body-data policy; if none applies, reject future local dates with a named 400 error rather than clamping.
- Manual logging has no minimum cadence, reminder, or automatic schedule. Users may submit any permitted local date; list/range/pagination behavior follows the weight contract.
- There is exactly one record per `(userId, localDate)`. Same-date create/upsert is transactional merge: supplied non-null fields replace only those fields, supplied `null` fields clear only those fields, and omitted fields preserve their existing values. It is never a whole-record replace. An empty resulting record is rejected atomically.
- The `(userId, localDate)` unique constraint is the owner/date conflict authority. All reads and writes are user-scoped; another user's id/date behaves as not found (404), with no mutation or ownership leak.

### Notes and CRUD

Notes remain optional, trimmed, nullable, and bounded by the existing notes convention; empty notes normalize consistently to null/omitted. CRUD is explicit: create-or-merge by date, bounded list/range/pagination, get by id/date when established by the route convention, patch with the merge/null/omission rules above, and explicit delete. Delete is hard-delete only if the existing ordinary-user-data retention convention supports it; otherwise use the established account-deletion behavior, never a new trash type.

## Implementation boundaries

Search for a reusable generic measurement abstraction first. If none exists, use one focused `body-measurements` shared strict schema, DB table, store, route plugin, migration, OpenAPI registration, exports, and tests. Rows require `userId`, unique/indexed `(userId, localDate)`, strict date/unit/value checks, created/updated timestamps, and the repository's established foreign-key/account-deletion behavior. Keep JWT and AgentToken route schemas and response semantics identical.

Out of scope: UI routes/components, manual-paste UI, photos/media, charts/trends, dashboard widgets, coaching/context enrichment, automatic estimates, production configuration/data, live migrations, deployment, merge, push, PR publication, or any server/Codex launch.

## Acceptance and verification

Run focused shared-schema, store, route, migration, and OpenAPI checks first, then one final uncached risk-relevant regression gate. Capture raw receipts, exact tested SHA, source/config identity, `git diff --check`, and clean status. Do not claim UI/browser acceptance for this backend-only milestone.

Minimum evidence:

- strict schema rejects unknown fields, malformed dates, invalid units, mixed/absent required unit usage, NaN/infinite/out-of-bound/over-precision values, empty creates, and empty-result patches;
- cm/in conversions round-trip through canonical millimetres; body fat remains user-reported percentage points with no derived interpretation;
- same-date create/upsert returns one row and merges supplied fields while preserving omitted fields; null clears only the named field; failed empty-result updates are atomic;
- JWT and AgentToken owner responses match; invalid auth is rejected; cross-user get/patch/delete returns 404 without mutation;
- local-timezone authority and future-date behavior match existing weight/body-data contracts; list ordering, date ranges, and pagination are deterministic;
- fresh migration, populated migration/restore, constraints/unique index, foreign key, account-deletion cascade, rollback, restart/readback, and ordinary-data retention evidence pass; do not claim a nonexistent export endpoint;
- `git diff --check` and the agreed final uncached regression command pass.

## Forbidden actions

Do not touch production data or environment, alter `.env`, launch Codex/app-server or a server, implement UI/photos/trends, merge/push, publish a PR, or modify the dirty main worktree's untracked files.

## Return contract

Return exact branch/worktree, starting and final SHA, changed files, verification commands with raw results/paths, migration and account-deletion evidence, clean status, and explicit confirmation that forbidden actions were not taken. No product decisions remain open in this handoff.
