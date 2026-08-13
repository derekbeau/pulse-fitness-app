# Adaptive TDEE v1 Implementation Plan

Authoritative contract: [`../docs/specs/adaptive-tdee-v1.md`](../docs/specs/adaptive-tdee-v1.md)

The milestones are ordered dependencies. Each milestone is a separate Codex goal and requires both Codex self-verification and Vector approval before the next milestone is authorized. Do not start with UI.

## Milestone 0: Baseline and development isolation

- [x] Install/reuse dependencies without copying production data.
- [x] Confirm the full existing quality suite passes from this worktree.
- [x] Define an isolated development SQLite path and seeded test-user workflow.
- [x] Verify the development server can run without touching the production volume/database.
- [x] Record baseline commands and results in `verification-report.md`.

**Codex gate:** clean baseline, isolated database, working local app, built-in-browser smoke test, self-reviewed evidence, pushed commit, then stop at `AWAITING VECTOR GATE 0 REVIEW`.

## Milestone 1: Canonical weight foundation

- [x] Implement the migration preflight and explicit per-user legacy-unit map.
- [x] Add canonical `weightKg` and `unitAtEntry` storage.
- [x] Keep the legacy compatibility column fixed in pounds.
- [x] Migrate every reader to canonical kg plus response-boundary display conversion.
- [x] Cover weight history, dashboard, habits/resolvers, agent context, exports, and preference changes.
- [x] Add old-database, fresh-database, lb-user, kg-user, mixed-user, ambiguous-map, and cross-unit-write tests.

**Codex gate:** no active application reader consumes ambiguous legacy weight values; migration/data-safety self-review, targeted tests, built-in-browser smoke of every affected weight surface, pushed commit, then stop at `AWAITING VECTOR GATE 1 REVIEW`.

## Milestone 2: Nutrition completeness and target provenance

- [x] Add `unknown | partial | complete` nutrition-log status.
- [x] Migrate all existing rows to `unknown`.
- [x] Implement status mutation and validation.
- [x] Downgrade complete days to partial atomically whenever meals/items change.
- [x] Add manual/adaptive target provenance and restricted check-in linkage.
- [x] Preserve same-date replacement history in check-in snapshots.
- [x] Add schema, migration, store, route, and invalidation tests.

**Codex gate:** only explicitly complete, unchanged days can enter adaptive calculations; schema/API self-review, targeted tests, built-in-browser verification of affected nutrition and target surfaces, pushed commit, then stop at `AWAITING VECTOR GATE 2 REVIEW`.

## Milestone 3: Pure adaptive algorithm

- [x] Implement canonical conversions and age calculation.
- [x] Implement Mifflin-St Jeor baseline and manual override.
- [x] Implement eligibility and suspect-data holds.
- [x] Implement interpolation, seven-day-half-life EWMA, and regression slope.
- [x] Implement observed TDEE, confidence, smoothing, and change limiting.
- [x] Implement goal calories, floors, deficit limits, upward constrained rounding, goal completion, and macros.
- [x] Implement deterministic fingerprint canonicalization.
- [x] Pass every required vector and invariant from specification section 22.

**Codex gate:** pure module is deterministic, clock-independent, and fully tested; independently recalculate required vectors, self-review numerical boundaries, browser-smoke the still-working app, push the commit, then stop at `AWAITING VECTOR GATE 3 REVIEW`.

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

**Codex gate:** check-ins are replayable, idempotent where specified, stale-safe, and concurrency-safe; API/concurrency self-review, targeted and real two-connection tests, built-in-browser exercise of every runnable API-backed state, pushed commit, then stop at `AWAITING VECTOR GATE 4 REVIEW`.

## Milestone 5: Coach and completion UI

- [ ] Add the Nutrition Coach tab and due badge.
- [ ] Implement setup with recent/entered weight requirements.
- [ ] Implement setup, baseline, learning, updating, holding, and pending states.
- [ ] Add nutrition-day completion controls.
- [ ] Add recommendation comparison, calculation details, acceptance, decline, and history.
- [ ] Implement same-date target replacement confirmation and stale recovery.
- [ ] Meet accessibility requirements and responsive widths.
- [ ] Add RTL and Playwright coverage for all major paths.

**Codex gate:** every primary state is usable with keyboard and at all specified responsive widths without console/network errors; complete built-in-browser walkthrough, accessibility self-review, screenshots/evidence, pushed commit, then stop at `AWAITING VECTOR GATE 5 REVIEW`.

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

**Codex gate:** `verification-report.md` contains reproducible green evidence, no unresolved Codex-found blocking issues, and the verdict `AWAITING VECTOR FINAL REVIEW`. Push the final milestone commit and stop for Vector's independent acceptance.

## Final handoff criteria

- [ ] Feature branch is clean and pushed.
- [ ] Draft PR accurately describes implemented scope and current verification.
- [ ] CI is green or every external/non-code blocker is explicitly documented.
- [ ] Preview URL and test workflow are verified before Derek receives them.
- [ ] Production remains unchanged.
- [ ] Codex stops after every milestone at its named Vector gate; only Vector may authorize the next milestone or promote the final verdict to `READY FOR DEREK PREVIEW`.
