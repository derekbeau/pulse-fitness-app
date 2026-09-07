# Internal review receipt

Requested runtime: `gpt-5.6-luna`, `medium`, agent `/root/review_rir155`.
The spawn tool accepts model/effort but exposes no Fast/service-tier setting. No inferred Fast claim.
The reviewer was read-only and ran neither gates nor browser tests.

## Source review returned

> I found no consequential source defect in the named changes:
>
> - `selectDigit` is one scoped helper used by closed trigger and open radiogroup paths.
> - Exact `0`–`5`, modifiers, repeats, composition, disabled state, unsupported tracking types, and `defaultPrevented` are guarded.
> - Handled events call `preventDefault()` and `stopPropagation()` once.
> - RIR updates preserve `{ rir: value, rpe: null }`; no completion, focus progression, or unrelated metric mutation is introduced.
> - `trackingType` is threaded through both `SetRow` and `SessionSetEditor`, covering active and completed correction surfaces.
> - The revised hint wrapper preserves trigger accessible naming/text content and uses a sibling `peer-focus-visible` hint.

The reviewer marked real Tab, mobile touch, API/reload persistence, and full completed-correction browser proof as still outstanding at that point. Those were already in progress and are covered by the browser receipts in this directory.

## Same review's evidence follow-up returned

> Narrow E2E/evidence review found one consequential harness gap:
>
> - The desktop AltGraph case is not actually testing AltGraph. The spec dispatches `new KeyboardEvent('keydown', { key: '2', bubbles: true, modifierAltGraph: true })` (`apps/web/e2e/rir-trigger-shortcuts.spec.ts`, rejected-key block). `modifierAltGraph` is not a `KeyboardEventInit` field, so the browser ignores it and `getModifierState('AltGraph')` remains false. The event is therefore treated as an ordinary `2`; the unchanged request count can pass for the wrong reason. Use a real `getModifierState` override or a browser-supported AltGraph event construction, as the focused unit test already does.
>
> Everything else in the new evidence is materially covered:
>
> - Desktop uses a real preceding-input `Tab`, confirms trigger focus, closed popover, focus returning after each selection, single PATCH per digit, unsupported duration control absence, lifecycle preservation, reload readback, and completed-session correction persistence.
> - Mobile uses touch taps for `0`, `5+`, Clear, replacement, focus return, reload, raw-set preservation, viewport overflow, and zero console/network errors.
> - Readbacks show `rpe: null`, expected RIR values, unchanged non-effort fields, and no completion mutation.
>
> The latest hint placement is visually safer: it remains inside the trigger's bounds on keyboard focus via `focus-visible:pb-5` and an absolutely positioned `Keys 0–5` label, while the accessible description remains a sibling reference. No additional source concern found.

## Primary resolution

The field claim is incorrect: the installed TypeScript `lib.dom.d.ts` declares `modifierAltGraph?: boolean` in `EventModifierInit` at line 675. The harness was nevertheless strengthened to assert the actual constructed event's `getModifierState('AltGraph')` value before accepting rejection evidence. The final browser readback retains `altGraphActive`; no synthetic override hides unsupported constructor behavior. The final browser run passed and `desktop-readback.json` records `altGraphActive: true`; the actual Chrome constructor did preserve the modifier.

Raw readback was also strengthened to compare full expected set rows, including unchanged effort fields on every untouched set. This is internal implementation review and verification, not independent release acceptance or merge approval.
