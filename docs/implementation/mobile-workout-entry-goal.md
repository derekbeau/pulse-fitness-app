# Mobile workout entry: Goal-Mode implementation contract

## Goal

Complete Pulse #140 and #142 as one coherent, reviewable change. Continue until the complete implementation, focused tests, adversarial review, consolidated repairs, proportional verification, clean commit, and literal evidence are complete. This is a frozen implementation handoff, not a plan to return with a partial implementation.

The user outcome is: active workout set values are legible and usable on narrow screens, across every existing tracking type, and an open RIR picker accepts a scoped `0`–`5` numeric shortcut that selects once and closes immediately. Existing save, completion, correction, accessibility, and rollback behavior must remain intact.

## Exact execution context

- Repository: `/Users/meridian/Projects/pulse-mobile-workout-entry`
- Approved base: branch `fix/mobile-workout-entry`, implementation baseline SHA `09b0339ea9f8e5cdd8ab2eda32c409717170b12e`; launch HEAD is the clean docs-only descendant supplied by the generated launcher
- Expected starting state: clean tracked worktree; preserve unrelated untracked artifacts and do not edit the original `/Users/meridian/Projects/pulse-fitness-app` worktree
- Issues: #140 and #142, grouped in one PR but independently verifiable
- Primary implementation owner: GPT-5.6 Sol medium
- Internal adversarial/support subagents: GPT-5.6 Luna medium, with distinct assignments
- Required first reads: `AGENTS.md`, this contract, the exact issue snapshot appendix, and the referenced source/tests below

Fail before editing if branch, generated launch HEAD, baseline ancestry, repository, worktree, or expected state does not match. Do not “repair” identifiers from memory.

## Inspected implementation surface

Read and account for these current paths:

- `apps/web/src/features/workouts/components/set-row.tsx`
  - `SetRow` currently uses a wrapping row, a `min-w-0 flex-1` metric region, two-metric `minmax(0,1fr)` columns, `h-9` inputs with `pr-8`, and absolutely positioned suffixes.
  - Tracking layouts currently cover `weight_reps`, `weight_seconds`, `bodyweight_reps`, `reps_only`, `reps_seconds`, `seconds_only`, `duration`, `distance`, and `cardio`.
  - Current input values are parsed and locally overridden; changes debounce for 700 ms and blur flushes the pending update and clears local overrides.
  - Completion is derived by `isSetCompleteForTrackingType`; do not change its product rules.
- `apps/web/src/features/workouts/components/rir-picker.tsx`
  - Options are `[null, 0, 1, 2, 3, 4, 5]`; `5` displays as `5+ RIR`.
  - Existing arrows, Home/End, click, Enter/Space, Escape, and trigger-focus restoration are part of the contract.
  - The current group handler has no digit shortcut.
- `apps/web/src/pages/active-workout.tsx`
  - `handleSetUpdate` updates the draft immediately, persists active-session changes through `useUpdateSet`, restores the previous set on failure, preserves completion behavior, starts rest timing only on a newly completed set, and reports RIR rollback errors.
- `apps/web/src/hooks/use-session-sets.ts`
  - `useUpdateSet` uses the shared optimistic mutation path; its rollback/reconciliation and RPE/RIR atomic pair behavior are existing invariants.
- `apps/web/src/features/workouts/components/session-detail.tsx` and `session-detail-exercise-card.tsx`
  - Completed-session edits use string drafts and an explicit receipt `Save` button; RIR changes update the draft and clear RPE, but must not silently submit the correction request.
  - Correction failure is owned by the mutation; the draft stays open for retry.
- Existing tests read: `set-row.test.tsx`, `use-session-sets.test.tsx`, active-workout tests, completed-session/detail tests, workout API correction tests, and relevant workout component tests.
- Browser harness: `apps/web/playwright.config.ts`, `apps/web/e2e/test-env.ts`, and existing `apps/web/e2e/workout-session.spec.ts`. The configured E2E database defaults to `data/pulse-e2e.db`, and ports are configurable; use an isolated override.
- Commands from `AGENTS.md`/package manifests: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; web workspace has `pnpm --filter web test:e2e` and `pnpm --filter web test`.

## Fixed product and architecture decisions

### Set-row responsive behavior (#140)

