# Pulse #152 final uncached gate binding

## Honest commit relationship

- Full-gate tested sibling: `873de43323d43a61200dce5bc717488b802c451b`
- Independently reviewed candidate: `81f36a69997d15e8b4aed89059b98ae3d2dcd502`
- Common parent: `35deea4a84f9954198dd31a954f87e4b00860af7`
- Required base and merge base: `6672b57599f2da4e3794ed02dc79879b7c27332a`
- `873de43…` is **not** an ancestor of `81f36a6…`; the recorded ancestry command exits 1.

The full gate ran against sibling commit `873de43…`, not an ancestor of the reviewed candidate. The commits are sibling snapshots created from the same parent. The raw comparison in `sibling-equivalence-raw.txt` records `NON_EVIDENCE_TREE_DIFF_EXIT=0`; its complete name-status output shows that the only files added on `81f36a6…` are the retained gate evidence and `.gitattributes`. Therefore all source, tests, package manifests, lockfiles, compiler/linter/test/build configuration, and other non-evidence inputs are byte-identical between the tested sibling and reviewed candidate. This is an equivalence binding, not an ancestry claim.

## Reused full gate

- Cache control: `TURBO_FORCE=true`; every Turbo task reported `Cached: 0 cached`.
- Source/test binding: `source-test-sha256.txt` (11/11 files verified on the reviewed candidate).
- Full evidence binding: `reviewed-candidate-evidence.sha256`.

| Command          | Exit | Result                                                                                      |
| ---------------- | ---: | ------------------------------------------------------------------------------------------- |
| `pnpm test`      |    0 | shared 728, API 1241, web 1418 tests passed                                                 |
| `pnpm typecheck` |    0 | 3/3 package tasks passed                                                                    |
| `pnpm lint`      |    0 | 3/3 package tasks passed; 6 pre-existing Fast Refresh warnings in unchanged files, 0 errors |
| `pnpm build`     |    0 | 3/3 package tasks passed; existing Vite chunk-size advisory only                            |

The genuine raw logs remain unchanged as `final-test.log`, `final-typecheck.log`, `final-lint.log`, and `final-build.log`. Their SHA-256 values are included in `reviewed-candidate-evidence.sha256`.

The browser acceptance was rerun separately on exact reviewed candidate `81f36a6…`; see `browser-reviewed-head/run-binding.md` and its raw reporter/readback artifacts.
