# Pulse #155 — RIR trigger shortcut evidence

The shared native RIR picker accepts unmodified `0`–`5` directly on its closed, focused trigger. Selection keeps focus and the popover closed. Zero is a value; five is the 5+ bucket. The existing active-set save and completed-correction draft/save callbacks remain unchanged.

## Identity and boundaries

- Executor: `/Users/meridian/Projects/pulse-rir-trigger-shortcuts`
- Branch: `fix/rir-trigger-shortcuts`
- Verified clean starting HEAD: `56f7d784cde130ffc73ce857d6a1198fd4788b45`
- Approved implementation base: `c3b1e28d60b6d2bba20a7768c355bb61109110f1`, verified ancestor.
- Read repository instructions and the complete frozen contract before editing. Its SHA-256 is retained in `artifacts/issue-155/preflight.json`; the contract is unchanged.
- The user granted the full-gate/browser slot. Native task inventory showed no other active Pulse owner before this lane took it.
- All source, dependency installation, test services, and retained deliverables are in this executor. Browser captures used temporary tool storage before being copied here. An early harness parent-path error created an empty output directory outside the executor; the database guard stopped execution before database access, and the empty directory was removed.
- No migration files, history/progression design, environment files, production/canonical data, merge, or deployment changes. Existing migrations initialized only the new disposable acceptance database.

## Changed files

| Path                                                                         | Change                                                                                                                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/features/workouts/components/rir-picker.tsx`                   | Shared scoped digit handler; exact key, modifier, repeat/composition, enabled/supported guards; trigger keyboard path; accessible and focus-only hint. |
| `apps/web/src/features/workouts/components/set-row.tsx`                      | Pass the row's tracking type into the picker; existing `{ rir, rpe: null }` callback unchanged.                                                        |
| `apps/web/src/features/workouts/components/session-detail-exercise-card.tsx` | Pass the correction editor's tracking type; existing draft and Save semantics unchanged.                                                               |
| `apps/web/src/features/workouts/components/rir-picker.test.tsx`              | Closed/open shortcut, bubbling, rejection, replacement, disabled/unsupported, input isolation, navigation/Clear tests.                                 |
| `apps/web/src/features/workouts/components/set-row.test.tsx`                 | Incomplete/completed rows update only the effort pair; unsupported controls fail closed even if requested.                                             |
| `apps/web/e2e/rir-trigger-fixture.ts`                                        | Opt-in fictional account and active/completed fixtures covering all three supported modes plus duration.                                               |
| `apps/web/e2e/rir-trigger-shortcuts.spec.ts`                                 | Real Tab, scoped digit requests, completed drafts/saves, reload, raw SQLite equality, mobile touch, console/network capture.                           |
| `apps/web/playwright.rir-trigger.config.ts`                                  | Fail-closed dedicated service/database configuration; serial desktop/mobile acceptance.                                                                |
| This report and `artifacts/issue-155/`                                       | Literal command logs, internal review, screenshots, accessibility, console, API/network and raw SQLite readbacks.                                      |

## Focused and full checks

Focused command:

```sh
pnpm --filter @pulse/web exec vitest run --maxWorkers=1 \
  src/features/workouts/components/rir-picker.test.tsx \
  src/features/workouts/components/set-row.test.tsx \
  src/features/workouts/components/session-detail.test.tsx
