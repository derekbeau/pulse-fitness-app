# Adaptive TDEE v1 Verification Report

**Status:** Not started  
**Branch:** `feat/adaptive-tdee-v1`  
**Reviewer:** Unassigned  
**Last verified commit:** `59eefa3` (specification only)

This report must contain observed results, not intended commands or agent self-reports.

## Baseline

| Check      | Command                                      | Result  | Commit/date |
| ---------- | -------------------------------------------- | ------- | ----------- |
| Formatting | `pnpm format:check` or repository equivalent | Pending |             |
| Lint       | `pnpm lint`                                  | Pending |             |
| Typecheck  | `pnpm typecheck`                             | Pending |             |
| Tests      | `pnpm test`                                  | Pending |             |
| Build      | `pnpm build`                                 | Pending |             |

## Milestone verification

For each milestone, record targeted test results, Codex self-review findings and resolutions, built-in-browser scenarios, console/network inspection, commit SHA, and one verdict: `AWAITING VECTOR GATE N REVIEW`, `VECTOR GATE N APPROVED`, or `VECTOR GATE N CHANGES REQUIRED`.

### Canonical weight foundation

Pending.

### Nutrition completeness and target provenance

Pending.

### Pure adaptive algorithm

Pending.

### Check-in/API lifecycle and concurrency

Pending.

### Coach UI and completion controls

Pending.

### Backtest and stale-data behavior

Pending.

## Final clean-run quality gates

Record exact commands, exit codes, test counts, duration, and commit SHA.

- [ ] Formatting
- [ ] Lint
- [ ] Typecheck
- [ ] Full tests
- [ ] Production build
- [ ] Fresh migration chain
- [ ] Legacy migration fixture
- [ ] Real SQLite concurrency tests
- [ ] Playwright/E2E suite

## Browser acceptance matrix

Use an isolated development database. Capture screenshots when they clarify a result. Inspect console errors and failed network requests for every flow.

| Flow                                        | Result  | Evidence/notes |
| ------------------------------------------- | ------- | -------------- |
| New-user setup and baseline preview         | Pending |                |
| Setup without current weight                | Pending |                |
| Learning/insufficient-data state            | Pending |                |
| Held stale-weight state                     | Pending |                |
| Complete/partial/unknown day behavior       | Pending |                |
| Complete day downgraded after food mutation | Pending |                |
| Eligible manual check-in                    | Pending |                |
| Same-date target conflict                   | Pending |                |
| Stale preview rejection                     | Pending |                |
| Accept and target invalidation              | Pending |                |
| Decline and repeated decline                | Pending |                |
| History and calculation details             | Pending |                |
| Goal-reached maintenance transition         | Pending |                |
| Due badge after held weekly attempt         | Pending |                |

## Responsive and accessibility checks

- [ ] 320 px
- [ ] 375 px
- [ ] 390 px
- [ ] 430 px
- [ ] 768 px
- [ ] 1280 px
- [ ] Keyboard-only setup and acceptance
- [ ] Focus trapping/restoration
- [ ] Status not communicated by color alone
- [ ] No horizontal overflow

## Development preview

| Item                           | Value   |
| ------------------------------ | ------- |
| Local URL                      | Pending |
| Tailscale URL                  | Pending |
| API health                     | Pending |
| Web health                     | Pending |
| Development database path      | Pending |
| Seed/test workflow             | Pending |
| Production isolation confirmed | Pending |

## Vector independent review

After Codex completes and stops, Hermes/Vector must independently compare the implementation against every item in specification section 27 and inspect migrations, concurrency, data isolation, browser behavior, and the complete branch diff.

**Blocking findings:** Pending  
**Non-blocking findings:** Pending  
**Resolution commits:** Pending

## Final verdict

`NOT READY`

Codex may change milestone verdicts only to `AWAITING VECTOR GATE N REVIEW` after that milestone's implementation, automated checks, self-review, and built-in-browser QA pass. Codex must then stop, push, and hand off without starting later work.

After Milestone 6, Codex may set the final verdict only to `AWAITING VECTOR FINAL REVIEW`. Only Hermes/Vector may change that to `READY FOR DEREK PREVIEW`, after independently rerunning acceptance and verifying the preview. Codex must not self-approve a gate, mark the feature ready for Derek, make the PR ready for review, merge, or deploy.
