# Daily Nutrition Notes: Frozen Goal-Mode Contract

## Contract status

**Frozen preparation handoff for Pulse issue #133. This lane is docs-only. Do not launch Codex, implement production/UI code, run the app/browser UI, deploy, mutate production/canonical data, access Foundry, or merge from this lane. The parent must first verify the PR #156 closeout archive and grant the serialized heavy final-verification/browser slot.**

- Repository: `/Users/meridian/Projects/pulse-daily-nutrition-notes`
- Upstream: `https://github.com/derekbeau/pulse-fitness-app.git`
- Approved base: `origin/main` at exact SHA `c1c95fc3ae498a205e78f2d7ece1d4d5211a1a83` (`fix: preserve food usage integrity`, merged PR #156)
- Executor branch: `feat/daily-nutrition-notes`
- Primary: **GPT-6 Astra, xhigh reasoning**, launcher-only; verify the actual model/reasoning label before launch
- Review/support: **GPT-5.6 Luna, medium reasoning**
- Execution: one fresh Pulse Goal Mode chat, one isolated worktree, one implementation editor; no competing editor
- Parallel boundary: counterpart #139 is workout presentation only. Do not edit its files or shared global files from that lane.
- Launch gate: no Codex UI launch until the parent verifies the PR #156 closeout archive.

Fail before editing if the worktree, branch, base SHA, or docs-only preparation state differs from this contract.

## Live issue snapshot

Captured from the live GitHub issue on 2026-09-07:

- Issue: [#133 Add editable daily nutrition notes and surface them in the UI](https://github.com/derekbeau/pulse-fitness-app/issues/133)
- State: open; labels: enhancement, design-system, feature, ai-generated
- Current comments: none; no assigned owner, project, milestone, branch, or PR
- The issue says `nutrition_logs.notes` already exists and daily nutrition reads already return it, but no supported write route or UI control exists.
- Required user outcome: day-level context is distinct from meal notes, available to agents and UI readers, editable for empty and historical days, and discoverable in the current nutrition history/calendar surface.
- Examples are explanatory context such as intentional higher intake, restaurant/estimated macros, appetite/illness/travel, or recovery intake.

The issue's “consider hover/detail treatment for charts” language is optional. Do not expand into chart hover, a new journal system, or a separate calendar product unless implementation inspection proves an existing in-scope surface requires it.

## Inspected repository facts

- `apps/api/src/db/schema/nutrition.ts` already defines nullable `nutritionLogs.notes` and the unique `(userId, date)` key. No new migration is authorized unless the executor proves the checked-out schema is missing a required persisted field or constraint; on this base it is present, so **no migration is expected**.
- `apps/api/src/routes/nutrition/index.ts` owns authenticated `/api/v1/nutrition/*` routes. Existing daily detail, summary, logging-context, week-summary, status, meal create/edit/delete, and item-edit routes use shared Zod/OpenAPI schemas and `{ data: T }` responses.
- `apps/api/src/routes/nutrition/store.ts` already scopes reads by `userId`, creates a nutrition log when creating a meal, returns `log.notes` in daily detail, and builds empty-day detail as `{ log, meals: [] }`. Extend this store rather than creating a second nutrition-log data path.
- `packages/shared/src/schemas/nutrition.ts` already models `nutritionLogSchema.notes`, `dailyNutritionSchema`, `nutritionSummarySchema`, `nutritionLoggingContextSchema`, and fixed-length seven-day `nutritionWeekSummarySchema`. Add only fields required for note consistency; preserve existing schemas and derived nutrition facts.
- `apps/web/src/features/nutrition/api/nutrition.ts` uses TanStack Query keys for day, summary, energy adherence, and week summary, and the rename mutation establishes the required cancel/optimistic-update/rollback/invalidate pattern.
- `apps/web/src/pages/nutrition.tsx` owns date selection, the existing Monday-to-Sunday `NutritionWeekStrip`, daily summary/macro surfaces, empty-day state, historical navigation, and meal list. Extend this composition; do not create an unrelated feature or global state layer.
- `apps/web/src/features/nutrition/components/nutrition-week-strip.tsx` is the current calendar/history-like seven-day surface. It currently distinguishes empty/partial/complete by meal count/completeness and has accessible date buttons. A compact note indicator belongs here if the week response exposes one.
- `AGENTS.md`, `docs/conventions/api-conventions.md`, `design-system.md`, and `feature-structure.md` are required context. Follow the loaded `derek-dev-workflows` rules: source changes through git, clean isolated lane, literal evidence, built-in-browser-first verification, and no production action.

## Frozen product and data decisions

1. **Reuse the existing field.** Persist day notes only in `nutrition_logs.notes`; keep them distinct from `meals.notes`. Do not attach context to a meal and do not add a new table or migration on this base.
2. **Canonical mutation.** Add an authenticated unified route `PATCH /api/v1/nutrition/:date` (or the repository's exact equivalent only if route inspection proves a conflict). The route must use the existing `requireAuth` hook, shared Zod/OpenAPI request and response schemas, and the existing nutrition store transaction.
3. **Explicit body semantics.** The request body is an object with an optional `notes` property:
   - `notes: "text"`: trim leading/trailing whitespace, validate a non-empty meaningful string, and create/replace the owned day's note.
   - `notes: null`: clear the owned day's note and persist SQL `NULL`.
   - omitted `notes`: leave the existing note unchanged; an omitted field is never interpreted as clear.
   - whitespace-only strings are rejected as `400 VALIDATION_ERROR`, not silently converted to a different operation. The UI uses explicit `null` for Clear.
   - maximum length is **2,000 Unicode code units after trim**, matching existing editable meal-note limits; preserve internal whitespace/newlines and render them safely.
   - reject unknown body fields if that is the established shared-schema convention for the chosen schema; do not accept a second alias such as `context`.
4. **Empty-day creation.** A valid string or `null` mutation may create the day's `nutrition_logs` row without a meal. Clearing an absent day is an idempotent no-op returning a canonical empty-day representation (or the route's documented updated-log response) without manufacturing meals or counts. The executor must choose one response shape and test it consistently; no ambiguous 404 for a valid empty-day note operation.
5. **Ownership and date safety.** Every select/update/upsert is constrained by authenticated `request.userId` and validated `YYYY-MM-DD` date. A foreign user's same-date log, note, meals, food rows, or summary must never be read or changed. Both JWT/Bearer and `AgentToken` authentication use the same route/schema behavior; do not branch the contract by auth mode.
6. **Response consistency.** The note remains available through daily detail (`log.notes`), daily summary (`notes` or the explicitly documented equivalent), logging context (`today.nutrition.log.notes` and any added summary field), and week/history data through a compact boolean such as `hasNote`. Do not put full note text into the seven-day strip payload. Preserve `{ data: T }` envelopes and generated OpenAPI output.
7. **No learning or integrity side effects.** Updating or clearing a day note must not alter meal/item rows, macro totals, meal counts, completeness/status, nutrition targets, adaptive TDEE calculations/recommendations, weight history, food `usageCount`, food `lastUsedAt`, or any food-usage-integrity invariant from merged PR #156. It must not mark a day complete/partial or trigger a food projection refresh.
8. **Safe rendering.** UI output is text content only, never HTML. Preserve line breaks with `whitespace-pre-wrap`, use bounded layout/wrapping, and ensure a note cannot inject markup or overflow mobile surfaces. Do not expose note text in an unsafe tooltip/HTML renderer.
9. **History indicator scope.** Add the smallest discoverability signal to the existing `NutritionWeekStrip` (for example `hasNote` plus an accessible “has note” label). Do not invent a second calendar/history route. If repository inspection finds another existing nutrition calendar surface that is actually used by this page, include it only to keep indicators consistent and report the path.
10. **No target semantic changes.** Preserve all existing adaptive-nutrition semantics, status gates, historical target selection, protein-floor facts, empty-day behavior, and food-count integrity. Notes qualify context; they do not qualify or override learned nutrition data.

## Frozen UI behavior

- On the selected day, place a compact but prominent day-note card/action above the meal list and near the daily summary/header.
- Empty state: show `Add day note` even when there are no meals; saving a note must work before the first meal exists.
- Existing note: render the current text, with `Edit note` and `Clear note` actions. Clear requires the existing confirmation primitive and is reversible through the next add/edit operation, not a destructive meal/data flow.
- Historical dates: the same add/edit/clear controls work for any valid selected date, not only today. Preserve date navigation and the existing Today affordance.
- Editor: use the existing form/input primitives and React Hook Form + shared Zod validation conventions where applicable; expose an associated label, character limit/error text, `aria-invalid` when invalid, and a live pending/success/error status. Provide a usable mobile textarea with keyboard-safe layout, no clipped action buttons, and at least existing 44px interaction targets.
- Save sends the trimmed string; Clear sends `null`; cancel closes without a request. Disable duplicate submits while pending and preserve the user's text on failure.
- Optimistic behavior: cancel the affected day query before mutation, snapshot the prior day data, update the note locally, roll back on error, and invalidate/refetch all affected day, daily-summary, week-summary/history, and logging-context queries. Invalidate broader dashboard/macro/adaptive/data-quality keys only if repository inspection shows those views actually consume the note; do not add speculative global invalidation.
- Preserve meal counts, meal cards, macro rings, completeness/status control, loading/error/empty states, and existing keyboard navigation in the week strip.

## Required implementation and test surface after launch

### Shared/API contract

- Add request schema/type for the explicit string/null/omitted semantics and response fields only where required.
- Add/update OpenAPI route schemas and generated contract coverage.
- Add store operation with a transaction, owner/date predicate, create-if-needed behavior, clear semantics, and deterministic returned row/read model.
- Add route tests for JWT and AgentToken auth, validation, string replacement, trimming/internal whitespace, max length, whitespace-only rejection, null clearing, omitted preservation, empty-day creation/clear, historical dates, and foreign-user isolation.

### Integration/hostile fixtures

Use isolated temporary SQLite databases and fictional users only. Cover:

- note before meals, note after meals, replace, clear, omitted no-op, and repeated idempotent writes;
- empty day, historical day, same date for two users, malformed/future date according to existing date policy;
- exact before/after meal counts, macro totals, status/completeness, targets/protein-floor facts, food counts/timestamps, and adaptive-learning inputs;
- AgentToken/Bearer parity and unauthorized/foreign access rejection;
- response consistency across daily detail, summary, context, and week/history indicator;
- transaction rollback on an injected persistence failure, with no partial log or note write.

### UI tests and browser acceptance

- Add focused component/API tests for add/edit/save/clear/cancel, optimistic rollback, pending/error states, empty and historical days, note indicator, safe multiline rendering, mobile-sized layout, keyboard operation, labels/focus, and accessible status/error messaging.
- After implementation, the parent must grant the serialized heavy final-verification/browser slot. The executor uses the built-in browser first against an isolated local fixture/app, with realistic populated and empty historical days. Capture literal API/DB readbacks and screenshots as evidence; verify no page errors, safe rendering, persistence after reload, clear/readback, auth isolation, and unchanged food counts/learning facts. Do not use production, Foundry, or personal data.
- Focused tests are allowed during implementation; do not add global lock machinery or touch the parallel #139 lane.

## Acceptance matrix

1. Existing `nutrition_logs.notes` is reused; no unnecessary migration.
2. Authenticated PATCH supports string create/replace, `null` clear, and omitted unchanged with explicit validation semantics.
3. Empty and historical days can be written and read without requiring meals.
4. User/date isolation is proven for both supported auth modes.
5. Daily detail, daily summary, logging context, and week/history indicator expose consistent note state.
6. UI supports add/edit/save/clear/cancel, pending/error/rollback, empty/historical days, mobile keyboard, a11y, and safe multiline rendering.
7. Daily/week/context query caches are updated/invalidate correctly; stale optimistic data cannot survive an error.
8. Meal counts, food usage counts/recency, macro/target/status facts, and adaptive nutrition learning semantics remain byte/invariant-equivalent before and after note-only writes.
9. Isolated API/DB fixtures and built-in-browser evidence pass; no production/env/Foundry/launch action occurs in this lane.
10. Final executor commit is implementation-only after the docs handoff; parent independently verifies the exact final SHA, full gate, browser evidence, clean status, and archive/PR boundaries.

## Consequential ambiguity to report

- The issue says “calendar/history views” but the current nutrition page exposes the seven-day `NutritionWeekStrip`, not a separate nutrition calendar route. This contract treats that existing strip as the required indicator surface and forbids invented expansion. Parent approval is required if inspection reveals a separate in-scope nutrition calendar that must also change.
- The prompt phrase “preserve food counts147? preserve156 integrity” is ambiguous. Verified live context shows issue #147 is the TDEE-learning contract and merged PR #156 is food-usage integrity, while the approved base is the PR #156 merge SHA. This contract preserves both: note writes cannot change adaptive/TDEE learning semantics or food usage integrity. Do not infer another issue or broaden scope without parent direction.
- The exact serialized final-verification/browser slot remains a parent-owned gate; this preparation does not grant it.

## Prohibited actions and handoff

No Codex UI launch before parent PR #156 archive verification; no implementation/UI/production/env/Foundry changes in this preparation commit; no deployment, merge, production DB access, canonical repair/backfill, external contact, or global lock machinery. Parent owns launch authorization, serialized heavy final verification, independent acceptance, PR/archive lifecycle, and final report.
