# Body Check-In Backend Completion Bridge

Status: documentation-only pre-launch handoff. No implementation, server launch, migration execution against live data, deployment, merge, PR, UI, media, analytics, or photo work is authorized here.

## Purpose and dependency graph

Complete the backend capability required by #124, correcting the gap between the live #121 implementation and the full #120/#121/#124 contract. This follow-up is linked to #120 (parent), #121 (closed predecessor), and #124 (web consumer). Do not close #121 or reopen it; this issue records residual obligations and supersedes the reduced historical handoff as the implementation contract.

Base: `main` at `7e64f6782fc27f504bcf06c9dfd4b9547ca78ea0`, verified against `origin/main` before authoring. Implement later only from a clean branch based on current main, after explicit authorization to prepare a backend-completion PR. Runtime preference if launched later: primary GPT-5.6 Sol, medium, Fast OFF; internal/review GPT-5.6 Luna, medium, Fast OFF. These are launcher settings, not acceptance gates.

## Live source inventory and actual gap

Read before coding:

- Live issues: [#120](https://github.com/derekbeau/pulse-fitness-app/issues/120), [#121](https://github.com/derekbeau/pulse-fitness-app/issues/121), [#124](https://github.com/derekbeau/pulse-fitness-app/issues/124).
- Current shared contract: `packages/shared/src/schemas/body-measurements.ts` and `packages/shared/src/utils/circumference-unit.ts`.
- Current persistence: `apps/api/src/db/schema/body-measurements.ts`, `apps/api/drizzle/0065_body_measurements.sql`.
- Current store/routes: `apps/api/src/routes/body-measurements/store.ts`, `index.ts`; registration `apps/api/src/index.ts`; integration tests and OpenAPI assertions colocated there.
- Current merged commit: `7e64f67` (`feat(api): add body measurement storage and CRUD (#168)`).
- Historical frozen reduced spec: `c3f17de:docs/implementation/body-measurements-goal.md` and live #121 body. Treat it as evidence, not authority where it conflicts with the live full issue bodies.

Actual #121 code is a single `body_measurements` row per user/local date with scalar nullable fields (`waistMm`, `hipsMm`, `chestMm`, `neckMm`, left/right arm/thigh), optional user-reported `bodyFatPercent`, one `unitAtEntry`, notes, timestamps, unique `(userId,date)`, and JWT/AgentToken CRUD. It performs same-date merge/upsert, null clearing, omitted-field preservation, 20–300 cm bounds via 200–3000 mm, future-date rejection, timezone-aware relative ranges, owner scoping, cascade deletion, and canonical conversion. It does **not** provide preferences, check-in status/draft/completion, protocol/site metadata, repeated raw readings, canonical quality, due/skip/snooze, context, correction provenance, context facts, export/privacy integration, idempotency/concurrency guarantees, or future-compatible versioning.

Do not pretend old rows contain replicates or protocol provenance. Preserve them as historical scalar facts with nullable metadata/default interpretation that is explicitly non-invented; no lossy migration and no fabricated historical protocol/readings.

## Required completion contract

### Domain model and protocol

Add a strict shared/server contract for separate check-ins and measurements while preserving existing measurement CRUD clients and routes during a compatibility transition. Same-date behavior remains transactional merge; omitted fields preserve, explicit null clears only the named field, and existing clients continue to work. New repeat readings are distinct persisted data and must never be represented as if the old canonical row had replicates.

Canonical enabled sites and exact names/protocol identifiers:

- `waist_iliac_crest_nhanes`: **NHANES iliac-crest waist**, standing, feet together, abdomen relaxed, arms at sides, end of normal expiration, tape horizontal immediately above the right iliac crest and parallel to floor. It is not narrowest waist, midpoint, or umbilicus.
- `chest_nipple_line_relaxed`: standing relaxed, tape horizontal at nipple line, arms relaxed after positioning, normal expiration, no deliberate expansion.
- `hips_maximum`: feet together, tape horizontal at maximum buttocks circumference.
- `upper_arm_midpoint_flexed`: midpoint between acromion and olecranon, selected side, flexed consistently.
- `thigh_midpoint`: selected side at the fixed midpoint protocol documented in the UI, standing with weight distributed consistently.

Use versioned protocol identifiers and preserve historical labels/instructions. Verify the CDC NHANES source and PhenX NHANES waist source linked in live #121/#124; do not substitute WHO midpoint or narrowest-waist instructions. Exact other-site protocols must be checked against the live issue and cited sources before implementation, not invented from names.

Length vocabulary is independently configurable `in|cm` (not coupled to weight system), with canonical cm/mm as the established storage convention and no lossy historical conversion. Enabled sites and laterality are typed strict preference state; arms/thighs require `left|right`, waist/chest/hips use `none`.

### Preferences, schedule, and due state

Create explicit preference persistence (not opaque `users.preferences`) with measurement cadence default 14 days, presets 7/14/28, custom 7–90, enabled sites/laterality, independent length unit, anchor date, optional reminder local time, snooze/skip state, timestamps, and protocol version context. Reminder time is an in-app scheduling hint only: not push/email/SMS, not a date authority, and not a competing clock.

Server due state is local-date based and uses shared authority: effective Adaptive Nutrition program timezone > persisted profile timezone; unresolved live authority fails closed with `TIME_ZONE_REQUIRED`; browser timezone never overrides. Anchor formula is `anchorDate + n*cadenceDays`. Completing inside the current occurrence satisfies it. Extra check-ins remain distinct; they do not reset the anchor unless explicit `countAsScheduledOccurrence: true`. Skip dismisses one occurrence and advances visibility to the next anchored occurrence. Snooze delays only the current prompt and never resets the anchor. Preserve explicit due states including not-configured, upcoming, due-today, overdue, snoozed, skipped-current-occurrence, satisfied, and error. Cadence changes must explicitly preserve anchor or restart from a selected date; never guess.

### Drafts, completion, readings, quality

Persist draft and completed check-ins, resumable cross-device, with local date/time, context (meal, workout, pump, bloating, notes), protocol versions, completion/provenance timestamps, and omitted optional sites. A single-reading completion is allowed but lower quality. Two readings within 1.0 cm use the average and replicated quality. Two readings over 1.0 cm require/promote a third, while draft save remains possible. Three readings use the closest two and preserve all raw values; span over 2.0 cm is high variance and still saveable. Quality is server-canonical and response-structured; clients may preview only.

**One consequential unresolved decision to approve before implementation:** if closest pairs are exactly tied, choose the earliest pair in reading order `(reading1,reading2)`, then `(reading1,reading3)`, then `(reading2,reading3)`; recommendation: this is deterministic, explainable, and preserves the first two readings as the stable tie outcome. Do not silently invent a different tie policy. Existing 20 cm minimum/300 cm maximum bounds are source bounds; assess compatibility with the new per-site/repeated-reading model only where required, without arbitrary new scope.

### API/context/safety

Add preferences, check-in CRUD/status/correction/delete, readings, due skip/snooze, and concise `/api/v1/context/` body facts needed by #124. Keep JWT and `AgentToken` identical in validation, ownership, response shape, and user scoping; AgentToken may receive concise hints, never bypass authorization. Require owner identity, JWT/AgentToken auth, cross-user isolation, concurrency-safe transactional writes, idempotency for retries, duplicate/same-date semantics, deletion cascade, and export/privacy compatibility. Corrections/deletions must recompute affected future analytics/context facts without building analytics here. Version response contracts for future compatibility; never make UI parse prose.

No body-fat derivation, trends, coaching, weight smoothing, photos/media, upload, analytics, chart, UI route, dashboard/profile/settings work, push delivery, production migration/backfill, deployment, or existing-history protocol invention. Whole Body Progress remains on production hold.

## Implementation/verification contract for the future agent

Use one isolated backend lane; no simultaneous editor and no changes to `/Users/meridian/Projects/pulse-body-progress-ui`. Start with focused synthetic migration tests (fresh and populated legacy DB), rollback/removal documentation, raw-reading/quality tests including equal closest pairs, preference/due tests, draft/resume/completion tests, auth/ownership/concurrency/idempotency/deletion/export/privacy/context tests, and compatibility tests for existing CRUD clients (same-date merge, null omission, unit conversion). Then run one uncached full gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` plus relevant API/OpenAPI checks. Capture the first-run raw receipt, exact clean SHA, source/config/dependency lock identity, and test bindings; do not claim browser/UI acceptance. Do not launch, deploy, backfill, merge, or publish a PR unless separately authorized.

Future #124 must regenerate its implementation contract from the live #124 body and this completed backend issue, not the historical reduced #121 contract. Exact protocol names are mandatory. Static landmark diagrams and short animation/video with equivalent text are mandatory in #124, not optional; media implementation remains out of scope here.

## Handoff state

The existing worktree `/Users/meridian/Projects/pulse-body-progress-ui` at `f24b70033dd18c343db0e83c440f4a40047687b4` is **SUPERSEDED/BLOCKED** for launch by this backend-completion bridge. This is an external coordination note only: do not edit, delete, reset, or launch it. The next launcher must refuse the reduced #124 contract and require this live-issue-derived bridge.

No product decision remains except the single equal-closest-pairs policy above; implementation requires explicit user authorization. Paste-ready future prompt: “Read live #120/#121/#124 and `docs/implementation/body-check-in-foundation-goal.md` at the exact base SHA. Implement only the backend completion bridge on an isolated branch. Preserve existing CRUD compatibility and historical scalar facts; add strict preferences, check-ins, repeated readings, server quality, due states, context, and safety contracts. Resolve the documented equal-pair decision exactly as approved. Run the required synthetic migration/API/compatibility tests and uncached full gates. Do not touch UI/media/analytics/photos, production, deployment, backfill, merge, or PR publication. Return exact SHA and raw receipts.”

Sources (verify live issue support before coding): CDC NHANES Anthropometry Manual https://wwwn.cdc.gov/nchs/data/nhanes/public/2021/manuals/2021-Anthropometry-Procedures-Manual-508.pdf; PhenX NHANES waist protocol https://www.phenxtoolkit.org/protocols/view/21604; WHO STEPS https://cdn.who.int/media/docs/default-source/ncds/ncd-surveillance/steps/part3-section5.pdf?sfvrsn=a46653c7_2; measurement error https://pmc.ncbi.nlm.nih.gov/articles/PMC10271771; self-measurement reliability https://pmc.ncbi.nlm.nih.gov/articles/PMC4855335.
