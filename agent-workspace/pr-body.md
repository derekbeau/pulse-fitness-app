## Summary

- Adds the complete implementation and acceptance specification for Adaptive TDEE and nutrition coaching v1.
- Establishes a durable cross-agent execution workspace with milestone gates, live status, decisions, Codex kickoff instructions, and an evidence-based verification report.
- Will implement the feature end to end in this PR before it leaves draft status.

## Motivation

Pulse needs a transparent MacroFactor-style v1 that estimates personalized TDEE from complete calorie logs and trended body weight, then proposes user-approved calorie and macro targets for loss, maintenance, or gain.

The work crosses weight-unit migration, nutrition completeness, target provenance, deterministic numerical logic, SQLite concurrency, API lifecycle, responsive UI, browser QA, and isolated staging. Keeping the specification and implementation in one draft PR makes the branch history and acceptance state visible without pretending the feature is finished.

## Implementation milestones

- [x] Baseline and isolated development database
- [x] Canonical weight foundation and all-reader migration
- [x] Nutrition completeness and adaptive target provenance
- [x] Pure deterministic adaptive TDEE algorithm
- [x] Program/check-in persistence, API lifecycle, and real SQLite concurrency tests
- [x] Coach UI, completion controls, history, accessibility, and responsive behavior
- [x] Backtest, seeded synthetic preview, browser acceptance, and Codex final handoff
- [ ] Vector final independent acceptance review

Live state: [`agent-workspace/current-status.md`](agent-workspace/current-status.md)  
Execution plan: [`agent-workspace/implementation-plan.md`](agent-workspace/implementation-plan.md)  
Verification gate: [`agent-workspace/verification-report.md`](agent-workspace/verification-report.md)

## Safety and scope

- No production deployment is included without explicit approval.
- Development must use an isolated SQLite database and test user.
- Legacy weight migration must abort on ambiguous units.
- Recommendations never silently overwrite targets in v1.
- This PR remains draft while Codex implements and at every `AWAITING VECTOR GATE N REVIEW` state. Only Vector may authorize the next milestone or promote `AWAITING VECTOR FINAL REVIEW` to `READY FOR DEREK PREVIEW` after independent acceptance.

## Current verification

Milestone 1 Gate 1 is independently approved at `2e539387c690f09710648d591e57c5d8501d88af`:

