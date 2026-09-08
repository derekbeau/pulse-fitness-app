# PR #160 final-gate follow-up

**Implementer verification passed. Ready for independent re-review; not self-accepted, merged or deployed.** This report supersedes the blocked verification status in `../issue-138-repair/README.md`; prior red receipts remain unchanged.

## Executor preflight and lineage

Actual executor worktree: `/Users/meridian/Projects/pulse-food-reuse`.
Actual branch: `feat/ranked-food-reuse`.
Actual follow-up starting HEAD: `6efd64fd058f8611838dd9ed29629bd44d25ff48` (required by `FINAL-GATE-FOLLOWUP.md`). Initial tool readback was clean. The retained literal `preflight.txt` was written after creating this evidence directory and therefore truthfully shows that directory as untracked. No inherited source changes existed.

Read authorities: worktree `AGENTS.md`, live issue #138, complete frozen contract, `REPAIR-PROMPT.md`, `FINAL-GATE-FOLLOWUP.md`, and the later parallel-networking README/wrapper. The direct parent instruction removed the slot restriction and authorized updating draft PR #160. No wait for #154/#155 remains. Neither lane's processes or fixtures were stopped, adopted or changed.

- Prior independently verified application repair: `e25b4c6c0c92151eca01b583ef409c613c25e41f`; evidence checkpoint `6efd64fd058f8611838dd9ed29629bd44d25ff48`.
- Timeout-test/source checkpoint: `89828ac5e2d4828c447016d0093e60a5aa1cb8d3`. All four fresh uncached final gates ran here.
- Browser harness correction and passing browser receipt: `56bec515b8bc1bf23585f62f3f7cab03e840cea4`. Its only change after the gate checkpoint is the artifact Playwright config's array-merge correction. All application, unit/integration test, documentation, dependency and standard configuration trees are identical (`gate-source-binding.json`).
- The subsequent evidence-only commit adds this report and retained receipts. It changes no executable source or harness. The final exact branch/PR SHA is reported in the executor handoff and PR body.

## Measured timeout repair

The usage merge/restore/ownership test compared complete `sqlite.serialize()` Buffer images using generic Vitest iterable equality. A focused V8 CPU profile measured **2,694.5ms in @vitest/expect and 559.3ms in GC** within a 4,654ms worker profile; SQLite/Drizzle execution was a small fraction. This is a measured allocation/comparison bottleneck, not evidence of a database deadlock.

A file-local Buffer equality tester now calls native `Buffer.equals`, preserving exact bytes and length for every existing rollback assertion. A distinct equal copy must pass; a changed last byte and truncated image must fail. All existing merge, restore, ownership and failure assertions remain. The equivalent after-profile measured **1.2ms in @vitest/expect and 38.9ms in GC**, within 1,329ms. Raw profiles and `profile-summary.json` retain the comparison. Profile commands use one focused Vitest worker solely for attribution; no global concurrency setting changed.

Worker IPC previously registered only after static imports/full API startup, so the old no-message timeout could not locate the stall. The fixture now registers IPC before asynchronous imports, queues early commands, reports bootstrap/DB-open/API-imported/API-ready phases, reports fatal import/spawn/signal failures, and closes already-exited/unspawned children safely. `online` still follows `await app.ready()`; it is not an early process-alive handshake. The original 5,000ms wait and API-wide 15,000ms test deadline remain unchanged.

The original worker stall has no historical phase trace; attribution to shared resource pressure is an inference supported by the old serial pass, the measured comparison cost, and the repaired default passes. No unobserved deadlock or precise old phase is asserted. Fresh default-run phase evidence now shows both full API workers ready within **1,765ms** of fork, all seven process cases executed, and the entire 12-test usage suite completed in **1,364ms**. No skips, todos, test retries, blanket timeout increases, global serialization or weakened existing assertions were added.

