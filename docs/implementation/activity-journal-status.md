# Activity / Journal release status

## Checkpoint

- Current checkpoint: #176 canonical foundation
- Branch: `feat/activity-journal-release`
- Product base: `a2525a61347f7b62c9014fc47d1518e38f34d3ef`
- Verified starting HEAD: `b86d2f3f99b8fd20da33b242eee6f899d3c67394`
- Checkpoint commit: the commit containing this status file; report its exact resolved SHA in the independent-review handoff
- Runtime claim: shared contract only; no new endpoint, database persistence, migration, UI, or deployment

## Requirements to executable evidence

| Requirement                                             | Executable evidence                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Actor versus subject ownership                          | `keeps the user subject distinct from the acting agent identity`                                                    |
| Cross-user/link rejection shape                         | `rejects a cross-user entity link and uses a non-disclosing rejection shape`                                        |
| Four provenance classes survive                         | `preserves all four provenance classes without collapsing their source`                                             |
| Planned Tuesday / actual Thursday and timezone boundary | `preserves planned Tuesday separately from actual Thursday across a timezone boundary`; disagreement rejection test |
| Duplicate retry versus changed-payload conflict         | `distinguishes a duplicate retry from a changed-payload idempotency conflict`; scope test                           |
| Immutable prior revision and visible stale conflict     | `retains immutable correction history and exposes a visible stale conflict`                                         |
| Recurrence preserves past assignment                    | `applies recurrence revisions prospectively while preserving past assignment identity`                              |
| Meaningful proposal cannot be implicitly approved       | `cannot represent a meaningful proposal as approved without explicit bound approval`                                |
| Approval binds exact proposal and target revisions      | `binds approval to both the exact proposal revision and target revision set`                                        |
| Unknown differs from negative                           | `keeps unknown distinct from an answered negative`                                                                  |
| Structured workout identity remains separate            | `keeps structured workout identity separate from activity identity`                                                 |
| Concern state policy is executable                      | `uses explicit conservative concern transitions`                                                                    |

Fixtures are fictional and live in `packages/shared/src/schemas/activity-journal-contracts.fixtures.ts`. The test file is `packages/shared/src/schemas/activity-journal-contracts.test.ts`; the runner config is `packages/shared/vitest.config.ts`.

## Command results

Evidence directory: `/Users/meridian/Projects/qa-reports/pulse-activity-journal-release/checkpoint-176`

| Evidence                                       | Command                                                                  | Result                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `01-shared-contract-focused-first-run.txt`     | `pnpm --filter @pulse/shared test -- activity-journal-contracts.test.ts` | Exit 1 before test execution: isolated worktree had no `node_modules`; `vitest` was not found. Preserved as environment/setup evidence. |
| dependency setup                               | `pnpm install --frozen-lockfile`                                         | Passed after network authorization; lockfile unchanged.                                                                                 |
| `02-shared-contract-focused-after-install.txt` | same shared test command                                                 | Exit 0: 59 files, 809 tests passed, including the initial 14 contract tests. The package script ran the complete shared suite.          |
| `03-shared-typecheck-first-run.txt`            | `pnpm --filter @pulse/shared typecheck`                                  | Exit 2: fixture freshness array inferred readonly; runtime schemas/tests were not the cause. Preserved.                                 |
| `04-shared-typecheck-repaired.txt`             | same shared typecheck                                                    | Exit 0 after narrowing the fixture annotation.                                                                                          |
| interim self-review rerun                      | shared test + typecheck + diff check                                     | Test import failed because a refined Zod schema was used as though it still exposed `.shape`; the later chained commands did not run.   |
| `05-shared-tests-final.txt`                    | shared test command                                                      | Exit 0: 59 files and 810 tests passed, including 15 final contract tests.                                                               |
| `06-shared-typecheck-final.txt`                | shared typecheck                                                         | Exit 0.                                                                                                                                 |
| `07-root-typecheck-final.txt`                  | `pnpm typecheck`                                                         | Exit 0, but API/web results were cache replays from another worktree, so this is not the final consumer receipt.                        |
| `07b-root-typecheck-forced.txt`                | `pnpm exec turbo run typecheck --force`                                  | Exit 0: API, shared, and web all ran in this worktree; 0 cached.                                                                        |
| `08-root-lint-forced.txt`                      | `pnpm exec turbo run lint --force`                                       | Exit 0: 0 cached; seven pre-existing web warnings and no errors.                                                                        |
| `09-root-build-forced.txt`                     | `pnpm exec turbo run build --force`                                      | Exit 0: API, shared, and web built; 0 cached. Vite retained its existing large-chunk warning.                                           |

`git diff --check` also passed after formatting. The forced commands are used as final affected-consumer evidence because the public `@pulse/shared` export changed.

## Deferred runtime owners and real gaps

- #177: additive Activity persistence, migrations, goals, assignment/execution lifecycle, recurrence materialization, rescheduling/corrections, owned links, idempotency receipts, and Activity APIs.
- #178: concern/capability/guidance persistence, flare transaction, lifecycle enforcement, meaningful proposal/approval execution, stale-target checks, and safe planning mutations.
- #179: canonical daily-context aggregation, deduplicated question claims, answer revisions/current projection, atomic concurrency behavior, and cross-thread API.
- #180: Journal persistence/routes, immutable correction history, source links, and fact-traced weekly reflection.
- #181: session-specific context derivation and replacement of preview cards with source/freshness/missing-data UI.
- #182: shared Calendar read model, cross-domain deduplication/filtering, navigation, and Workouts as a filtered view.
- #183: remaining UI, agent guide/examples, populated persistence/auth/concurrency/browser gates, migration rehearsals, and integrated acceptance.

Open runtime gaps are intentionally not hidden behind placeholder routes: there is no Activity or Journal route registration today; legacy tables cannot satisfy the new contract; current Activity/Journal/Session Context surfaces remain mock/preview-driven; canonical daily check-in, concern/guidance stores, proposal approval, session-context read, and shared Calendar read do not exist yet.

## Evidence boundary

The current green evidence establishes shared Zod/type and pure-policy behavior only. It is not deployed persistence, endpoint verification, concurrency proof, migration proof, or UI acceptance. No production data, secrets, migration, PR, merge, issue closure, or deployment is part of checkpoint #176.
