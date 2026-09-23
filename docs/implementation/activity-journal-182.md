# #182 — Unified Calendar read model and top-level Calendar

Parent Astra owns final approval of this spec. Do not implement, launch, merge, deploy, or close issues until Astra accepts it. This file is the executable checkpoint once approved.

## Authority and trial

Derek authorizes continuation on the existing isolated release lane after independent #181 acceptance at `0a635e976474b29acd8cbfcee3a699e1de71fd61`. Work ONLY in `/Users/meridian/Projects/pulse-activity-journal-release` on `feat/activity-journal-release`. Verify shell cwd, branch, HEAD, and writable root before edits. Do not create a new worktree. Preserve `main` and other worktrees. Draft PR #187 exists; ordinary feature-branch commits/pushes are authorized. PR stays draft. No merge, production, deployment, issue closure, or #183.

Live GitHub #182 still carries stale “current checkpoint: #177” wording; it is not authority. #176–#181 are accepted. Canonical intent: `docs/planning/activity-journal-body-context.md`. Reserved route: `GET /api/v1/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`. Closed #149/#151 remain constraints: no fabricated recovery/technique scores and no second injury registry. Closed #111 / `GET /api/v1/data-quality/calendar` is a different product; do not reuse, merge, or collide with it.

Trial (launcher-owned; executor does not change models): GPT-6 Sol medium implements; a separate independent GPT-6 Sol medium review; Fast OFF always. Cross-domain identity, date/DST, and existing mutation-path guards warrant medium. Parent launches Desktop CUA only after Astra spec approval. No internal reviewer/subagent fan-out. Localized in-scope repairs stay with the implementer; structural/spec mismatch escalates to parent. Stop for independent acceptance at this checkpoint.

Read AGENTS.md, live GitHub #182 and #183, the planning proposal, `activity-journal-release.md`, `activity-journal-contracts.md`, `activity-journal-181.md`, foundation `calendarReadModelSchema` / `calendarReadItemSchema`, `daily-check-in/read-model.ts` workout pairing, `getDailyNutritionForDate` / `getDailyNutritionSummaryForDate`, Activity assignment/execution/recurrence routes, guarded `PATCH /api/v1/scheduled-workouts/:id`, `source-authority.ts`, `apps/web/src/features/workouts/components/workout-calendar.tsx`, `nav-items.ts`, `App.tsx`, `bottom-nav.tsx`, and existing Activity/Journal preview pages before editing. Search coverage first. Preserve #176–#181 invariants. No new data ownership.

## Outcome

One shared calendar/agenda read model over existing canonical records, plus a top-level Calendar surface. Planned and actual stay distinct. Reschedule does not rewrite actual history. Each canonical record appears once. Workouts remains a workout-only view over the same records, not a second schedule. Calories/macros are date-scoped and never fabricated. Missing stays missing. No diagnosis, clearance, causality, cron, LLM, forms, calendar writes, or #183 Activity/Journal/Session Context completion.

## Inspected current state (do not regress)

