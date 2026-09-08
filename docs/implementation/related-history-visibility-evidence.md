# Issue #154 implementation checkpoint

Status: **READY_FOR_FINAL_GATES**. This is implementation evidence, not independent acceptance.

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

All commands ran inside the worktree. No full lint/typecheck/test/build command or browser acceptance was run.

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

## Pending parent gates

The serialized heavy slot has not been granted. Full lint, typecheck, test, build, and browser acceptance remain pending. Repository pre-commit hooks invoke the reserved full typecheck/test gates; the local checkpoint commit bypasses those hooks only to honor the slot restriction. This does not count as passing those gates.

Browser coverage is prepared in:

- `apps/web/e2e/related-history-fixture.ts`
- `apps/web/e2e/related-history-visibility.spec.ts`
- `apps/web/playwright.related-history.config.ts`

After an explicit grant, use Codex's built-in browser first. Verify 375px and 1280px presentation, keyboard disclosure interaction, absence of empty layout, direct and related View all navigation, notes and native zero RIR, and console/network behavior. The synthetic fixture and browser config require API `http://127.0.0.1:3154`, frontend `http://127.0.0.1:5254`, proxy target `http://127.0.0.1:3154`, and the absolute disposable database path `<worktree>/data/issue-154/browser.db`. No services have been started and no browser fixture has been seeded at this checkpoint. Ensure the launched frontend uses the same proxy target before acceptance. The standard browser suite skips these opt-in tests outside this lane.

No browser evidence is claimed. Push and draft PR (`Fixes #154`) remain for substantive acceptance under the launcher; no independent acceptance is claimed. No unresolved product ambiguity was identified.
