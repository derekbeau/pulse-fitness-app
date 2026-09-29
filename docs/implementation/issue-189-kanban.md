# Issue 189 implementation contract

Canonical scope: GitHub issue #189, informed by closed #124 / PR #171 and merged Activity release PR #187. This branch fixes browser compatibility for non-security client-generated Body Progress and local Activity IDs only; it does not implement #188 or change authentication, encryption, production data, or server ID generation.

## Design contract

- Add one shared web utility that feature-detects `globalThis.crypto.randomUUID`, otherwise generates an RFC 4122 version-4 UUID with `crypto.getRandomValues`.
- Never substitute `Math.random` or another weak source. If neither cryptographic capability is usable, return an explicit typed failure that affected components render as a controlled, recoverable state.
- Preserve `body-ui-` and `activity-local-` prefixes and existing downstream validation.
- Initialize the Body Progress operation key lazily and once per mounted create operation. Rerenders and retries reuse it; distinct mounts/operations generate distinct keys. Existing-entry PATCHes remain governed by server versioning.
- Generate an Activity local ID only on valid submit. A failed ID generation keeps the form open with an actionable error; rerenders do not create IDs, and distinct successful submissions receive distinct IDs.
- Audit all browser-source `randomUUID` call sites; Node-only test and API usages are out of browser scope.

## Acceptance map

1. Guided Body Progress opens without `crypto.randomUUID`: component test removes the method, renders the form, and saves with the fallback ID.
2. Activity local creation works without `crypto.randomUUID`: component/page test submits and verifies the prefixed fallback ID.
3. Utility behavior: focused tests cover native delegation, cryptographic fallback UUID format/version/variant/uniqueness, and explicit no-crypto failure.
4. No unconditional polyfill: tests alter crypto per case and restore it.
5. Identity/idempotency: Body tests verify rerender and failed-request retry reuse one key and a separate mount gets a different key; Activity tests verify no ID churn on rerender and unique IDs across submitted operations.
6. Real browser compatibility: focused Playwright acceptance removes `randomUUID` before application code, records `window.isSecureContext`, exercises an actual Body draft/save retry without duplication and an Activity add action, and uses a non-loopback HTTP host when the harness/environment supports it. Any forced-method-removal evidence is labeled honestly and does not claim ambient HTTP behavior.
7. Normal native behavior and call-site audit: utility native-path test plus focused browser acceptance; source search confirms no unguarded browser `randomUUID` use remains.

## Verification commands

Focused while editing:

- `pnpm --filter web test -- src/lib/browser-id.test.ts src/features/body-progress/components/guided-check-in-form.test.tsx src/pages/activity.test.tsx`
- `pnpm --filter web typecheck`
- focused Playwright command defined by the added #189 spec, with isolated `E2E_DATABASE_URL`, non-production `API_PORT`/`E2E_PORT`, and durable `PLAYWRIGHT_OUTPUT_DIR` under `/Users/meridian/Projects/qa-reports/pulse-188-189/189-implementation/`

Final source-bound gate (one run after repairs):

- `pnpm lint`
- `pnpm typecheck`
- `TURBO_CONCURRENCY=1 pnpm test`
- `pnpm build`
- focused #189 Playwright acceptance against the exact candidate source with raw output, exit status, timing, source SHA, environment/origin/secure-context record, and browser artifacts retained under `/Users/meridian/Projects/qa-reports/pulse-188-189/189-implementation/`

Deliver a clean committed/pushed candidate, PR against `main` with `Closes #189`, evidence index mapping each criterion to raw receipts, and disclose browser-origin limitations. Independent review, merge, deployment, issue closure, and downstream release remain Vector-owned.