```

`focused-02.log`: **93 tests / 3 files passed**. `focused-01.log` preserves the initial two number-versus-string assertion failures, corrected without changing product behavior.

Full uncached commands, run serially, with literal output and exit codes under `artifacts/issue-155/`:

```sh
pnpm lint --force --concurrency=1
pnpm typecheck --force --concurrency=1
pnpm test --force --concurrency=1 -- --maxWorkers=1
pnpm build --force --concurrency=1
```

**All passed.** Full test inventory: **3,175 tests** = repository scripts 15 + shared 680 (47 files) + API 1,114 (85 files) + web 1,366 (186 files). All Turbo gate receipts report zero cache hits. Lint retains six existing Fast Refresh warnings; Vite retains its existing chunk-size warning. No new errors. Source/report Prettier and the staged diff check excluding raw `*.log` files pass. The unfiltered whitespace check flags original trailing spaces/blank lines emitted by Turbo, Playwright, and the native compiler; those literal logs are preserved unchanged.

The visual-only hint adjustment landed after the first lint/typecheck and before the full web unit suite and final full build. Final affected web lint and typecheck were repeated successfully (`final-web-lint.log`, `final-web-typecheck.log`). The separate browser fixture/spec/config TypeScript check passed (`browser-types.log`). The final full web suite includes all 43 picker and 28 set-row tests.

The generated `.husky/_/pre-commit` launcher is absent after the offline no-scripts install. No hook bypass was configured; the explicit focused and uncached full commands above are the verification evidence.

Locked dependencies were installed offline in this executor (`CI=true pnpm install --offline --frozen-lockfile --ignore-scripts`); all 791 packages were reused, zero downloaded. Local SQLite bindings were built from installed sources with `npm_config_build_from_source=true pnpm --recursive rebuild better-sqlite3 esbuild --config.ignore-scripts=false`; the literal build output is in `native-bindings.log`. No manifest or lockfile change.

## Browser acceptance

Codex's built-in browser was used first, against the fictional fixture on `127.0.0.1:5255` with API `127.0.0.1:3155`. Both services run directly from this executor without an environment file. SQLite is the ignored `data/issue-155/browser.db`, created empty for this task. Fixture credentials and the database are not committed.

Built-in receipts:

- `builtin-desktop-tab.png`, `builtin-desktop-two.png`, `builtin-desktop-two.txt`, and `builtin-next-tab.txt`: preceding reps input → real Tab → closed trigger → `2`, unchanged trigger focus, then normal Tab to the next weight input.
- `builtin-desktop-five.png`, `builtin-mobile-picker.png`, `builtin-mobile-zero.png`: zero, replacement, 5+, reload, and 375px layout/selection.
- `builtin-readback.json`: API and raw SQLite show native zero, legacy RPE NULL, unchanged non-effort set fields and completion.
- `builtin-correction-unsaved.json`, `builtin-correction-readback.json`, `builtin-correction-reloaded.txt`: digit updates a correction draft without an API write, explicit Save persists native RIR 2, lifecycle timestamps and other set fields remain unchanged, reload exposes exact native effort.
- `builtin-final-correction-focus.png` / `.txt`: final keyboard hint sits inside the focused trigger, clear of the correction label. Initial visual review found the earlier floating hint overlapped that label; this was corrected.
- `builtin-console.json`: no warning/error entries.

The built-in browser exposes viewport and click/keyboard controls, but no touch API. Mobile built-in activation is therefore recorded as a viewport/click check. The supplemental Playwright case uses `hasTouch: true`, `isMobile: true`, `navigator.maxTouchPoints > 0`, and actual `.tap()` calls at **375 × 900**. Desktop uses **1280 × 900**. The browser is installed Google Chrome, driven headlessly from this native task; no browser ChatGPT or Sites was used.

```sh
BASE_URL=http://127.0.0.1:5255 \
API_BASE_URL=http://127.0.0.1:3155 \
E2E_DATABASE_URL=/Users/meridian/Projects/pulse-rir-trigger-shortcuts/data/issue-155/browser.db \
pnpm --filter @pulse/web exec playwright test --config=playwright.rir-trigger.config.ts
```

`browser-final.log`: **2 passed, zero skipped, 12.8 seconds**. Final desktop took 6.5s and mobile touch 5.3s. Both retained error arrays are empty; desktop readback records `altGraphActive: true`. The final screenshot set includes `desktop-tab-hint.png`, `desktop-closed-two.png`, `desktop-correction-draft.png`, `desktop-correction-reloaded.png`, `mobile-picker-0.png`, `mobile-picker-5.png`, `mobile-picker-clear.png`, and `mobile-touch-reloaded.png`.

The desktop test checks all digits, zero/replacement, exact keypad-emitted `key: '5'`, rejected digits/modifiers/repeats/composition, Enter/Space opening, Escape/focus, all three supported modes, completed active sets, and absent unsupported duration controls. Completed corrections are local until explicit Save, which sends the expected set IDs and native RIR/RPE pair. It compares every raw set row against the expected effort-only changes, preserving all fields of every untouched set. Both API lifecycle readback and page reload are verified.

Playwright maps a physical `Numpad5` press to `key: 'Clear'` without NumLock. The keypad-specific assertion therefore dispatches the contract's explicit `{ code: 'Numpad5', key: '5' }` case; ordinary digits and Tab use real browser keyboard input. The browser's AltGraph constructor state is explicitly asserted, rather than inferred from an unchanged request count.

The mobile case verifies touch 0, 5+, explicit Clear, replacement, 44px minimum option targets, closed popover and return focus, reload, raw set equality, and no horizontal overflow. `desktop-readback.json` and `mobile-readback.json` retain request payloads, response statuses, raw rows, and empty browser error arrays. Screenshots are retained beside them.

Initial harness failures remain in `browser-01.log`, `browser-02.log`, and `browser-03.log`: CommonJS configuration handling, a guarded root-path calculation, and physical numpad emission were corrected. Mobile passed in run 03; desktop passed in `browser-desktop-04.log`. The final refresh covers the corrected hint and strengthened readback assertions.

## Internal review and launch readback

One read-only internal reviewer was explicitly launched as **GPT-5.6 Luna / medium**. The same reviewer closed the outstanding browser evidence questions. No consequential product-source defect was found. Its AltGraph coverage concern led to an explicit constructor-state assertion; the local DOM type declarations confirm `modifierAltGraph` is a valid event-init field. Review receipt: `artifacts/issue-155/internal-review.md`.

The delegation tool exposes model and reasoning effort but no Fast/service-tier parameter, so Fast support could not be enabled or visibly verified through that surface. No flags were invented.

The planner clarified that model/effort/Fast UI verification is launcher-owned and never a coding acceptance gate. The launcher observed **GPT-6 Astra / Extra High**. **Fast activation remains unverified**; no independent confirmation is claimed. The executor is released from inspecting native UI or proving these settings. This clarification waives only executor UI-label verification; every substantive product, test, and evidence requirement remains in force. The original blocked inspection receipt is preserved in `preflight.json`.

Implementation, internal review, focused/full checks, and browser acceptance are complete. The temporary native tab was closed, both executor-owned preview services were stopped, and both ports were verified free. Shutdown receipt: `services-stopped.json`. The final manifest hashes the implementation and retained evidence; fixture credentials and database remain ignored.

## Completion and exact source lineage

**COMPLETE — ready for parent independent review.** There are no remaining executor acceptance blockers. Independent acceptance belongs to the parent reviewer; no merge or deployment was performed.

- Verified implementation and substantive evidence commit: `17d10c6e8e959171abd4a14738c2619e2a75911e`.
- Delivery branch: `fix/rir-trigger-shortcuts`.
- Draft PR: [#159](https://github.com/derekbeau/pulse-fitness-app/pull/159).
- The completion follow-up changes only this report, `artifacts/issue-155/completion.json`, and its manifest. All implementation/test files and retained raw evidence remain byte-identical to the verified commit above.
- Passing suites were not rerun for launcher settings. Completion validation checks the source/evidence hashes, frozen-contract hash, metadata formatting, exact PR/remote/local head agreement, and clean worktree status.
- The final delivery SHA is recorded in the native final report, PR description, and ignored `logs/issue-155/delivery.json`. `completion.json` records the tested implementation SHA and planner clarification without a circular self-commit reference.
