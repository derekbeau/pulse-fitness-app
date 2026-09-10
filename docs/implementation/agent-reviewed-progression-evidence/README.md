# Pulse #153 implementation evidence

This directory retains raw command output and JSON sidecars for the bounded implementation of
`docs/implementation/agent-reviewed-progression-goal.md`. The shared receipt harness records argv,
exit code, UTC timing, branch, tested commit, dirty-patch hash, and combined-output hash. Its
`pulse-151` format label is a legacy harness identifier; the paths and evidence here are for #153.

## Starting authority and bindings

- Worktree: `/Users/meridian/Projects/pulse-agent-reviewed-progression`
- Branch: `feat/agent-reviewed-progression`
- Required starting HEAD: `bfcf849b4e6b1e35e928681c518916708c657602`

`raw/00-clean-start.*` records the clean starting tree (`DIRTY_PATCH_SHA256` is the empty SHA-256)
and exact branch/HEAD. Its command exited 1 because the first binding inventory named a nonexistent
root `vitest.config.ts`; the clean-state observations remain authentic and unchanged.
`raw/01-start-bindings-corrected.*` is the corrected exit-0 inventory of the real package,
TypeScript, Vitest, Playwright, and lock files.

## Focused verification

| Receipt                                          |                         Result | Contract exercised                                                                                                                                                                     |
| ------------------------------------------------ | -----------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `07-shared-progression-schema`                   |                       7 passed | strict management modes and publication input                                                                                                                                          |
| `09-api-progression-store-replay-order`          |                      29 passed | transaction rollback repair and stable concurrent replay                                                                                                                               |
| `10-api-progression-routes`                      |                       7 passed | real action route, AgentToken provenance, OpenAPI request shape                                                                                                                        |
| `11-web-progression-review`                      |                      30 passed | managed final review, self review, and both web start surfaces                                                                                                                         |
| `12-api-start-provenance`                        |                       3 passed | scheduled snapshot, independent template start, concurrent start                                                                                                                       |
| `17-browser-api-managed-publication-375-desktop` | historical 1 passed; not final | original dirty-worktree browser run; input binding is unproven and is superseded by receipt `25`                                                                                       |
| `25-browser-api-managed-publication-375-desktop` |                       1 passed | clean pinned `b8ba3b7`, external synthetic DB, unique ports, real owner PUT, preview, AgentToken publish/replay, JWT readback, 375px/desktop UI, keyboard Start, active-session target |
| `18-shared-engine-and-contract-final-focused`    |                      37 passed | unchanged deterministic engine, native RIR including zero, safety/unknown holds                                                                                                        |
| `19-focused-typecheck-before-review`             |    3 packages passed, uncached | typed source and test contract before review                                                                                                                                           |
| `20-api-progression-store-final-focused`         |                      29 passed | incomplete batch rejection, injected rollback, concurrent replay, conflicting retry                                                                                                    |

The installed-Chrome acceptance screenshots and metadata remain local test artifacts at:

- `logs/progression-preview/existing-chrome/agent-reviewed-final-375.png`
- `logs/progression-preview/existing-chrome/agent-reviewed-final-1280.png`

The acceptance used only the fictional `adaptive-preview-wp-agent` fixture in the isolated
worktree database `apps/api/data/pulse-tdee-dev.db`. The fixture-only ignored `.env` contains no
production credential. No production database, deployment, migration, or service was accessed.

## Retained superseded evidence

Failures are retained rather than rewritten:

- `02`–`04`: intermediate type errors while the new strict evidence/configuration fields were
  propagated through fixtures; superseded by `06` and `19`.
- `05`: an accidentally broad package test invocation ran suites in parallel. Progression coverage
  passed, while unrelated performance/seed/active-workout tests failed under contention. It is not
  cited as acceptance evidence.
- `08`: the new concurrency assertion found disposition-order drift on replay. The implementation
  was repaired; `09` and `20` prove exact replay equality.
- `14`: browser launch failed before tests because the isolated worktree lacked its ignored `.env`.
  No app scenario ran. `15` passed after adding a fixture-only environment; `17` supersedes it with
  the required 375px and desktop checks.

## Internal review

One bounded GPT-5.6 Luna medium, Fast-off review inspected the current diff and reported no concrete
correctness or security findings. It independently confirmed owner-scoped authorization,
all-managed transactional publication, actor-bound replay, stale and schedule locks,
direct/non-progressing restrictions, final-review projection, and unchanged snapshot start paths.
The reviewer made no edits. Its attempted optional focused Vitest command did not find a binary in
the review agent environment; the primary agent's receipt-captured focused tests above are the
authoritative executions.

## Final uncached candidate gates

Receipts `21`–`24` bind the final matrix to clean source candidate
`d977b4db271cde4f3e39fa59ee523f1b575495db`. Every receipt records
`worktreeDirtyBefore: false`, exit code 0, `TURBO_FORCE=true`, strict environment handling, and
single-worker Turbo execution.

| Receipt              | Result                         | Notes                                               |
| -------------------- | ------------------------------ | --------------------------------------------------- |
| `21-final-test`      | 6 Turbo tasks passed, 0 cached | shared 729, web 1420, API 1243, repo scripts 15     |
| `22-final-typecheck` | 3 Turbo tasks passed, 0 cached | shared, API, and web                                |
| `23-final-lint`      | 3 Turbo tasks passed, 0 cached | zero errors; six pre-existing Fast Refresh warnings |
| `24-final-build`     | 3 Turbo tasks passed, 0 cached | successful production builds; known chunk warning   |

`final-binding-manifest.md` binds the reviewed source, tests, goal, package/config/lock files,
receipt harness, and final raw receipts by SHA-256. The later evidence-only commit does not alter
the tested candidate and therefore does not invalidate or rerun this matrix.
