# #181 — Planning reads and session-specific “What matters today”

Parent Astra owns final approval of this spec. Do not implement, launch, merge, deploy, or close issues until Astra accepts it. This file is the executable checkpoint once approved.

Parent Astra approved this checkpoint at `de7c0d6ee1f49e4c2de2bd6fcf5ce36372681228` with these clarifications, recorded before implementation:

- Keep the foundation schema strict. For a workout-session runtime response, parse a projection containing exactly the foundation fields with `sessionContextReadModelSchema`; parse the complete response with the additive strict runtime schema.
- Use the stored canonical active `workout_sessions.duration` for workout load duration, or `null` when it is absent. Elapsed `startedAt` to `completedAt` time can include pauses and is never an active-duration fallback.
- A linked Activity execution contributes to its workout identity only when the owned, non-deleted workout is an actual-work status and its local date matches the execution. A missing, foreign, deleted, scheduled, cancelled, or date-mismatched linked workout is not evidence of workout load. Exclude that inconsistent linked execution from load and expose `linked_load_mismatch:<executionId>` in `missingInputs`; do not reinterpret it as an unlinked execution or invent a workout item.

## Authority and trial

Derek authorizes continuation on the existing isolated release lane after independent #180 acceptance at `fde6124bf5d6793f5b4db7d3116ed943bf90555a`. Work ONLY in `/Users/meridian/Projects/pulse-activity-journal-release` on `feat/activity-journal-release`. Verify shell cwd, branch, HEAD, and writable root before edits. Do not create a new worktree. Preserve `main` and other worktrees. Draft PR #187 exists; ordinary feature-branch commits/pushes are authorized. No merge, production, deployment, issue closure, or #182.

Live GitHub #181 still carries stale checkpoint wording; it is not authority. #176–#180 are accepted. Canonical intent: `docs/planning/activity-journal-body-context.md`. Inventory route already reserved: `GET /api/v1/workout-sessions/:id/session-context`. Closed #149/#151 remain constraints: do not reintroduce fabricated recovery/technique scores or a second injury registry. `GET /api/v1/context` and `GET /api/v1/context/feedback` stay workout-feedback / agent-snapshot owners.

Trial (launcher-owned; executor does not change models): GPT-6 Sol medium implements; a separate independent GPT-6 Sol medium review; Fast OFF always. Parent launches Desktop CUA only after Astra spec approval. No internal reviewer/subagent fan-out. Localized in-scope repairs stay with the implementer; structural/spec mismatch escalates to parent. Stop for independent acceptance at this checkpoint.

Read AGENTS.md, live GitHub #181, the planning proposal, `activity-journal-release.md`, `activity-journal-contracts.md`, `activity-journal-180.md`, foundation `sessionContextReadModelSchema`, daily-check-in / journal / body-context / activity runtimes, `apps/api/src/routes/v1/context.ts`, `apps/api/src/routes/agent/context-store.ts`, `apps/api/src/routes/feedback-planning/`, `apps/api/src/routes/daily-check-in/read-model.ts`, `apps/api/src/routes/workout-sessions/`, `apps/web/src/features/workouts/components/session-context.tsx`, `apps/web/src/pages/active-workout.tsx`, and `workoutSessionContext` mocks before editing. Search coverage first. Preserve #176–#180 invariants. No new data ownership.

## Outcome

Derived planning/read APIs return session-specific “What matters today”: source-linked positive focus, applicable cautions, current-body guidance, combined Activity + structured-workout load, freshness, and explicit missing facts. Different sessions get different relevant context. Concerns that are not relevant today remain listed. Co-occurrence is context, never causality. Missing stays missing. No composite load/recovery score, diagnosis, clearance, LLM, cron, forms, or UI-complete claim.

## Inspected current state (do not regress)

