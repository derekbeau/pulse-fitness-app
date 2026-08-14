# Adaptive TDEE v1 Implementation Plan

Authoritative contract: [`../docs/specs/adaptive-tdee-v1.md`](../docs/specs/adaptive-tdee-v1.md)

Milestones 0–11 below are the completed historical implementation plan. Their gate wording records the
process used at the time and is not a current authorization protocol. The active work is the bounded final
goal-strategy repair at the end of this file.

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

- [x] Add the lifetime program and immutable check-in tables.
- [x] Implement read state and eligibility progress.
- [x] Implement preview with pending-only fingerprint uniqueness.
- [x] Implement explicit SQLite immediate transactions or a proven compare-and-swap alternative.
- [x] Implement supersession, held attempts, acceptance, decline, history, and detail routes.
- [x] Pin stale acceptance to persisted preview boundaries.
- [x] Add real two-connection SQLite concurrency tests.
- [x] Add repeated accept/decline, reverted fingerprint, midnight, held schedule, and cross-user tests.
- [x] Add all required query/cache invalidation paths.

**Codex gate:** check-ins are replayable, idempotent where specified, stale-safe, and concurrency-safe; API/concurrency self-review, targeted and real two-connection tests, built-in-browser exercise of every runnable API-backed state, pushed commit, then stop at `AWAITING VECTOR GATE 4 REVIEW`.

## Milestone 5: Coach and completion UI

- [x] Add the Nutrition Coach tab and due badge.
- [x] Implement setup with recent/entered weight requirements.
- [x] Implement setup, baseline, learning, updating, holding, and pending states.
- [x] Add nutrition-day completion controls.
- [x] Add recommendation comparison, calculation details, acceptance, decline, and history.
- [x] Implement same-date target replacement confirmation and stale recovery.
- [x] Meet accessibility requirements and responsive widths.
- [x] Add RTL and Playwright coverage for all major paths.

**Codex gate:** every primary state is usable with keyboard and at all specified responsive widths without console/network errors; complete built-in-browser walkthrough, accessibility self-review, screenshots/evidence, pushed commit, then stop at `AWAITING VECTOR GATE 5 REVIEW`.

## Milestone 6: Backtest, staging preview, and independent review

- [x] Add the read-only backtest script.
- [x] Build deterministic fixtures for every Coach state.
- [x] Verify stale historical data cannot produce a current estimate.
- [x] Run lint, typecheck, complete tests, and production build from a clean checkout.
- [x] Start an isolated development environment on non-production ports/data.
- [x] Exercise setup, learning, held, eligible preview, stale acceptance, accept, decline, history, and goal completion in a real browser.
- [x] Inspect browser console and failed network requests.
- [x] Verify 320, 375, 390, 430, 768, and 1280 px layouts.
- [x] Produce and independently verify a Tailscale-accessible preview URL.
- [x] Have Codex perform a fresh self-review against every definition-of-done item.
- [x] Resolve all Codex-found blocking issues and rerun affected gates.
- [x] Hand off to Hermes/Vector for the independent acceptance review; Codex must not perform or waive this gate.

**Codex gate:** `verification-report.md` contains reproducible green evidence, no unresolved Codex-found blocking issues, and the verdict `AWAITING VECTOR FINAL REVIEW`. Push the final milestone commit and stop for Vector's independent acceptance.

## Goal-strategy extension

The authoritative scope, acceptance criteria, and gate evidence are in specification sections 30–38.

### Milestone 7: Goal domain, migration, and contracts

- [x] Add first-class goals and immutable revisions with constraints, indexes, and triggers.
- [x] Add check-in goal/revision linkage and compatibility mirrors.
- [x] Backfill fresh and isolated production-clone databases without changing historical snapshots/targets.
- [x] Add shared schemas, OpenAPI contracts, and read-only current/history APIs.
- [x] Prove idempotency, rollback, immutability, concurrency, isolation, and no-weight fail-closed behavior.

