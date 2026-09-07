# Food usage integrity verification

Implementation verification is complete. The final Git commit/remote/clean-status
receipt is written after the commit to `/tmp/food-integrity-evidence/final-git-receipt.json`
and reported with the draft PR. This avoids embedding a commit's own hash inside
itself. `source-manifest.json` binds every changed/new source and test file to the
exact bytes used for the final matrix; the post-commit receipt verifies the same
hashes again. Raw compressed logs preserve literal output byte-for-byte and are
indexed by SHA-256 in `log-manifest.json`.

## Exact launch context

- Worktree: `/Users/meridian/Projects/pulse-food-usage-integrity`
- Branch: `fix/food-usage-integrity`
- Starting HEAD: `ef27ad8336e1da5dd82a32a428125341612eeeee`
- Verified base: `b64e8191ba4dc0415e05eedbbb8050fc56ebbc9e`
- Start status: clean. Starting commit was docs-only.
- Issue 143 read with `gh issue view 143 --json title,body,comments`; no comments.
- Original worktree was read-only; verified on `main` with no tracked changes and
  its pre-existing untracked artifacts present.
- The frozen goal contract was amended only for Derek's explicit Trash decision.

## Final uncached gates

Each final command used a new empty task-owned cache directory with read-only
cache access and no remote cache. No task reused a cached result or wrote a cache
archive. Literal commands:

```sh
pnpm lint --cache=local:r --cache-dir=/tmp/food-integrity-final-cache-q8p1ywp0
pnpm typecheck --cache=local:r --cache-dir=/tmp/food-integrity-final-cache-q8p1ywp0
pnpm test --cache=local:r --cache-dir=/tmp/food-integrity-final-cache-q8p1ywp0 -- --maxWorkers=1
pnpm build --cache=local:r --cache-dir=/tmp/food-integrity-final-cache-q8p1ywp0
```

All four exited 0. Lint: zero errors, six existing warnings in unchanged web files.
Build: successful, with Vite's large-chunk advisory. Literal test result lines:

```text
ℹ tests 15
ℹ pass 15
ℹ fail 0
@pulse/shared:test:  Test Files  47 passed (47)
@pulse/shared:test:       Tests  680 passed (680)
@pulse/api:test:  Test Files  85 passed (85)
@pulse/api:test:       Tests  1114 passed (1114)
@pulse/web:test:  Test Files  184 passed (184)
@pulse/web:test:       Tests  1263 passed (1263)
Cached:    0 cached, 6 total
EXIT_CODE: 0
```

Total: 3,057 package tests plus 15 repository-script tests, all passing.
Formatting check: `All matched files use Prettier code style!`.
`git diff --check`: exit 0, no output. Source hashes were unchanged through gates.

## Requirements to evidence

| Contract acceptance                                               | Evidence                                                                                                                                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Required reads and complete writer inventory before edits      | plan.md; behavior.md; exact launch context above                                                                                                                                        |
| 2. Both create routes, one/repeated links, no duplicate increment | nutrition/store.food-usage.test.ts authenticated preferred/date tests; final API suite                                                                                                  |
| 3. Append, metadata, corrections, delete, merge, trash/restore    | real SQLite lifecycle suite, including JWT and AgentToken route tests; completeness-mutations.integration.test.ts                                                                       |
| 4. Rollback and no partial usage                                  | injected usage failures for create/append/correction/delete/merge/restore; partial-purge rollback; second-target reconcile failure; invalid projected response rollback                 |
| 5. Concurrent/retry-shaped calls                                  | eight simultaneous creates/appends, repeated identical corrections/deletes; independent COUNT/MAX readbacks                                                                             |
| 6. Auth, owner scope and malformed/foreign inputs                 | real signed session JWT/AgentToken tests; foreign food/meal, missing users, bad claims, invalid modes/limits/query selectors; JWT-only repair                                           |
| 7. Bounded dry-run/apply/idempotency                              | 22 reconciliation tests, including serialized DB byte equality; limit overflow rejects before writes; unchanged apply writes zero                                                       |
| 8. Hostile fixtures and Trash decision                            | stale/negative/fractional counters, wrong timestamps, duplicate/null links, foreign links, Trash edits/deletes/repair/restore, merge and purge; static reimport preserves trashed links |
| 9. Full final uncached matrix                                     | complete-1 through complete-4 raw logs; literal commands and totals above                                                                                                               |
| 10. Installed Chrome/API/DB readbacks                             | chrome-readback.md; readback.json; isolated script; COUNT/MAX equality, quick_check=ok, empty FK violations, byte-identical dry-run                                                     |
| 11. Consolidated Luna-medium review and repairs                   | review.md: R1 intentional bounded-scope limit disclosed; R2 repaired static Trash mappings; primary R3 serialization-atomicity repair                                                   |
| 12. Diff/commit/clean tree, push, draft PR                        | source-manifest.json plus external final-git-receipt.json and final report after commit/push/PR                                                                                         |

Test paths above are under `apps/api/src/routes/` except reconciliation under
`apps/api/src/__tests__/` and static import under `apps/api/src/scripts/`.

## Iteration receipts and limitations

Initial focused tests passed 37 tests. Subsequent full checks exposed obsolete
counter mocks, optional-body OpenAPI shape, and lint issues; all repaired and covered
by passing final gates. The primary negative-counter probe reproduced HTTP 500 after
a repair write; the response is now validated before commit and its regressions pass.
One otherwise progressing full run hit `No space left on device`; its raw failure log
is retained. Available host space recovered without deleting unrelated files. Final
runs avoided cache writes and passed.

Reconciliation intentionally rejects owner scopes over 500 foods without writes.
There is no cursor, partial-page success, or unbounded/all-user fallback. This explicit
limit is described in behavior.md and was the documented disposition of Luna R1.

The final Chrome fixture listener was stopped. Graceful shutdown stalled on an open
connection, so the verified task-owned process was terminated and its disposable
directory removed after retaining the report. No fixture database remains in source.

No merge, deployment, production DB access, production reconciliation/backfill,
canonical data mutation, outreach, terms acceptance, or spend occurred. Draft branch
push/PR only is authorized. No remaining implementation blocker is known.
