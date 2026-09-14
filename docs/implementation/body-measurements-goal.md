# BodyProgress measurement contracts and persistence (121)

Status: frozen implementation handoff; documentation/setup only. This branch contains no BodyProgress source, migration, UI, server launch, deployment, or production change.

## User outcome

A future Pulse implementation must let an authenticated user manually paste or enter dated BodyProgress measurements, save one coherent measurement record per local date, correct or delete that record, and retrieve the history safely. This milestone is the persistence/API contract only. It does not build the BodyProgress screen, photos, charts/trends, coaching, or automatic measurement ingestion.

## Base and execution contract

- Repository: `/Users/meridian/Projects/pulse-fitness-app`
- Base: `origin/main` at `050ae6b209cc5679ec26efca03c2e540257e781b`
- Implementation branch/worktree: `feat/body-measurements`, `/Users/meridian/Projects/pulse-body-measurements`
- Runtime policy: primary GPT-5.6 Sol, medium, Fast OFF; internal review GPT-5.6 Luna, medium, Fast OFF. These are launcher/runtime settings, not acceptance gates.
- The next agent must read this file and the listed source before editing, preserve the existing untracked main worktree, and make one bounded implementation plan. Manual-paste execution is authorized; do not launch Codex/app-server from this handoff.

## Current-state inventory to reuse (not duplicate)

- Weight persistence and date-scoped CRUD pattern: `apps/api/src/routes/weight/index.ts`, `apps/api/src/routes/weight/store.ts`, `packages/shared/src/schemas/weight.ts`, `apps/api/src/db/schema/body-weight.ts`.
- Weight canonical-unit/range rules: `packages/shared/src/utils/weight-unit.ts`; migration/history guard: `apps/api/drizzle/0041_canonical_body_weight.sql`, `apps/api/src/db/canonical-weight-migration.ts`.
- Auth and unified JWT/AgentToken route contract: `apps/api/src/middleware/auth.ts`, `apps/api/src/routes/weight/index.ts`, `docs/conventions/api-conventions.md`.
- User-local date/timezone behavior: `apps/api/src/lib/user-time-zone.ts`, `apps/api/src/lib/date.ts`, weight relative-date handling in `apps/api/src/routes/weight/store.ts`.
- Ownership and account deletion: `apps/api/src/routes/auth/store.ts` (`deleteUserAccount`), user foreign-key/cascade patterns in `apps/api/src/db/schema/*`.
- Export/data-retention precedent: inspect the existing account/data export route and its integration tests before adding any export hook; do not invent a second export pipeline. Trash/purge is not the correct default for measurement rows unless an existing canonical account-deletion/export contract requires it.
- Integration fixture/migration pattern: `apps/api/src/routes/weight/trend-store.integration.test.ts`; use a fresh migrated SQLite database, realistic populated rows, a second user, and restart/readback checks.

## Fixed v1 contract decisions

1. **One record per user per local date.** Re-submitting the same date replaces the editable record transactionally (upsert semantics), rather than creating same-day duplicates.
2. **Date is an explicit `YYYY-MM-DD` user-local date.** No server timestamp conversion may silently move the record to an adjacent day. Future-date policy must match the nearest existing body-data policy; if no existing policy applies, reject future local dates with a named 400 error rather than silently clamping.
3. **Numbers are canonical server values; display units are presentation.** Store each measurement in its declared canonical unit, preserve `unitAtEntry` where meaningful, validate finite positive bounded values, and return the user's configured display unit only when that is already the established pattern. Do not use floating-point strings as a second source of truth.
4. **Notes are optional, trimmed, nullable, and bounded** using the existing notes convention; empty input becomes null/omitted consistently.
5. **Ownership is mandatory on every read and write.** JWT and AgentToken callers use the same route/schema and response semantics. Cross-user IDs return 404, not an ownership leak.
6. **CRUD surface is explicit:** create-or-replace for a date, list with bounded date range/pagination, get by id/date as needed by the existing route convention, patch, and delete. Delete is hard-delete only if the existing retention/export contract says measurement records are ordinary user data; otherwise implement the established account-deletion cascade, not a new trash type.
7. **No derived interpretation in this milestone.** Do not calculate body-fat trends, deltas, goals, readiness, coaching, photos, or charts. Persist and return facts only.
8. **No silent schema expansion.** The measurement names, canonical units, per-field bounds/precision, and whether a field is optional must be represented by one shared strict schema and one database contract.

## Consequential product decision to resolve before source edits

The existing repo establishes weight but does not establish a BodyProgress measurement vocabulary. Before implementing, product must choose the exact v1 field set and semantics in one decision (not a low-stakes question loop):

- proposed field set: `waist`, `hips`, `chest`, `neck`, `left_arm`, `right_arm`, `left_thigh`, `right_thigh`, and optional `body_fat_percent`;
- proposed unit policy: circumferences in `cm` or `in`, one unit per record or per field; body fat in percentage points;
- proposed bounds/precision for each field and whether missing fields are allowed on partial records;
- whether a same-date partial submission replaces the whole record or merges fields.

Until that single decision is confirmed, the implementation agent must not guess field names, units, or merge semantics. It may prepare schema/table scaffolding only after the decision is written into the implementation commit/PR description. Weight remains a separate source and must not be copied into this record.

## Required implementation boundaries

- Prefer a new focused `body-measurements` shared schema, DB table, store, route plugin, and tests only if the chosen contract cannot reuse an existing generic measurement abstraction. Search first; do not create a parallel weight engine or duplicate date/auth helpers.
- All user rows require `userId`, indexed/unique by `(userId, localDate)`, strict date checks, explicit unit/value checks, created/updated timestamps, and a foreign key with the repo's established account-deletion behavior.
- Route registration, OpenAPI schemas, and generated/shared exports must follow the existing monorepo conventions.
- No UI route/component, photos/media storage, trends, dashboard widget, agent context enrichment, production configuration, migration against a live database, deployment, merge, or PR publication.

## Acceptance and verification for the future implementation

Run focused shared-schema, store, route, and migration tests first, then one final risk-relevant regression gate. The final report must contain raw command output/log paths, exact clean commit SHA, and source/config identity.

Minimum cases:

- strict schema rejects unknown fields, malformed local dates, NaN/infinite/out-of-bound values, invalid units, empty invalid records, and forbidden future dates;
- create returns 201, same-date retry returns 200 and leaves exactly one row, patch changes only supplied fields under the frozen merge rule, delete is idempotent/404 as specified;
- JWT and AgentToken responses are identical for the same owner; missing/expired/invalid auth is rejected; cross-user read/patch/delete returns 404 with no mutation;
- date range/list ordering and pagination are deterministic; local timezone boundary tests prove no UTC day shift;
- fresh migration, populated migration/restore, schema constraints, unique index, foreign key, account-deletion behavior, and restart/readback all pass;
- export includes the new records through the existing canonical export mechanism, and purge/account deletion removes or retains them exactly according to that mechanism; no orphan rows remain;
- `git diff --check`, focused tests, and the agreed final regression command pass. Do not claim UI/browser acceptance because UI is explicitly out of scope.

## Forbidden actions

Do not touch production data or environment, run deployment, alter `.env`, start Codex/app-server, launch a server for this preparation, implement the UI, add photos/trends, merge/push, or publish a PR. Do not modify the dirty main worktree's untracked files.

## Return contract

Return: decision status if the field-set decision is still blocked; otherwise exact branch/worktree, base and final SHA, changed files, verification commands with raw results, migration/export/purge evidence, clean status, and explicit confirmation that forbidden actions were not taken.
