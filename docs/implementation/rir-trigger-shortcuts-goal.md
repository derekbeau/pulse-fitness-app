# Frozen Goal: Pulse #155 — RIR trigger digit shortcuts

## Scope and base

- **Issue:** #155, “Enable RIR number shortcuts directly on the tab-focused picker trigger.”
- **Repository/worktree:** `/Users/meridian/Projects/pulse-rir-trigger-shortcuts`
- **Implementation branch:** `fix/rir-trigger-shortcuts`
- **Approved base:** `c3b1e28d60b6d2bba20a7768c355bb61109110f1` (`main`, after merged PR #157).
- Read `AGENTS.md` before editing. Preserve all pre-existing untracked files in the main worktree; work only in this isolated worktree.
- This contract is frozen. Implement the complete contract; do not broaden it into history redesign, schema/data migration, or unrelated effort-tracking changes.

## Product behavior

When focus is on a **closed**, enabled, supported native RIR trigger, an unmodified keyboard digit `0`–`5` selects that RIR immediately:

1. Tab from the preceding control to the RIR trigger.
2. Press `0`, `1`, `2`, `3`, `4`, `5` (including a numpad key that emits that same `key`).
3. Record native RIR for that set immediately, without opening the popover.
4. Keep focus on that same trigger; do not submit/complete the set and do not advance focus.
5. Subsequent Tab proceeds normally.

`5` means **5+**. `0` is valid and must never mean clear. Replacement of an existing RIR must work.

Maintain existing accessible current-value labeling and visible focus. Add a concise, non-cluttering keyboard hint that does not force the popover open.

## Required implementation boundaries

- In `apps/web/src/features/workouts/components/rir-picker.tsx`, factor the digit selection into one **scoped shared helper** used by both the closed trigger path and the existing open radiogroup path.
- The helper may only handle exact `0`–`5`, enabled, supported native RIR selection. It must reject `6`–`9`, Shift/Ctrl/Alt/Meta/AltGraph modifiers, held repeats, IME composition, disabled controls, and unsupported tracking modes.
- On a handled digit, consume the event exactly once (`preventDefault` and propagation control) so a parent shortcut cannot also run and bubbling cannot yield duplicate callbacks.
- Do not install a global/document shortcut and do not interfere with unrelated weight, reps, notes, or other inputs.
- Keep Enter, Space, and click behavior opening the existing picker. Preserve existing open-picker arrows/Home/End navigation, Escape, explicit Clear, touch selection, and return-focus behavior.
- Apply behavior across every existing shared-picker consumer, including active logging and completed-session correction/editing surfaces.
- Preserve native RIR/RPE mutual exclusion and the existing update/persistence callback semantics. A RIR update must retain existing semantics that persist the correct set as `{ rir: value, rpe: null }`; do not modify unrelated set values, completion state, focus progression, or timestamps.
- No migration, no history redesign, no production/deploy/environment/Foundry work.

## Required coverage and evidence

Add or update focused tests (including `rir-picker.test.tsx` and where appropriate `set-row.test.tsx`) that prove:

- Real keyboard path: Tab → trigger → digit `2` updates once, popover remains closed, focus remains on trigger, then Tab moves normally.
- `0`, `5`/5+, and replacing an existing RIR value.
- No duplicate callback through bubbling; no completion or automatic focus advance.
- Modified keys including AltGraph, repeats, IME composition, disabled, and unsupported controls do nothing.
- Digits typed in unrelated inputs remain untouched.
- Existing open-popover keyboard navigation and explicit Clear behavior remain intact.
- Existing touch selection works on a mobile viewport.
- Native RIR persists across the existing API refetch/reload flow, with raw/persisted RIR clearing legacy RPE and no other set values changed.

Use Codex’s built-in browser first for desktop keyboard and mobile touch acceptance with realistic/synthetic data; retain screenshots plus console/network/readback evidence. Do not use browser ChatGPT or Google Sites. Use this native Codex app only.

Run focused tests during work. Do **not** run heavy/full gates while the #133 independent review owns the full gate/browser slot. When implementation is ready, commit coherent work, push it, create/update a **draft** PR only, and write literal evidence in the goal report. Do not merge, deploy, modify production, or change environment/data.

## Coordination and final status

The #133 independent reviewer is complete and has released the full-gate/browser slot. Before taking that slot, confirm no other active owner is using it; then this implementation lane may run the complete agreed gates and built-in-browser acceptance. If a new owner appears, do not contend: report **READY FOR GATE — NOT DONE** with exact commit, draft PR, focused-test results, remaining gates/browser acceptance, and the blocker.

Primary launcher routing: GPT-6 Astra, **Extra High / actual `Extra High`**, with **Fast mode ON**. Verify visible Fast-mode readback at launch; Fast does not lower reasoning effort. Internal review/support: GPT-5.6 Luna, Medium, with Fast mode enabled when supported; verify actual supported setting and do not invent delegation flags.

Final report must state changed files, exact commit, branch, draft PR URL, focused checks/results, built-in browser evidence or the explicit wait, clean worktree status, and all remaining gate work.
