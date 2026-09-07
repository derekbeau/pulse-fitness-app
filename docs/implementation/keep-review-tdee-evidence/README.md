# Issue 137 implementation and evidence map

Forward implementation: eligible keep reviews accept the expenditure calculation in the existing
immediate transaction and resolve the check-in without a target or event write. Immutable
snapshots and historical terminal rows remain intact. Material acceptance retains the existing
proposal, same-date conflict and explicit replacement lifecycle.

## Requirements and proof locations

| Contract requirements                 | Proof                                                                                                                                                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–4: small movement, dead-band, floor | `review-store.integration.test.ts`: signed ±10/±20 persistence; exact signed 20/24/25/30 classification and target/event counts; floor-pinned learning. Shared `adaptive-tdee.test.ts` boundary tests; original rounding/cap/floor tests retained. |
| 5: no fabrication                     | Store tests reject baseline, learning, held, null TDEE, missing targets/update, and ineligible snapshot with unchanged rows. Real API held acceptance returns 409.                                                                                 |
| 6: next prior                         | Store tests assert accepted source ID/TDEE in subsequent immutable input snapshot; delayed acceptance test verifies historical and current provenance.                                                                                             |
| 7: material lifecycle                 | Existing edit/explicit-accept and same-date replacement tests retained; exact boundary tests assert target and event counts. Chrome material flow verifies accepted target ID.                                                                     |
| 8: audit/atomicity                    | Retry equality, one action, temporary trigger failure rollback, and two Node processes synchronized at a barrier before accepting through independent SQLite connections.                                                                          |
| 9: stale                              | Fingerprint, action sequence, source facts, algorithm, program, goal and ownership tests assert no check-in/target/event/action writes.                                                                                                            |
| 10: auth/isolation                    | Existing JWT-only decision boundary preserved. Chrome/API harness uses real login and AgentTokens: own reads equal, foreign review/check-in IDs 404, foreign JWT accept 404, AgentToken decision 403.                                              |
| 11: analytics                         | Model-only expenditure source/value advances; target calories/IDs persist. Only explicit model-only audit adopts acceptance-date semantics; legacy effective-date analytics test remains unchanged.                                                |
| 12: compatibility                     | Historical accepted keep plus declined source read/retry unchanged; baseline and immutable snapshot equality; strict optional audit tests; all prior target/event/API tests retained.                                                              |
| 13: launcher UI                       | Installed Chrome, 375×812: keep, material adjust, held calculation, populated defer form, accepted audit, rendered analytics. Screenshots/readbacks under external `browser/`.                                                                     |
| 14–15: gates/evidence                 | `scripts/verify-keep-review-tdee.mjs` records committed full SHA, branch, cwd, exact command, timestamps, literal stdout/stderr and exit for serial uncached lint/typecheck/test/build, diff check and clean status.                               |
| 16: boundaries                        | No production/canonical DB access, backfill/repair, `.env` or secret changes, deployment, merge, push, or cron. QA uses freshly created temporary fictional databases and dedicated localhost ports.                                               |

Test files are in `apps/api/src/routes/adaptive-nutrition/`,
`packages/shared/src/{utils,schemas}/`, and
`apps/web/src/features/adaptive-nutrition/components/`.

## Review consolidation

All reviewers used GPT-5.6 Luna medium, read-only, with distinct assignments:

- `/root/data_review` — data/contracts/invariants: no concrete blocker; canonical rounding
  interpretation documented and exercised through full review classification.
- `/root/auth_review` — auth/atomicity/concurrency: preserve JWT boundary, guard source eligibility,
  null-target replay, atomic action rollback and cross-process race. Implemented and verified;
  focused final delta review found no blocker.
- `/root/ui_analytics_review` — UI/analytics/product: repaired acceptance-date/current-prior
  mismatch, explicit decision copy, absent-target UI coverage. Final delta review found no blocker.
- `/root/tests_evidence_review` — tests/evidence/hygiene: replaced sequential Promise simulation
  with synchronized child processes; added malformed/held rejection and real API model-only,
  parity/isolation and mobile screenshots. No reviewer edits or duplicate full-suite runs.

Primary consolidated all findings and owns the final verification. Reviews do not imply merge
or deployment approval. The contract authorizes Astra execution; the runtime did not expose a
visible effort-label selector, so no exact visible-label selection is claimed.

## Reproduction

From the clean committed branch:

1. `node scripts/verify-keep-review-tdee.mjs`
2. `pnpm --filter @pulse/api exec tsx qa-keep-review-tdee.ts`
3. `VITE_API_PORT=3117 pnpm --filter @pulse/web exec vite --host 127.0.0.1 --port 5287`
4. `pnpm --filter @pulse/web exec node qa-keep-review-tdee.mjs`

The QA launcher creates a new fictional database each run; stop its listener before restarting.
No credentials are emitted by the browser evidence writer. Test credentials exist only for
fictional fixtures. Browser result is launcher evidence, never an executor acceptance blocker.

Literal final receipts, precommit attempts, screenshots, API readbacks, final report and git
status are retained under `/Users/meridian/Projects/qa-reports/pulse-pr137-launch/`.
The final report there identifies the exact committed SHA and gate results.
