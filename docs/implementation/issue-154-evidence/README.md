# Issue #154 gate receipts

Each gate JSON records the exact command, start/end times, exit code, implementation HEAD, tracked patch SHA-256, and SHA-256 of its raw output. Raw logs are retained losslessly as `.log.gz`; the original metadata remains unchanged. `log-archives.json` maps original names to archives and hashes the uncompressed bytes. Locally, uncompressed originals are preserved under ignored `logs/issue-154/raw/`.

To inspect a receipt: `gzip -dc docs/implementation/issue-154-evidence/test-1.log.gz`.

Final passing gates: `lint-2`, `typecheck-3`, `test-1`, `build-1`, and `browser-3`. All Turbo gates used `--force`; no cached tasks counted as execution. `typecheck-1` and `browser-2` remain retained failed attempts, with their fixes explained in the parent evidence document. `browser-1` passed before screenshot timing was improved.

`source-receipt.json` binds the final application/test files to the executed gates. Full test ran after the exact-name RTL correction. Later changes were confined to the opt-in Playwright harness and fixture, which the final browser/lint gates exercised. No product or Vitest/repository-script inputs changed after the passing full suite. `verified-candidate.patch.gz` preserves the final source patch relative to implementation commit `27afa252b7a7739bd0cfbf1e0b9b74503f2de08a`.

`resources-before.json`, `networking-ownership.json`, and `wrapper-ownership.json` retain capacity and isolation checks. `builtin-readback.json` and `wrapper-readback.json` record synthetic database integrity checks. Final browser screenshots and per-viewport assertions are in `artifacts/issue-154/browser-3/`; earlier evidence is preserved separately. `service-cleanup.json` records the exact owned processes stopped after acceptance. Databases and authentication tokens are excluded from Git.