**Codex checkpoint:** run focused plus exact uncached full gates and extensive isolated built-in-browser/API/OpenAPI smoke; create/push exactly one Milestone 7 commit, then continue to Milestone 8. Do not include progress calculations, mutations, or UI in that commit.

### Milestone 8: Progress engine and goal mutations

- [x] Add pure progress/projection and maintenance-range calculations.
- [x] Add edit/new/cancel/complete transactions and goal-change recommendations.
- [x] Preserve expenditure/history and require explicit target acceptance.
- [x] Add deterministic fixtures, backtest support, and adversarial concurrency/staleness tests.

**Codex checkpoint:** run focused plus exact uncached full gates and extensive isolated browser/API mutation/acceptance smoke; create/push exactly one Milestone 8 commit, then continue to Milestone 9. Do not include UI in that commit.

### Milestone 9: Persistent goal card and edit/new flows

- [x] Keep goal/progress visible in every Coach state.
- [x] Add loss/gain progress, maintenance range, and honest projections.
- [x] Add accessible edit/new-goal and pending-recommendation replacement flows.
- [x] Pass focused RTL, installed-Chrome journeys, and all required widths.

**Codex checkpoint:** run focused RTL, exact uncached full gates, installed-Chrome E2E, and extensive built-in-browser QA across all paths and widths; create/push exactly one Milestone 9 commit, then continue to Milestone 10.

### Milestone 10: Goal detail, history, and completion

- [x] Add detailed progress, chart text equivalents, revisions, and prior-goal history.
- [x] Add reviewed completion-to-maintenance flow and deterministic fixtures.
- [x] Pass complete RTL/Playwright, accessibility, responsive, stale, and retry scenarios.

**Codex checkpoint:** run complete automated and extensive built-in-browser detail/history/completion/accessibility QA; create/push exactly one Milestone 10 commit, then continue to Milestone 11. Do not deploy or make the PR ready.

### Milestone 11: Final acceptance and release evidence

- [x] Rehearse migration on a fresh isolated production clone.
- [x] Run complete original-plus-goal demo acceptance and backtest compatibility.
- [x] Update docs/OpenAPI/agent guidance and exact release evidence.
- [x] Pass uncached full gates, installed-Chrome E2E, branch/PR sync, and remote CI.

**Codex final stop:** after exact uncached full gates and extensive built-in-browser final acceptance, create/push exactly one Milestone 11 commit and stop at `AWAITING VECTOR FINAL GOAL-STRATEGY REVIEW`. Production remains untouched and PR #100 remains draft. Confirmed Vector final-QA defects return to the same Codex goal for one bounded repair commit and re-review.

## Final handoff criteria

- [x] Feature branch is clean and pushed.
- [x] Draft PR accurately describes implemented scope and current verification.
- [x] CI is green or every external/non-code blocker is explicitly documented.
- [x] Preview URL and test workflow are verified before Derek receives them.
- [x] Production remains unchanged.
- [x] The extension uses one Codex goal, one commit per Milestone 7–11, extensive automated/browser QA after each milestone, and one independent Vector final review before any readiness verdict.

## Final goal-strategy repair

- [x] Enforce strategy changes through exactly one database-authoritative next revision.
- [x] Make historical progress revision-effective and server-authoritative.
- [x] Canonicalize maintenance range behavior in current and historical responses.
- [x] Persist actual final trends and immutable completion-transition ownership.
- [x] Add goal-history load-more beyond 20 rows.
- [x] Add permanent focused, migration, concurrency, replayability, UI, and browser regressions.
- [x] Pass exact uncached full gates, installed Chrome, built-in browser, and final database integrity checks.
- [x] Reconcile evidence, create/push exactly one repair commit, update the draft PR body, and stop at
      `AWAITING VECTOR FINAL GOAL-STRATEGY RE-REVIEW`.
