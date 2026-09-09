# Browser acceptance binding for reviewed candidate

- Tested HEAD: `81f36a69997d15e8b4aed89059b98ae3d2dcd502`
- Test file: `apps/web/e2e/semantic-template-diff.spec.ts`
- Playwright: 1.62.1, Chromium project, one worker, zero retries
- Result: 3 expected, 0 unexpected, 0 flaky
- Exit status: `exit-status.txt` contains `0`
- Start time from raw reporter: `2026-09-09T18:12:57.203Z`

## Invocation

The isolated API used `JWT_SECRET=synthetic-browser-only`, port 33165, and disposable database `/private/tmp/pulse152-evidence-browser.db`. The web server used port 54165. Both ports were free and the database absent before startup; both servers were stopped afterward. No repository `.env` or production service/data was used.

```text
JWT_SECRET=synthetic-browser-only PORT=33165 DATABASE_URL=/private/tmp/pulse152-evidence-browser.db pnpm --filter @pulse/api exec tsx src/index.ts
VITE_API_PORT=33165 pnpm --filter @pulse/web exec vite --host 127.0.0.1 --port 54165
API_PORT=33165 E2E_PORT=54165 API_BASE_URL=http://127.0.0.1:33165 BASE_URL=http://127.0.0.1:54165 E2E_DATABASE_URL=/private/tmp/pulse152-evidence-browser.db pnpm exec playwright test apps/web/e2e/semantic-template-diff.spec.ts --project=chromium --workers=1 --reporter=json --output=/private/tmp/pulse152-browser-artifacts
```

## Authentic retained artifacts

- `playwright-stdout.json`: untouched JSON reporter stdout. It contains the exact argv, test titles, viewport-bearing test names, status/duration, and base64 reporter attachments.
- `playwright-stderr.log`: untouched stderr (empty).
- `exit-status.txt`: shell-captured Playwright exit status.
- `tested-head.txt`: `git rev-parse HEAD` captured for the run.
- `mobile-375-readback.json` and `desktop-1280-readback.json`: decoded verbatim from the corresponding base64 attachments in `playwright-stdout.json`; both contain empty `consoleErrors` and `failedRequests`, the concrete disclosure text, and `startEnabled: true`.
- `api-error-responses.json`: decoded verbatim from the reporter attachment; contains the two observed synthetic detail responses, both status 500.
- `attachment-verification.txt`: machine-produced `decoded_match=true` and SHA-256 verification for all three decoded reporter attachments.
- `playwright-last-run.json`: Playwright output status metadata.
- `screenshots/*.png`: screenshots produced by this exact run.

Every retained artifact is SHA-256 bound by `../reviewed-candidate-evidence.sha256`. The raw JSON reporter remains the authority for the decoded readbacks.
