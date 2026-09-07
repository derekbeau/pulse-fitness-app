# Issue #139 implementation evidence

Implemented the frozen RIR-first history/provenance contract in the isolated lane. Native RIR stays exact (with `5+` a lower-bound bucket), legacy resistance RPE is visibly approximate, and disclosures expose the original raw fields. Missing effort remains missing. No API/domain schema, persistence, migration, progression calculation, or fingerprint code changed.

## Launch and authority

- Worktree: `/Users/meridian/Projects/pulse-rir-history`
- Branch: `fix/rir-history-provenance`
- Verified clean launch: `60b5ec69257e2768641764be2a424a3a02907fee`
- Approved base: `c1c95fc3ae498a205e78f2d7ece1d4d5211a1a83`
- Actual launcher metadata: `gpt-6-astra`, `xhigh`, task `01a07d96-65ff-7893-86cb-f78200bff101`; read from the running task's launch context, not inferred from a prompt label. Receipt: `logs/issue-139/launch-and-review.json`.
- The direct execution request authorized this prepared launch and granted lane 139 the full-gate/browser slot upfront. Full gates and browser use followed that grant.
- Read the frozen goal, repository instructions, live issue body, RIR spec, workout conventions, and accessibility primitives before implementation. The frozen goal file remains byte-identical to launch.

## Surface coverage and raw facts

| Surface                  | Central presentation path                                                                         | Evidence                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Completed session detail | `WorkoutExerciseSetList` → `formatEffort` / `EffortValue`; receipt summaries → `formatSetSummary` | Set-list, session-detail, formatter tests; Chrome completed screenshots                            |
| Compact history          | `formatCompactSets` → `formatEffort`; `SessionExerciseList` → `HistoryEffortDetails`              | Tracking and session-exercise-list tests; populated compact summaries                              |
| Exercise history         | `useExerciseHistory` retains raw `rir`/`rpe`; modal → compact formatter and disclosure            | Raw-adapter and modal tests; built-in repaired readback; Chrome history and scrolled screenshots   |
| Comparisons              | `SessionExerciseComparison` → structured `formatEffort` / `EffortValue`                           | Comparison tests; Chrome comparison screenshots                                                    |
| Last performance         | `LastPerformanceChip` → compact formatter and disclosure                                          | Chip tests; Chrome last-performance screenshots                                                    |
| Progression review       | Completed-performance cell → `formatEffort` / `EffortValue`                                       | Progression review tests; Chrome progression screenshots and before/after recommendation readbacks |

The formatter tests cover all three resistance tracking types; native `0`, `4`, `5`; every legacy integer RPE `1..10`; missing and mixed effort; inconsistent dual raw fields with RIR precedence; unsupported RPE values; and all six non-resistance tracking types. Derivation never enters a write or progression policy. Existing active picker, correction, whole-session RPE, and non-resistance tests remain passing.

The populated browser flow found and repaired an existing frontend history adapter that dropped both effort fields. The repair copies the two existing fields unchanged; it does not change the API contract. A regression test compares the exact native/legacy/missing raw set array after the adapter. The completed-detail addition uses an optional display slot; active-entry picker logic is unchanged.

## Focused checks

Run from the isolated worktree:

```sh
pnpm --filter @pulse/web exec vitest run --maxWorkers=1 \
  src/features/workouts/lib/effort.test.ts \
  src/features/workouts/lib/tracking.test.ts \
  src/features/workouts/components/effort-display.test.tsx \
  src/features/workouts/components/workout-exercise-card/workout-exercise-set-list.test.tsx \
  src/features/workouts/components/workout-exercise-card/last-performance-chip.test.tsx \
  src/features/workouts/components/exercise-detail-modal.test.tsx \
  src/features/workouts/components/session-comparison.test.tsx \
  src/features/workouts/components/workout-progression-review.test.tsx \
  src/features/workouts/components/session-exercise-list.test.tsx \
  src/features/workouts/components/session-detail.test.tsx \
  src/features/workouts/components/set-row.test.tsx \
  src/features/workouts/components/rir-picker.test.tsx
```