- Foundation `calendarReadItemSchema` domains are `activity | workout | journal | body_context | nutrition`; states are `planned | completed | observed | summary`; `occurrenceAt` may be null for date-only items; nested `record.subjectUserId` must match the item. `.strict()`. Do not add foundation keys or state values.
- `GET /api/v1/calendar` is unimplemented. `GET /api/v1/data-quality/calendar` already exists under a different prefix.
- Daily context already pairs workouts: unstarted `scheduled_workouts` (`sessionId === null` and not a live session’s `scheduledWorkoutId`) are planned; started/paused/completed rows are the `workout_sessions` identity. Reuse that pairing. Do not copy lifecycle rules into a new aggregate store.
- `WorkoutCalendar` fetches `useScheduledWorkouts({ from, to })` plus sessions `completed | in-progress | paused`, and owns start/reschedule/cancel via existing workout APIs. Keep those mutation hooks.
- Navigation has no Calendar. `primaryNavItems` is four items; mobile `BottomNav` is `grid-cols-5` (those four plus More). `/activity` and `/journal` remain preview/mock. Session Context remains preview (#181/#183).
- Nutrition day identity is `(userId, date)` on `nutrition_logs`. `getDailyNutritionSummaryForDate` currently returns numeric `0` actuals when no log exists; Calendar must not present that as logged intake.
- Recurrence policy is already `unassigned_on_or_after_effective_date`. Calendar reads materialized assignments only.
- Latest additive migration is `0072_journal_runtime`. #181 added no `0073`. #182 is a derived read plus UI: no `0073`, no new tables, no calendar writes.

## Architecture (fixed)

Reuse domain stores and #179 `source-authority` tokens. Do not persist calendar rows. Do not materialize recurrence from this route. Do not add calendar POST/PATCH/DELETE.

### Route

`GET /api/v1/calendar`

Query (strict):

| Param    | Rule                                                                                  |
| -------- | ------------------------------------------------------------------------------------- |
| `from`   | required `YYYY-MM-DD`                                                                 |
| `to`     | required `YYYY-MM-DD`, `from <= to`                                                   |
| `domain` | optional; repeatable; each value one of the five foundation domains                   |
| `state`  | optional; repeatable; each value one of `planned \| completed \| observed \| summary` |

Repeated values in one dimension are OR. Dimensions AND. Omitted dimension = all values. Unknown value → `400`. Inclusive local-day span (`to - from + 1`) must be `1..42` (same bound as data-quality calendar). `from > to` → `400` `CALENDAR_RANGE_INVALID`. Span `> 42` → `400` `CALENDAR_RANGE_LIMIT`. Do not truncate a too-wide range.

Auth: JWT or AgentToken reads, same `requireAuth` as planning reads. Subject/actor from authentication only. `Cache-Control: private, no-cache`. Missing/invalid user IANA zone → `400` `USER_TIME_ZONE_REQUIRED`. Envelope `timeZone` is that zone. Date-only source dates (`scheduled_workouts.date`, `workout_sessions.date`, nutrition/journal/assignment local dates) are already subject-local; never UTC-slice instants to invent a day.

Register under `/api/v1` next to `planningRoutes`. Real OpenAPI. Do not touch `/api/v1/data-quality/calendar`.

### Additive runtime schema

Add `packages/shared/src/schemas/calendar-runtime.ts`. Export from `packages/shared/src/index.ts`. API responses use the runtime schema. A projection containing exactly the foundation fields must also parse with `calendarReadModelSchema` / `calendarReadItemSchema`. `.strict()` everywhere: extra keys such as `recoveryScore`, a second schedule id, or a single `totalLoad` fail parse.

Runtime may add, without removing foundation fields:

- `filters`: echo of applied `domain[]` and `state[]` (empty array means unrestricted)
- on items: `lifecycleStatus` (closed unions below), `plannedLocalDate`, `actualLocalDate`, `scheduledWorkoutId`, `workoutSessionId`, `activityId`, `assignmentId`, `linkedActivityExecutionIds`, `sourceReference` when a #179 token exists, `missingProvenance` boolean, `nutrition` overlay
- `nutrition` overlay only on `domain: nutrition` items:

```
nutrition: {
  status: 'unknown' | 'partial' | 'complete' | null,
  actual: { calories, protein, carbs, fat } | null,
  target: { calories, protein, carbs, fat } | null
}
```

`sourceReference` uses existing #179 kinds only (`activity_assignment`, `activity_execution`, `scheduled_workout`, `workout_session`, `observation`, `nutrition_log`, …). Canonical Journal uses foundation `record.kind: journal_entry` and `record.revisionId = currentRevisionId`; do not add `journal_entry` to `dailyCheckInSourceKindSchema` in this checkpoint. Legacy rows set `record.revisionId: null` and `missingProvenance: true`.

### Event identity (each canonical record once)

Item `id` equals `record.id`. Uniqueness key is `(domain, record.kind, record.id)`. Foreign and deleted rows never appear and do not consume limits.

| Source                               | Include when                                                                                         | `domain` / `record.kind` / foundation `state`                                | Dates                                                                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity assignment                  | `state` is `planned` or `completed`; omit `cancelled` and `skipped`                                  | `activity` / `activity_assignment` / `planned`                               | `localDate = plannedLocalDate`; `occurrenceAt = null`; runtime `lifecycleStatus = assignment.state`                                                                                                              |
| Activity execution                   | `outcome` `completed` or `partial`; omit `skipped` and `unknown`                                     | `activity` / `activity_execution` / `completed`                              | `localDate = actualLocalDate`; `occurrenceAt = actualOccurredAt` (must agree with IANA, including both DST transitions)                                                                                          |
| Legacy `activities` row              | owner row in range                                                                                   | `activity` / `activity` / `completed`                                        | date-only; `occurrenceAt = null`; `missingProvenance: true`; do not convert                                                                                                                                      |
| Unstarted scheduled workout          | `sessionId === null` and id not a live session’s `scheduledWorkoutId`; same pairing as daily context | `workout` / `scheduled_workout` / `planned`                                  | `localDate = scheduled.date`; `occurrenceAt = null`; `lifecycleStatus = scheduled`                                                                                                                               |
| Workout session                      | owned, non-deleted, status `scheduled \| in-progress \| paused \| completed`; omit `cancelled`       | `workout` / `workout_session` / `planned` if not completed, else `completed` | `localDate = workout_sessions.date` (never UTC-sliced `startedAt`); runtime `plannedLocalDate` from linked schedule if any; `lifecycleStatus = session.status`; `in-progress`/`paused` stay foundation `planned` |
| Canonical Journal observation        | `localDate` in range                                                                                 | `journal` / `journal_entry` / `observed`                                     | date-only; `occurrenceAt = null`                                                                                                                                                                                 |
| Legacy `journal_entries`             | `date` in range                                                                                      | `journal` / `journal_entry` / `observed`                                     | date-only; `missingProvenance: true`; item `timeZone` is the envelope zone; do not convert the recorded date                                                                                                     |
| Canonical flare / health observation | `localDate` in range                                                                                 | `body_context` / `observation` / `observed`                                  | `occurrenceAt = occurredAt` (instant/local/IANA agreement)                                                                                                                                                       |
| Nutrition day                        | in range AND (evidence log OR a date-scoped effective target)                                        | `nutrition` / `nutrition_log` / `summary`                                    | date-only; one item per local date                                                                                                                                                                               |

Evidence log means the existing daily-notes predicate: any meal, explicit `statusUpdatedAt`, or non-`unknown` status. Implicit unknown rows without meals are not intake evidence.

Do **not** emit: recurrence revisions, unmaterialized recurrence dates, check-in Q&A, standing concerns/capabilities/guidance, proposals, habits, data-quality days, TDEE ratchets, cancelled/skipped assignments, cancelled/deleted sessions.

Linked Activity execution + structured workout are **two** canonical records (Activity vs workout). Both may appear. Do not collapse them the way #181 load aggregation does. Do not also emit the scheduled row once a live session owns it.

Title is copied from existing labels only (activity name, template/session name, journal title, observation text, or `Nutrition`). Truncate to `shortTextSchema`. Never invent recovery/phase copy.

### Planned vs actual and mutation guards

Calendar is read-only. Inventory existing date mutation paths and prove read-after-write; do not add a calendar write and do not weaken guards:

- `PATCH /api/v1/activity-assignments/:id/reschedule` — assignment `plannedLocalDate` moves; linked execution `actualLocalDate` does not
- `POST /api/v1/activity-recurrences/:id/revisions` + `materialize` — policy `unassigned_on_or_after_effective_date`; existing assignments keep original recurrence revision and date until explicitly rescheduled; calendar never expands the rule itself
- `POST /api/v1/activities/:id/executions` and execution corrections — actual history is the execution; Tuesday plan + Thursday actual remain two items
- Guarded `PATCH /api/v1/scheduled-workouts/:id` date (`expectedUpdatedAt`) — unstarted eligible move updates the planned item; started/completed date change remains rejected and must not detach `sessionId`; same-date is identity-preserving no-op
- Typed #178 proposal `activity_assignment_reschedule` / `scheduled_workout_reschedule` — calendar reflects committed effects only; capture/approval-statement alone does not move items; no implicit approval
- Workout session complete/cancel — completed session is `completed` on `session.date`; cancelled omitted

GET calendar must not mutate plans, sessions, journal, flares, nutrition, or receipts. Identical idempotent replay of an existing write leaves calendar item identities stable; changed-payload conflict leaves calendar unchanged.

### Nutrition numbers

Reuse `getDailyNutritionSummaryForDate` / `getDailyEnergyAdherenceForDate` as the target authority and meal-item sums as actuals. Batch if needed so a 42-day range is owner-scoped and bounded; values must match those functions for the same date.

- No evidence log → `actual: null` (not `0`)
- Evidence log → actual macros from meal items (zeros only when the log truly has zero-calorie items)
- Effective date-scoped target present → `target` from that authority; else `target: null`
- Do not leak an invalid protein floor as a causal target; copy existing summary `target.protein` semantics
- Do not fabricate load, TDEE, or adherence scores on calendar items

### Limits

Fetch `limit+1` per independent collection. Overflow is HTTP `422` `CALENDAR_READ_LIMIT_EXCEEDED` with `details.scope` and `details.limit`, never a truncated success. Output: `items` 10_000 (foundation max). Source scans are owner-scoped and capped before output filtering: `source_activity_assignments`, `source_activity_executions`, `source_legacy_activities`, `source_scheduled_workouts`, `source_workout_sessions`, `source_journal_observations`, `source_legacy_journal`, `source_observations`, `source_nutrition_logs` each 1000. Foreign rows do not consume the allowance. Probe below / at / above each limit.

### Consumer UI (#182 owns Calendar; #183 owns remaining Activity/Journal/Session Context)

1. Top-level route `/calendar` with heading `Calendar`, calendar grid view and agenda list view over the shared GET. Cross-domain filters compose. Loading / empty / error / missing-timezone states come from the real API. Density and control placement are design-flexible.
2. Add `Calendar` to `primaryNavItems` immediately after Workouts (icon `Calendar` from lucide). Update `BottomNav` column class to `primaryNavItems.length + 1` so More still fits. Do not remove Dashboard/Workouts/Nutrition/Habits.
3. Source links use canonical ids: scheduled → `/workouts/scheduled/:id`; session → `/workouts/session/:id`; nutrition → existing nutrition day; Activity/Journal links may land on current preview routes. Do not rewrite Activity/Journal/Session Context pages or remove `PreviewBanner`.
4. Workouts calendar stays workout-only. It may keep fetching scheduled/session APIs for start/reschedule/cancel payloads. Displayed workout identities must equal `GET /calendar?domain=workout` record ids for the same owner/range (subset, same ids, no UI-local duplicates, no second schedule). Comment the shared-record contract on `workout-calendar.tsx`.
5. Adapter `apps/web/src/features/calendar/lib/calendar-workout-filter.ts` (or equivalent) that filters runtime items to `domain === 'workout'` and cannot invent ids.
6. Browser-readable fixture `docs/implementation/activity-journal-182-fixtures/calendar-agenda.html`: self-contained HTML bound to registered API GET payloads for a populated fictional range showing planned Tuesday / actual Thursday Activity, unstarted vs completed workout pairing, flare, journal, nutrition actual+target, DST boundary, and filter composition. Openable as a file. Not a substitute for the live Calendar page tests.
7. Agent-integration examples for `GET /api/v1/calendar` only. `GET /context` and `/context/feedback` unchanged.

Update `activity-journal-contracts.md` runtime inventory (#182 implemented) and `activity-journal-status.md` after code exists. Do not edit historical SQL.

## Frozen hostile / compatibility cases

Registered API tests, fictional fixtures only:

1. Planned Tuesday assignment + Thursday completed execution: two activity items, distinct ids/dates; reschedule of the assignment does not move the execution.
2. Recurrence revision `effectiveFromLocalDate` plus materialize: pre-effective assignments keep original dates/revision ids; new assignments appear only where materialized; no rule-expanded phantom days.
3. Unstarted scheduled workout is one `scheduled_workout` planned item; after start, calendar shows the session once and not the scheduled row.
4. Guarded scheduled-workout PATCH: eligible unstarted date move updates the planned item; started/completed date change rejected without detaching `sessionId`; same-date no-op preserves identity. Legacy generic PATCH still uses that primitive.
5. Proposal statement capture without approval does not move calendar items. Direct JWT approval and trusted AgentToken relay remain the only execution paths; calendar is not an approval surface.
6. Identical idempotent replay of assignment create/reschedule does not duplicate calendar items; changed-payload conflict does not mutate calendar.
7. Owner isolation: foreign assignments, sessions, journal, flares, and nutrition logs absent; identical non-disclosing empty-or-unrelated range for another user. JWT and AgentToken succeed for the owner.
8. Nutrition: evidence day shows actual macros matching meal sums; no-log day with a target has `actual: null` and the real target; no-log no-target day omitted; never coerce missing intake to `0`.
9. Date-only vs occurrence: journal/assignment/nutrition/scheduled have `occurrenceAt: null`; execution/flare instants agree with local date in the recorded IANA zone across Detroit spring-forward, fall-back, and a UTC-day boundary.
10. Filters: `domain=workout` hides activity/journal/nutrition/body; repeating `domain=activity&domain=journal` unions those domains; adding `state=planned` intersects. Invalid domain/state → 400. Omitted filters return all included kinds.
11. Cancelled session, skipped assignment, unmaterialized recurrence, standing concern, check-in question, and data-quality rows are absent.
12. Linked execution + workout session: both records present with distinct domains; not double-emitted as two workouts.
13. Legacy journal/activity date-only rows: included with `missingProvenance`, no invented actor/provenance/occurrence time.
14. Overflow: below/at/above each source scope; 422 with `scope`/`limit`; foreign rows ignored. Range 42 accepted; 43 → 400.
15. GET does not write. Foundation projection parses; runtime `.strict()` rejects extra score/schedule keys.
16. Label fixture-DB tamper probes as such; they are not API bypasses.

## UI / browser acceptance (this checkpoint)

Populated fictional fixtures. Codex built-in browser first; Playwright via `apps/web` e2e only if that is the registered live-page gate. Do not require installed-Chrome CUA.

- Top-level Calendar nav on desktop and mobile
- Calendar and agenda views render shared ids/titles from the API
- Filters compose; empty and error/401/422 states visible; reload keeps server data
- Workout-only Workouts calendar still starts/reschedules through existing APIs and shows ids that exist in `domain=workout`
- Source link to a scheduled or session record uses the canonical id
- Do not treat Activity/Journal preview rewrite or Session Context card replacement as #182 acceptance

## Verification (usage-efficient)

Focused checks while editing. Search/reuse existing activity, scheduled-workout, daily-context, nutrition-summary, journal, and workout-calendar tests. One bounded self-review. Consolidated repairs. **One** final risk-relevant matrix after last substantive repair — do not rerun identical full suites per reviewer or for evidence-only commits.

Final matrix (inspect actual package scripts first): new shared calendar-runtime tests; registered calendar API tests including identity, reschedule/history, recurrence, PATCH guards, filters, nutrition null-vs-zero, DST, owner isolation, limits; affected scheduled-workout / activity / daily-context regressions if pairing reuse could break them; web nav + Calendar page + workout-calendar identity tests; then the live Calendar browser gate above; then `pnpm typecheck`, `pnpm lint`, `pnpm build` if source/API/shared/web changed. Honor mandatory hooks; **no bypass**. Root `pnpm test` only if hooks did not already run that exact suite on the same source identity, or if fail-fast skipped it — then capture the missing gate independently.

Evidence: `/Users/meridian/Projects/qa-reports/pulse-activity-journal-release/checkpoint-182`. Raw first-run stdout/stderr, exit, argv, source/test/config hashes. Record local command wall time and child CPU separately from CI queue/execution; do not infer CPU from wall. Preserve failures and label superseded runs. No LLM polling. No retry-to-green.

Commit coherent source/tests/docs, push only this feature branch, verify `HEAD == origin/feat/activity-journal-release` and a clean worktree. Return exact SHA, requirement-to-evidence map, gaps. End `Ready for independent GPT-6 Sol medium review: #182`. Do not open a second PR, merge, deploy, close issues, or start #183.
