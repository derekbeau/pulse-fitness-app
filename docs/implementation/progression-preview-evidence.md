# Progression preview compatibility — execution evidence

## Scope and execution plan

Worktree: `/Users/meridian/Projects/pulse-progression-preview-fix`.
Branch: `fix/progression-preview-compatibility`.
Verified clean starting HEAD: `ad3d78706ca8f2dc399ec1726dbe27a05cdbaa3d`.
Its parent is the approved base `4f9574e607be99fee2396a673154e41699853a31`.

1. Read AGENTS, progression v1 specification, and the absolute goal contract; verify isolated checkout.
2. Implement shared lossless compatibility, per-exercise invalid evidence, and writer protection.
3. Bound preview request behavior and preserve inline source-aware comparisons.
4. Add persisted legacy, route, lifecycle, writer, UI, and installed-Chrome checks.
5. Run four distinct Luna-medium adversarial reviews, consolidate concrete findings, repair and verify.
6. Commit coherent source and evidence; run uncached gates and Chrome again from clean final HEAD.

## Behavior and boundaries

The strict canonical target schema still rejects mixed exact/range representations. The shared
compatibility helper alone recognizes equivalent equal rep bounds, retains exact reps, and records
`REDUNDANT_EXACT_REPS`. Conflicts retain schema-safe raw fields with current/historical source,
set ID and number; invalid historical prescriptions also retain completed observations. Invalid
sets never become fabricated canonical targets. Their exercise holds unavailable; other exercises
are evaluated independently. Empty canonical target arrays are allowed only with invalid-current
evidence, and material actions cannot apply unavailable evidence or empty action targets.

Existing immutable snapshots and action audit records are retained. Current redundant diagnostics
are non-semantic only when projecting an already decided recommendation: an explicit material
action may have canonicalized that current row. Historical diagnostics remain compared exactly.
Preview never updates scheduled targets. Keep/hold remain no-change actions.

Writers audited: scheduled template snapshot creation/replacement, scheduled route snapshot
construction, merged existing-set patches and added sets, scheduled-to-session materialization,
session set recreation preserving snapshot facts, and explicit progression accept/edit. Session
corrections update completed values without rewriting prescriptions. Agent/import callers share
these routes; no auth or enrichment branching was added. Session-start validation rejects conflicts
before creating a session, sets, or schedule link.

## Adversarial reviews and consolidated dispositions

All four requested distinct review agents were explicitly launched as `gpt-5.6-luna`, medium.
Reviews were read-only. Implementer validation below is separate from reviewer observations;
reviewer test attempts were blocked by their sandbox or command invocation, not counted as passes.

| Review                   | Finding                                                                        | Disposition                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A schemas/evidence       | P1: accepting current legacy redundancy makes decided recommendation stale     | Repaired: ignore only current redundant diagnostic provenance during decided projection. Accept/edit/reopen regressions cover current-only and both current/historical redundancy.                                                                                                                                                                                  |
| A schemas/evidence       | P1: exercise-set conflict mapped to unknown exercise                           | Repaired: correct route emits 400 `INVALID_REP_TARGET`; route regression passes.                                                                                                                                                                                                                                                                                    |
| B auth/isolation/writers | No consequential defect found                                                  | Auth, ownership, actor-bound idempotency, transactional action protection, and scheduled source identity retained.                                                                                                                                                                                                                                                  |
| C UI/query               | P1: Retry remains enabled while fetching                                       | Repaired: disabled pending Retry, pending label, non-cancelling refetch; pending activation test.                                                                                                                                                                                                                                                                   |
| C UI/query               | P2: both Retry and Recompute shown on error                                    | Repaired: hide Recompute on error, leaving one explicit retry.                                                                                                                                                                                                                                                                                                      |
| C UI/query               | P1/P2: number-based previous/current comparison may imply same source identity | Numeric rows intentionally compare different workout prescriptions: previous scheduled source IDs normally differ from the future schedule. Replacing this with ID matching would lose normal comparisons. Added explicit historical session-set/scheduled-source and current scheduled-set identities, with regression; no identity-based fulfillment is inferred. |
| D tests/evidence         | Claimed dual-source redundancy still stales after action                       | Not reproduced after A repair: historical diagnostics remain unchanged on both sides. Added dual-source accept/edit/reopen regressions using a material strength policy; both pass.                                                                                                                                                                                 |
| D tests/evidence         | Browser legacy success used synthetic payload                                  | Repaired: browser renders the real API response from current and historical persisted redundant rows. Conflict browser flow also uses persisted malformed current rows.                                                                                                                                                                                             |
| D tests/evidence         | Missing browser reopen request counts                                          | Repaired: SPA navigation away/back asserts exactly one POST and unchanged targets. Full page loads start a new query client and naturally make one initial POST.                                                                                                                                                                                                    |
| D tests/evidence         | Session-start conflict atomicity insufficiently tested                         | Repaired implementation and coverage: canonicalization checked before session transaction; conflict directions/range order return 400 with zero new sessions/sets/links; equivalent copying keeps source IDs and leaves source rows untouched.                                                                                                                      |

