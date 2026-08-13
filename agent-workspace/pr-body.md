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
- [ ] Nutrition completeness and adaptive target provenance
- [ ] Pure deterministic adaptive TDEE algorithm
- [ ] Program/check-in persistence, API lifecycle, and real SQLite concurrency tests
- [ ] Coach UI, completion controls, history, accessibility, and responsive behavior
- [ ] Backtest, seeded staging preview, browser acceptance, and independent review

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

Milestone 1 complete; stopped at `AWAITING VECTOR GATE 1 REVIEW`:

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
- [ ] Full Adaptive TDEE browser acceptance (Milestones 5-6)

## Review focus

Reviewers should pay particular attention to:

- Canonical weight migration and compatibility behavior
- Complete/partial/unknown nutrition-day semantics
- Determinism and numerical rounding boundaries
- Fingerprint reuse, stale acceptance, and SQLite transaction semantics
- Production-data isolation
- Whether every definition-of-done item in specification section 27 has executable coverage