- Foundation `sessionContextReadModelSchema` is workout-session-scoped and has `positiveFocus`, `relevantConcerns`, `applicableGuidance`, `recentObservations`, `missingInputs`. It has no workload, irrelevant-concern retention, journal facts, co-occurrence, or derived freshness overlay. Do not silently weaken it.
- No session-context route or runtime module exists. Daily context (`GET /api/v1/daily-context`) is the day inventory, not session relevance.
- `GET /api/v1/context` is AgentToken-only and still omits Activity/Journal/concerns/check-in. `GET /api/v1/context/feedback` is the bounded feedback-planning surface (#151). Neither is the #181 owner.
- Web Session Context is preview inventory: Recent Training / Recovery Status / Active Injuries / Training Phase. `active-workout.tsx` overlays last-3 completed session names onto `workoutSessionContext` mock sleep, injuries, and “Accumulation Block 2 - Rebuild”. `hasPreviewCards` is hard-coded true.
- Activities and workout sessions are separate identities. `activity_execution.structuredWorkoutSessionId` is a link, not a second event. Workout `duration` is seconds (`calculateActiveDuration`); Activity `durationMinutes` is minutes. Weekly Journal already counts actual workouts as `in-progress|paused|completed` only.
- Latest additive migration is `0072_journal_runtime`. #181 is derived reads: no `0073`, no new tables, no writes.

## Architecture (fixed)

Reuse domain stores and #179 `source-authority` tokens. Do not copy lifecycle rules into a new aggregate. Do not persist session context.

### Targets

| Target                | Route                                               | `workoutSessionId`                     |
| --------------------- | --------------------------------------------------- | -------------------------------------- |
| Owned workout session | `GET /api/v1/workout-sessions/:id/session-context`  | required; foundation schema must parse |
| Subject-local date    | `GET /api/v1/planning/what-matters?date=YYYY-MM-DD` | `null`; runtime-only                   |

Both share one builder. Date defaults to the subject’s authoritative local today. Timezone comes from the existing user date authority; missing timezone is `400` `USER_TIME_ZONE_REQUIRED`. Session target uses `workout_sessions.date` as `localDate`, never UTC-sliced `startedAt`. Auth: JWT or AgentToken reads. `Cache-Control: private, no-cache`. Subject/actor from authentication only.

Owned non-deleted session statuses `scheduled|in-progress|paused|completed` are readable. Missing, foreign, deleted, or `cancelled` sessions return the same non-disclosing `404` `SESSION_CONTEXT_NOT_FOUND`. Do not leak existence.

Register `GET /:id/session-context` on the existing workout-session plugin. Register `GET /planning/what-matters` under `/api/v1` (no `:id` collision). Real OpenAPI.

### Additive runtime schema

Add `packages/shared/src/schemas/session-context-runtime.ts`. Export from `packages/shared/src/index.ts`. API responses use the runtime schema. A workout-session payload must also satisfy foundation `sessionContextReadModelSchema`. `.strict()` everywhere: extra keys such as `recoveryScore`, `sleepStatus`, `trainingPhase`, `readiness`, or a single `totalLoad` fail parse.

Runtime adds, without removing foundation fields:

- `localDate`, `timeZone`
- `target`: `{ kind: 'workout_session', workoutSessionId }` or `{ kind: 'local_date', workoutSessionId: null }`
- `trackedIrrelevantConcerns`: `bodyConcernSchema[]` max 50
- `journalObservations`: `journalObservationSchema[]` max 20 (never merge into `recentObservations`)
- `positiveFocusAttributions`: `{ capabilityId, sessionRelevance: 'guidance_linked' \| 'fallback_recent', derivedFreshness }[]`
- `workload` as specified below
- `coOccurrences`: `{ observationKind: 'flare' \| 'journal', observationId, loadKind, loadId, localDate, relationship: 'same_local_date' }[]` max 50
- `missingInputs` remains the foundation short-text code list

`recentObservations` stays flares (`healthObservationSchema`). Check-in questions are not duplicated here; agents keep `GET /daily-context`.

### Relevance (fail closed, no NLP)

Normalize `bodyRegion` and muscle-group tokens: lowercase, trim, strip `\b(left|right|bilateral)\b`. Match only via this frozen alias map from region token → allowed muscle-group tokens:

- `shoulder` / `deltoid` / `delts` → `front delts`, `rear delts`, `side delts`, `delts`, `shoulders`
- `chest` / `pec` / `pecs` → `chest`, `pecs`
- `lats` → `lats`
- `upper back` / `trap` / `traps` → `upper back`, `traps`
- `lower back` / `lumbar` / `erectors` → `lower back`, `erectors`
- `quad` / `quads` → `quads`
- `hamstring` / `hamstrings` → `hamstrings`
- `glute` / `glutes` → `glutes`
- `hip` → `glutes`, `hip flexors`
- `calf` / `calves` / `ankle` → `calves`

Unmapped regions (`knee`, `elbow`, `wrist`, `neck`, free text) never become relevant by muscle group. Laterality is stripped for matching only; do not invent side-specific medical meaning.

A non-`archived` concern is **relevant** when any of:

1. Workout target: normalized region aliases intersect the session’s exercise `muscleGroups` (load session sets / snapshot / template exercises actually on that session).
2. Current guidance (`state: current`) links the concern, and either (1) holds or the linked capability is `developing|stable`.
3. A flare in the load window lists the concern and either references the target session / a target-date activity execution or satisfies (1).
4. A canonical Journal observation in the load window lists the concern in `sourceReferences` and either lists the target `workout_session` or (date target) has that `localDate`.

All other non-archived concerns, including `resolved` and `maintenance`, go in `trackedIrrelevantConcerns` with their real `symptomState` / `managementState`. Archived omitted. Never drop an irrelevant concern to imply a clean bill of health. `resolved` is an explicit management decision, not healing or clearance.

Date target with no session: (1) cannot fire; relevance is (2)–(4) plus any concern with a flare on that local date.

Implementation interpretation pending parent confirmation: on a workout target, a developing/stable capability link alone does not make its concern relevant to every workout. That concern needs the target's muscle, flare, or Journal evidence. A local-date target may use the current guidance/capability link as written. This preserves the required two-session relevance and focus difference; the literal global-link reading conflicts with those required cases.

**Guidance:** `applicableGuidance` is `state: current` rows linked to a relevant concern or to a positive-focus capability. `superseded` / `retired` stay out. Provenance class is unchanged (`clinician_authored` vs `user_relayed_clinician` vs `user_observation` vs `agent_suggestion`).

**Positive focus:** only `developing` or `stable` capabilities. Prefer current-guidance links to relevant concerns (`guidance_linked`). If none, at most the latest `updatedAt` developing/stable capability (`fallback_recent`). `limited` / `unknown` never appear as focus. Empty array plus `missingInputs` code `positive_focus`. Never invent “Rebuild”, sleep, or training-phase copy. Copy capability `label` only.

**Derived freshness overlay** (read-only; do not write sources): if stored freshness is `current` and `asOf` local date is more than 14 subject-local days before `localDate`, set `derivedFreshness` to `stale` with reason `as_of_older_than_14_local_days` (append; keep `asOf`). Otherwise copy stored freshness. Stale focus/guidance remains visible.

### Missing vs negative

`unknown`, `not_asked`, `denied`, and absent are distinct. Empty `relevantConcerns` is not “no injuries”. Denied `symptomState` is a recorded negative; it is not missing. Do not emit sleep or training-phase facts; if callers might expect them, `missingInputs` may include `sleep` and `training_phase` as honest gaps and those fields must not appear elsewhere.

Required `missingInputs` codes when applicable:

- `positive_focus`
- `activity_load_duration:<executionId>`
- `workout_load_duration:<sessionId>`
- `guidance_for_concern:<concernId>` (relevant concern, no current guidance)
- `sleep`
- `training_phase`

### Load aggregation identity (no double-counting)

Window: 7 subject-local dates ending at `localDate` inclusive (`localDate-6` through `localDate`). Foreign rows do not count toward items or limits.

Count **actual** work only:

- Activity executions with `outcome` `completed` or `partial`. `skipped` / `unknown` are not load. Planned assignments with no such execution are not load.
- Workout sessions with status `in-progress`, `paused`, or `completed`, non-deleted. `scheduled` and `cancelled` are not load.

Identity key `${kind}:${id}`:

- An execution with `structuredWorkoutSessionId` contributes as `workout_session:<thatId>` and records `linkedActivityExecutionIds`. It does **not** also emit `activity_execution:<id>` and does **not** add `durationMinutes` on top of the workout.
- An unlinked execution is `activity_execution:<id>`.
- A workout session in the window is `workout_session:<id>` (merge with any linked executions).

Duration stays native: activities `durationMinutes`; workouts use stored canonical active `duration` seconds or `null`. No status uses wall-clock subtraction. Null duration does not become `0`.

```
workload: {
  window: { startLocalDate, endLocalDate, timeZone },
  items: [{
    identityKind: 'activity_execution' | 'workout_session',
    identityId,
    localDate,
    activityDurationMinutes: int | null,      // only activity identities
    workoutDurationSeconds: int | null,       // only workout identities
    outcomeOrStatus,
    sourceReference,                          // #179 current token
    linkedActivityExecutionIds: id[]
  }],
  totals: {
    activityExecutionCount,
    workoutSessionCount,
    activityDurationMinutes: int | null,      // null if any activity item lacks minutes
    workoutDurationSeconds: int | null        // null if any workout item lacks seconds
  }
}
```

No summed cross-unit total. No volume/tonnage as load. Schema rejects a single score field.

**Co-occurrence:** if a flare or Journal observation’s `localDate` equals a load item’s `localDate`, emit `relationship: 'same_local_date'`. No other relationship enum values.

### Limits

Fetch `limit+1` per independent collection. Overflow is HTTP `422` `SESSION_CONTEXT_READ_LIMIT_EXCEEDED` with `details.scope` and `details.limit`, never a truncated success. Scopes: `relevant_concerns` 20, `tracked_irrelevant_concerns` 50, `positive_focus` 10, `applicable_guidance` 20, `recent_observations` 20, `journal_observations` 20, `workload_items` 200, `co_occurrences` 50. Owner-scoped only; foreign rows do not consume the allowance. Probe below / at / above each limit.

The strict foundation also caps `missingInputs` at 20. If required gap codes exceed that bound, return the same 422 with `scope: missing_inputs` and `limit: 20`; never truncate gaps or return an unvalidated 500.

### Legacy Session Context migration (not UI completion)

Preview cards are inventory, not layout requirements. Mapping for #183, not a claim that the React slice is done:

| Preview card    | Replacement facts                                | Forbidden                                   |
| --------------- | ------------------------------------------------ | ------------------------------------------- |
| Recent Training | `workload.items`                                 | mock last-3 + fake `volume` as readiness    |
| Recovery Status | omit; `missingInputs` `sleep`                    | `sleepStatus`, recovery copy                |
| Active Injuries | `relevantConcerns` + `trackedIrrelevantConcerns` | “No active conditions” from empty mock      |
| Training Phase  | `positiveFocus` labels + provenance              | `trainingPhaseLabel`, inferred phase badges |

#181 deliverables for consumers:

1. Runtime types + adapter `apps/web/src/features/workouts/lib/session-context-migration.ts` that cannot populate `sleepStatus` / `trainingPhaseLabel` / mock injury ids from the runtime model.
2. Tests: `workoutSessionContext` mock fails runtime parse; two fixture sessions differ in `relevantConcerns` / `positiveFocus`; adapter never emits recovery/phase.
3. Comment on `session-context.tsx` and the `active-workout.tsx` `sessionContext` memo pointing at #183. **Do not** fetch the new API from the page, remove `PreviewBanner`, or rewrite the four cards. Leaving preview UI in place is required honesty.
4. Browser-readable fixture `docs/implementation/activity-journal-181-fixtures/what-matters-two-sessions.html`: self-contained HTML, two populated session JSON payloads labeled What matters today / cautions / guidance / workload identities / missing / irrelevant / freshness / co-occurrence. Openable as a file; no app server. Not Playwright UI acceptance.

`GET /context` and `/context/feedback` unchanged. Add agent-integration examples for the two new GETs only.

Update `activity-journal-contracts.md` runtime inventory (#181 implemented) and `activity-journal-status.md` after code exists. Do not edit historical SQL.

## Frozen hostile / compatibility cases

Registered API tests, fictional fixtures only:

1. Upper-body vs lower-body sessions on the same subject: overlapping irrelevant knee concern retained on both; shoulder concern relevant only to upper; positive focus not generic inventory.
2. Date target with PT execution and no workout session: activity load present; workout count 0; no fabricated phase/sleep.
3. Execution linked via `structuredWorkoutSessionId` plus the workout row: one `workout_session` identity, linked execution ids recorded, durations not summed across units.
4. Scheduled-only and cancelled workouts excluded from load; `in-progress`/`paused`/`completed` included; skipped activity excluded; partial included.
5. Same-day flare + load → `same_local_date` only; payload has no cause/clearance/diagnosis strings.
6. Missing capability → empty `positiveFocus`, `missingInputs` contains `positive_focus`; no recovery sentence.
7. Stored `current` guidance with `asOf` 20 local days earlier → derived `stale`; still listed.
8. `unknown` / `not_asked` symptoms ≠ `denied` ≠ missing; empty relevant list does not imply cleared.
9. Relevant concern without current guidance → `guidance_for_concern:<id>`; superseded guidance omitted.
10. Four provenance classes survive on focus/guidance/concerns; agent_suggestion is not clinician_authored.
11. Journal observation on the date appears in `journalObservations`, not `recentObservations`; flares stay flares.
12. Foreign/cancelled/deleted session: identical 404, no body disclosure. JWT and AgentToken reads succeed for the owner.
13. Overflow: below/at/above each scope; 422 with `scope`/`limit`; foreign rows ignored.
14. DST spring/fall and UTC-day boundary keep `localDate` / window / freshness-day math on the subject IANA zone.
15. Runtime `.strict()` rejects `recoveryScore` / `sleepStatus` / `trainingPhase` / `totalLoad`. Foundation parse succeeds for the workout-session payload.
16. `GET /api/v1/context` and `/context/feedback` response shapes unchanged by this checkpoint.
17. Preview mock `workoutSessionContext` is not a valid runtime payload. No write route exists; GET does not mutate plans, flares, journal, or check-in.
18. Label fixture-DB tamper probes as such; they are not API bypasses.

No production DB. No new browser/UI gate for the live page. Fixture HTML is the browser-readable evidence.

## Verification (usage-efficient)

Focused checks while editing. Search/reuse existing activity, body-context, daily-context, journal, workout-session, and session-context component tests. One bounded self-review. Consolidated repairs. **One** final risk-relevant matrix after last substantive repair — do not rerun identical full suites per reviewer or for evidence-only commits.

Final matrix (inspect actual package scripts first): new shared session-context-runtime tests; registered session-context / what-matters API tests including limits, timezone, identity, and migration adapter tests; affected daily-context / journal / workout-session regressions only if the builder reuse could break them; then `pnpm typecheck`, `pnpm lint`, `pnpm build` if source/API/shared/web changed. Honor mandatory hooks; **no bypass**. Root `pnpm test` only if hooks did not already run that exact suite on the same source identity, or if fail-fast skipped it — then capture the missing gate independently.

Evidence: `/Users/meridian/Projects/qa-reports/pulse-activity-journal-release/checkpoint-181`. Raw first-run stdout/stderr, exit, argv, source/test/config hashes. Record local command wall time and child CPU separately from CI queue/execution; do not infer CPU from wall. Preserve failures and label superseded runs. No LLM polling. No retry-to-green.

Commit coherent source/tests/docs, push only this feature branch, verify `HEAD == origin/feat/activity-journal-release` and a clean worktree. Return exact SHA, requirement-to-evidence map, gaps. End `Ready for independent GPT-6 Sol medium review: #181`. Do not open a second PR, merge, deploy, close issues, or start #182.
