# Body measurements implementation evidence

Scope: Pulse #121 frozen persistence/API contract only. No UI, photos, trends, coaching,
automatic estimates, live database migration, deployment, or production mutation was exercised.

## Source and configuration identity

- Worktree: `/Users/meridian/Projects/pulse-body-measurements`
- Branch: `feat/body-measurements`
- Required starting HEAD: `cfafec5ee8e8eb79667fdb95b89bb9f93e0784e9`
- Goal SHA-256: `a2c4ac2fe27c78a7c3bbd94b6d630e5404b5ab4e17e9d7c3903128ac0b8d0273`
- Lockfile SHA-256: `a4a3723d7b1181995713719f2f45a6dcc931bc1c03de5b44d6362e401be1975a`
- Turbo config SHA-256: `3d6fe8d8db6f86f91108bfd23e70330e5eda32f6a1aea53fd03e4097522284af`
- API tsconfig SHA-256: `98c856e09ed7d3cfc1973da021958594d6dd070812407910daad0b647f0890d5`
- API test tsconfig SHA-256: `109e61040b256597a5674251cdc42b992c1af1a2ec568c47b874a277b16cc94e`
- Shared tsconfig SHA-256: `65266cfc79518e86d11b011a0570548e7482fafb68c4c3dc39abde2f9622fd52`
- Migration journal SHA-256: `b046cd3985c4bf5b039eeac7cd5bd61dcfed0a1277f8eefcdf4dadff53ee6289`
- ESLint config SHA-256: `50155f9465c2b4d414356badf666286f444e8f584c8425aafb5108f7b4bf784e`
- Runtime: Node `v24.15.0`, pnpm `10.30.3`

## Focused receipts

### Shared schema and conversion

Command:

```bash
pnpm --filter @pulse/shared exec vitest run \
  src/schemas/body-measurements.test.ts \
  src/utils/circumference-unit.test.ts
```

Result: 2 files passed, 21 tests passed. Raw output:
[`raw/01-shared-contracts.log`](raw/01-shared-contracts.log).

### API, migration, OpenAPI, auth, and weight regressions

Command:

```bash
pnpm --filter @pulse/api exec vitest run \
  src/db/schema.test.ts \
  src/db/migration-0064.lifecycle.test.ts \
  src/db/migration-0065.lifecycle.test.ts \
  src/db/migrations.test.ts \
  src/routes/body-measurements/api.integration.test.ts \
  src/index.test.ts \
  src/routes/weight/index.test.ts \
  src/routes/weight/store.test.ts \
  src/routes/auth/index.test.ts
```

Result: 9 files passed, 118 tests passed. Raw output:
[`raw/02-api-migration-regressions.log`](raw/02-api-migration-regressions.log).

The synthetic acceptance uses fresh migrated SQLite only. It covers canonical cm/in conversion,
same-date merge and null/omission behavior, failed-empty-update atomicity, JWT/AgentToken parity,
invalid auth, cross-owner 404 behavior, explicit local dates, Adaptive-program time-zone precedence,
future-date rejection, deterministic range/pagination, restart/readback, rollback/restore, database
constraints, hard delete, and account-deletion cascade. Body-fat percentage is supplied by the caller
and is never derived.

### Focused static gates

Commands: shared/API typecheck, ESLint on every touched TypeScript source/test, and
`git diff --check`.

Result: all exited 0. Raw output:
[`raw/03-focused-typecheck-lint-diff.log`](raw/03-focused-typecheck-lint-diff.log).

## Internal review

One read-only GPT-5.6 Luna medium review found that SQLite integer affinity did not itself forbid
fractional canonical millimetres and that database body-fat precision was not constrained. The
migration and Drizzle schema now enforce integer `*_mm` storage and one-decimal body-fat precision,
with direct migration acceptance cases. The same review requested explicit relative-day coverage;
the API acceptance now proves Adaptive program time-zone precedence over the profile time zone.
No other ownership, merge, auth, date, OpenAPI, cascade, rollback, or restart/readback findings
remained.
