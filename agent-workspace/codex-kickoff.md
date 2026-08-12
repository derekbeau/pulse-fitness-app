# Codex Desktop Kickoff: Adaptive TDEE v1

Use this prompt in a Codex Desktop chat opened on the permanent project/worktree:

`/Users/meridian/Projects/pulse-fitness-app-adaptive-tdee`

---

Implement the complete Adaptive TDEE and Nutrition Coaching v1 specification in `docs/specs/adaptive-tdee-v1.md`.

You are operating in the permanent worktree `/Users/meridian/Projects/pulse-fitness-app-adaptive-tdee` on branch `feat/adaptive-tdee-v1`. Read `AGENTS.md` and every file in `agent-workspace/` before acting. The specification is the implementation and acceptance contract. `agent-workspace/current-status.md` is the live handoff state.

Own the goal from baseline verification through a working isolated development preview. Do not stop after planning, scaffolding, or a partial backend. Follow `agent-workspace/implementation-plan.md` in dependency order and continue until all milestones and the final independent acceptance gate are complete.

Operating requirements:

- Keep production unchanged. Never deploy production or write to the production SQLite database/volume without Derek's explicit approval.
- First establish and prove an isolated development database and test-user workflow.
- Use tests during each milestone, including RED/GREEN where practical.
- Commit coherent milestones with Conventional Commits and required explanatory bodies.
- Update `agent-workspace/current-status.md` after each meaningful session and milestone commit.
- Record genuine decisions or material deviations in `agent-workspace/decision-log.md` before coding them. Ask Derek only when the ambiguity materially changes product behavior, safety, or migration scope.
- Record actual commands and observed results in `agent-workspace/verification-report.md`.
- Delegate independent exploration, test-gap analysis, code review, migration review, and browser QA to subagents when useful. Subagents must not concurrently edit this same checkout; use separate worktrees for concurrent editors.
- Never trust a subagent's success claim without independently verifying its files and commands.
- Do not hand routine testing or obvious errors to Derek.

Required completion gates:

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
11. Fresh independent review against every definition-of-done item, with all blocking findings resolved.

Use side chats/subagents for read-only status or reviews without interrupting the main goal. Keep one primary integration owner. If blocked, document the exact blocker and continue every independent task that remains possible.

Stop only for a genuine product decision, unavailable credential, destructive production action, or blocker that cannot be resolved locally. Otherwise keep working until `agent-workspace/verification-report.md` can honestly say `READY FOR DEREK PREVIEW`.

Final response must include:

- Done/blocked status
- Branch and final commit SHA
- Milestone commits
- Exact quality-gate results and test counts
- Development database/seed details without secrets
- Verified local and Tailscale preview URLs
- Browser scenarios exercised
- Remaining limitations or non-blocking findings
- Confirmation that production was unchanged

---
