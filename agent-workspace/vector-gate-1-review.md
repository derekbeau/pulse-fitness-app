# Vector Gate 1 Review

**Reviewed commit:** `f80d2094b10531cc80f840f74f4b7e9b48b924fa`<br>
**Verdict:** `VECTOR GATE 1 CHANGES REQUIRED`<br>
**Date:** 2026-08-12

## Blocking findings

### 1. The production runtime cannot supply the mandatory reviewed migration map

- `apps/api/src/db/canonical-weight-migration.ts:260-263` intentionally refuses a non-empty legacy database unless `BODY_WEIGHT_LEGACY_UNIT_MAP_PATH` points to a reviewed map.
- `docker-compose.yml` does not pass that variable or mount a reviewed map into the API container.
- `Dockerfile` copies compiled application code and Drizzle migrations, while `.dockerignore` excludes database/data files.

The fail-closed migration implementation is correct, but the release path is incomplete: the documented production startup cannot migrate the existing legacy database because the required reviewed artifact is unreachable inside the container. Gate 1 must add a secure, explicit deployment mechanism for supplying the reviewed map without committing production user IDs or data. Add a test or reproducible container-level check proving a legacy database starts only when the mounted map is provided and fails closed otherwise. Do not deploy it during this repair.

### 2. AgentToken weight mutation enrichment drops the display unit

`apps/api/src/middleware/agent-enrichment.ts:438-457` emits `weight`, `previousWeight`, and `delta` in natural-language hints and `relatedState` without the response unit. After kilograms are supported, messages such as `Logged 80` or `down by 0.5` are ambiguous to the agent even though the core response correctly includes `unit`.

Include the display unit in the weight mutation hint and related state, and add pounds and kilograms regression coverage. Unit changes must never leave an agent interpreting a unitless number.

### 3. The reviewed-map writer does not enforce mode `0600` when overwriting an existing file

`apps/api/src/scripts/review-body-weight-migration.ts:59-62` passes `mode: 0o600` to `writeFileSync`, but Node applies `mode` only when creating a file. An existing map with broader permissions remains broader after overwrite. The independent reproduction left an existing `0644` file at `0644`.

Write through a safe create/replace flow or explicitly `chmod` the final map to `0600`, and add regression coverage for both a new file and an existing permissive file.

## Independent passing evidence

- Targeted migration, API, shared, web, and startup checks: 167 tests passed.
- Uncached full pipeline passed: lint, typecheck, 1,879 package tests, 3 startup-isolation tests, and production build.
- Live `pnpm dev:gate0` QA used only ports 3102/5274 and `pulse-tdee-dev.db`.
- Browser QA covered a 180 lb write, persisted pounds-to-kilograms preference switch, weight history, dashboard, settings, and habits.
- Cross-unit database verification:
  - pounds-origin row: `81.6466266000 kg`, `180.0000000000 lb` compatibility, `unitAtEntry=lbs`;
  - kilogram-origin row: `81.7000000000 kg`, `180.1176682050 lb` compatibility, `unitAtEntry=kg`;
  - compatibility delta `0.0` and zero invalid canonical rows.
- Clean in-app Dashboard → History → Dashboard → Habits → Dashboard navigation produced zero console warnings/errors and zero non-abort failed requests.
- Production snapshot SHA-256 remained `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`.
- PR #100 remains draft and CI checks are green at the reviewed commit.

## Required next state

Gate 1 remains rejected and Milestone 2 is unauthorized. Repair only these Gate 1 findings, rerun the affected targeted checks plus the uncached full pipeline, perform isolated browser/API verification, update the workspace evidence, commit and push, and stop at `AWAITING VECTOR GATE 1 RE-REVIEW`.
