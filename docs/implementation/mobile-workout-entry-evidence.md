# Mobile workout entry: implementation evidence

## Candidate identity

- Branch: `fix/mobile-workout-entry`
- Verified implementation commit: `1a25e2218fc23e9060731e436f495780c04a1c8f`
- Required starting HEAD: `5fd837469506abfb2bd85313f143074430f433cf`
- Approved implementation baseline: `09b0339ea9f8e5cdd8ab2eda32c409717170b12e`
- Repository: `/Users/meridian/Projects/pulse-mobile-workout-entry`

This document is committed separately so it can name the exact verified implementation commit without attempting a self-referential SHA. The final PR HEAD is the later evidence-only commit and is reported externally. The post-commit handoff verifies that the code, test, browser harness, and screenshot trees are unchanged from the verified implementation commit.

## Files changed

- `apps/web/src/features/workouts/components/set-row.tsx`
- `apps/web/src/features/workouts/components/set-row.test.tsx`
- `apps/web/src/features/workouts/components/rir-picker.tsx`
- `apps/web/src/features/workouts/components/rir-picker.test.tsx`
- `apps/web/src/features/workouts/components/session-detail.test.tsx`
- `apps/web/src/pages/active-workout.tsx`
- `apps/web/e2e/rir-logging.spec.ts`
- `artifacts/issues-140-142/*.png` (21 installed-Chrome screenshots)
- This evidence document (evidence-only follow-up)

## Requirements-to-evidence map

### #140 — readable populated mobile workout entry

- `SetRow` now gives metrics a dedicated full-width row below the set label/RIR at narrow and tablet widths, retaining a compact three-column arrangement only at `lg`.
- Inputs are 44 px tall, use external visible unit labels connected through `aria-describedby`, and no longer sacrifice content width to an absolutely positioned suffix. Target hints wrap instead of competing with inputs.
- Component coverage renders all nine existing tracking types with realistic populated values, including `157.5`, `155.5`, `225`, `12`, `3600`, `45`, and `5.4`.
- Installed-Chrome coverage exercises populated, empty, focused, completed, target-hint, clear/edit, blur-save, debounce, error, reload, and resume states at 320, 390, 430, 768, and 1280 px in light, dark, and midnight themes.
- Browser geometry subtracts computed padding, borders, and an 18 px native number-control allowance from every input. The asserted usable width is at least `max(24 px, measured rendered value width + 4 px)`. Units are asserted outside the input, controls are at least 44 px, and document horizontal overflow is rejected.
- A discovered distance/cardio reload defect was fixed in `createSessionSetDrafts`: persisted distance is now retained when rebuilding active-session drafts.

### #142 — scoped immediate RIR digit selection

- The radiogroup-local handler accepts unmodified `event.key` digits `0` through `5`, calls the existing `choose()` path once, closes, and relies on the existing popover focus restoration.
- Shift, Control, Alt, Meta, AltGraph, repeat, and composing events are ignored. There is no document/window listener, and outside weight/reps inputs remain ordinary inputs.
- Component tests cover every digit, `5+`, keypad-style `key: '5'/code: 'Numpad5'`, ignored events, existing arrow/Home/End/Enter/Space/Escape/click/Clear behavior, selected state, and trigger focus restoration.
- Installed Chrome verifies active-session exactly-once mutation, RIR/RPE atomicity and rollback, unchanged completion/next-set state, persistence after reload, no copy/auto-advance, and ordinary `155`/`12` entry outside the picker.
- Completed-session coverage verifies digit selection remains draft-only until explicit Save, injected Save failure keeps the draft recoverable, retry succeeds, RPE is cleared atomically, session status/timestamps do not change, and JWT/AgentToken history agrees.

## Verification commands and literal results

### Focused checks during implementation

```text
pnpm --filter web exec vitest run src/features/workouts/components/set-row.test.tsx src/features/workouts/components/rir-picker.test.tsx
PASS — 2 files, 40 tests

pnpm --filter web exec vitest run src/features/workouts/components/set-row.test.tsx src/features/workouts/components/rir-picker.test.tsx src/features/workouts/components/session-detail.test.tsx
PASS — 3 files, 62 tests

pnpm --filter web exec vitest run src/features/workouts/components/set-row.test.tsx src/features/workouts/components/rir-picker.test.tsx src/features/workouts/components/session-detail.test.tsx src/hooks/use-session-sets.test.tsx src/pages/active-workout.test.tsx
PASS — 5 files, 103 tests

pnpm --filter api exec vitest run src/routes/foods/analytics-store.integration.test.ts --maxWorkers=1
PASS — 1 file, 11 tests, 2.06 s
```