Only three existing files changed in this follow-up: `store.food-usage.test.ts`, `food-reuse-process.integration.test.ts`, and its `__tests__/food-reuse-worker.ts`. Additional files are isolated acceptance tooling and evidence under this directory.

## Preserved independent-review fixes

`invariant-hashes.json` proves the frozen contract, categorical matching/schema/OpenAPI contract tests/docs and actual food/current-write logic are byte-identical to the follow-up start. IR-1 remains categorical-only for saved/frequent/nested matches; separate shorthand scoring remains. IR-2 still acquires native `BEGIN IMMEDIATE` before the final owner-local food re-read, then commits definition/current meal/items/usage atomically. Only BUSY/LOCKED errors retry the complete transaction, at most four attempts with 25/50/100ms backoff; created outcomes publish after commit.

The real two-process proof retains independent API/SQLite connections, an explicit post-staging barrier, actual induced SQLITE_BUSY, all three mutation surfaces, one definition with created/reused outcomes, replay, owner isolation, four-attempt exhaustion, legacy duplicate ambiguity and persistence rollback. No new identity policy, uniqueness migration, automatic binding/promotion, historical linking or snapshot rewrite was introduced. #143 projection and #133 note invariants remain covered.

## Fresh checks

| Command                                                                                                                                              | Result                                                            | Raw log                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| `pnpm --filter @pulse/api exec vitest run src/routes/nutrition/store.food-usage.test.ts src/routes/nutrition/food-reuse-process.integration.test.ts` | PASS: 2 files / 19 tests, 3.05s                                   | `focused-timeout-repair.log`       |
| `pnpm test --force` before checkpoint commit                                                                                                         | PASS: first default run after the measured repair, 72.03s         | `default-after-timeout-repair.log` |
| `pnpm lint --force`                                                                                                                                  | PASS, 11.03s; six existing unrelated web Fast Refresh warnings    | `final-lint.log`                   |
| `pnpm typecheck --force`                                                                                                                             | PASS, 10.24s                                                      | `final-typecheck.log`              |
| **`pnpm test --force`**                                                                                                                              | **PASS, 68.33s; default repository concurrency, zero cache hits** | **`final-test.log`**               |
| `pnpm build --force`                                                                                                                                 | PASS, 11.51s; existing bundle-size warning                        | `final-build.log`                  |

Final tests: 15 repository-script tests; shared 47 files / 683 tests; API 89 files / 1,195 tests; web 188 files / 1,348 tests. **3,226 workspace tests; zero skipped or failed.** Literal skip/todo search in the default source trees remains empty. Four full-gate JSON receipts bind exact command, cwd, branch, HEAD, timing and exit code. Existing pre-commit hooks replayed cached checks; those are not claimed as fresh gates. The focused matrix from the prior repair (144 API / 68 shared tests) is retained there; the current full run freshly executes those tests as well.

Actual host checks are retained in `resources-before-*.txt`. Before the final test: 10 logical CPUs, 16GiB RAM, 72% system-wide free memory, 39GiB disk free, no demonstrated conflict. After the suite, load averages were still decaying; before browser startup actual process CPU was low and memory free was 69%. No other task was interrupted.

## Browser / API / SQLite / OpenAPI receipt

Read and sourced `/Users/meridian/Projects/qa-reports/pulse-parallel-networking/pulse160-acceptance-env.sh` with bash. Used the existing root Playwright harness through the artifact config, with API **3160**, web **5260**, and only the assigned database:

`/Users/meridian/Projects/qa-reports/pulse-parallel-networking/fixtures/pulse160/pulse-e2e.db`

Preflight proved both ports had no listener, the DB/WAL/SHM were absent, and created an exclusive owner marker. Live ownership recorded API PID 85483 and web PID 85587 in this worktree's respective app directories, plus the API's open descriptor for DB inode 80623929/UID 501. Run nonce: `452fe1dd-9b56-4f2a-a324-f913794a14f9`.

