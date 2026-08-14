# Codex Desktop Kickoff: Adaptive TDEE Goal Strategy Extension

Use the existing `pulse-fitness-app` Codex project and its permanent worktree on branch `feat/adaptive-tdee-v1`. Keep one primary Codex chat attached to this worktree for the feature's full history.

---

## Single-goal milestone protocol

Use **one uninterrupted Codex Goal Mode goal** for the complete goal-strategy extension, Milestones 7–11. Do not stop for Vector approval between milestones. Preserve each milestone as a strict scope, testing, evidence, and commit boundary.

Before starting, read `AGENTS.md`, `docs/specs/adaptive-tdee-v1.md`, and every file in `agent-workspace/`. The original Milestones 1–6 are approved; the single authorized goal is the complete specification sequence in sections 30–38.

For each milestone, in order:

1. Confirm prerequisites and production-data isolation.
2. Implement only that milestone's scope.
3. Add and run the required targeted tests.
4. Perform a fresh Codex self-review of the milestone diff against the specification, including migration/data-safety review when applicable.
5. Run the exact uncached repository lint, typecheck, full tests, and builds after the focused tests.
6. Start the isolated app and perform extensive built-in-browser testing. Exercise every new runnable path and regression-smoke affected existing surfaces; inspect console, page errors, failed resources, and HTTP failures. For backend-only milestones, browser-smoke the existing affected surfaces and inspect live API/OpenAPI behavior. A passing Playwright suite does not replace this walkthrough.
7. Fix every defect found, rerun affected focused/full/browser gates, and record exact evidence.
8. Update `current-status.md`, `decision-log.md` when needed, `verification-report.md`, and the draft PR evidence.
9. Create and push exactly one coherent Conventional Commit for the milestone to `feat/adaptive-tdee-v1`, then continue directly to the next milestone.

After Milestone 11, stop once at `AWAITING VECTOR FINAL GOAL-STRATEGY REVIEW`. Vector independently inspects the complete five-commit sequence and reruns the applicable automated, migration, data-isolation, and browser checks. If Vector confirms defects, resume this same goal only for the bounded repair list, create one final-QA repair commit after all affected gates pass, and stop at `AWAITING VECTOR FINAL GOAL-STRATEGY RE-REVIEW`.

Operating requirements:

- Keep production unchanged. Never deploy production or write to the production SQLite database/volume without Derek's explicit approval.
- First establish and prove an isolated development database and test-user workflow.
- Use tests during each milestone, including RED/GREEN where practical.
- Create exactly one coherent Conventional Commit per milestone with the required explanatory body. Do not squash milestones together or create routine follow-up commits inside a milestone.
- Update `agent-workspace/current-status.md` after each meaningful session and milestone commit.
- Record genuine decisions or material deviations in `agent-workspace/decision-log.md` before coding them. Ask Derek only when the ambiguity materially changes product behavior, safety, or migration scope.
- Record actual commands and observed results in `agent-workspace/verification-report.md`.
- Delegate independent exploration, test-gap analysis, code review, and migration review to subagents when useful. The primary Codex chat must personally verify their findings and perform the built-in-browser QA. Subagents must not concurrently edit this same checkout; use separate worktrees for concurrent editors.
- Never trust a subagent's success claim without independently verifying its files and commands.
- Do not hand routine testing or obvious errors to Derek.

Goal-strategy milestone sequence:

7. Goal domain, immutable revisions, migration/backfill, compatibility mirrors, shared/OpenAPI contracts, and read-only current/history APIs.
8. Goal progress/projections, edit/new/cancel/complete transactions, and goal-change recommendations with explicit target acceptance.
9. Persistent goal card, loss/gain progress, maintenance range, and edit/new-goal UI.
10. Goal detail/history, revisions, charts with text equivalents, and completion-to-maintenance UX.
11. Final production-clone migration rehearsal, complete original-plus-goal acceptance, documentation, and release evidence.

Use side chats/subagents for read-only analysis or review without interrupting the milestone goal. Keep one primary integration owner. If blocked, document the exact blocker and continue every independent task within the authorized milestone that remains possible.

Inside a milestone, stop early only for a genuine product decision, unavailable credential, destructive production action, ambiguous migration that risks data loss, or a blocker that cannot be resolved locally. Otherwise keep working until that milestone's implementation, tests, self-review, and browser QA are green.

Milestones 7–10 are internal checkpoints, not stopping states. The only successful initial stopping state is `AWAITING VECTOR FINAL GOAL-STRATEGY REVIEW` after Milestone 11.

You are not the gate or final acceptance authority. Do not self-approve a Vector gate, write `READY FOR DEREK PREVIEW`, make the PR ready for review, merge, deploy, or modify production. Only Hermes/Vector may approve gates and promote the final verdict after independently rerunning acceptance.

Final response must include:

- Done/blocked status and exact final Vector review requested
- Branch and final commit SHA
- Five milestone commit SHAs, one each for Milestones 7–11, plus any later final-QA repair commit
- Exact quality-gate results and test counts
- Development database/seed details without secrets
- Verified local preview URL for the milestone; include a Tailscale URL when the milestone requires one
- Built-in-browser scenarios exercised, responsive widths where relevant, and console/network findings
- Remaining limitations or non-blocking findings
- Confirmation that production was unchanged

---