- [x] Independent technical review completed and findings incorporated
- [x] Formula vectors independently recalculated
- [x] Citation validation passed
- [x] Markdown formatting and `git diff --check` passed
- [x] Existing repository typecheck/build/test hooks passed at specification commit
- [x] Fresh uncached worktree baseline recorded (1,862 tests across 242 files)
- [x] Isolated read-only seed, writable development database, and test-user workflow verified
- [x] Built-in-browser smoke test passed across 11 primary routes with clean console/request diagnostics
- [x] Local-date rollover and Recharts initialization warnings found during QA were fixed and regression-tested
- [x] Local development preview and production-database isolation verified
- [x] Explicit per-user legacy-unit preflight and fail-closed migration guard implemented
- [x] Canonical kilograms, entry-unit provenance, and pounds-only compatibility storage verified
- [x] All weight readers migrated to canonical kilograms with response-boundary conversion
- [x] Old/fresh, lb/kg/mixed/ambiguous, preference-change, and cross-unit-write coverage passed
- [x] 241 targeted Milestone 1 tests passed; uncached full lint, typecheck, 1,879 package tests, and build passed
- [x] Built-in-browser weight/dashboard/settings/habits QA passed with clean console and request diagnostics
- [x] Vector independently reran targeted and full checks plus cross-unit isolated browser/database QA
- [x] Secure reviewed-map bind mount and fail-closed production entrypoint added and container-verified
- [x] AgentToken weight mutation hints and related state include units for pounds and kilograms
- [x] Reviewed migration-map creation and overwrite force mode `0600`
- [x] Canonical-table schema/null integrity, shared agent bounds, unit-visible history forms, response-unit rendering, and runtime schema parsing repaired and covered
- [x] Final isolated kg-to-pounds browser QA passed with zero console/request diagnostics
- [x] Final SQLite audit passed: 25 rows, zero invalid rows, zero compatibility delta; production snapshot hash unchanged
- [x] Exact uncached lint/typecheck/test/build pipeline passed (1,899 package tests plus 6 startup-isolation tests)
- [x] Host-only `/runtime-secrets/` is excluded from Git and a real Docker build context, with behavioral regression coverage
- [x] Canonical preflight rejects partial unique indexes and malformed existing calendar dates while migration 0041 continues to pass
- [x] Paginated weight metadata is runtime-parsed with shared schema coverage for page zero and negative totals
- [x] Final exact uncached pipeline passed (1,905 package tests plus 7 startup/security tests; zero cached Turbo tasks)
- [x] Vector Gate 1 re-review and approval
- [x] Explicit nutrition-log completeness status, legacy `unknown` migration, and authenticated validation route
- [x] Atomic complete-to-partial downgrade across every in-scope meal, item, food, purge, and static-reimport mutation
- [x] Manual/adaptive target provenance, server-derived macro calories, restricted check-in linkage, and immutable same-date snapshots
- [x] Old/fresh migration, real SQLite rollback, provenance, route, response-boundary, and invalidation coverage
- [x] Isolated built-in-browser Nutrition and Settings QA with clean console and expected request diagnostics
- [x] Milestone 2 exact uncached pipeline passed (1,932 package tests plus 7 startup/security tests; zero cached Turbo tasks)
- [x] Gate 2 integrity repair: immutable check-in delete guard with transaction-scoped account deletion
- [x] Same-owner program/check-in database constraint and actionable exact-proposal adaptive writer guard
- [x] Adversarial deletion, rollback, cross-user, terminal/held, and malformed-proposal regressions
- [x] Repair exact uncached pipeline passed (1,944 package tests plus 7 startup/security tests; zero cached Turbo tasks)
- [x] Vector independently re-reviewed the repair, repeated fresh-database adversarial checks and isolated browser/API acceptance, and reran the exact uncached pipeline
- [x] Vector Gate 2 approved
- [x] Pure clock-independent Adaptive TDEE calculation module and strict shared calculation/response schemas
- [x] Canonical conversions, local-date age, Mifflin/manual baselines, eligibility, suspect holds, interpolation, seven-day-half-life EWMA, and OLS slope
- [x] Observed expenditure, plausibility, confidence, smoothing, no-op/150-kcal limits, goal guardrails, constrained rounding, completion, and reconciled macros
- [x] Canonical source snapshots and deterministic lowercase SHA-256 fingerprints independent of input order
- [x] Required vectors A-K and boundary/invariant regressions; 13 schema and 34 algorithm tests
- [x] Milestone 3 exact uncached pipeline passed (1,991 package tests plus 7 startup/security tests; zero cached Turbo tasks)
- [x] Isolated Gate 0 browser smoke passed on Dashboard, Nutrition, Weight History, and Settings with clean console and all observed API requests HTTP 200
- [x] Gate 3 repair preserves explicit calorie floors, corrects macro-difference sign, and deduplicates complete nutrition dates deterministically
- [x] Gate 3 repair regressions passed (50 focused shared; 400 full shared); exact uncached lint/typecheck/test/build passed with 1,994 package tests plus 7 startup/security tests and zero cached tasks
- [x] Vector independently re-reviewed the Gate 3 repair, repeated the focused and exact uncached full gates, and passed isolated API/browser acceptance
- [x] Vector Gate 3 approved
- [x] Lifetime program state, replayable check-in snapshots, JWT/AgentToken route policy, and OpenAPI contracts
- [x] Immediate-transaction preview/accept lifecycle with pending/held reuse, supersession, stale rejection, idempotent resolution, same-date replacement, and goal maintenance
- [x] Real two-connection SQLite contention/convergence plus setup, rebaseline, aggregation, midnight, due scheduling, pagination, and cross-user coverage
- [x] Complete adaptive/weight/target/nutrition/dashboard query invalidation map
- [x] Milestone 4 exact uncached gates passed: startup/security 7, shared 402, API 657, web 960, lint/typecheck/build; zero cached Turbo tasks
- [x] Isolated real API lifecycle and built-in-browser affected-surface/Swagger QA passed with clean console diagnostics
- [x] Gate 4 pending-to-held repair supersedes stale actionable pending rows before held persistence while preserving identical pending/held reuse and immediate-transaction safety
- [x] Durable pending -> changed inputs -> held regression passed; exact uncached gates passed with startup/security 7, shared 402, API 658, web 960, and zero cached tasks
- [x] Vector independently re-reviewed the Gate 4 repair, repeated focused/fresh-database/full uncached gates, and passed isolated API/browser acceptance with production isolation intact
- [x] Vector Gate 4 approved
- [x] Responsive Nutrition Coach setup, readiness, recommendation, details, decision, and history UI
- [x] Explicit Nutrition Log unknown/partial/complete controls with today confirmation and downgrade reflection
- [x] Adaptive response-boundary parsing and complete query-invalidation coverage
- [x] Milestone 5 focused RTL passed 70 tests; exact uncached gates passed 2,047 package tests plus 7 startup/security tests
- [x] Adaptive Playwright suite passed 7/7 major paths in installed Chrome against the isolated Gate 0 runtime
- [x] Built-in-browser acceptance passed all six Coach states and required widths with keyboard/focus checks, no overflow, empty final console diagnostics, and no unexpected failed requests
- [x] Gate 5 repair exposes snapshot-backed Estimated RMR and activity multiplier on equation baseline review before acceptance
- [x] Manual baseline review omits equation values, discloses manual starting expenditure, and both modes show the multiple-weeks personalization warning
- [x] Permanent equation/manual RTL passed; installed-Chrome adaptive Playwright now passes 8/8 with equation setup-preview coverage
- [x] Gate 5 repair exact uncached gates passed startup/security 7, shared 402, API 658, web 989, lint/typecheck/build, and zero cached Turbo tasks
- [x] Vector independently re-reviewed the Gate 5 disclosure repair, reran 53 focused RTL and 8 Chrome Playwright scenarios, and repeated the exact uncached repository gates
- [x] Vector Gate 5 approved
- [x] Milestone 6 read-only backtest, deterministic fixtures, sanitized Tailscale preview, clean-checkout gates, and Codex acceptance
- [ ] Vector final independent acceptance review

Current milestone state: `AWAITING VECTOR FINAL REVIEW`. Codex-owned Milestone 6 work is complete; PR #100 remains draft and production remains unchanged.

## Review focus

Reviewers should pay particular attention to:

- Canonical weight migration and compatibility behavior
- Complete/partial/unknown nutrition-day semantics
- Determinism and numerical rounding boundaries
- Fingerprint reuse, stale acceptance, and SQLite transaction semantics
- Production-data isolation
- Whether every definition-of-done item in specification section 27 has executable coverage