1. Keep every existing tracking type and its data semantics. The layout fix must not be dependent on the RIR shortcut.
2. On narrow layouts, give primary numeric metrics a dedicated usable row or an equivalent layout with a proven minimum content width. Do not force set label, target hint, metrics, separators, suffixes, and RIR into one line.
3. Weight/reps, weight/seconds, reps/seconds, duration effort fields, cardio, distance, reps-only, bodyweight-reps, and seconds-only all receive populated-layout coverage. A layout that only fits null placeholders is not acceptable.
4. RIR and target hints must move outside the numeric content area on narrow screens. Desktop may retain a compact arrangement if content remains measurable and readable.
5. Preserve accessible names and unambiguous units. Labels, suffixes, or headers may be visually relocated or hidden only when the accessible name/unit remains available; never leave weight, distance, seconds, reps, RPE, or zone ambiguous.
6. Preserve at least 44px touch actions for controls. Inputs may be taller or stacked. No horizontal viewport overflow.
7. Treat usable content width as the input’s inner content box after border, horizontal padding, native number-control space, and any suffix reservation. Outer bounding width alone is not evidence.
8. Use realistic populated values in tests and browser evidence: `155`, `225`, `12`, decimal weights such as `157.5`, decimal distance such as `5.4`, and time values such as `3600` seconds / `1:00:00` where the UI supports that representation. Include enough digits to expose clipping, not just one-digit fixtures.

### Scoped RIR numeric shortcut (#142)

1. Only while the RIR picker is open and focus is within its picker content/radiogroup, an unmodified digit key `0`, `1`, `2`, `3`, `4`, or `5` selects the corresponding option through the existing `choose()` path exactly once and closes the picker.
2. `5` stores numeric bucket `5` and displays `5+`; it is never an exact-five estimate.
3. Accept top-row and numeric-keypad key events when the resulting `event.key` is the corresponding digit. Do not depend on document/window listeners.
4. Ignore Shift, Control, Alt, Meta, AltGraph or other modifiers, auto-repeat (`event.repeat`), and composing input (`event.isComposing` or equivalent composition state). Do not prevent unrelated typing.
5. Preserve arrows, Home/End, Enter/Space, Escape, touch/click selection, clear/unset, selected state, and focus return to the invoking trigger.
6. Weight and reps input outside the picker must never change RIR. Typing `155` into weight or `12` into reps must remain ordinary input.
7. In active sessions, use the existing server-backed mutation and preserve completion state and atomic RIR selection/RPE clearing. A failed request must restore both prior RIR and prior RPE, retain normal error reporting, and not create duplicate saves.
8. In completed-session edit mode, the shortcut changes only the correction draft, clears draft RPE through the existing selection path, closes the picker, and leaves the explicit receipt `Save` boundary intact. A correction request is sent only after the user presses `Save`; failed Save leaves the draft open and recoverable.
9. Do not auto-advance, auto-complete, or copy RIR to another set.

## Non-goals and boundaries

- Do not change completion rules, debounce/blur-save semantics, optimistic mutation architecture, session status/timestamps, or existing RIR/RPE data contracts except where required to route the same selection path.
- Do not add global digit shortcuts, change unrelated forms, redesign the workout domain, alter migrations, or repair production/canonical data.
- Do not deploy, merge, close issues, mutate production, use a production `.env`, use a production database, accept terms, spend money, or contact anyone. Pushing this branch and opening one DRAFT PR for #140/#142 are explicitly authorized; keep it draft for independent acceptance and user QA. No server tests are run by the planner; the executor owns implementation verification.

## Required implementation loop and ownership

Sol owns the complete implementation lane, including reading, planning, code/tests, browser checks, internal review, consolidated repairs, final diff, commit, and evidence. Sol may spawn Luna medium subagents, but they must be read-only/isolated reviewers with distinct scopes:

1. **UI geometry/accessibility:** populated metrics, inner content widths, suffixes, touch targets, overflow, focus, responsive layouts, themes.
2. **Keyboard/data invariants:** picker scope, digits `0`–`5`, keypad/top-row, modifiers/repeat/composition, exactly-once selection, RIR/RPE atomicity, rollback.
3. **Correction/persistence:** completed-session draft-only behavior, explicit Save, failure retry, reload/resume, completion/status/timestamp invariants.
4. **Test/evidence/repository hygiene:** fixture isolation, meaningful assertions, screenshot population, exact commands/totals, diff and secret hygiene.

Consolidate all findings once, repair every in-scope finding, then rerun affected checks and the final gate. Do not create competing editors or parallel heavy checks in the same worktree.

## Acceptance matrix

### A. Responsive populated layouts