The initial harness invocation failed before database/browser creation because Playwright concatenates `webServer` arrays across `defineConfig(base, override)`. This genuine non-passing receipt is retained under `failed-startup/`. The single-object spread correction was committed, and config readback asserts exactly two owned server commands. No active server/fixture was replaced. No `.env` file was created or edited; only fictional, process-local API env was supplied. The unchanged root harness continues to provide networking, readiness URLs and Vite invocation.

A fresh **built-in browser** tab opened `http://127.0.0.1:5260/api/docs` first. CUA's fresh AX tree and screenshot showed Swagger/Pulse Fitness API and the owned schema URL. No native Codex UI was inspected. `builtin-browser-first.json` binds that observation to the current run nonce and HEAD. Only then did the Playwright test create its own fresh browser/page. The built-in tab was closed afterward.

`pnpm exec playwright test --config artifacts/issue-138-final/acceptance.config.mjs` **PASS: 1 test, 3.2s test execution, zero retries**. Total harness wall time 61.84s includes the explicit browser-first operator handoff. It is not a test timeout change. Proof includes:

- Real JWT/AgentToken calls through the Vite proxy; identical owned logging-context data; deterministic reads leave all food/log/meal/item rows unchanged.
- Exact raw and generated OpenAPI keys `aliasVersion`, `ambiguity`, `evidence`, `food`, `matchedVariant`, `reason`; no ranked numeric score. Separate shorthand score remains.
- Two prior dates with differing amount/macros retain both snapshots, occurrence count 2, distinct-day count 2 and `review_only` evidence; exact saved-match evidence takes precedence after an explicit current create.
- Two current calls yield `created` then `reused`, one definition and two links. Provenance, fiber/sugar, quantity-scaled macros, usage count 2 and max linked-item timestamp match SQLite. Embedded summaries contain no redundant summary hints/actions.
- Foreign owner sees no owned matches/promotions and gets 422 on a foreign link attempt, with no domain writes. A current food-definition calorie edit preserves every meal-item snapshot and all historical log/note rows.
- An induced usage trigger returns 500 with no success enrichment; all food/log/meal/item rows remain unchanged. FK check is empty; quick check is `ok`.
- Browser displays two 200-calorie current lunches and 400-calorie daily intake, despite the later 777-calorie definition edit. Screenshot and trace are under `browser-results/`.
- 34 browser API responses; no browser console warning/error, page errors, failed requests or HTTP failures. The intended 422 and 500 negative assertions use explicit API requests and are retained in the raw response receipt. Only Vite/React development info/debug messages appeared.

The Swagger server dropdown retains the existing default `http://localhost:3001` metadata. No Swagger execute action was used; all receipt traffic explicitly targeted the owned 5260 proxy/3160 API. This does not affect the verified response schemas.

Exact raw JSON is losslessly gzip archived (`browser-api-sqlite.json.gz`, `browser-openapi.json.gz`). `raw-archive-manifest.json` gives original SHA-256 and lengths. `browser-receipt-summary.json` is a readable derivative with the large OpenAPI body replaced by its archive reference. Decode raw evidence with `gzip -dc <file.json.gz>`.

Playwright stopped its own servers. `browser-teardown.json` verifies neither assigned port had a listener, the DB had no open handles, and only nonce/inode-verified fixture DB/WAL/SHM/owner-marker files were removed. No other server was stopped. Receipt tooling refuses occupied ports or existing fixtures; a future run must archive its prior output files first.

## Review and stop state

Consolidated internal Luna medium review and dispositions are in `review.md`. The one stale browser-handoff finding was fixed with a new run nonce. The executor-found Playwright config merge defect was fixed and its failure retained. No unresolved in-scope finding remains. No unsupported Fast claim or model UI gate.

No slot wait remains. The executor is stopped for **independent re-review** after the authorized push/draft-PR update. No merge, deploy, production/canonical data access, history repair or persisted environment change occurred.
