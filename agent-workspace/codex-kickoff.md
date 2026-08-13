# Codex Desktop Kickoff: Adaptive TDEE v1

Use the existing `pulse-fitness-app` Codex project and its permanent worktree on branch `feat/adaptive-tdee-v1`. Keep one primary Codex chat attached to this worktree for the feature's full history.

---

## Goal-mode and gate protocol

Use Codex Goal Mode, but create **one goal per authorized milestone**, not one uninterrupted goal for the entire feature. The goal's stopping condition is the current Vector review gate. This preserves long-running autonomy inside a milestone without allowing later work to build on an unreviewed foundation.

Before each goal, read `AGENTS.md`, `docs/specs/adaptive-tdee-v1.md`, and every file in `agent-workspace/`. Confirm `current-status.md` authorizes exactly one milestone. Do not begin, scaffold, or partially implement a later milestone.

For the authorized milestone:

1. Confirm prerequisites and production-data isolation.
2. Implement only that milestone's scope.
3. Add and run the required targeted tests.
4. Perform a fresh Codex self-review of the milestone diff against the specification, including migration/data-safety review when applicable.
5. Start the isolated app and use Codex's built-in browser to exercise every runnable user flow affected by the milestone. Inspect browser console errors and failed network requests. For backend-only milestones, browser-smoke the existing affected surfaces and explicitly record which correctness properties require automated tests rather than visual inspection.
6. Fix every blocking issue found by tests, self-review, or browser QA, then rerun the affected checks.
7. Update `current-status.md`, `decision-log.md` when needed, and `verification-report.md` with exact observed evidence.
8. Commit and push a coherent milestone commit to `feat/adaptive-tdee-v1` and update draft PR #100.
9. Set Overall and the milestone verdict to `AWAITING VECTOR GATE N REVIEW`, replacing `N` with the completed milestone number.
10. Stop the goal. Do not start the next milestone.

Derek then returns to Hermes/Vector. Vector independently inspects the diff and evidence, reruns the applicable checks and browser flows, and either records blocking findings or approves the gate and authorizes the next milestone. If Vector records findings, resume only the same milestone, resolve them, repeat Codex self-review and browser QA, push the fixes, and stop at the same gate again.

Operating requirements:

- Keep production unchanged. Never deploy production or write to the production SQLite database/volume without Derek's explicit approval.
- First establish and prove an isolated development database and test-user workflow.
- Use tests during each milestone, including RED/GREEN where practical.
- Commit coherent milestones with Conventional Commits and required explanatory bodies.
- Update `agent-workspace/current-status.md` after each meaningful session and milestone commit.
- Record genuine decisions or material deviations in `agent-workspace/decision-log.md` before coding them. Ask Derek only when the ambiguity materially changes product behavior, safety, or migration scope.
- Record actual commands and observed results in `agent-workspace/verification-report.md`.
- Delegate independent exploration, test-gap analysis, code review, and migration review to subagents when useful. The primary Codex chat must personally verify their findings and perform the built-in-browser QA. Subagents must not concurrently edit this same checkout; use separate worktrees for concurrent editors.
- Never trust a subagent's success claim without independently verifying its files and commands.
- Do not hand routine testing or obvious errors to Derek.

Milestone sequence:

1. Canonical weight migration with an explicit reviewed per-user legacy-unit map and every active reader converted to `weightKg`.
2. Explicit nutrition-day completeness and automatic complete-to-partial downgrade.
3. Adaptive target provenance and immutable check-in audit history.
4. Deterministic pure algorithm with all vectors and invariants from specification section 22.
5. Program/check-in APIs with fingerprint reuse rules, stale protection, explicit SQLite immediate transaction semantics, and real two-connection concurrency tests.
6. Complete Coach UI, day-status controls, history, acceptance, decline, accessibility, and responsive behavior.
7. Read-only backtest plus seeded fixtures for all major Coach states.
8. Clean formatting, lint, typecheck, complete test suite, production build, migration tests, and Playwright flows.
9. Real browser acceptance with console/network inspection at required responsive widths.
10. Verified local and Tailscale-accessible development preview using non-production data.
11. Fresh Codex self-review against every definition-of-done item, with all Codex-found blocking issues resolved.

Use side chats/subagents for read-only analysis or review without interrupting the milestone goal. Keep one primary integration owner. If blocked, document the exact blocker and continue every independent task within the authorized milestone that remains possible.

Inside a milestone, stop early only for a genuine product decision, unavailable credential, destructive production action, ambiguous migration that risks data loss, or a blocker that cannot be resolved locally. Otherwise keep working until that milestone's implementation, tests, self-review, and browser QA are green.

At Milestones 0 through 5, the only successful stopping state is `AWAITING VECTOR GATE N REVIEW`. At Milestone 6, after its Codex-owned checks are green, use `AWAITING VECTOR FINAL REVIEW`.

You are not the gate or final acceptance authority. Do not self-approve a Vector gate, write `READY FOR DEREK PREVIEW`, make the PR ready for review, merge, deploy, or modify production. Only Hermes/Vector may approve gates and promote the final verdict after independently rerunning acceptance.

Final response must include:

- Done/blocked status and exact Vector gate requested
- Branch and final commit SHA
- Milestone commits
- Exact quality-gate results and test counts
- Development database/seed details without secrets
- Verified local preview URL for the milestone; include a Tailscale URL when the milestone requires one
- Built-in-browser scenarios exercised, responsive widths where relevant, and console/network findings
- Remaining limitations or non-blocking findings
- Confirmation that production was unchanged

---