For each tracking layout below, render populated values plus empty, focused, completed, target-hint, and error states at **320px, 390px, and 430px mobile widths**, one representative tablet width (use the project’s responsive tablet breakpoint/viewport), and one desktop width. Run each representative populated matrix in both light and dark themes and at least the project’s midnight/accent theme; do not substitute empty rows or DOM values for visual evidence.

- `weight_reps`: weight `155`, `225`, and decimal `157.5`; reps `12`; target weight/range; optional RIR.
- `weight_seconds`: weight `155.5`; seconds `3600` and a shorter `45`; target weight × seconds.
- `bodyweight_reps` and `reps_only`: reps `12`, including focused edit and clear.
- `reps_seconds`: reps `12` × seconds `3600`.
- `seconds_only`: `3600` seconds.
- `duration`: seconds `3600` plus RPE and zone fields; target seconds.
- `distance`: decimal distance `5.4` with the correct `mi`/`km` unit.
- `cardio`: seconds `3600` plus decimal distance `5.4`.

For every viewport/theme representative, verify with browser geometry that each populated input’s inner usable content width remains positive and sufficient for the fixture’s rendered digits and suffix; record the measurement method and threshold chosen by the implementation. Verify no text, suffix, separator, target hint, or primary value is clipped/overlapped, no horizontal document overflow occurs, set number/completion remain clear, and all touch controls are at least 44px. Keyboard-open viewport remains usable; state any emulation limitation honestly.

### B. Set interaction and invariants

- Enter, edit multi-digit values, enter decimals where supported, clear, blur, wait through the 700ms debounce, save, reload, and resume each retain readable values and the existing server behavior.
- Assert debounce still coalesces keypad entry and blur still flushes once.
- Assert populated rows, not only null fixtures, drive visual/browser regression assertions.
- Assert completion remains exactly as before for every tracking type, including clearing a required field and entering the final required field; no RIR edit changes completion.
- Assert active-session update failure restores the complete prior set draft, including RIR/RPE pair where relevant, and reports the existing error.

### C. RIR shortcut and scope

In component tests and an installed-Chrome regression, with picker focused/open:

- Each digit `0`, `1`, `2`, `3`, `4`, `5` selects the corresponding bucket without Enter, closes, invokes the existing callback once, and returns focus to the trigger; assert `5` is stored/displayed as `5+`.
- Cover top-row and numeric-keypad-produced digit keys where the browser harness can produce them.
- Assert Shift/Control/Alt/Meta modified digits, `event.repeat`, and composing input do nothing and do not close or save.
- Assert one keypress produces one selection/save; held/repeated events cannot duplicate it.
- Assert weight `155` and reps `12` typed outside the open picker do not alter RIR.
- Preserve and test arrows, Home/End, Enter/Space, Escape, click/touch, selected radio state, and Clear/unset.
- For active sessions, assert exactly one existing mutation payload and normal completion preservation; inject a failed request and assert RIR/RPE rollback and error reporting.
- For completed-session editing, assert digit selection updates the draft and closes, sends no correction request before explicit Save, then sends the expected correction only on Save; failed Save leaves the corrected draft open for retry.
- Assert no auto-advance, auto-completion, or next-set RIR mutation.

### D. Existing suite and final repository gate

During iteration use focused installed tests and the relevant existing workout suite. Once the final code and repairs are complete, run **one full uncached** repository gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Do not require duplicate full matrices for each reviewer. Run one focused installed-Chrome regression against an isolated fixture/server after the heavy repository checks are not concurrently consuming the same resources; the regression must contain populated digits and the RIR scope/failure/correction flows. Reuse unchanged relevant evidence only when the source/test/harness tree truly did not change, and say so.

## Fixture, server, and port isolation

- Never use production `.env`, production credentials, production/canonical database, or the shared default fixture/database.
- Use a fresh per-run E2E database path under a disposable temp/workspace directory and unique seeded user/data; clean it afterward unless retained as evidence. Do not point at `data/pulse-e2e.db` if it is shared or pre-existing.
- Before starting any server, identify the owner of every selected API/web port with `lsof -nP -iTCP:<port> -sTCP:LISTEN` (or equivalent), then choose unique free ports owned by the executor and record them. Never kill an unowned listener.
- Inspect actual harness/scripts and .env.example to derive supported environment variable names, database and URL wiring, and explicitly set isolated values. Do not guess environment keys or assume dev:gate0 respects overrides. Do not inherit production values.
- Do not overlap the full lint/typecheck/test/build gate with the browser server/regression. Keep one implementation owner and one browser lane; shut down servers and verify no executor-owned listeners remain.

## Evidence artifact required from executor

