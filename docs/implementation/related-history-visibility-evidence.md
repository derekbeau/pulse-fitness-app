# Issue #154 implementation and acceptance evidence

Status: **Ready for independent acceptance**. Implementation and executor gates passed; no independent acceptance, merge, or deployment is claimed.

## Identity and boundaries

- Worktree: `/Users/meridian/Projects/pulse-related-history-visibility`
- Branch: `fix/related-history-visibility`
- Verified clean starting HEAD: `ae9ce0de93127a2fa270fc12b18902f24d5ed3a8`
- Frozen contract: `docs/implementation/related-history-visibility-goal.md` (unchanged)
- No production access, environment configuration changes, migrations, backfills, historical-data changes, relationship changes outside fictional test setup, merge, or deployment.
- Dependencies installed from the local locked pnpm cache; the locked SQLite native test binding was installed inside this worktree. API tests use their own temporary SQLite database.

## Implemented behavior

A shared tracking-aware completed/non-skipped-set predicate is used by the related-history API selection and frontend selector. Reps, time, or distance establish performance according to the compact preview's tracking semantics; zero remains a recorded value. Load or effort alone does not establish performance. Existing legacy reps-as-time/distance preview support remains, including reps-only previews for `reps_seconds` when seconds are absent.

The API scans complete, scoped candidates in descending session order before selecting each related exercise's latest qualifying session. Newer empty, unstarted, skipped, effort-only, wrong-metric, in-progress, or deleted candidates cannot conceal an older valid performance. Related definitions retain authored order and existing ownership/soft-delete restrictions. Direct history continues through its existing selector.

The frontend filters both rows and sets before rendering the related disclosure. No qualifying rows means no related badge, heading, container, placeholder, or View all control. Valid rows keep their compact previews, native/legacy effort presentation, notes, and direct related-exercise history navigation. Optional related history notes are now carried through the response schema and hook. Null/missing/malformed/truncated related payloads and HTTP/transport failures remain query failures; the direct-history compatibility behavior is unchanged.

## Focused verification

The initial checkpoint completed the following focused checks inside the worktree. Final full gates and browser checks are recorded below.

| Check                                                                                                            | Result                    |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Shared predicate: `pnpm --filter @pulse/shared exec vitest run src/utils/related-history.test.ts --maxWorkers=1` | 25 passed                 |
| Exercise schemas: `pnpm --filter @pulse/shared exec vitest run src/schemas/exercises.test.ts --maxWorkers=1`     | 24 passed                 |
| Exercise API: `pnpm --filter @pulse/api exec vitest run src/routes/exercises/index.test.ts --maxWorkers=1`       | 49 passed                 |
| Focused frontend command below                                                                                   | 197 passed across 7 files |
| ESLint on changed TypeScript files only                                                                          | Passed                    |
| `git diff --check`                                                                                               | Passed                    |

Total: **295 passing focused tests**. The API cases compare sets, sessions, and exercise definitions before/after GET requests and verify both JWT and AgentToken responses. Native RIR picker and effort/provenance tests are included to cover adjacent #139/#155 behavior.

```sh
pnpm --filter @pulse/web exec vitest run \
  src/hooks/use-last-performance.test.tsx \
  src/features/workouts/lib/related-history.test.ts \
  src/features/workouts/components/session-exercise-list.test.tsx \
  src/features/workouts/lib/effort.test.ts \
  src/features/workouts/lib/tracking.test.ts \
  src/features/workouts/components/rir-picker.test.tsx \
  src/features/workouts/components/effort-display.test.tsx \
  --maxWorkers=1
```

Early attempts were non-passing: the new tests needed to await query notifications, distinguish the unrelated session-notes disclosure, use expiring synthetic JWTs, and respect SQLite ownership/RPE constraints. The first API attempt could not start until the local native SQLite binding was installed. These were corrected; the final results above supersede those attempts.

## Internal review

Luna medium completed a consolidated read-only review. No implementation findings remained. Its browser-setup review identified a missing Vite proxy-target guard; the dedicated config now requires `VITE_API_PROXY_TARGET` to equal the isolated API URL. Model/effort/Fast UI proof remains user-owned. No native Codex UI was inspected.

## Final gates

The planner explicitly removed the serialized-slot restriction and authorized final gates, isolated browser acceptance, push, and draft PR creation. Actual capacity was checked before heavy work: 10 CPU cores, 16 GiB RAM, 39 GiB disk available; a later pre-browser sample showed 73.58% CPU idle and 65% memory available. No concrete resource conflict was found. Suites ran serially where appropriate.

