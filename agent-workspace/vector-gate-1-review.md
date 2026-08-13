# Vector Gate 1 Re-review

**Previously reviewed commit:** `f80d2094b10531cc80f840f74f4b7e9b48b924fa`
**Previous verdict:** `VECTOR GATE 1 CHANGES REQUIRED`
**Current state:** `AWAITING VECTOR GATE 1 RE-REVIEW`
**Re-review date:** 2026-08-13

## Re-review blocker

### Canonical preflight validates check-constraint names but not behavior

`apps/api/src/db/canonical-weight-migration.ts:264-270` accepts a canonical-looking table whenever its `sqlite_master` SQL contains the five expected constraint names. Vector independently reproduced a table with the correct columns, NOT NULL flags, primary key, unique index, cascading foreign key, and five correctly named `CHECK (1)` no-ops; `prepareCanonicalWeightMigration()` returned `already-canonical`.

This leaves finding 4 only partially repaired: malformed schema can claim the expected names while failing to enforce date format, positive pounds, 25–350 canonical kilograms, provenance, or pounds compatibility. Validate the required check expressions/behavior, not only their names, and add a regression test using correctly named no-op constraints. The actual migration-0041 schema and an already-canonical database must continue to pass.

## One-bug repair response

The canonical preflight now recreates the exact live `body_weight` table definition in an isolated in-memory SQLite database and behaviorally probes the contract. It requires valid 25 kg and 350 kg boundary rows to pass and requires SQLite check-constraint failures for malformed dates, non-positive compatibility pounds, weights immediately below/above the canonical range, invalid unit provenance, and pounds values outside the migration-0041 compatibility tolerance. The production database is never probed or rewritten.

A regression fixture matching Vector's reproducer—correct columns, NOT NULL/PK, unique user/date, cascading user FK, and all five expected names with `CHECK (1)` bodies—is now rejected. The real migration-0041 table passes after legacy migration, as an already-canonical populated database, and after the complete fresh migration chain.

## Repair disposition for all eight blocking findings

1. **Production migration-map provisioning — repaired.** The API image now starts through `scripts/api-container-entrypoint.sh`; Compose supplies `BODY_WEIGHT_LEGACY_UNIT_MAP_PATH` and mounts a host-only secret directory read-only. Container checks prove fresh/empty/canonical databases start without a map, non-empty legacy data fails closed without one, and a regular mode-0600 map is accepted.
2. **AgentToken enrichment units — repaired.** Weight mutation hints and `relatedState` carry the response unit; pounds and kilograms regressions pass.
3. **Map overwrite permissions — repaired.** Map output uses a mode-0600 temporary file, atomic rename, and final chmod. New and pre-existing permissive destinations are covered.
4. **Canonical preflight integrity — repaired.** Preflight detects invalid existing rows and validates required columns/NOT NULL/PK, user/date unique index, cascading user foreign key, expected check names, and the actual check behavior before accepting an already-canonical table.
5. **Agent schema divergence — repaired.** The exported agent weight-write schema reuses `createWeightInputSchema`, enforcing the canonical 25–350 kg range after conversion for both units. Agent integration documentation includes explicit response units.
6. **Ambiguous history forms — repaired.** Add/edit labels show `Weight (lbs|kg)`, placeholders use `181.4`/`82.3`, edit aria labels carry the unit, and edit submissions retain the entry response unit.
7. **Stale unit relabeling — repaired.** History entries and detailed trend values derive their display unit from response entries; mixed-unit collections fail instead of being silently relabeled. Stale-preference transition tests cover both surfaces.
8. **Unparsed web responses — repaired.** Latest, list, paginated list, create, patch, and delete responses are parsed with shared schemas at the API hook boundary; invalid/unitless fixtures reject.

## Observed verification

### Focused and container checks

- Container/Gate 0 startup: 6/6.
- Migration + enrichment: 18/18.
- Agent schema: 10/10.
- Weight boundary hooks: 15/15.
- History/trend unit coverage: 16/16.
- API Docker target built successfully.
- Real container preflight: legacy-without-map exited 1; the same legacy DB with a mounted regular mode-0600 map was accepted.