The executor must create `docs/implementation/mobile-workout-entry-evidence.md` identifying the verified code commit. A later evidence-only commit is allowed: prove relevant code/test/harness trees unchanged and report final PR HEAD externally; do not attempt a self-referential commit SHA. It must include:

- exact final branch and full SHA;
- files changed and a requirements-to-evidence map for #140 and #142;
- exact command lines, whether cache was disabled/cleared, pass/fail result, and literal test totals reported by the tools (never invent counts);
- focused installed-Chrome command, browser/channel/version if available, isolated fixture/database and ports (redact secrets), and exact populated viewport/theme cases exercised;
- screenshots showing actual populated digits at representative 320/390/430/tablet/desktop layouts and themes, with paths and what each proves;
- geometry/overflow/focus/keyboard and rollback/correction observations;
- Luna subagents used, assignments, every finding and disposition;
- limitations such as unavailable physical-device testing or keypad emulation, without presenting emulation as device proof;
- final `git status --porcelain` output and confirmation of prohibited actions not taken.

Evidence must correspond to the exact final committed SHA, not an earlier local state.

## Git contract and draft PR handoff

- Keep all implementation/test/evidence changes scoped to #140/#142; preserve unrelated artifacts.
- Commit the frozen handoff now as a docs-only Conventional Commit with a required why-focused body. The later executor commit must also follow Conventional Commits and include a body.
- Push the finished branch and open one DRAFT PR targeting main, linking both #140 and #142 with closing keywords. Do not merge, mark ready, deploy, or close issues manually.
- Final executor state must be a clean worktree at the reported exact SHA.

Required draft PR closing text:

> Fixes #140\n> Fixes #142

## Final report contract

Return `COMPLETE` or `BLOCKED`, exact branch and SHA, commits, files, requirements-to-evidence mapping, adversarial assignments/findings/dispositions, exact checks and literal results, browser evidence, limitations/blockers, prohibited-action confirmation, and final `git status --porcelain`.

---

# Appendix A — exact live issue body snapshots

## Issue #140 — Fix unreadable mobile active-workout numeric inputs and responsive set-row layout

```text
## Execution grouping

First execution bundle: **#140 + #142 in one PR** for readable mobile workout entry and scoped RIR numeric selection. Keep each issue’s acceptance criteria independently verifiable; close both only after independent acceptance of the final candidate. Use a single Codex Goal Mode implementation owner and one clean branch/worktree. This grouping does not authorize implementation, merge, deployment, or production data changes by itself.

## Severity / outcome
High priority: active workout logging is not usable on mobile when the entered numbers cannot be read. Redesign the row so actual weight/reps/time values take priority over decorative or redundant labels.

## User report
Entering numbers in active sessions is effectively broken because the text cannot be seen. Labels/placeholders should disappear or relocate when necessary on narrow screens.

## Investigation
At main `09b0339ea9f8e5cdd8ab2eda32c409717170b12e`:
- `set-row.tsx:113-129`: flex-wrapping row with a `min-w-0 flex-1` metric region.
- `set-row.tsx:184-205`: inputs reserve `pr-8` while unit/metric suffixes are absolutely positioned inside them.
- `set-row.tsx:400-409`: two-metric grid uses `minmax(0,1fr)` columns, allowing the digit area to collapse.
- `rir-picker.tsx:71-79`: the adjacent RIR trigger reserves additional minimum width.
- Nested mobile/card padding reduces available width further.
The normal input foreground is not intentionally transparent. The source and stored screenshots substantiate a width/padding/suffix layout defect; the user's exact phone/browser has not yet been reproduced.

## Why previous verification missed it
The #130 active bench fixture used null weight/reps. Screenshots at 320/390/430 and overflow checks proved the empty row fit, not that populated digits were legible. Existing SetRow unit tests passed 17/17 during investigation despite this gap.

## Required behavior
- Give primary numeric metrics a dedicated usable mobile row, or an equivalent layout with proven minimum content width.
- Move RIR and target hints out of the numeric area on narrow screens; desktop may remain compact.
- Hide/relocate redundant visual placeholders, labels, separators, or suffixes when needed. Never remove accessible names or leave weight units ambiguous; an external/header unit label is acceptable.
- Preserve readable set number, completion state, targets, and 44px touch actions without forcing everything into one line.
- Test every tracking layout, especially weight/reps, bodyweight, duration and multi-metric timed sets—not only RIR-supported rows.
- Preserve debounce, blur save, completion rules, existing RIR, explicit clears, optimistic rollback, and reload/resume behavior.

## Acceptance criteria
- [ ] Values such as 155, 225, 12, and decimal weights are fully readable at 320/390/430px.
- [ ] Enter, edit, select, clear, blur, save, reload, and resume work without text clipping or suffix overlap.
- [ ] Input content width is verified after padding and native numeric controls, not merely outer bounding width.
- [ ] Empty, populated, focused, completed, target-hint, and error states are verified in light/dark/midnight themes.
- [ ] Keyboard-open viewport remains usable; verify a real mobile browser where available and state emulation limitations honestly.
- [ ] Desktop/tablet layout and all tracking types remain usable.
- [ ] No horizontal viewport overflow; accessible labels and clear units remain available.
- [ ] Installed-Chrome screenshots contain actual populated digits; include regression assertions for usable input geometry.

Related: #130 / #136. Coordinate with the separate RIR numeric-shortcut issue, without making the layout fix dependent on it.

## Implementation and verification contract
Start from clean current main; read AGENTS.md and preserve unrelated work. This issue authorizes no production data repair, deployment, or merge. Use isolated fixtures for writes. Add focused regression tests, run full uncached lint/typecheck/test/build, and verify relevant installed-Chrome flows. Return exact SHA, commands/results, screenshots where relevant, and remaining limitations. Do not treat passing DOM value assertions or empty screenshots as proof of visual usability.

```

