# Adaptive TDEE v1 Verification Report

**Status:** VECTOR GATE 0 CHANGES REQUIRED<br>
**Branch:** `feat/adaptive-tdee-v1`<br>
**Reviewer:** Codex self-review complete; Vector independent review found blockers<br>
**Last verified state:** Milestone 0 working tree based on `350cd5d`; pushed commit is the PR #100 head

This report must contain observed results, not intended commands or agent self-reports.

## Baseline

| Check      | Command                                                                   | Result                                                                                        | State/date                           |
| ---------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------ |
| Formatting | Pre-commit `prettier --write` on all 12 changed files; `git diff --check` | Pass; all changed files were normalized by the commit hook                                    | Milestone 0 commit, 2026-08-12       |
| Lint       | `TURBO_FORCE=true pnpm lint`                                              | Pass, exit 0; 3/3 tasks, 0 cached; 0 errors and 4 pre-existing Fast Refresh warnings; 14.10 s | Milestone 0 working tree, 2026-08-12 |
| Typecheck  | `TURBO_FORCE=true pnpm typecheck`                                         | Pass, exit 0; 3/3 tasks, 0 cached; 12.48 s                                                    | Milestone 0 working tree, 2026-08-12 |
| Tests      | `TURBO_FORCE=true pnpm test`                                              | Pass, exit 0; 6/6 tasks, 0 cached; 242 files and 1,862 tests; 61.27 s                         | Milestone 0 working tree, 2026-08-12 |
| Build      | `TURBO_FORCE=true pnpm build`                                             | Pass, exit 0; 3/3 tasks, 0 cached; Vite transformed 3,830 modules; 9.84 s                     | Milestone 0 working tree, 2026-08-12 |

Package test totals: shared 30 files/331 tests, API 51 files/586 tests, web 161 files/945 tests.

## Milestone verification

For each milestone, record targeted test results, Codex self-review findings and resolutions, built-in-browser scenarios, console/network inspection, commit SHA, and one verdict: `AWAITING VECTOR GATE N REVIEW`, `VECTOR GATE N APPROVED`, or `VECTOR GATE N CHANGES REQUIRED`.

### Milestone 0: baseline and development isolation

Verdict: `AWAITING VECTOR GATE 0 REVIEW`

#### Dependency and database isolation

- `pnpm install --frozen-lockfile --offline` passed in 802 ms; the lockfile and dependency graph were unchanged.
- Read-only copied seed: `apps/api/data/pulse-prod-snapshot-20260812.db` (`0400`).
- Writable development database: `apps/api/data/pulse-tdee-dev.db` (`0600`).
- Before development writes, both files had SHA-256 `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`.
- After browser QA, the seed hash was still `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`; the active copy changed as expected to `3adf3caef86a5462830339bcaf6df3df3ca4bdd834a000fb32a0036d3f0bdd4c`.
- SQLite `PRAGMA quick_check` returned `ok` for both files. The existing migration journal contains 42 migrations.
- The isolated API process on port 3102 had only `pulse-tdee-dev.db`, its WAL, and its SHM open. It did not open the seed or `/data/pulse.db`.
- The isolated test user `tdee-gate0` was registered through the real UI. A browser-created `Milestone 0 isolated write` weight row was confirmed for that user in the active database only. Credentials remain ignored and are not recorded here.
- The copied baseline has 37 pre-existing foreign-key violations: 34 `session_sets -> exercises` and 3 `template_exercises -> exercises`. Repair is outside Milestone 0 and tracked in GitHub issue #101.

#### Built-in-browser smoke test

The app ran on isolated ports (web 5274, API 3102). Web, direct API health, and proxied API health each returned HTTP 200.

Clean rerun scenarios:

