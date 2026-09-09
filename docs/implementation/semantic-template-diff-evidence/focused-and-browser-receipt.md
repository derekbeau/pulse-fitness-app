# Pulse #152 focused and browser receipt

## Starting state

- Requested branch: `branchfix/semantic-template-diff`
- Starting HEAD: `35deea4a84f9954198dd31a954f87e4b00860af7`
- Required base / merge base: `6672b57599f2da4e3794ed02dc79879b7c27332a`
- Starting `git status --porcelain`: empty
- Dependencies: restored from the local pnpm cache with `pnpm install --frozen-lockfile --offline` (exit 0); no network download.

## Focused regressions

The final focused run after the Luna repairs used:

```text
pnpm --filter @pulse/shared exec vitest run src/schemas/scheduled-workouts.test.ts
EXIT_CODE=0
Test Files 1 passed (1)
Tests 24 passed (24)

pnpm --filter @pulse/api exec vitest run src/routes/scheduled-workouts/snapshot-store.test.ts src/routes/scheduled-workouts/store.test.ts src/routes/scheduled-workouts/index.test.ts
EXIT_CODE=0
Test Files 3 passed (3)
Tests 64 passed (64)

pnpm --filter @pulse/web exec vitest run src/features/workouts/components/scheduled-workout-detail.test.tsx src/features/workouts/components/scheduled-start-surfaces.test.tsx
EXIT_CODE=0
Test Files 2 passed (2)
Tests 29 passed (29)
```

The scheduled-start surface suite retains list/calendar schedule identity, stale 409, and explicit force-retry coverage. The detail suite retains the other scheduled-start route, including visible stale recovery and explicit force retry.

The commit hook then identified lint-only issues in the inspector and two focused tests (exit 1, no commit created). After those repairs, only the invalidated suites were rerun: API snapshot store 6/6 and web scheduled detail 15/15, both exit 0. Focused ESLint over every changed TypeScript file also exited 0.

One repair-only API run first exited 1 because the malformed legacy fixture was rejected by the current SQLite check constraint. The fixture was corrected to bypass the check only around its direct legacy-row seed, following the existing test pattern; the unchanged product repair then passed. A sandboxed Vitest launch separately exited 1 because Vite could not write its local temporary cache; the same command was rerun with worktree write permission and passed.

## Synthetic browser acceptance

The original run was retained only as narrative and screenshots and is not used for console/network acceptance.

The evidence repair reran only `apps/web/e2e/semantic-template-diff.spec.ts` on exact reviewed candidate `81f36a69997d15e8b4aed89059b98ae3d2dcd502`. The authentic JSON reporter output, decoded reporter attachments, stderr, exit status, screenshots, tested SHA, command/environment binding, and hashes are retained under `browser-reviewed-head/`. See `browser-reviewed-head/run-binding.md` for the inventory. The isolated run passed 3/3 with empty mobile/desktop console-error and failed-request arrays and the expected bounded 500 responses.