### Browser and SQLite QA

- Saved the live kilogram edit, changed preference through the real Settings UI to pounds, and observed history/dashboard/detailed trend conversion and relabeling.
- Pounds add form: `Weight (lbs)` and `181.4`; pounds edit form: `Weight (lbs)`, `181.4`, and unit-bearing aria label. Kilogram forms showed `Weight (kg)` and `82.3`.
- Final dashboard showed pounds consistently: logged `182.6 lbs`, compact trend `180.4 lbs`, and detailed current trend/average/change in pounds.
- Browser diagnostics: zero console warnings/errors, zero window errors/unhandled rejections, and zero non-abort failed resources.
- API process open files: only `pulse-tdee-dev.db` plus its WAL/SHM.
- SQLite `PRAGMA quick_check = ok`; 25 total rows, 0 invalid rows, max compatibility delta `0.000000000000`, 23 pounds-origin and 2 kilogram-origin rows.
- QA rows preserved canonical kilograms, pounds compatibility, and entry provenance, including an 81.7 kg-origin row with 180.1176682050 lb compatibility.
- Production snapshot remained unchanged: `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`.
- The tracked `pnpm dev:gate0` process was stopped through the process tool; ports 3102 and 5274 were free before the final pipeline.

### Exact uncached pipeline

All commands completed with exit 0:

- `TURBO_FORCE=true pnpm lint`: 3/3, 0 cached, zero errors; four pre-existing Fast Refresh warnings.
- `TURBO_FORCE=true pnpm typecheck`: 3/3, 0 cached.
- `TURBO_FORCE=true pnpm test`: startup isolation 6/6; Turbo 6/6, 0 cached; shared 342, API 602, web 955 (1,899 package tests across 245 files).
- `TURBO_FORCE=true pnpm build`: 3/3, 0 cached; 3,830 Vite modules transformed.

## Scope review

The complete repair diff was reviewed against all eight findings. No nutrition-completeness, adaptive algorithm, concurrency lifecycle, Coach UI, Milestone 2, production deployment, merge, or PR-ready work was introduced. Ignored databases, credentials, and reviewed maps are absent from the tracked diff.

## Required next state

`AWAITING VECTOR GATE 1 RE-REVIEW`

The remaining finding-4 gap is repaired. Targeted migration/database tests passed 16/16 and startup tests passed 6/6. The exact uncached pipeline passed lint, typecheck, 1,900 package tests plus 6 startup-isolation tests, and production build; all Turbo tasks were uncached. PR #100 remains draft. Milestone 2 is unauthorized until Vector independently approves Gate 1.

## Final three-class follow-up handoff

Subsequent independent review confirmed three remaining classes. The current branch repairs them without changing the required state:

- **Host-only directory safety:** both ignore files contain root-anchored `/runtime-secrets/`. A behavioral test proves the exact map fixture is Git-ignored and absent from a real BuildKit-exported `COPY .` context; `git ls-files runtime-secrets` is empty.
- **Canonical adversarial schema/data:** preflight rejects every partial unique `(user_id,date)` index via `PRAGMA index_list.partial`, including `WHERE 0`, and validates every existing date with shared `dateSchema` calendar semantics. Impossible and non-ISO stored dates reject; migration 0041 still passes with `partial: 0`.
- **Paginated metadata:** the web boundary parses metadata with shared `apiMetaSchema`; page zero and negative totals reject while entry parsing and mixed-unit rejection remain intact.

Observed final verification: startup/security 7/7; API migration/database/enrichment 25/25; web boundary/history 26/26; API image build passed; real image legacy preflight exited 1 without a map and 0 with a secure read-only map; fresh image health returned OK. The exact uncached command passed lint, typecheck, 1,905 package tests plus 7 startup/security tests, and build with zero cached Turbo tasks. No UI changed, so browser QA was not repeated.

**Current state remains:** `AWAITING VECTOR GATE 1 RE-REVIEW`. PR #100 must remain draft; no deploy, merge, or Milestone 2 work is authorized.
