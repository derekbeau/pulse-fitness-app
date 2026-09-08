# Raw receipt authority

Every `*.log` file is literal combined stdout/stderr captured by one wrapper. The wrapper records
receipt format, tested commit, branch, worktree, UTC start/end, exact escaped command, output
boundaries, and exit code. Raw output is intentionally not normalized for whitespace.

## Final authority

The final source/test commit is `ea4ca7688c5c022abfa38affba424d150b07ee5a`.

- `00-identity.log` — branch, source commit, base, prepared ancestor, and worktree state.
- `01-repo-tests.log` — repository script tests.
- `02-shared-tests.log` — full serial uncached shared Vitest suite.
- `03-api-tests.log` — full serial uncached API Vitest suite; only final API authority.
- `04-web-tests.log` — full serial uncached web Vitest suite; only final web authority.
- `05-typecheck.log` — forced Turbo typecheck.
- `06-lint.log` — forced Turbo lint.
- `07-build.log` — forced Turbo build.
- `08-migration-acceptance.log` — focused verbose migration/restore/rollback/idempotence receipt with
  exact source hashes.
- `09-playwright-acceptance.log` — synthetic bundled-Chromium acceptance command.
- `10-browser-evidence-audit.log` — decoded attachment audit, artifact hashes, viewport dimensions,
  and explicit expected/unexpected error classification.
- `11-source-hash-verification.log` — successful verification of all 1,559 manifest entries.
- `12-receipt-index-verification.log` — machine-checks the tested commit and exit code for every
  final receipt and the nonzero exits for all retained superseded receipts.

## Superseded — not final passes

- `01-repo-tests-SUPERSEDED-harness-error.log` is an invalid receipt-harness invocation, exit 9.
- `03-api-tests-SUPERSEDED-clock-drift.log` is the full reviewed-candidate run that exposed the
  fixed timestamp after pause/resume, exit 1.
- `03a-api-focused-SUPERSEDED-clock-drift.log` reproduces that test-clock failure, exit 1.
- The earlier concurrent web timeout had no recoverable raw receipt. It was not recreated or
  represented as raw evidence, and it has no final authority.

## Expected synthetic events inside passing gates

- Browser: one intentionally injected session-draft 503 is labeled
  `EXPECTED SYNTHETIC FAILURE-PATH`; retry succeeds, and the audit proves there are no unexpected
  page errors, console errors, or network failures.
- Migration: the transactional rollback test deliberately throws after partial synthetic writes
  and asserts that no rows or revision increments survive. The enclosing test and gate pass.
