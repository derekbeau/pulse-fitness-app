# Pulse #132 acceptance evidence

## Binding

- Implementation commit: `ad9f259895a3b5732eae30cb3911d896d409ee9f`
- Tested tree: `33bd372571d5d6118101013afdf7b67d10a181d2`
- Branch: `feat/daily-nutrition-targets`
- Starting HEAD: `1090719b096ed4ce37f9af8ba3d87e93d11ae9aa`
- Every authoritative receipt records `worktreeDirtyBefore: false`, the same implementation commit/tree, exact argv, timestamps, exit status, and raw-log SHA-256.
- The later evidence-only commit adds this report and captured artifacts; it does not change the tested implementation tree.

## Outcome

The selected date can override any subset of calories, protein, carbs, and fat. Omitted fields preserve an existing override, explicit `null` restores the baseline field, and an empty override is deleted canonically. The UI shows baseline, effective values, adjusted provenance, and optional reason. Clearing restores the causal baseline.

Resolution is owner/date scoped and uses the existing program/profile timezone authority plus causal target-event ordering. The effective target is consumed by selected-date summary, adherence, week/history, dashboard detail, and agent display contexts. Adaptive calculations, review eligibility, accepted expenditure, target events, and actual intake/weight paths are unchanged. Cache invalidation is confined to the selected date and its containing week.

## Internal review

One consolidated review used GPT-5.6 Luna at medium effort with Fast off. It found three actionable P2 issues, all remediated before the final candidate:

1. Dashboard cache invalidation was broader than the selected date; it now invalidates only `dashboardSnapshot.detail(date)`.
2. SQLite `length()` counts Unicode code points rather than JavaScript UTF-16 code units; persistence now records and constrains `reason_code_units`, with astral-character boundary tests.
3. Evidence coverage needed explicit missing-baseline, future-date, adaptive-ledger, and browser confinement checks; those assertions are now present.

The reviewer reported no remaining merge-blocking findings after remediation. This is still not self-acceptance.

## Authoritative final receipts

| Receipt | Result | Evidence |
| --- | --- | --- |
| Browser acceptance | 2/2 Chromium scenarios passed at 375px and 1280px | `raw/07-browser-acceptance-bound-final.{log,json}` |
| Full tests | 15 repository-script tests plus 3,411 Vitest tests passed; 6/6 Turbo tasks, 0 cached | `raw/08-test-uncached-bound-final.{log,json}` |
| Typecheck | 3/3 Turbo tasks passed, 0 cached | `raw/09-typecheck-uncached-bound-final.{log,json}` |
| Lint | 3/3 Turbo tasks passed, 0 cached; 0 errors and 6 pre-existing Fast Refresh warnings | `raw/10-lint-uncached-bound-final.{log,json}` |
| Build | 3/3 Turbo tasks passed, 0 cached; existing chunk-size advisory only | `raw/11-build-uncached-bound-final.{log,json}` |

The browser output retains full-page screenshots plus explicit console and nutrition-network JSON for each viewport. Both console files are empty; both network files contain successful selected-date `PATCH` and `DELETE` responses and successful reads for the historical, selected, and future dates.

## Earlier authentic receipts

`raw/01-browser-acceptance` is the retained failed browser receipt: the API started on port 3101 while Vite proxied to 3122. `raw/02` through `raw/06` are passing receipts for the preceding candidate. They are development evidence only and are superseded by authoritative receipts `07` through `11`; none were rewritten or relabeled.

Ready for independent review. Not self-accepted and not merged.
