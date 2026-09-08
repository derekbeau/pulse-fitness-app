# Pulse #150 — frozen workout feedback questions and revisioned answers

**Frozen execution contract**

- Issue: [#150](https://github.com/derekbeau/pulse-fitness-app/issues/150)
- Parent/foundation: [#148](https://github.com/derekbeau/pulse-fitness-app/issues/148)
- Merged dependency: [#149](https://github.com/derekbeau/pulse-fitness-app/issues/149), including the provenance correction merged by [PR #162](https://github.com/derekbeau/pulse-fitness-app/pull/162)
- Downstream consumer work: [#151](https://github.com/derekbeau/pulse-fitness-app/issues/151)
- Required starting SHA: `6326bd7b81219a4cf4d7b2e819e09369bf4a3946`
- Required worktree: `/Users/meridian/Projects/pulse-workout-feedback-questions`
- Required branch: `feat/workout-feedback-questions`
- One implementation editor only. Preserve the original `/Users/meridian/Projects/pulse-fitness-app` worktree and its 25 pre-existing untracked entries.

## Goal

Let an authenticated agent configure a small set of genuinely workout-specific feedback questions, freeze the exact definitions through template → scheduled workout → started session, collect native answers in the existing completion experience, and preserve every accepted draft/edit/correction as an owner-scoped revision.

This is not a canned-question-only feature. The shared contract must support authored prompts and the existing supported answer types. It must not create a second feedback/form engine, turn text into scores, infer medical meaning, or pre-implement the longitudinal planning system in #151.

## Verified baseline at the starting SHA

Read `AGENTS.md` and re-check these files before editing. The paths and behavior below were inspected on the required base; if source has changed, stop and report the consequential conflict rather than silently changing the contract.

- `packages/shared/src/schemas/feedback-provenance.ts` defines native response types (`scale`, `slider`, `text`, `yes_no`, `emoji`, `multi_select`), exact labels/values/notes, `answered|unanswered|skipped|unknown`, and provenance-safe schema version 2. A native response ID/label is bounded to 255 characters, response text/notes to 4,000, arrays to 20, and false/zero are preserved.
- `packages/shared/src/schemas/workout-templates.ts`, `scheduled-workouts.ts`, and `workout-sessions.ts` do not yet expose authored/frozen question definitions. Template/scheduled/session long text uses 4,000 characters and short labels/identifiers use 255.
- `apps/web/src/features/workouts/components/session-feedback.tsx` is the existing renderer/form engine. It already renders all six supported input types, merges standard and custom fields, persists a local draft by session key, exposes explicit skip, preserves false, and conditionally shows pain details. Its current standard core is RPE, energy, and pain.
- `apps/web/src/pages/active-workout.tsx` currently always passes mock `workoutFeedbackFields`, maps native responses into provenance-safe feedback, and attaches feedback at completion. `use-complete-session.ts` persists completion through the existing session update route.
- `POST /api/v1/workout-sessions` has mutually exclusive scheduled, template, and ad-hoc start modes. Scheduled starts read the scheduled exercise snapshot; template starts read the live template. The two scheduled UI entry surfaces are `workout-list.tsx` and `scheduled-workout-detail.tsx`, both posting `scheduledWorkoutId` through `use-workout-session.ts`.
- `apps/api/src/routes/scheduled-workouts/snapshot-store.ts` hashes/copies exercise definitions into scheduled snapshot rows. `apps/api/src/routes/workout-sessions/index.ts` then copies scheduled snapshot facts into the session. Question definitions must join both copy boundaries; a template link alone is insufficient.
- `workout_sessions.feedback` remains JSON parsed/serialized by `apps/api/src/db/schema/workout-session-feedback.ts`. #149/PR #162 established provenance-safe native responses and submission audit. Extend that model; do not bypass, replace, or weaken it.
- Unified routes use `requireAuth`: Bearer JWT and `AgentToken <token>` resolve to one owner ID. `templateName` is only an AgentToken convenience. All new reads/writes must retain this owner boundary and explicit actor provenance.
- Completed set corrections currently use `PATCH /api/v1/workout-sessions/:id/corrections`; they are set-only today. Extend the established correction surface or a tightly related session feedback surface rather than creating a competing completed-session model.
- `/api/v1/context/` currently returns recent workout identity/exercise counts but no feedback. Rich longitudinal retrieval, stale/open-concern interpretation, suppression recommendations, and automatic future-note disposition belong to #151.

## Frozen product decisions

### Standard core

Every newly started session freezes these system definitions, in this order:

1. `session-rpe`: **Session RPE**, scale 1–10, explicit skip allowed.
2. `pain-discomfort`: **Any pain or discomfort?**, yes/no, explicit skip allowed. If yes, optional details are first-class notes on that native answer; details may be saved, resumed, or explicitly omitted without losing `true`.
3. `session-context`: **Anything that affected this session?**, optional free text.

The old universal energy control is no longer a mandatory system-core question. Existing explicit energy, shoulder, or other custom questions must survive through compatible template question definitions and remain readable in historical records; do not silently erase them. There are no universal recovery or technique ratings.

Core definitions do not consume the additional-question budget. They cannot be deleted, relabeled, or used to submit another construct. An agent may author real dynamic additional prompts; the feature is not limited to a fixed catalog.

### Additional questions and timing

- New template defaults and scheduled overrides allow **0–3 additional questions**. Prefer two as authoring guidance, but two is not a validation requirement.
- Reject a fourth additional question atomically with an actionable 400 validation error. Historical/imported forms with more than three remain readable and editable only under the compatibility policy below; never truncate them.
- Supported answer types are exactly the six already handled by `SessionFeedback`: `scale`, `slider`, `text`, `yes_no`, `emoji`, and `multi_select`.
- Timing is exactly `post_session` or `next_check_in`.
  - `post_session` questions render in the completion form.
  - `next_check_in` definitions are frozen and readable through detail/API responses but do **not** render as if answerable immediately after the workout. #150 adds no notification, scheduler, reminder, or automatic next-morning answer. A later authenticated API/UI flow may append a native response against that frozen definition; if no such explicit flow is implemented in this PR, it remains `unanswered` and the limitation must be documented honestly.
- Do not ask for reps, set RPE/RIR, or other facts already captured by workout logging.

### Question definition envelope

Use one shared Zod contract, exported from `@pulse/shared`, for system and authored definitions. Each frozen definition includes:

- stable opaque `id` (1–255 characters) and positive integer `version`;
- exact `prompt` (trimmed, 1–255 characters);
- `type`, `optional`, and `timing`;
- type-specific configuration:
  - `scale`: safe integer `min`, `max`, optional safe positive integer `step`, and optional exact endpoint/point anchors; the inclusive discrete choice count after applying step must be 2–10 so the existing button UI remains bounded;
  - `slider`: finite `min`, `max`, and finite positive `step`, with `min < max` and no more than 1,000 representable increments; endpoint anchors optional;
  - `emoji` and `multi_select`: 2–20 unique exact options, each trimmed to 1–255 characters;
  - `text` and `yes_no`: reject irrelevant bounds/options;
- immutable author/source metadata: `sourceKind` (`system|user|agent_token|legacy_import`), nullable actor ID/name snapshot as applicable, and authored timestamp;
- optional typed references: `exerciseIdSnapshot` plus exact exercise-name snapshot, `bodyRegion`, `laterality` (`left|right|bilateral|midline|unspecified`), opaque `concernRef`, and a short non-diagnostic context label;
- revision metadata sufficient to identify the prior definition/version without editing old wording in place.

These limits are storage/UI safety constraints, not medical thresholds. The 255/4,000/20 limits follow existing shared feedback/schema bounds. The scale choice cap follows the existing 1–10 RPE renderer. The slider increment cap is only a denial-of-service/rendering guard; do not assign medical meaning to any numeric boundary.

### Answer envelope and validation

A response references the frozen question ID **and exact definition version** and preserves:

- native value in its original type;
- optional notes (maximum 4,000 characters);
- exactly one state: `answered|skipped|unanswered|unknown`;
- answer timestamp and question timing;
- response ID, monotonically increasing positive revision, prior revision link, and immutable respondent/source provenance (`user|agent_token|other|unknown`, with evidenced actor ID when available);
- the frozen exercise/body-region/laterality/concern context needed to understand the historical answer even if a live exercise is deleted or swapped.

Server validation is authoritative and validates every answered value against the referenced frozen definition:

- false and numeric zero are legitimate answered values where the definition permits them;
- value must be absent for skipped/unanswered/unknown; value must be present for answered except text may be the exact empty string only for legacy reads, not new writes;
- numeric value must satisfy min/max/step; selections must be members of the frozen options; multi-select values are unique and cannot combine `None` with any symptom option when a definition marks `None` as the exclusive option;
- pain `true` never requires details, and missing details never changes it to false/unknown;
- unknown/skipped/not-tested never means symptom-free or resolved;
- never derive recovery, technique, readiness, diagnosis, clearance, or another score from an answer or from omission.

### Template → scheduled → session freezing

Use immutable definition revisions with current projections; do not overwrite a definition row/blob referenced by scheduled or past sessions.

- **Template defaults:** create/update operations accept an explicit `feedbackQuestions` list of additional question definitions. Omitted means preserve current values on PATCH; explicit `[]` means no additional template defaults. Creating or editing a definition creates a new version and current projection.
- **Schedule creation:** transactionally copy the template's then-current additional definitions into the scheduled snapshot. Store the exact definitions and versions, not just template IDs. Template edits after scheduling cannot change them.
- **Scheduled override:** the scheduled mutation surface accepts an explicit replacement list and records `questionsSource=scheduled_override`; explicit `[]` is a real override and must not fall back to template defaults. If no override has ever been supplied, the scheduled snapshot remains the copied template default (`questionsSource=template_snapshot`). Editing a scheduled override creates new immutable versions/revisions; it cannot mutate an already started session.
- **Session start:** transactionally freeze the three system-core definitions plus the exact applicable additional list into the new session. A scheduled start uses its scheduled snapshot/override; a direct template start snapshots the template's current defaults; an ad-hoc start gets the core and may use explicitly supplied valid additional definitions only if the existing authenticated create contract is extended for that purpose.
- Both scheduled UI start surfaces—scheduled card/list and scheduled detail—must produce identical exact question versions/wording/metadata. Start/retry/force handling must not duplicate definitions.
- Template deletion, exercise deletion/swap, later template/schedule edits, or display-name changes cannot alter the session snapshot or historical response context.

### Revisions, drafts, pause/resume, and conflict behavior

- Every accepted template/scheduled definition edit, in-progress answer draft write, and completed answer correction is revisioned with actor/source/timestamp and immutable prior state. Historical prompt wording and prior native answers are never edited in place.
- Add an explicit optimistic token (`expectedRevision`) to question-list and answer mutation payloads. Compare and increment in the same transaction. A stale writer returns HTTP 409 with code `WORKOUT_FEEDBACK_REVISION_CONFLICT`, current revision, and no partial mutation. Do not use last-write-wins.
- In-progress response drafts are server-durable through an existing session-owned mutation path. Keep local storage as a resilience layer, not the source of truth. Hydration merges only responses matching the same session/question/version and must not overwrite a newer server revision.
- Drafts and explicit skips survive section pause/resume, session pause/resume, reload, failed save, and retry. A failed save leaves the visible draft and prior server revision intact.
- Session completion can occur with RPE/pain explicitly skipped and optional context unanswered. Do not fabricate required values.
- Completed-session correction appends a new answer revision and updates only the current projection. It must not change sets, native set RPE/RIR, timing, completion state/time, programming notes, or prior response revisions. Existing set correction behavior remains intact.

### Closed-loop synthetic acceptance case

Use fictional data only. A scheduled tib-bar session has a one-off additional `multi_select` question:

> Any toe pain during ordinary walking, tib-bar setup, or today's raises?

Options: `None`, `During walking`, `During setup or raises`; `None` is exclusive. Optional details, `post_session` timing, an exercise snapshot, body region/laterality, and an opaque source concern reference are frozen with it.

Prove:

- one or multiple symptom locations/stages can be selected, but `None` plus a symptom is rejected;
- not-tested is represented by skipped/unanswered/unknown, never by `None`;
- completed sets do not imply symptom-free and skipped sets do not imply pain;
- the exact answer, date, timing, scope, provenance, and source reference remain readable after exercise/template edits;
- this one-off scheduled override does not automatically appear on the next workout. Only an intentional template default recurs. #150 does not implement automatic recurrence, conflict/exposure interpretation, concern resolution, future note rewriting, or medical clearance; #151 may use the exact evidence later to propose a targeted follow-up.

## Compatibility policy

- New writes use the new definition/response revision contract.
- Preserve #149's schema version 2 provenance semantics and native response fields. Do not renumber/reinterpret them merely to add question-definition linkage.
- Existing legacy feedback blobs/forms—including more than three custom questions, old labels, energy controls, out-of-new-authoring-limit option text, false/zero values, and absent definition links—remain readable exactly. Classify absent linkage as legacy/unknown; do not fabricate a question version or actor.
- A compatibility adapter may display legacy responses in the existing history UI, but new edits to legacy records append a correction revision and preserve the original blob/audit evidence. Do not normalize historical prompt text/options in place.
- No automatic text interpretation, sentiment conversion, score generation, diagnosis, clearance, or coach-note rewrite.

## Source-grounded consumer inventory (complete before implementation)

This inventory is frozen preparation evidence. Before editing source, the executor must re-run repository searches and add any missed current consumer; do not use this list as an artificial gate for impossible future #151 consumers.

| Surface | Current source behavior | Required #150 action |
|---|---|---|
| Shared exports and OpenAPI | `workout-templates.ts`, `scheduled-workouts.ts`, `workout-sessions.ts`, `feedback-provenance.ts`, `packages/shared/src/index.ts`; route schemas generate OpenAPI | Add/export definition, snapshot, response-revision and mutation schemas; assert concrete limits and response shapes in schema/OpenAPI tests. |
| Template persistence/API | template DB schema/store and `routes/workout-templates/index.ts`; unified auth and AgentToken transforms | Persist current immutable question-definition projection/revisions; accept/return template defaults on create/get/list/update without losing omitted fields. |
| Scheduled snapshot persistence/API | scheduled workout/exercise/set schemas, `snapshot-store.ts`, backfill, scheduled store/routes | Snapshot template defaults, expose exact definitions, add explicit scheduled override + expected revision, preserve owner scoping and explicit empty override. |
| Session persistence/API | `workout_sessions.feedback` JSON parser/serializer, session schema/store/routes, submission audit | Freeze definitions at all start modes, save server-durable drafts, append response revisions/corrections, validate against frozen definitions, return exact current + history where authorized. |
| Scheduled start surfaces | `workout-list.tsx`, `scheduled-workout-detail.tsx`, `scheduled-start.ts`, `use-workout-session.ts`, existing `scheduled-start-surfaces.test.tsx` | Prove list and detail starts consume the scheduled snapshot exactly; retry/force remains idempotent. |
| Direct template/ad-hoc start | `template-detail.tsx`, `session-detail.tsx` repeat flow, session POST route | Freeze current template defaults for direct template starts; retain safe core for ad-hoc; never read later template edits for an active session. |
| Completion form | `session-feedback.tsx`, `active-workout.tsx`, workout types/mock data, `use-complete-session.ts` | Reuse renderer, drive it from session-frozen definitions, render only post-session timing, conditional pain details, explicit states, server draft persistence and exact validation errors. Remove production reliance on mock fields. |
| Completed detail/correction | `session-detail.tsx`, workout API hooks, `/corrections`, feedback audit | Render exact question/version/native state/provenance, permit answer correction with immutable revision history, and preserve set correction behavior. |
| History/comparison | session list/detail/comparison components and tests | Keep exact current answer/history readable; do not collapse unknown/skipped/false/zero or infer a score. No new aggregate interpretation. |
| Provenance/actionability | #149 classifier, parser, audit tables/middleware, feedback audit UI | Preserve source attribution and audit links; definition metadata complements rather than replaces #149 provenance. |
| Progression | `routes/workout-progression/store.ts` reads actionable technique and selected pain IDs | Ensure dynamic data cannot bypass native validation or become an automatic score. Existing source-linked behavior remains regression-tested; no new medical thresholds. |
| Adaptive nutrition | `routes/adaptive-nutrition/review-store.ts` parses feedback/native responses | Preserve #149 exclusion of unsupported scores and exact response semantics; dynamic questions do not become readiness/recovery inputs automatically. |
| Agent context | `/api/v1/context/`, `routes/agent/context-store.ts`, shared agent schema | #150 need only return exact questions/answers through workout/scheduled/template detail APIs. Rich longitudinal context/search/deduplication is explicitly #151; do not claim it here. |
| Auth/privacy | `middleware/auth.ts`, route `requireAuth`, AgentToken enrichment/transform, owner-filtered stores | JWT and AgentToken see only their owner; actor provenance is explicit; raw private text is absent from generic logs/enrichment. Cross-owner references fail closed. |
| Cache/optimistic UI | TanStack workout keys, session cache sync, optimistic helpers, invalidation map | On successful revisions update/invalidate exact template/schedule/session/detail/history keys; on 409 or network failure retain visible drafts and roll back only optimistic cache state. |
| Migration/fixtures | Drizzle journal currently ends at `0061_feedback_provenance_audit.sql`; schema/migration/backfill tests and synthetic feedback scripts | Add stage-aware current schema migration/fixtures without changing frozen #149 migration SQL or historical expected schema. Rehearse predecessor→current and fresh current installs on synthetic copies. |
| E2E/browser | workout session/scheduling/provenance Playwright coverage | Add populated end-to-end author→schedule override→both starts→draft/reload→complete→correct→history evidence, plus hostile cases and raw API readbacks. |

## Persistence and migration safety

Choose normalized immutable revision tables/current projections or an equivalently auditable design; do not bury all definition/version/history semantics in a mutable untyped blob. Exact names are implementation-owned, but the schema must enforce owner links, question/version identity, response revision order, and one current projection per scope.

- Create a new migration after 0061. Never edit `0061_feedback_provenance_audit.sql`, its metadata, or #149's historical schema expectations.
- Stage-aware tests must construct an exact through-0061 predecessor from the journal, apply only the new migration(s), and separately install the full current journal on an empty database. New current-schema reference checks must not be evaluated against the predecessor before their migration runs.
- Use synthetic fixtures covering a #149 schema-v2 record, legacy feedback, template defaults, scheduled override, started session, and completed correction. Preserve exact old raw JSON and audit rows.
- Prove transaction rollback by injecting a failure after partial synthetic work and verifying no new rows/projections/revision increments remain. Reapplying migration/setup is idempotent.
- SQLite downgrade is restore-based: retain an untouched synthetic pre-migration copy, document how the test restores it, and compare integrity/counts. Do not invent a destructive production down migration.
- No production migration, production database access, live backup, live data write, or environment change is authorized.

## Required tests and hostile cases

At minimum cover:

- duplicate question IDs, duplicate options, invalid type/config combinations, invalid bounds/step/anchors, overlong ID/prompt/answer/notes/option, >20 options, >3 new additional questions, and historical over-budget reads;
- false and zero as answered values; null/absent/unanswered/skipped/unknown distinctions; optional empty context; pain yes with omitted/skipped details;
- multi-select exclusivity (`None` + symptom), empty selection, invalid option, and duplicate selections;
- stale definition and response `expectedRevision` conflicts with no partial write;
- timezone/date and `post_session` vs `next_check_in`; no invented next-morning response;
- template defaults, explicit scheduled empty/list override, later template edit, later scheduled edit, both scheduled start UI routes, direct template start, ad-hoc start, force/retry, pause/resume/reload, failed draft save and completion retry;
- exercise swap/deletion and template deletion without loss of frozen wording/context;
- completed answer correction with immutable prior revision and unchanged sets/RIR/timing;
- legacy schema-v2 and older records, old energy/shoulder/custom fields, imported labels/answers outside new authoring limits;
- owner A/B isolation for definition, snapshot, response, correction, exercise and concern references under both JWT and AgentToken callers;
- OpenAPI request/response schemas and AgentToken workflow examples;
- tib-bar closed loop with no automatic recurrence, no automatic note rewrite, no symptom-free inference, and no medical clearance.

## UI and accessibility acceptance

- Use `SessionFeedback`; refactor it to consume the shared frozen definition contract rather than cloning its renderer.
- Exact prompts, option text, numeric endpoints/anchors, explicit state, and applicable context are visible. Do not replace source text with a generated summary.
- Conditional pain details retain `true` when details are absent or save fails.
- Keyboard-only operation reaches every control, visible focus is preserved, grouped controls have programmatic labels/instructions, state changes are announced, and screen-reader names include scale meanings—not emoji glyphs alone.
- At 375px there is no horizontal overflow; verify 375px and desktop with populated longest-valid prompts/options, error, skipped, resumed, and correction states.
- Reload/resume uses the latest server revision and compatible local draft; failed save remains visible and retryable.

## Verification contract

Use focused checks during implementation. Final evidence must be from the exact final commit with caches disabled/cleared where the tool supports it; no substantive gate may be reported from stale Turbo/Vitest/build cache output.

Run and report actual results for:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Also run focused shared-schema, migration, API route/store/auth, web component/hook, and Playwright suites. Do not weaken a historical migration fixture or delete assertions to get green.

Browser acceptance uses the coding agent's built-in browser first—no Codex Desktop, CUA, or installed-Chrome ritual. Verify with populated synthetic data at 375px and desktop:

1. agent-authored template defaults and scheduled override API readback;
2. both scheduled start UI surfaces freezing identical exact question versions;
3. post-session rendering and next-check-in non-rendering;
4. conditional pain details, false/zero, explicit skip/unknown, local+server draft pause/resume/reload, failed save/retry;
5. completion, immutable correction history, removed exercise, legacy history, and tib-bar non-recurrence;
6. keyboard and accessibility tree/names;
7. exact raw source/API evidence for definitions, answers, revisions, provenance, and unchanged sets/RIR/timing;
8. no unexpected console errors, failed network requests, or horizontal overflow.

Store screenshots, raw API/readback JSON, console/network logs, migration fixture evidence, and exact commands/results in a checked-in or clearly referenced evidence directory. Screenshots alone do not prove persistence. UI inspection does not prove the launcher model; model/effort/Fast are launcher-owned and not an executor acceptance gate.

## Scope and stop conditions

In scope: shared schema, persistence/migration, authenticated APIs/OpenAPI, existing feedback UI integration, durable drafts, completed answer corrections, compatibility adapter, focused/full tests, built-in-browser evidence, docs, Conventional Commit, push, and draft PR.

Out of scope: #151 longitudinal context/query service, automatic repeated-question suppression based on semantic interpretation, automatic concern resolution, diagnosis, treatment, medical thresholds, return-to-sport/medical clearance, clinician portal, injury registry, notifications, scheduler, LLM/network dependency, automatic live workout modification, automatic future programming-note rewrite, deployment, production migration/data, merge, environment/config changes, and history rewriting.

Stop and report only a focused consequential ambiguity that changes data safety, immutable-history semantics, owner isolation, or the user-visible contract. Resolve ordinary file placement, table naming, and bounded adapter/test choices from current conventions without asking. Do not invent medical thresholds.

## Delivery contract

1. Confirm branch, worktree, exact starting SHA, clean baseline, and read `AGENTS.md` plus this complete goal before source edits.
2. Re-run and finalize the consumer inventory **before** implementation, adding source evidence for anything missed. Do not block implementation on impossible future consumers from #151.
3. Plan, implement the entire frozen goal, test, inspect the final diff, and use internal GPT-5.6 Luna medium review/adversarial subagents with Fast off. Consolidate all findings, fix every in-scope issue, and rerun affected plus full uncached gates.
4. Create one coherent Conventional Commit, push `feat/workout-feedback-questions`, and open a **draft** PR against `main` only after required evidence is complete. No executor merge.
5. Return branch, starting/final SHA, changed files, migration/restore notes, consumer inventory, focused and full command results, browser/evidence paths, review findings/fixes, draft PR URL, clean status, blockers, and explicit confirmation that no app/server/browser/Desktop/CUA launch was performed during preparation and no production/deploy/merge/environment/history write occurred.