**217 tests / 12 files passed.** Literal command and result: `logs/issue-139/focused-01.log`.

After the browser-discovered adapter repair:

```sh
pnpm --filter @pulse/web exec vitest run --maxWorkers=1 \
  src/hooks/use-exercise-history.test.tsx \
  src/features/workouts/components/exercise-detail-modal.test.tsx \
  src/features/workouts/components/exercise-trend-chart.test.tsx
```

**34 tests / 3 files passed**, including one newly added raw-adapter regression. Receipt: `logs/issue-139/history-adapter-repair.log`.

## Complete gate and bounded repairs

The complete uncached repository gate was invoked once, serially. Failed and blocked portions were repaired/completed without duplicating the passing shared/repository suites. Original logs are retained.

| Command                                               | Result and receipt under `logs/issue-139/`                                                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint --force --concurrency=1`                   | API/shared passed; web found one unused fixture variable. Original `full-lint-01.log`; corrected web lint passed in `web-lint-repair.log`.                  |
| `pnpm typecheck --force --concurrency=1`              | All 3 packages passed; `full-typecheck-01.log`.                                                                                                             |
| `pnpm test --force --concurrency=1 -- --maxWorkers=1` | Repository scripts: 15 passed; shared: 680 passed. API was blocked by missing local SQLite native bindings, so Turbo did not reach web; `full-test-01.log`. |
| `pnpm build --force --concurrency=1`                  | All 3 packages passed; `full-build-01.log`.                                                                                                                 |
| `pnpm --filter @pulse/api test --maxWorkers=1`        | After local binding repair, 1,114 tests / 85 files passed; `api-test-repair.log`.                                                                           |
| `pnpm --filter @pulse/web test --maxWorkers=1`        | 1,334 tests / 186 files passed; `web-test-completion.log`.                                                                                                  |

The completed full-gate test inventory was **3,143 passing tests** (15 + 680 + 1,114 + 1,334). The later adapter repair was checked with the 34-test focused run above, including its one new test; the manual full suite was not repeated after that bounded repair. Git is configured for `.husky/_`, but that generated launcher directory is absent in this offline isolated install. The commit ran without a Husky override and did not execute additional hook checks; the explicit full/focused, lint, type, and build commands above are the verification evidence. The literal commit outcome is retained in `commit-01.log` and the final manifest.

Dependencies were installed only in this isolated checkout using `CI=true pnpm install --offline --frozen-lockfile --ignore-scripts`. SQLite bindings were built from installed sources and cached headers with `npm_config_build_from_source=true pnpm --recursive rebuild better-sqlite3 esbuild --config.ignore-scripts=false`. No dependency versions, lockfiles, environment files, or secrets changed.

Final web checks after the adapter repair passed:

```sh
pnpm --filter @pulse/web lint
pnpm --filter @pulse/web typecheck
pnpm --filter @pulse/web exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module ESNext --moduleResolution Bundler --esModuleInterop e2e/rir-history-fixture.ts e2e/rir-history.spec.ts
pnpm --filter @pulse/web build
pnpm --filter @pulse/web exec eslint e2e/rir-history.spec.ts e2e/rir-history-fixture.ts
```

Receipts: `final-web-lint.log`, `final-web-typecheck.log`, `final-browser-types.log`, `final-web-build.log`, `final-browser-lint.log`. Lint retains six pre-existing Fast Refresh warnings in untouched files; Vite retains its large-chunk warning. No new lint errors remain. Prettier and final diff checks cover only intended paths.

## Browser evidence

Built-in Codex browser was used **first**, against the disposable local fixture. It verified mobile legacy provenance, real keyboard discovery of native zero, and desktop progression detail. Screenshots and accessibility readbacks are under `logs/issue-139/builtin/`:

- `mobile-legacy.png` / `.txt`
- `keyboard-zero.png` / `.txt`
- `desktop-progression.png` / `.txt`
- `repaired-history.txt`: follow-up built-in readback after the adapter repair, showing native, derived, lower-bound, and missing raw facts together.

Installed Google Chrome **152.0.7977.77** then ran the populated end-to-end flow at **375 × 900 dark/touch** and **1280 × 900 light/keyboard**. API: `127.0.0.1:3139`; Vite: `127.0.0.1:5239`; isolated SQLite: `data/issue-139/browser-20260907.db`. Fixture users, exercises, sessions, and progression policy are fictional. API and Vite ran directly from this worktree without loading an environment file. No production/canonical database or server was used.

```sh
API_PORT=3139 E2E_PORT=5239 \
API_BASE_URL=http://127.0.0.1:3139 BASE_URL=http://127.0.0.1:5239 \
PLAYWRIGHT_CHANNEL=chrome \
pnpm --filter @pulse/web exec playwright test e2e/rir-history.spec.ts \
  --workers=1 --retries=0 --reporter=line \
  --output=../../logs/issue-139/chrome-results-05
