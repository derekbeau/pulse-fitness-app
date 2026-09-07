# Food usage integrity execution

Starting worktree: /Users/meridian/Projects/pulse-food-usage-integrity
Branch: fix/food-usage-integrity
Starting HEAD: ef27ad8336e1da5dd82a32a428125341612eeeee
Verified origin/main: b64e8191ba4dc0415e05eedbbb8050fc56ebbc9e
Starting status: clean. Preparation commit changes only the goal contract.
Issue 143 read using gh issue view 143 --json title,body,comments; no comments.

## Plan before implementation

1. Replace incremental/best-effort usage effects with canonical owner-scoped projection inside synchronous mutation transactions.
2. Strengthen the existing JWT-only reconciliation endpoint: strict bounded dry-run default, explicit apply, deterministic before/projected rows, atomic failure and idempotency.
3. Cover hostile fixtures and actual authenticated routes using temporary SQLite databases, including failure triggers and retry/concurrency-shaped operations.
4. Run focused checks, one consolidated Luna-medium adversarial review across data/contracts, auth/atomicity, and tests/evidence/hygiene; repair all in-scope findings.
5. Run final uncached lint/typecheck/test/build, isolated Chrome/API/DB readbacks, inspect diff, commit, push and create draft PR. Capture final exact commit and clean status outside the commit to avoid self-reference.

## Writer inventory

- nutrition/index.ts: date-scoped create adds duplicate trackFoodUsage after store create.
- meals/index.ts: preferred create and append delegate to nutrition store; metadata/item edits and deletes likewise.
- nutrition/store.ts: createMealForDate, addItemsToMeal, deleteMealForDate, patchMealItemById currently dispatch post-transaction effects. Metadata edits do not modify links.
- foods/store.ts: trackFoodUsage/decrementFoodUsage increment stale counters; mergeFoods relinks scoped items but sums stale counters; reconcileFoodUsage has active food scope but lacks meal owner join.
- trash/index.ts: food restore clears deletedAt without projection; purge deletes linked owner items and food; audit FK effects on malformed foreign links.
- v1/index.ts: existing admin reconciliation is JWT-only and currently applies without explicit opt-in.
- scripts/migrate-static.ts: legacy name-matched lastUsedAt writer and static meal import require inspection; fixture seed scripts are isolated data generation rather than application lifecycle.
- foods create/update/delete: create defaults zero/null, normal update excludes usage fields, soft delete preserves metadata.

## Semantics

Superseded initial assumption: Derek explicitly decided on 2026-09-07 that active AND trashed foods remain exact projection targets. The contract has been amended accordingly. Count surviving linked rows whose meal's nutrition log has the same owner as the food. lastUsedAt is MAX(item.createdAt) in milliseconds; zero links means null. No new meal/item soft-delete semantics. Each successful retry that creates new rows contributes once per actual row; this does not introduce request deduplication.

No production access, backfill, deployment, merge, main edits, or unrelated issue 138 work is authorized.
