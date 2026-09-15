# Body check-in foundation evidence

This evidence records the Pulse #169 backend bridge tested on 2026-09-14 in
`/Users/meridian/Projects/pulse-body-check-in-foundation`.

## Source identity

- Branch: `feat/body-check-in-foundation`
- Verified clean starting HEAD: `7cf9c9f51c63fcd9a9a384c80d0d56f2cda0557d`
- Implementation and test file hashes: `source-manifest.sha256`
- Gate configuration hashes: `source-manifest.sha256`
- No implementation or configuration file changed between the recorded final
  gates and the manifest capture.

## Focused verification

Before the final gates, the body check-in shared contract/quality tests and the
focused API/migration lifecycle set passed:

- Shared body check-in schemas and canonical reading quality: 2 files, 6 tests.
- Body check-in API, synthetic 0066 migration lifecycle, generalized predecessor
  lifecycle, and legacy scalar CRUD compatibility: 4 files, 11 tests.
- Focused API lint and typecheck passed.

The uncached full test receipt also contains passing executions for the new API,
migration, shared contract, quality, and legacy scalar compatibility tests.

## Final uncached gates

All commands used `TURBO_FORCE=true` and the dependency/configuration files
listed in `source-manifest.sha256`.

| Gate                     | Result                                                                                                            | Raw receipt                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `pnpm lint`              | Passed: 3/3 tasks, 0 cached; 0 errors and 6 pre-existing Fast Refresh warnings                                    | `final-lint.log`             |
| `pnpm typecheck`         | Passed: 3/3 tasks, 0 cached                                                                                       | `final-typecheck.log`        |
| `pnpm test`              | Functional assertions passed except three independent 15-second timeouts under the forced parallel run; see below | `final-test.log`             |
| Exact failed-test reruns | Passed unchanged: 3/3 selected tests                                                                              | `targeted-timeout-rerun.log` |
| `pnpm build`             | Passed: 3/3 tasks, 0 cached; existing Vite chunk-size warning only                                                | `final-build.log`            |

The full test command recorded 1,261 passing API tests before two API tests
timed out, plus one web timeout. The three timeout cases were unrelated to body
check-ins:

1. Adaptive TDEE preview fixture rebuild.
2. Food-usage reconciliation dry-run/apply lifecycle.
3. Active-workout rest-timer focus behavior.

Each exact failed case was rerun once against unchanged source and passed in
6.501 s, 5.413 s, and 0.779 s respectively. The original failed receipt is
retained; it is not represented as a passing command.

## Review and scope

A single read-only internal review used GPT-5.6 Luna at medium effort with Fast
off. Its consequential findings were resolved in the tested source: immutable
protocol source snapshots, preserve-mode cadence anchoring, concise body
context, retry-idempotent CAS-backed skip/snooze operations, shared unit-safe
quality arithmetic, and authenticated owner-scoped export. The goal's explicit
one-check-in-per-user/date rule and historical explicit-date due evaluation were
retained.

No UI, analytics, photos, production data, deployment, merge, or Body Progress
release action is included.