## Requirements to evidence

| Contract items                                                             | Evidence                                                                                                                                                                    |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–6 target forms, domain rejection, source-aware normalization             | `packages/shared/src/schemas/workout-progression-compatibility.test.ts`; strict original schema tests; evaluator tests                                                      |
| 3–9 persisted legacy, current/historical isolation, missing policy/history | `apps/api/src/routes/workout-progression/store.integration.test.ts` with populated isolated SQLite fixtures                                                                 |
| 10 writers/copy/update                                                     | scheduled snapshot tests, scheduled route tests, session route tests; rollback and unchanged source assertions                                                              |
| 11 JWT/AgentToken, cross-user 404, idempotency                             | progression route tests plus store actor/resource/body replay and ownership tests                                                                                           |
| 12 request counts/unchanged targets                                        | real TanStack hook tests (success and failure remount/focus/reconnect/retry), installed-Chrome SPA reopen and retry counts, persisted row assertions                        |
| 13 actions/stale/locks                                                     | existing and added progression store tests, scheduled/session route coverage, existing progression Chrome acceptance/edit/stale flows                                       |
| 14 UI/loading/unavailable/history/error/stale/accessibility                | progression review and query-client tests; keyboard-focusable horizontal comparison; 44px controls                                                                          |
| 15 installed Chrome                                                        | `apps/web/e2e/progression-preview-compatibility.spec.ts` and existing `workout-progression.spec.ts`; PNGs and JSON sidecars under ignored `logs/progression-preview/chrome` |
| 16 clean final uncached gates                                              | final raw logs and manifest under ignored `logs/progression-preview/final-<SHA>/`; exact outputs include command, branch, SHA, status, and exit code                        |

## Browser fixture and evidence policy

Only `/Users/meridian/Projects/pulse-progression-preview-fix/apps/api/data/pulse-tdee-dev.db`
is seeded, using fictional `adaptive-preview-*` users, anchored at 2026-08-23. API port 3191,
frontend 5291, installed channel `chrome`, one worker, zero Playwright retries. A fixture-only
`.env` contains no real credentials. No production environment or database is read or copied.
Legacy injection rejects absent, non-local, or symlink database paths. Successful legacy and
conflict previews use real persisted rows. No-policy response and intentional transport failure
are browser-controlled UI scenarios; API missing-policy behavior is separately tested with real rows.
PNG metadata records branch, full SHA, dirty/clean state, fixture, viewport, and action phase.
Working-tree logs/screenshots are explicitly pre-commit evidence, not final-HEAD receipts.

Mobile and desktop PNGs were inspected visually, including the horizontally scrollable comparison.
Final verification regenerates screenshots on the clean committed implementation.

## Execution metadata limitation

The contract requests the exact visible model/effort UI label. The Computer Use attempt to read
Codex was refused: `Computer Use is not allowed to use the app 'com.openai.codex' for safety reasons.`
No label-to-effort mapping or visible label is asserted. User clarification was requested while
implementation continued. This restriction does not affect repository or browser verification.

## Prohibited actions

No merge, push, deployment, production access/repair, migration creation/execution against canonical
data, external message, or changes to the original dirty checkout. Disposable fixture migrations
are test setup only. No known in-scope implementation finding is left unresolved.

## Literal pre-commit receipts

These are working-tree receipts at base `ad3d78706ca8f2dc399ec1726dbe27a05cdbaa3d`,
not final-HEAD evidence. Full unmodified output is retained in
`logs/progression-preview/consolidated-gates.log`.

```text
COMMAND: pnpm lint --force
EXIT CODE: 0
COMMAND: pnpm typecheck --force
EXIT CODE: 0
COMMAND: pnpm test --force
@pulse/shared:test:  Test Files  47 passed (47)
@pulse/shared:test:       Tests  671 passed (671)
@pulse/api:test:  Test Files  85 passed (85)
@pulse/api:test:       Tests  1071 passed (1071)
@pulse/web:test:  Test Files  184 passed (184)
@pulse/web:test:       Tests  1260 passed (1260)
EXIT CODE: 0
COMMAND: pnpm build --force
EXIT CODE: 0
```

The repository script tests are also included in `pnpm test`; every Turbo gate reports zero
cache hits. Existing frontend refresh-export warnings and the Vite chunk-size advisory remain
warnings, not gate failures. Working installed-Chrome receipts: seven compatibility tests and
five existing progression/muscle tests passed; their final committed versions are rerun below
through the final evidence harness.

## Reproduce final verification

Use the final `logs/progression-preview/final-<SHA>/manifest.json` for exact command arrays,
exit codes, branch/SHA and clean-status assertions. Each gate uses `--force` to bypass Turbo cache.
Browser commands use the environment described above and `--workers=1 --retries=0`; fixture seeding
runs before each browser suite so the explicit-accept suite cannot contaminate the compatibility
suite. Final PNGs are copied into that SHA-specific directory with their JSON metadata.
