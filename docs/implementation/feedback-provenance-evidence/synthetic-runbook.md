# Synthetic-only feedback provenance rehearsal

This is a capability rehearsal, not authorization to touch a real environment. No production command is provided. The frozen contract remains authoritative. Do not point any script here at a real-data copy or live database.

## Boundary and evidence

`apps/api/src/scripts/migrate-feedback-synthetic.ts` never imports the default application database or loads an environment file. It validates an existing regular, non-linked `fixture.db` beneath the canonical system temporary directory, in a `pulse-feedback-synthetic-*` directory, before opening SQLite. The database must also contain the `feedback-provenance-149`, version 1 synthetic manifest. A path name alone does not make real data acceptable: use only the fictional generator in this lane.

The library preflights all known source columns and foreign keys, plans every owned session in stable owner/ID order, then applies bounded immediate transactions. Dry-run opens read-only in the CLI and performs the same inventory and classification without writes. All generated summary numbers are non-actionable unless explicit same-construct native evidence validates them. Known historical generation requires an explicit source artifact bound to owner, record and raw checksum; absent that proof it remains legacy_unknown. Historical actor assertions likewise require a source artifact. Numeric coincidence never supplies proof.

The ledger records all source records, including null-feedback skips and canonical preserved records. Raw legacy payloads and projected checksums are retained separately in the private audit. Resume checks source/version/checksum before accepting a completed record. A conflict aborts; it does not overwrite a newer revision. Note candidate detection only queues uncertain prose. A confirmed disposition requires an exact owned note revision, linked invalid feedback checksum, construct and evidence ID. Original notes and actor metadata remain untouched.

## Disposable fixture commands

Run from the isolated worktree. First create a fresh fictional fixture with `pnpm --filter @pulse/api exec tsx src/scripts/seed-feedback-synthetic.ts`. This creates a new temporary directory and an original synthetic SQLite backup. Keep both files. Record the printed path as `<temporary-fixture-path>` below; these placeholders are deliberately not live paths.

```
pnpm --filter @pulse/api exec tsx src/scripts/migrate-feedback-synthetic.ts --fixture <temporary-fixture-path> --dry-run --acknowledge-synthetic-only --classified-at 2026-09-08T00:00:00.000Z
pnpm --filter @pulse/api exec tsx src/scripts/migrate-feedback-synthetic.ts --fixture <temporary-fixture-path> --apply --acknowledge-synthetic-only --classified-at 2026-09-08T00:00:00.000Z
pnpm --filter @pulse/api exec tsx src/scripts/migrate-feedback-synthetic.ts --fixture <temporary-fixture-path> --apply --acknowledge-synthetic-only --classified-at 2026-09-08T00:00:00.000Z
pnpm --filter @pulse/api exec tsx src/scripts/migrate-feedback-synthetic.ts --fixture <temporary-fixture-path> --rollback --acknowledge-synthetic-only
```

Rollback is transactional and compares every current projection against the audit. It restores exact raw feedback only if there was no subsequent edit, deactivates note dispositions, and retains audit/ledger history. A rolled-back rehearsal cannot be silently resumed: create another fresh fictional fixture or restore its preserved original while that synthetic API is stopped. Never use a raw file copy against an open SQLite database. The migration tests verify byte-identical dry-run and forced-batch rollback, interrupted resume, exact source/set restoration, and audit retention. A real-data execution and backup/restore plan require a separate approval; this runbook does not provide one.

## API/client behavior

The shared v2 response has nullable energy/recovery/technique, native responses and per-construct provenance. Legacy requests remain accepted only through the explicit legacy input branch: their raw values are audited and their unsupported ratings are null. JWT/AgentToken identity is supplied by the server, overriding submitted actor claims. A native response must validate its type and construct; reserved pain/RPE questions cannot be relabeled as recovery/technique. Canonical submitted ratings are recomputed from native evidence, with the exact submitted object retained privately.

The owner-only `GET /api/v1/workout-sessions/:id/feedback-audit` is paginated and includes raw submissions, migration payloads and session-note remediation history. It is an explicit audit surface, excluded from generic context. Session history opens it on demand. OpenAPI is generated from the same shared request/response schemas; tests assert provenance, nullability and both authentication schemes.

## Browser evidence status

Built-in browser used first against the task-owned API 3119/web 5289 and fictional account. It exercised native RPE, mapped energy, false pain, skipped custom response, failure and reload, and saved screenshots/readbacks. Advertised tab capabilities were pageAssets and webmcp, with no interception or standalone test runner. Headless Playwright provides repeatable 375/1280 tests with controlled 503 failure and persisted native-data assertions, using a dedicated configuration that starts no server and requires the synthetic acknowledgement.

Earlier failing logs and screenshots are preserved as development evidence. They are not acceptance receipts. Final full gates and browser results must be listed separately after all changes stop.
