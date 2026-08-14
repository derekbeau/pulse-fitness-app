# Milestone 6 Preview and Backtest Runbook

> Historical Milestone 6 runbook. Current final-QA fixtures extend goal history beyond 20 rows; use
> `codex-kickoff.md` and `verification-report.md` for current commands and evidence.

This runbook is non-production only. The preview must use the tracked Gate 0 ports and exact ignored
database path. A database containing production-derived health data must never be bound to a network
interface.

## Historical replay

The self-contained JSON vector proves explicit completion labels are required and stale April weights
cannot generate an August estimate:

```bash
pnpm --silent backtest:adaptive-tdee -- \
  --input scripts/fixtures/adaptive-tdee-backtest.json \
  --format json > adaptive-tdee-backtest.json
```

The `--silent` pnpm option is required for redirected machine output; without it, pnpm prints a command
banner before the JSON or CSV payload.

For the private production-copy replay, select the intended user without recording identity in tracked
evidence and provide:

- `scripts/fixtures/adaptive-tdee-production-copy-checkins.json`
- `scripts/fixtures/adaptive-tdee-production-copy-complete-dates.json`
- `scripts/fixtures/adaptive-tdee-production-copy-program.json`

Do not select the database's first user. The final anonymized historical cohort is identified by its
reviewed aggregate only: 19 canonical weights from 2026-03-11 through 2026-04-07. The replay must produce an
eligible 2026-04-08 row and a held 2026-08-13 row with zero current weight inputs.

The source `.db`, `-wal`, and `-shm` files are snapshotted byte-for-byte into a private temporary
directory before SQLite is opened read-only with `query_only=ON`. SQLite never opens the source family,
and the command fails if any source-family file's presence or bytes change during a successful replay.
The command also fails if the canonical `weight_kg` column is absent or the scratch connection reports a
write. Completion overrides exist only in memory; stored `unknown` values remain unchanged.

## Synthetic Coach preview

1. Create and migrate a fresh `apps/api/data/pulse-tdee-dev.db` with `pnpm dev:gate0`, then stop it.
2. Run `pnpm seed:adaptive-tdee-preview -- --date 2026-08-13`.
3. Confirm the database contains exactly the thirteen `adaptive-preview-*` users and no other users.
4. Start locally with `pnpm dev:gate0`, or use
   `pnpm dev:gate0 -- --web-host=<tailscale-ipv4>` after confirming the address with
   `tailscale ip -4`.
5. Verify `/`, proxied `/health`, and the direct API `/health` before handoff.

All preview accounts use the test-only password `adaptive-preview-only`:

| Username                        | Expected state or path                                                 |
| ------------------------------- | ---------------------------------------------------------------------- |
| `adaptive-preview-setup`        | Setup required                                                         |
| `adaptive-preview-baseline`     | Baseline active                                                        |
| `adaptive-preview-learning`     | Learning with insufficient recent data                                 |
| `adaptive-preview-updating`     | Eligible and ready for a manual check-in                               |
| `adaptive-preview-holding`      | Prior estimate held because recent weight is stale                     |
| `adaptive-preview-pending`      | Pending recommendation plus prior-decline history                      |
| `adaptive-preview-goal-reached` | Reached proposal; acceptance still requires separate completion review |
| `adaptive-preview-goal-loss`    | Active loss progress                                                   |
| `adaptive-preview-maintain`     | Active maintenance range                                               |
| `adaptive-preview-goal-edited`  | Same-direction revision history                                        |
| `adaptive-preview-goal-history` | Prior replaced goal plus active new direction                          |
| `adaptive-preview-goal-pending` | Goal-change recommendation awaiting explicit acceptance                |
| `adaptive-preview-completion`   | Accepted reached goal awaiting explicit completion                     |

The seeder is idempotent: rerunning it removes and rebuilds only `adaptive-preview-*` users. It rejects
every database path except the regular, non-symlink Gate 0 database.

## Browser acceptance

Run installed-Chrome coverage against the already-running isolated stack:

```bash
BASE_URL=http://<preview-host>:5274 \
API_BASE_URL=http://127.0.0.1:3102 \
E2E_PORT=5274 \
API_PORT=3102 \
PLAYWRIGHT_CHANNEL=chrome \
pnpm --filter @pulse/web test:e2e -- \
  e2e/adaptive-nutrition.spec.ts \
  e2e/adaptive-preview-fixtures.spec.ts
```

The fixture suite fails on console warnings/errors, page errors, transport failures, or unexpected HTTP
responses at or above 400. It covers every Coach state, decline/history/re-preview/acceptance, persistent
loss/maintenance cards, goal edits/new directions, revision/prior-goal audit, stale completion, idempotent
retry, keyboard focus restoration, explicit maintenance transition, and 320, 375, 390, 430, 768, and
1280 px widths.