The focused API run reproduced an unrelated full-gate timing assertion without cross-package load. It passed. The preceding concurrent uncached gate had failed only `keeps bounded presets insensitive to 100,000 old linked occurrences`: measured 1.2525 ms versus a 1.1490 ms threshold, with 84 API files / 1,041 tests otherwise reporting 83 files and 1,040 tests passed. No product code was changed for that timing-only miss.

### Final uncached repository gate

```text
TURBO_FORCE=true TURBO_CONCURRENCY=1 pnpm lint && TURBO_FORCE=true TURBO_CONCURRENCY=1 pnpm typecheck && TURBO_FORCE=true TURBO_CONCURRENCY=1 pnpm test && TURBO_FORCE=true TURBO_CONCURRENCY=1 pnpm build
```

Result: PASS, exit 0. `TURBO_FORCE=true` bypassed all Turbo caches; every final task reported `Cached: 0 cached`. `TURBO_CONCURRENCY=1` prevented the unrelated millisecond benchmark from competing with the web suite.

- Lint: 3/3 package tasks passed in 20.003 s; 0 errors and 6 existing Fast Refresh warnings.
- Typecheck: 3/3 package tasks passed in 15.943 s.
- Repository script tests: 15/15 tests, 4/4 suites, 0 failures.
- Shared: 46/46 files, 652/652 tests passed.
- API: 84/84 files, 1,041/1,041 tests passed.
- Web: 182/182 files, 1,237/1,237 tests passed.
- Test Turbo run: 6/6 tasks passed, 0 cached, in 1m18.692s.
- Build: 3/3 package tasks passed, 0 cached, in 15.9 s. Vite transformed 3,907 modules and emitted the repository's existing greater-than-500-kB chunk advisory.

The pre-commit hook subsequently ran formatting, cached typecheck, and cached tests. Comparing its saved pre-hook tree object `7d9e649` to the implementation commit showed no source/test/harness diff; `git show --format= --check 1a25e2218fc23e9060731e436f495780c04a1c8f` also passed.

## Installed-Chrome acceptance

- Browser: Google Chrome `152.0.7977.77`
- Playwright project: `chromium`, installed channel override: `chrome`
- API/Web ports: `33141` / `54142`
- Fixture database: `/tmp/pulse-mobile-workout-entry-e2e-accepted.db`
- Authentication and data: unique disposable seeded user, JWT, and AgentToken; no production credentials or production/canonical data.
- Port preflight: `lsof -nP -iTCP:33141 -sTCP:LISTEN -iTCP:54142` returned no listeners before the run.
- Cleanup: the harness removed the disposable database. The same `lsof` check returned no listeners after the run, and no matching temp database files remained.

```text
CI=1 API_PORT=33141 E2E_PORT=54142 API_BASE_URL=http://127.0.0.1:33141 BASE_URL=http://127.0.0.1:54142 E2E_DATABASE_URL=/tmp/pulse-mobile-workout-entry-e2e-accepted.db PLAYWRIGHT_CHANNEL=chrome pnpm --filter web exec playwright test e2e/rir-logging.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line
PASS — 3/3 tests in 45.2 s
```

The populated layout matrix is 320/390/430/768/1280 px × light/dark/midnight (15 cases), plus a 320×568 keyboard-height emulation and a 430 px midnight edited/reloaded state. All nine tracking types are present in each representative matrix. The two interaction scenarios cover the active and completed-session RIR behavior described above. Injected 503 responses were the only accepted browser console/network failures.

## Screenshot evidence

