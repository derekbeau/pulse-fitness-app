## Summary

Implements Adaptive TDEE v1 end to end: canonical weight storage, nutrition-day completeness and target
provenance, deterministic expenditure calculation, replayable check-ins, responsive Coach UI, immutable
goal strategy/history, and explicit completion-to-maintenance review.

The completed final-QA repair addressed the goal-strategy findings known at the time:

- goal target, maintenance center, and rate now change only by inserting exactly one matching immutable next
  revision, which the database atomically applies;
- historical progress is server-authoritative and resolves the revision effective on each date;
- current and historical maintenance views use `max(0.68 kg, center × 1%)` on each side;
- replaced, cancelled, and completed goals persist their actual final canonical trend, which owns history and
  net-change calculations;
- completion stores an immutable accepted-check-in → completed-goal → maintenance-goal relation;
- goal history loads beyond the first 20 records;
- specification, API, and data-model copy were updated for the implemented ownership and lifecycle.

Nutrition targets still change only through explicit recommendation acceptance. Goal edits, replacements,
and completion do not silently write targets.

## Legacy-history correction

Vector subsequently withdrew approval for three legacy-history defects. The bounded correction now:

1. Adds ordered migration 0045, leaving recorded 0044 unchanged, and reconstructs legacy closing trends only
   when transition evidence has one distinct canonical endpoint value. It aborts when none exists.
2. Backfills legacy completion relations only from a unique accepted goal-reached check-in and maintenance
   successor; ambiguous relations remain unlinked rather than guessed.
3. Requires a fresh canonical trend for cancellation and preserves the active goal when evidence is stale or
   absent.

The correction is awaiting independent Vector re-review and must not be treated as approved or ready to merge.

Correction verification: focused migration/store/API regressions 44/44; exact uncached startup/isolation 9/9,
shared 412/412, API 696/696, web 1005/1005; lint, typecheck, and build passed with zero cached Turbo tasks;
installed Chrome 11/11 after deterministic reseeding; restored isolated database passed `quick_check` and
foreign-key validation. One earlier Chrome attempt stopped only on an external Google Fonts 404.

## Historical verification of the prior repair

- Permanent old/fresh migration, direct-SQL, store, API, shared-schema, UI, concurrency, replayability, and
  browser regressions cover the repaired behavior.
- Focused adversarial suites passed: shared 25/25, API 94/94, and web 34/34.
- Exact uncached gates passed with zero cached Turbo tasks: lint 3/3 (zero errors; four pre-existing Fast
  Refresh warnings), typecheck 3/3, tests (startup/isolation 9; shared 412; API 689; web 1005), and build 3/3.
- Installed Chrome passed all 11 journeys at 320, 375, 390, 430, 768, and 1280 px with strict console,
  page-error, request-failure, and unexpected-HTTP monitoring.
- Built-in-browser QA verified 21-goal load-more, revision-effective loss history, canonical current and
  historical maintenance ranges, and the immutable completion transition. Console warnings/errors were
  empty and observed Gate 0 product requests returned 200.
- The deterministically restored Gate 0 database passed `quick_check` and `foreign_key_check` with 45
  migrations, 13 users, 81 weights, 12 programs, 32 goals, 12 active goals, 0 completion transitions, and
  3 pending check-ins. Ports 3102 and 5274 were stopped after acceptance.
- Runtime acceptance uses only tracked `pnpm dev:gate0` with the isolated regular
  `apps/api/data/pulse-tdee-dev.db`.
- Installed-Chrome command:

  ```bash
  API_PORT=3102 BASE_URL=http://127.0.0.1:5274 PLAYWRIGHT_CHANNEL=chrome pnpm --filter @pulse/web exec playwright test e2e/adaptive-preview-fixtures.spec.ts --project=chromium
  ```

## Safety and review state

- PR #100 remains draft.
- Production was not accessed, deployed, restarted, or modified.
- No merge, readiness promotion, or silent nutrition-target change is included.
- Current state: `AWAITING VECTOR FINAL GOAL-STRATEGY RE-REVIEW`.