| Route/view               | Observed result                      | Console/request diagnostics |
| ------------------------ | ------------------------------------ | --------------------------- |
| Dashboard `/`            | Dashboard and populated weight trend | None                        |
| Workouts `/workouts`     | Calendar view and Workouts heading   | None                        |
| Nutrition log            | Nutrition log empty state            | None                        |
| Nutrition foods          | Saved-foods empty state              | None                        |
| Nutrition trends         | Macro trends empty state             | None                        |
| Weight `/weight/history` | Local-date form and persisted entry  | None                        |
| Habits `/habits`         | Five isolated starter habits         | None                        |
| Activity `/activity`     | Activity list                        | None                        |
| Journal `/journal`       | Journal list                         | None                        |
| Profile `/profile`       | Isolated test-user profile           | None                        |
| Settings `/settings`     | Settings sections                    | None                        |

Developer-console inspection returned zero warnings/errors on the clean rerun. Navigation, authentication, the weight POST, and the subsequent read all completed; there were no console failed-resource/request messages. The local API and web health checks remained HTTP 200.

#### Findings resolved during self-review

1. Weight entry defaults, weight-range filtering/cache logic, and settings target effective dates used the UTC calendar date. At 21:09 America/Detroit on August 12, the UI showed August 13. These paths now use the local date key, with a UTC-boundary component regression test.
2. Weight history, dashboard weight trend, and nutrition trend charts initialized at `-1 x -1`, producing Recharts warnings. Explicit mobile-first initial dimensions eliminate the warnings while the resize observer takes over.
3. Focused final checks passed: 25/25 tests across weight history, settings, and dashboard weight trend; nutrition page 16/16. The full suite then passed without the Recharts stderr warnings.
4. A pre-existing Exercise Library debounce assertion timed out once under heavy full-suite load. The test now waits for the filtered API request and resulting UI state with the file's established four-second async bound.

#### Codex self-review

- Compared the final diff to the Milestone 0 checklist and specification boundary.
- Confirmed no Adaptive TDEE schema, migration, algorithm, API, or Coach UI work from Milestone 1 or later was started.
- Confirmed ignored `.env` credentials/database files are not in the tracked diff.
- Confirmed production Docker services, volume, database, deployment, and user records were not changed.
- No unresolved Codex-found blocking issues remain.

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

| Item                           | Value                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Local URL                      | `http://127.0.0.1:5274` during Gate 0 verification; local process stopped after QA                          |
| Tailscale URL                  | Not required for Milestone 0                                                                                |
| API health                     | HTTP 200 at `http://127.0.0.1:3102/health`                                                                  |
| Web health                     | HTTP 200 at `http://127.0.0.1:5274/`; proxied `/health` also HTTP 200                                       |
| Development database path      | `apps/api/data/pulse-tdee-dev.db`                                                                           |
| Seed/test workflow             | Read-only copied seed -> writable ignored copy -> UI-registered isolated test user                          |
| Production isolation confirmed | Yes; unchanged seed hash, active-process open-file proof, no production volume/database/process interaction |

## Vector independent review

After Codex completes and stops, Hermes/Vector must independently compare the implementation against every item in specification section 27 and inspect migrations, concurrency, data isolation, browser behavior, and the complete branch diff.

**Blocking findings:** Two; see `agent-workspace/vector-gate-0-review.md`<br>
**Non-blocking findings:** The ignored `.env` is accepted by app env-file parsing but is not shell-sourceable because a display-name value contains spaces.<br>
**Resolution commits:** Pending

## Final verdict

`VECTOR GATE 0 CHANGES REQUIRED`

Codex may change milestone verdicts only to `AWAITING VECTOR GATE N REVIEW` after that milestone's implementation, automated checks, self-review, and built-in-browser QA pass. Codex must then stop, push, and hand off without starting later work.

After Milestone 6, Codex may set the final verdict only to `AWAITING VECTOR FINAL REVIEW`. Only Hermes/Vector may change that to `READY FOR DEREK PREVIEW`, after independently rerunning acceptance and verifying the preview. Codex must not self-approve a gate, mark the feature ready for Derek, make the PR ready for review, merge, or deploy.