| Gate | Genuine result | Receipt |
| --- | --- | --- |
| `pnpm lint --force` | Passed; 6 existing React Refresh warnings in unchanged files | [lint-2](issue-154-evidence/lint-2.json) |
| `pnpm typecheck --force` | Passed across all 3 packages | [typecheck-3](issue-154-evidence/typecheck-3.json) |
| `pnpm test --concurrency=1 --force -- --maxWorkers=1` | 15 repository-script tests plus 3,268 Vitest tests passed: shared 707, API 1,149, web 1,412 | [test-1](issue-154-evidence/test-1.json) |
| `pnpm build --force` | Passed all 3 packages; Vite reports its advisory for a chunk over 500 kB | [build-1](issue-154-evidence/build-1.json) |
| Dedicated Playwright config, 1 worker, no retries | 3 passed: 375px, 1280px, loading/503 recovery | [browser-3](issue-154-evidence/browser-3.json) |

All Turbo tasks were executed with cache bypass. Gate metadata includes timestamps, raw-log hashes, implementation HEAD, and the tracked patch hash. [Raw receipts](issue-154-evidence/README.md) include failed attempts rather than replacing them with passing output.

The first full typecheck caught an unsupported React Testing Library `exact` query option. It was replaced with an anchored accessible-name regex, preserving the assertion. The full suite then passed. A browser evidence writer subsequently failed because its callback omitted `testInfo`; the callback was corrected without weakening assertions. Screenshot capture now waits for closed dialogs and disables animations. The final browser run passed with clean screenshots. Earlier screenshots and the failed attempt remain under `artifacts/issue-154/`.

The implementation checkpoint is `27afa252b7a7739bd0cfbf1e0b9b74503f2de08a`. [Source receipt](issue-154-evidence/source-receipt.json) and the archived patch bind final source files to the gate runs. All application, Vitest, and repository-script inputs exactly match the passing full test run; subsequent edits affected only the dedicated Playwright fixture/harness and evidence. Final lint/typecheck/build/browser receipts cover that harness revision. Commit hooks need not duplicate the full gates already executed and retained here.

## Browser acceptance

Codex's built-in browser was used first in an owned tab, with a synthetic fixture on the original isolated 3154/5254 services. Manual checks covered 375px and 1280px, Enter/Space disclosure interaction, absent related UI for empty data, valid-row previews, notes and native zero RIR details, direct/related View all navigation, no horizontal overflow, and an empty warning/error console. API readback showed all three fixture sessions unchanged; SQLite quick-check passed with no foreign-key violations.

After the networking handoff arrived, the active Playwright attempt was allowed to finish. The next run sourced `/Users/meridian/Projects/qa-reports/pulse-parallel-networking/pulse154-acceptance-env.sh`. It used API **3155**, web **5255**, and `/Users/meridian/Projects/qa-reports/pulse-parallel-networking/fixtures/pulse154/pulse-e2e.db`. Before startup, both assigned ports were free and the dedicated database was absent. After startup, actual listener PIDs and working directories matched this worktree, and the API was the sole owner of the regular, non-symlink database. No other task's services or fixtures were inspected, reset, or stopped.

Final Chromium **151.0.7922.34** browser evidence:

- [375px assertions](../../artifacts/issue-154/browser-3/related-history-visibility-c38bb-n-and-never-mutates-history/acceptance.json): no console/network errors, scroll width 375, three sessions unchanged.
- [1280px assertions](../../artifacts/issue-154/browser-3/related-history-visibility-7069f-n-and-never-mutates-history/acceptance.json): no console/network errors, scroll width 1280, three sessions unchanged.
- [Retry assertions](../../artifacts/issue-154/browser-3/related-history-visibility-2dda4-rom-an-empty-related-result/retry.json): one injected 503, exactly two attempts, recovery with valid related history and direct History visible during loading.
- [Mobile mixed rows](../../artifacts/issue-154/browser-3/related-history-visibility-c38bb-n-and-never-mutates-history/mixed-related.png) and [desktop mixed rows](../../artifacts/issue-154/browser-3/related-history-visibility-7069f-n-and-never-mutates-history/mixed-related.png), visually inspected after dialog animations completed.
- [Mobile empty related history](../../artifacts/issue-154/browser-3/related-history-visibility-c38bb-n-and-never-mutates-history/empty-8b4beead-c2de-41e9-9f1b-6d5598adc9b2.png). The existing form-cue container is independent of related history; no related disclosure or placeholder occupies space.

The built-in tab was closed, and only the four verified issue-154 server processes were stopped after acceptance. Both synthetic fixture databases are preserved. No native Codex UI was inspected. User-owned model/Fast UI proof was not treated as an executor gate.

## Handoff

The final candidate is intended for a draft PR with `Fixes #154`. Implementation, full gates, and browser verification are complete for executor handoff. Independent acceptance remains with the parent/user. No unresolved product ambiguity was identified. Production, protected instructions, the frozen contract, and migration files remain unchanged; no merge or deployment was performed.