- `artifacts/issues-140-142/mobile-entry-{320,390,430,768,1280}-{light,dark,midnight}.png` — 15 populated viewport/theme cases with all tracking types, multi-digit/decimal values, units, targets, empty and completed rows.
- `artifacts/issues-140-142/mobile-entry-320-midnight-keyboard-height-emulation.png` — narrow reduced-height viewport remains vertically usable; this is emulation, not physical-device proof.
- `artifacts/issues-140-142/mobile-entry-edited-resume-430-midnight.png` — edited values for every non-bench tracking layout remain populated after reload/resume.
- `artifacts/issues-140-142/rir-active-unset-320-light.png` — active unset RIR state at the narrowest width.
- `artifacts/issues-140-142/rir-active-5-plus-430-midnight.png` — stored bucket 5 displays as `5+ RIR` after keyboard selection.
- `artifacts/issues-140-142/rir-correction-picker-430-midnight.png` — completed-session correction picker and explicit Save boundary.
- `artifacts/issues-140-142/rir-history-1280-light.png` — exact corrected history in the desktop receipt.

Representative final artifacts were visually inspected at 320 light/midnight, 390 dark, 430 midnight, 768 light, 1280 dark, and the completed correction state. Values, units, targets, focus treatment, completion styling, and RIR controls remained legible without overlap.

## Luna medium adversarial reviews

### UI geometry/accessibility — Bacon

- Finding: no concrete UI geometry or accessibility defect after reviewing populated stacking, 44 px controls, external units and accessible descriptions, desktop behavior, inner-width assertions, overflow, focus, and themes.
- Limitation: no physical mobile-device run was available. The keyboard-height case is explicitly emulated.
- Disposition: accepted; no repair required.

### Keyboard/data invariants — Heisenberg

- Finding: no in-scope defect in picker scope, digit/keypad behavior, modifiers/repeat/composition rejection, exactly-once selection, focus restoration, atomic RIR/RPE handling, rollback, completion/rest behavior, or completed correction Save boundary.
- Advisory: the pre-existing shared query-cache updater in `use-session-sets.ts` omits optimistic `seconds` and `distance` fields.
- Disposition: no architecture change. The contract explicitly excludes changing optimistic mutation architecture; active-session local drafts update immediately and the server/refetch remains authoritative. Browser reload/resume coverage verifies the required persisted fields.

### Correction/persistence — Beauvoir

- Finding: the first browser draft did not edit/reload every metric layout.
- Repair: added UI edits and post-reload assertions for bodyweight/reps-only, reps-seconds, weight-seconds, duration seconds/RPE/zone, distance, and cardio distance/seconds.
- Finding: completion/status/timestamp invariants were not explicit enough.
- Repair: added active completed-set preservation and completed-session status/startedAt/completedAt snapshots before and after correction.
- Finding: a failed completed-session Save was not retried with the retained draft.
- Repair: retained the failed draft, retried it successfully, verified closure/persistence, then performed a separate fresh correction.

### Test/evidence/repository hygiene — Bacon

- Finding: this required evidence document was not yet present.
- Repair: created this evidence-only record after the verified implementation commit.
- Finding: browser isolation depended on the executor command because Playwright's default database is shared.
- Repair: final acceptance explicitly used the fresh `/tmp/pulse-mobile-workout-entry-e2e-accepted.db`, dedicated free ports, unique fixture identity, post-run database cleanup, and listener checks.
- Finding: final clean committed state remained pending at review time.
- Disposition: implementation commit was created from the intended staged paths only; clean status was verified before this evidence-only change, and final status is reported after the evidence commit.

## Limitations and prohibited actions

- No physical mobile device was available; responsive and keyboard-height evidence comes from installed desktop Chrome emulation and browser geometry.
- Numeric keypad behavior is tested using a real Chrome `KeyboardEvent` with `key: '5'` and `code: 'Numpad5'`; Playwright's platform key helper did not itself emit the required resulting digit key.
- No production environment, credential, database, service, or data was accessed. No deployment, merge, ready-for-review transition, manual issue closure, purchase, external contact, or terms acceptance occurred.
- The original `/Users/meridian/Projects/pulse-fitness-app` worktree was not edited.

## Repository status checkpoint

Immediately after the verified implementation commit and before creating this evidence-only file:

```text
$ git status --porcelain
<empty>
```

The final post-evidence-commit `git status --porcelain`, final PR HEAD, and proof that the evidence commit alone differs from the verified implementation commit are reported in the external handoff.
