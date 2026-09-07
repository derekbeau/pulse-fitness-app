# Food usage integrity behavior

`usageCount` counts surviving linked meal-item rows. `lastUsedAt` is their maximum
`createdAt` in Unix milliseconds, or null when none survive. Both the food owner
and the item's meal/nutrition-log owner must match. Duplicate links each count.
Ad-hoc/null links do not count. Calendar dates and display times do not determine
recency. This includes foods in Trash, per Derek's 2026-09-07 decision recorded in
the amended goal contract. Trashing a food preserves meal history; restore exposes
recomputed metadata. Ordinary meal writes still require an available active owner food for new links.
Historical static reimport preserves owner mappings to trashed foods.

## Transaction and writer inventory

- Both create routes delegate usage to `createMealForDate`; date create no longer
  increments separately. Create, append, item edit/relink/unlink, meal delete,
  merge, trash and restore recompute affected foods inside the same synchronous
  SQLite transaction as their row mutations. Usage failure propagates and rolls
  back the operation. Metadata-only meal edits leave usage unchanged.
- `reconcileFoodUsage` in `foods/store.ts` is the sole production counting
  implementation. `refreshFoodUsage` selects distinct affected owner foods and
  invokes it inside the caller's transaction. It never selects foreign write
  targets. Projection updates preserve food `updatedAt` rather than treating a
  repair as a food content edit.
- Merge derives both affected food projections from final links instead of adding
  old counters. The loser is then trashed with zero owner-linked usage. Foreign
  meal links, including deliberately malformed fixtures, are never relinked.
- Food purge verifies the trashed owner target before deleting owner-linked rows.
  A foreign link causes failure before FK `SET NULL` could modify another user's
  item. A failed final food delete rolls back earlier item deletion.
- Static meal reimport captures old linked IDs before cascade deletion, captures
  new IDs, and refreshes both inside the day's transaction. Food catalog import
  no longer invents recency from free-text name/date matches. Fixture seed tools
  intentionally manufacture fixture states; they are not application writers.
- Preferred item PATCH now validates the actual `/:id/items/:itemId` path rather
  than requiring date-scoped parameters.

Exactly-once describes the row projection, not network request deduplication.
Repeated successful create/append requests create new rows, each contributing once.
Repeated identical corrections, deletion attempts, and reconciliation cannot add
extra usage. Synchronous SQLite transactions serialize each connection's writes;
competing SQLite writers either commit atomically or fail without partial usage.

## Bounded reconciliation API

`POST /api/v1/admin/reconcile-food-usage` retains JWT-only authentication. The JWT
must be a valid session with the existing issuer/type/expiry claims. AgentToken
callers are rejected; ordinary meal routes continue to accept both schemes.
The user scope comes only from authentication and must exist in the database.

An omitted body or `{}` defaults to `{"mode":"dry-run","limit":100}`.
Explicit repair uses `{"mode":"apply","limit":100}`. Limits are integers 1–500.
All foods, including Trash, must fit the supplied bound; exceeding it fails before
any update. There is no partial page, cursor, all-users mode, or arbitrary user/food
selector. Unknown body keys and invalid mode/limits fail closed. A larger owner
scope requires a separately designed and reviewed operation, not an implicit
unbounded fallback.

Each response includes authenticated `userId`, `mode`, `reconciled` (examined),
`changed` (drift detected), `updated` (writes), and deterministic ID-ordered rows
with `before` and `projected` values. Dry-run performs no writes. Apply is one
immediate transaction; repeated apply returns zero changes/writes on unchanged
fixtures. Failure rolls back all targets. No startup or migration hook runs repair.

Production execution remains separately gated and is not authorized by this work.

## Reproduce isolated readback

From the executor worktree:

```sh
pnpm --filter @pulse/api exec tsx src/scripts/verify-food-usage-integrity.ts
```

The script always creates its own temporary fictional SQLite database, migrates
only that new database, and serves a loopback-only report on a dynamically chosen
port. It never accepts an existing database or remote server. Its printed report
contains literal API status codes, dry-run byte identity, owner invariant SQL and
rows, `quick_check`, and `foreign_key_check`. Authentication values are not printed.
Stop with SIGINT/SIGTERM after browser inspection to remove the disposable fixture.