```

**2 passed, zero skipped, 15.4 seconds.** Literal final receipt: `logs/issue-139/chrome-05.log`. The spec explicitly skips outside its dedicated API address, and its seeder independently rejects other targets, keeping ordinary E2E runs away from this fixture. It requires the dedicated disposable server pair before the command above.

The checks use actual touch activation and desktop Tab/Enter discovery, Escape closing with focus return, 44px minimum targets, viewport containment, no document overflow, and zero browser console warnings/errors. Screenshots capture settled animations. Long mixed-history disclosures are scrolled to verify that their missing-effort entry can be read. Native `0/4/5`, legacy `10/9/8/7/6/5/1`, and missing effort are populated across all three resistance tracking types. Duration remains `1,800 sec (RPE 3 / Zone 2)` and session RPE remains `7`.

Final screenshot families under `logs/issue-139/chrome/`, each prefixed `375-` or `1280-`:

- `completed-native-zero.png`, `completed-native-four.png`, `completed-native-bound.png`
- `completed-legacy.png`, `completed-legacy-bound.png`
- `last-performance.png`, `comparison.png`
- `exercise-history.png`, `exercise-history-scrolled.png`
- `progression.png`

`375-readback.json` and `1280-readback.json` retain before/after full session responses and recommendation payloads. Both verify exact equality of the raw session and complete recommendations, including evidence, source fingerprints, and states. Each records `errors: []` and Chrome version. Duration is 3,600 seconds in both final fixture sessions.

Earlier literal receipts remain available: `chrome-01.log` caught missing History-tab navigation; `chrome-02.log` caught the actual raw-adapter omission; `chrome-03.log` passed after repair; `chrome-04.log` passed with the extra scrolled screenshot. Their screenshot directories are preserved as `chrome-attempt-01` through `chrome-attempt-04`. The earlier built-in fixture predates a duration-fixture correction; duration evidence comes from the final Chrome fixture, not that earlier screenshot set. Browser fixture TypeScript/setup corrections are retained in `browser-types-01.log` and the passing follow-up logs. No API behavior was changed to accommodate fixtures.

Final formatting briefly hit host filesystem exhaustion (`ENOSPC`). Source files remained intact. Only the SQLite compiler intermediates generated in this lane were removed (the tested runtime binding and all evidence were retained); formatting then passed. The disposable API/Vite server processes were stopped after browser verification. A subsequent filesystem readback showed 13 GiB available. No other paths were cleaned.

## Review, scope, and handoff

GPT-5.6 Luna medium performed one consolidated read-only implementation review with no actionable consequential findings, followed by a narrow review of the browser-discovered adapter repair and its fixture/test. The follow-up also found no actionable consequential issues. The reviewer made no edits and did not duplicate the full suite or browser run. These are implementer checks plus internal review, not parent acceptance.

Final diff contains only workout presentation, focused tests/browser fixture, and documentation. The frozen goal, API/shared source, migrations, nutrition #133, active-entry behavior, correction persistence, production, Foundry, environment files, deployment, merge, and issue closure are untouched. Raw logs, screenshots, generated build output, and the disposable database remain ignored local artifacts.

The exact local implementation commit and evidence hashes are recorded after commit in `logs/issue-139/final-manifest.json` and reported in the task handoff. No push, merge, deployment, or issue closure is performed.
