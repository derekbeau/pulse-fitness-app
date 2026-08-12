# Adaptive TDEE v1 Implementation Plan

Authoritative contract: [`../docs/specs/adaptive-tdee-v1.md`](../docs/specs/adaptive-tdee-v1.md)

The milestones are ordered dependencies. Do not start with UI.

## Milestone 0: Baseline and development isolation

- [ ] Install/reuse dependencies without copying production data.
- [ ] Confirm the full existing quality suite passes from this worktree.
- [ ] Define an isolated development SQLite path and seeded test-user workflow.
- [ ] Verify the development server can run without touching the production volume/database.
- [ ] Record baseline commands and results in `verification-report.md`.

**Gate:** clean baseline, isolated database, and working local app.

## Milestone 1: Canonical weight foundation

- [ ] Implement the migration preflight and explicit per-user legacy-unit map.
- [ ] Add canonical `weightKg` and `unitAtEntry` storage.
- [ ] Keep the legacy compatibility column fixed in pounds.
- [ ] Migrate every reader to canonical kg plus response-boundary display conversion.
- [ ] Cover weight history, dashboard, habits/resolvers, agent context, exports, and preference changes.
- [ ] Add old-database, fresh-database, lb-user, kg-user, mixed-user, ambiguous-map, and cross-unit-write tests.

**Gate:** no active application reader consumes ambiguous legacy weight values.

## Milestone 2: Nutrition completeness and target provenance

- [ ] Add `unknown | partial | complete` nutrition-log status.
- [ ] Migrate all existing rows to `unknown`.
- [ ] Implement status mutation and validation.
- [ ] Downgrade complete days to partial atomically whenever meals/items change.
- [ ] Add manual/adaptive target provenance and restricted check-in linkage.
- [ ] Preserve same-date replacement history in check-in snapshots.
- [ ] Add schema, migration, store, route, and invalidation tests.

**Gate:** only explicitly complete, unchanged days can enter adaptive calculations.

## Milestone 3: Pure adaptive algorithm

- [ ] Implement canonical conversions and age calculation.
- [ ] Implement Mifflin-St Jeor baseline and manual override.
- [ ] Implement eligibility and suspect-data holds.
- [ ] Implement interpolation, seven-day-half-life EWMA, and regression slope.
- [ ] Implement observed TDEE, confidence, smoothing, and change limiting.
- [ ] Implement goal calories, floors, deficit limits, upward constrained rounding, goal completion, and macros.
- [ ] Implement deterministic fingerprint canonicalization.
- [ ] Pass every required vector and invariant from specification section 22.

**Gate:** pure module is deterministic, clock-independent, and fully tested.

## Milestone 4: Program, check-in, and API lifecycle

- [ ] Add the lifetime program and immutable check-in tables.
- [ ] Implement read state and eligibility progress.
- [ ] Implement preview with pending-only fingerprint uniqueness.
- [ ] Implement explicit SQLite immediate transactions or a proven compare-and-swap alternative.
- [ ] Implement supersession, held attempts, acceptance, decline, history, and detail routes.
- [ ] Pin stale acceptance to persisted preview boundaries.
- [ ] Add real two-connection SQLite concurrency tests.
- [ ] Add repeated accept/decline, reverted fingerprint, midnight, held schedule, and cross-user tests.
- [ ] Add all required query/cache invalidation paths.

**Gate:** check-ins are replayable, idempotent where specified, stale-safe, and concurrency-safe.

## Milestone 5: Coach and completion UI

- [ ] Add the Nutrition Coach tab and due badge.
- [ ] Implement setup with recent/entered weight requirements.
- [ ] Implement setup, baseline, learning, updating, holding, and pending states.
- [ ] Add nutrition-day completion controls.
- [ ] Add recommendation comparison, calculation details, acceptance, decline, and history.
- [ ] Implement same-date target replacement confirmation and stale recovery.
- [ ] Meet accessibility requirements and responsive widths.
- [ ] Add RTL and Playwright coverage for all major paths.

**Gate:** every primary state is usable with keyboard and at 375 px without console/network errors.

## Milestone 6: Backtest, staging preview, and independent review

- [ ] Add the read-only backtest script.
- [ ] Build deterministic fixtures for every Coach state.
- [ ] Verify stale historical data cannot produce a current estimate.
- [ ] Run lint, typecheck, complete tests, and production build from a clean checkout.
- [ ] Start an isolated development environment on non-production ports/data.
- [ ] Exercise setup, learning, held, eligible preview, stale acceptance, accept, decline, history, and goal completion in a real browser.
- [ ] Inspect browser console and failed network requests.
- [ ] Verify 320, 375, 390, 430, 768, and 1280 px layouts.
- [ ] Produce and independently verify a Tailscale-accessible preview URL.
- [ ] Have Codex perform a fresh self-review against every definition-of-done item.
- [ ] Resolve all Codex-found blocking issues and rerun affected gates.
- [ ] Hand off to Hermes/Vector for the independent acceptance review; Codex must not perform or waive this gate.

**Gate:** Codex's `verification-report.md` contains reproducible green evidence, no unresolved Codex-found blocking issues, and the verdict `AWAITING VECTOR REVIEW`.

## Final handoff criteria

- [ ] Feature branch is clean and pushed.
- [ ] Draft PR accurately describes implemented scope and current verification.
- [ ] CI is green or every external/non-code blocker is explicitly documented.
- [ ] Preview URL and test workflow are verified before Derek receives them.
- [ ] Production remains unchanged.
- [ ] Codex stops at `AWAITING VECTOR REVIEW`; only Vector may promote the verdict to `READY FOR DEREK PREVIEW`.
