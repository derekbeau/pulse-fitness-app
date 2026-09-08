Food-name logging could select a substring match or create a duplicate while repeated ad-hoc snapshots offered little reuse guidance. This adds owner-local categorical saved-food ranking and 30-day recurrence evidence, exact-only name resolution, and explicit ambiguity. Candidates remain advisory; current writes preserve ad-hoc intent and never relink history.

Meal creation and append retain provenance, classify reused/created/adhoc outcomes, and suppress redundant embedded-summary guidance. The independent-review repairs remove numeric ranked-match scores from runtime/Zod/OpenAPI/docs, and acquire SQLite's writer before the final owned-food recheck. Food/current meal/items/usage commit atomically; busy/locked errors retry the whole transaction at most four times with 25/50/100ms backoff. Created outcomes publish after commit. No migration, uniqueness constraint, alias model, automatic promotion, or history rewrite was added.

Refs #138. Frozen contract and #143/#133 invariant tests remain unchanged. Repair source: `e25b4c6c0c92151eca01b583ef409c613c25e41f`.

**DRAFT — ACCEPTANCE BLOCKED.** The full/browser slot was granted and used. This is no longer waiting for slot authorization. Do not merge or deploy.

| Fresh final command      | Result                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `pnpm lint --force`      | PASS; six existing web warnings                                                                          |
| `pnpm typecheck --force` | PASS                                                                                                     |
| `pnpm test --force`      | FAIL: existing usage-merge test hit 15s; new process fixture hit its 5s startup deadline under full load |
| `pnpm build --force`     | PASS; existing chunk-size warning                                                                        |

All commands bypassed cache reads. One uncached serialized diagnostic (`pnpm test:repo-scripts && pnpm exec turbo run test --concurrency=1 --force`) passed 3,225 workspace tests plus repository-script tests. It does not replace the red default gate. No timeouts, concurrency defaults, assertions or test retries were weakened.

Focused evidence: 11 API files / 144 tests; 3 shared files / 68 tests. The genuine two-process proof (7 tests, included in API count) uses real independent API/SQLite connections and an IPC barrier, induces actual SQLITE_BUSY, and verifies all three write surfaces, one definition, created/reused outcomes, replay, owner isolation, bounded exhaustion, late legacy ambiguity and full persistence rollback. Raw response/OpenAPI assertions cover categorical-only saved/frequent/nested matches while retaining separate shorthand scoring.

Internal Luna-medium review and bounded follow-up are disposed; no actionable source findings remain from that review. Browser verification was not started because the required default gate remains red. Awaiting independent review/parent direction; no acceptance claim.

[Repair report, literal preflight, source hashes, review dispositions and all raw receipts](https://github.com/derekbeau/pulse-fitness-app/blob/feat/ranked-food-reuse/artifacts/issue-138-repair/README.md).
