# Pulse Body Progress UI — Issue #124 implementation contract

Status: frozen implementation handoff regenerated from live #124, #120, and merged backend completion #169. This document supersedes the historical reduced handoff at f24b700; that old worktree remains untouched and must not be launched.

## Base and boundaries

Implement on a clean branch from current `origin/main` (backend #169 already merged). Consume the existing shared/server contracts; do not duplicate backend algorithms or add migrations/API routes. UI only: `/body`, detail/edit flow, setup/preferences, guided check-in, history/corrections, Profile/Dashboard/Settings entry points, query invalidation, and maintainable protocol media assets. Do not touch production, live DBs, deployment, backfill, Foundry, photos/trends/analytics (#122/#123/#125), push/email/SMS, body-fat estimation, or global navigation redesign. `/weight` stays unchanged.

## Authoritative contracts to read before coding

Read live issue bodies #120, #124, #169 and source files before editing. Inspect `packages/shared/src/schemas/body-check-ins.ts`, `body-measurements.ts`, `body-reading-quality.ts`, `apps/api/src/db/schema/body-check-ins.ts`, `apps/api/src/routes/body-check-ins/{index,store}.ts`, body-measurements compatibility routes, OpenAPI generation, timezone authority, Profile, Dashboard, Settings, Weight, Adaptive due-state, query invalidation, form/dialog, and existing Playwright patterns. Server is authoritative for canonical values, quality, due state, dates, versions, corrections, ownership, and AgentToken/JWT response shape. UI previews are never final facts.

Historical `body_measurements` scalar rows must remain compatible and must not be presented as if they have repeated readings/protocol provenance. No invented dates, protocol versions, or browser timezone authority.

## User experience acceptance

### Setup and preferences

First visit to `/body` explains what circumference measurements can/cannot show; labels 14-day cadence as a product default, not a medical standard; offers 7/14/28/custom 7–90 days; default sites are NHANES iliac-crest waist, chest, hips, right flexed upper arm, right mid-thigh; arm/thigh laterality is configurable; length unit is independently `in|cm`; shows cadence anchor, server-resolved local date/time authority, optional in-app reminder time; explains extra logs do not silently reset cadence. Persist through #169 preference API, survive reload/device change, and never use durable local-only state.

### Guided check-in

For every enabled site render exact protocol identifier/name, anatomical landmark, actual shipped static diagram and short animation/video equivalent (real maintainable SVG/CSS animation or equivalent text; no placeholder, fake thumbnail, or omitted media), concise repeat-every-time cues, reading 1 and 2, and explicit units beside every value. Reading 3 is automatically requested when the first two differ by >1.0 cm and focus moves to it. Preserve all raw readings. Show local date/time and context: pre/post meal, pre/post workout, pump, unusual bloating, notes; protocol version is available in help/detail. Support save draft, resume draft cross-device, complete, safe cancel, and omit optional sites. Waist is recommended, not coercively required; explain limitation if absent.

### Quality

Two readings within 1.0 cm: server canonical average and `replicated` quality in plain language. Over 1.0 cm: third-reading prompt and draft remains saveable. Three readings: server canonical mean of closest two, retain all values, high-variance warning if span >2.0 cm without deleting values. Single-reading completion remains possible and visibly lower confidence. Equal closest-pair behavior must follow the server/shared contract (earliest pair in reading order); UI must not reimplement or contradict it. Never shame/fail users for variance.

### Due and actions

Consume one server due-state source across `/body`, Profile, Dashboard. Render not-configured, upcoming, due-today, overdue, snoozed, skipped-current-occurrence, satisfied, and error states with text, not color alone. Skip dismisses only current anchored occurrence; snooze chooses a local date and leaves future cadence unchanged; extra log asks whether it counts as scheduled occurrence when relevant. No streak/shame/notification-delivery claims. Duplicate-date 409 must preserve/offer navigation to existing check-in rather than lose input.

### History and corrections

`/body` shows latest completed summary, next due/state, chronological history, draft/complete/quality badges, detail with raw readings/canonical/context/protocol/correction timestamp, edit/correct, delete, resume draft, accessible exact-value table, and empty/partial/loading/error/retry states. Do not build analytics/recomp charts; basic per-site history is enough. Corrections/deletions invalidate all affected views and preserve exact server version/CAS behavior.

### Integration and accessibility

Canonical `/body`; detail route or deep-linkable modal chosen to match current conventions. Add Profile quick access, compact Dashboard due card/badge following existing Adaptive Nutrition patterns, and Settings link without bloating Settings. Update `apps/web/src/lib/query-invalidation.ts` for Body/Profile/Dashboard/context consumers. Keep `/weight` and existing behavior unchanged. Every value shows unit; decimal mobile input modes; error summary links/focuses invalid fields; dialogs/sheets trap/restore focus; focus reading 3 predictably; tables avoid viewport overflow; skeletons avoid large shift; protocol media has equivalent text.

## Verification gates

Focused component/API integration tests must cover setup/preferences, every due state, draft/resume/complete/cancel/omit, two/three/single quality, no-waist, high variance, duplicate-date 409, corrections/delete, AgentToken-created history, loading/partial/error/retry, cache invalidation, and regression entry points. Use realistic populated fixtures, not only empty mocks.

Run one final uncached risk-relevant gate after repairs: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and relevant Playwright/browser checks. Browser acceptance must use actual running app and source-bound fixtures at widths 320, 390, 430, 768, 1280: inspect no overflow, 44px hit areas, keyboard focus/order, reduced-motion behavior, console errors, failed network requests, and raw screenshots at each width. Verify screenshot manifest paths and bind evidence to exact HEAD/config/lockfiles/fixtures. Do not claim completion from generated screenshots or test text alone.

## Side-effect and report contract

Do not deploy, touch production/live DB, backfill, merge, publish externally, or implement #122/#123/#125. Commit one coherent Conventional Commit, push branch, and create a draft PR linked to #124 only when the work is verified. Return exact branch/HEAD/clean status, changed files/assets, focused and final command results, browser widths/evidence manifest, blockers, and explicit prohibited-actions confirmation. Stop ready for review.