## Issue #142 — Add scoped numeric hotkeys for immediate RIR selection

```text
## Execution grouping

First execution bundle: **#140 + #142 in one PR** for readable mobile workout entry and scoped RIR numeric selection. Keep each issue’s acceptance criteria independently verifiable; close both only after independent acceptance of the final candidate. Use a single Codex Goal Mode implementation owner and one clean branch/worktree. This grouping does not authorize implementation, merge, deployment, or production data changes by itself.

## Outcome
When the RIR picker is open and focused, pressing a number selects that RIR and commits/closes immediately, without an additional Enter press.

## Investigation
At main `09b0339ea9f8e5cdd8ab2eda32c409717170b12e`, `apps/web/src/features/workouts/components/rir-picker.tsx` defines the unset/0–5 options at line 14. Its keyboard handler at lines 43–59 implements arrows, Home and End only. Digit keys fall through without action. The existing `choose()` path invokes onChange and closes, and the popover restores trigger focus.

## Required behavior
- While focus is in the open picker, keys 0, 1, 2, 3, 4, 5 select their corresponding options and call the existing selection path once.
- 5 selects stored bucket 5 and displays 5+; never interpret it as an exact five-rep estimate.
- Scope the shortcut to the picker, not the document/window. Typing 155 into weight or 12 into reps must never alter RIR.
- Ignore modified shortcuts and composing input; prevent held-key repeat from generating duplicate saves.
- Preserve arrows, Home/End, Enter/Space, Escape, touch selection, and clear/unset behavior.
- Active sessions save through the existing server-backed mutation, preserving completion and atomic RPE clearing; failure rolls back and reports the error.
- In completed-session edit mode, commit the picker selection into the correction draft and close the picker, but preserve the existing explicit receipt Save boundary. Do not silently save the whole completed-session edit.
- Do not auto-advance into another set, auto-complete the set, or copy RIR to the next set.

## Acceptance criteria
- [ ] Every digit 0–5 selects the expected value and closes without Enter.
- [ ] Top-row and numeric-keypad input work when they produce the corresponding digit key.
- [ ] One keypress produces one selection/save; repeats/modifiers/composition do not duplicate or hijack actions.
- [ ] Focus returns to the invoking trigger.
- [ ] Weight/reps entry outside the picker is unaffected.
- [ ] Active completed/incomplete state is preserved; errors roll back normally.
- [ ] Completed-session editing updates only the draft until explicit Save.
- [ ] Keyboard-only and touch flows retain accessible selected state, clear, and Escape behavior.
- [ ] Component and installed-Chrome tests cover each digit, 5+, scope isolation, focus, and persistence.

Related: #130 / #136. Small companion to the mobile set-row layout repair; keep acceptance independently verifiable.

## Implementation and verification contract
Start from clean current main; read AGENTS.md and preserve unrelated work. This issue authorizes no production data repair, deployment, or merge. Use isolated fixtures for writes. Add focused regression tests, run full uncached lint/typecheck/test/build, and verify relevant installed-Chrome flows. Return exact SHA, commands/results, screenshots where relevant, and remaining limitations. Do not treat passing DOM value assertions or empty screenshots as proof of visual usability.

```
