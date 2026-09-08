# Pulse #150 acceptance evidence

This directory contains synthetic-only evidence for workout-specific feedback questions.
No production service or database is used. The Playwright configuration starts the local API and
web app against a disposable SQLite database under `/tmp` and uses Playwright's bundled Chromium.

Run:

```bash
PULSE_WORKOUT_FEEDBACK_SYNTHETIC=I_ACKNOWLEDGE_SYNTHETIC_FIXTURE_ONLY \
  pnpm --filter web exec playwright test \
  --config playwright.workout-feedback.config.ts
```

The retained Playwright artifacts include 375 px and 1280 px screenshots, raw scheduled/session
API readbacks, immutable correction history, an accessibility snapshot, and console/network logs.
The API/store/migration tests cover hostile validation, owner isolation under JWT and AgentToken,
legacy schema-v2 byte preservation, migration rollback/restore, stale revisions, retry idempotence,
explicit empty overrides, direct/ad-hoc starts, and non-recurrence. `next_check_in` definitions are
frozen and readable but deliberately have no notification or automatic answer flow in issue #150.

SQLite downgrade is restore-based: the migration test retains an untouched through-0061 synthetic
copy, applies 0062 to a separate copy, then restores and compares integrity and row counts. There is
no destructive down migration.
