# Scheduled Snapshot Provenance: Goal-Mode Implementation Contract

## Contract status

**Frozen handoff for Pulse issue #134. Docs-only; implementation is not authorized in this worktree.**

- Repository: `/Users/meridian/Projects/pulse-scheduled-snapshot-fix`
- Upstream repository: `https://github.com/derekbeau/pulse-fitness-app.git`
- Approved implementation baseline: `origin/main` / `85930bd6497286bcc3153b77885e44feb1f31a82` (merged PR #144)
- Executor branch: `fix/scheduled-snapshot-provenance`
- Primary implementation model approved by Derek: **GPT-6 Astra, Low reasoning**
- Review/support model: **GPT-5.6 Luna, Medium reasoning**
- Execution mode: one fresh Codex App Goal Mode lane, one isolated worktree, no competing editor
- Scope: one coherent implementation PR for #134; no production launch, deployment, or data repair

The executor must fail before editing if the branch, worktree, starting SHA, required context, or clean/dirty expectation does not match the generated launcher manifest supplied with this handoff.

## Goal

Make a customized scheduled workout snapshot the canonical source for every scheduled-workout start. Starting the same scheduled workout from the Workouts list, calendar, dashboard, or scheduled-workout detail must materialize the same immutable snapshot into the active session. The visible workout and persisted provenance must agree, including when the reusable template happens to look identical.

Complete the contract 100%. Do not stop at a plan, a happy-path test, visible exercise equality, or a status summary. Read the actual implementation, plan, implement, test, adversarially review, repair, run the complete gate, inspect the final diff, commit coherent changes, and retain literal evidence. This file is a frozen implementation contract, not evidence that implementation has occurred.

## Exact live issue snapshot

Captured from GitHub on **2026-09-06** at issue `https://github.com/derekbeau/pulse-fitness-app/issues/134` (state: `open`, updated `2026-09-06T20:03:24Z`, title: **Starting a scheduled workout from the Workouts list ignores its snapshot**). The following issue body is preserved verbatim from the live API snapshot:

> ## Bug
>
> Starting a scheduled workout from the Workouts list ignores the customized scheduled-workout snapshot and builds the active session from the reusable template instead.
>
> The API then automatically links that template-built session back to the scheduled workout, making the session appear correctly linked while its exercises, sets, targets, order, supersets, and notes are wrong.
>
> This has occurred on multiple production workout starts, including the September 2 provenance-only failure documented below; live data repairs did not fix the underlying code path.
>
> ## Production evidence
>
> ### Reproduction 1: Wednesday, August 26, 2026
>
> The scheduled upper workout had been customized and verified before start:
>
> - Removed the heavy seated cable row because of temporary posterior-chain tightness
> - Added Dead Bug
> - Updated exercise order, support instructions, and recovery gates
>
> The active session instead restored template content, including Seated Cable Row and Band Pull-Aparts, while omitting scheduled-snapshot content including Cable Preacher Curl, Face Pulls, and Dead Bug.
>
> The user had to split and repair exercises in the live workout after starting.
>
> ### Reproduction 2: Thursday, August 27, 2026
>
> Scheduled workout `447fd6ee-6fa7-4d17-b689-deb5705a4336` was customized and API-verified with exactly six exercises:
>
> 1. Leg Extension Machine
> 2. Lying Leg Curl Machine
> 3. Lying Cable Hip Flexion (Ankle Strap)
> 4. Cable Hip Abduction
> 5. Cable Hip Adduction
> 6. Posterior Chain Roll + Hamstring Stretch
>
> After start, active session `31e5fb2e-fa9e-477a-bb98-6d33e2247bf3` contained the reusable template instead:
>
> - Bodyweight Squat (ATG)
> - Tib Bar Tibialis Raise
> - Barbell Hip Thrust
> - Leg Extension Machine
> - Lying Leg Curl Machine
> - Cable Hip Adduction
> - Spanish Squat
> - Weighted Calf Stretch
> - Ankle Rockers
> - Plantar Fascia Foot Stretch
> - Posterior Chain Roll + Hamstring Stretch
>
> This restored exercises explicitly removed for recovery/toe constraints and omitted hip flexion and abduction. The recovery block survived only because it had also been added to the reusable template, which is strong evidence that active-session construction used the template rather than the scheduled snapshot.
>
> ## Root cause
>
> The API already has a correct scheduled-start branch.
>
> In `apps/api/src/routes/workout-sessions/index.ts` around lines 726–772, requests containing `scheduledWorkoutId`:
>
> - read the scheduled snapshot;
> - build session sets from `snapshot.exercises`;
> - propagate programming notes, agent notes, metadata, source scheduled-set IDs, and snapshot facts;
> - link the resulting session to the schedule.
>
> The scheduled-workout detail page uses that path correctly:
>
> ```ts
> // apps/web/src/features/workouts/components/scheduled-workout-detail.tsx
> startSessionMutation.mutateAsync({
>   scheduledWorkoutId: scheduledWorkout.id,
>   startedAt,
>   ...
> });
> ```
>
> The Workouts-list start action does not:
>
> ```ts
> // apps/web/src/features/workouts/components/workout-list.tsx
> startSessionMutation.mutateAsync({
>   date: mutationTodayKey,
>   name: scheduledWorkout.templateName,
>   sets: buildInitialSessionSets(templateQuery.data),
>   startedAt,
>   templateId: scheduledWorkout.templateId,
> });
> ```
>
> Because `scheduledWorkoutId` is omitted, the API takes the template-start branch and uses current template sets.
>
> It then runs this fallback after creation:
>
> ```ts
> if (!hasScheduledStart && input.templateId !== null) {
>   await linkTodayScheduledWorkoutToSession(...);
> }
> ```
>
> That auto-link masks the mistake: the active session receives the scheduled-workout relationship even though it was not materialized from that snapshot.
>
> Issue #104 fixed dashboard routing to the scheduled detail page, but the Workouts-list inline Start flow still uses the unsafe template-start payload. This is a distinct downstream bug.
>
> ## Required fix
>
> ### Web
>
> - Change the Workouts-list scheduled-card start action to send `scheduledWorkoutId` and use the same scheduled-start contract as `scheduled-workout-detail.tsx`.
> - Do not send `templateId` or `buildInitialSessionSets(templateQuery.data)` when starting an existing scheduled workout.
> - Consolidate scheduled-start payload construction so list, calendar, dashboard, and detail surfaces cannot drift again.
> - Preserve early-start confirmation, active-session conflict handling, stale-exercise confirmation, navigation, query invalidation, and error behavior.
>
> ### API defense in depth
>
> Do not silently auto-link a template-built session to a scheduled workout when that would hide snapshot divergence.
>
> Implement one explicit, tested behavior:
>
> 1. Preferably, resolve an unambiguous matching scheduled workout through the scheduled-snapshot materialization path; or
> 2. Fail closed with a structured conflict requiring `scheduledWorkoutId`, unless the caller explicitly requested a separate template/ad-hoc session.
>
> The server must preserve the intentional “create another anyway” flow without attaching a template-built duplicate to the scheduled card.
>
> ## Snapshot integrity invariant
>
> When a scheduled workout is started, the active session must be an immutable materialization of the scheduled snapshot at start time.
>
> The following must match the scheduled detail exactly:
>
> - Exercise IDs and names
> - Included/removed exercises
> - Section and order
> - Set count and set numbers
> - Repetition, duration, distance, and weight targets
> - Cleared/null targets
> - Superset groups
> - Rest/tempo where represented in the active contract
> - Programming Notes
> - Agent Notes and metadata
> - Source scheduled exercise/set identity
> - Exercise and tracking-type snapshot facts
>
> Later template edits must not change an already scheduled snapshot or its resulting active session.
>
> ## Acceptance criteria
>
> - [ ] Starting from the Workouts list sends `scheduledWorkoutId` and does not seed from the template.
> - [ ] Starting from scheduled detail, Workouts list, calendar, and dashboard produces equivalent active-session data.
> - [ ] Removed scheduled exercises do not reappear.
> - [ ] Added/swapped scheduled exercises appear in the active session.
> - [ ] Scheduled set additions/removals, target changes, and explicit null clears survive start exactly.
> - [ ] Scheduled exercise order and superset groups survive start.
> - [ ] Programming Notes, Agent Notes, and note metadata survive start.
> - [ ] Active session links to the correct scheduled workout and the schedule links back to the session.
> - [ ] Starting early uses the scheduled date/start semantics intentionally and does not lose the snapshot.
> - [ ] Template changes after scheduling do not leak into the active session.
> - [ ] Explicit “create another anyway” creates a separate template session without consuming or silently linking the scheduled card.
> - [ ] A malformed/missing scheduled-start identifier cannot silently fall back to template materialization and auto-link.
> - [ ] Regression tests cover both production failure shapes above.
>
> ## Tests
>
> ### Web component/mutation tests
>
> - Workouts-list scheduled Start calls the mutation with `scheduledWorkoutId`.
> - Payload excludes template-generated sets and `templateId` for scheduled starts.
> - Early-start and active-session confirmation preserve the same payload.
> - Stale-snapshot conflict can force-start the scheduled snapshot.
>
> ### API integration tests
>
> Existing API coverage already proves a direct `scheduledWorkoutId` request uses the snapshot. Extend it to verify:
>
> - structural exercise removals/additions;
> - reordered exercises;
> - set deletion and explicit target clearing;
> - supersets and notes;
> - template divergence after snapshot creation;
> - server behavior when a template start matches an unconsumed scheduled workout;
> - explicit duplicate/template-start behavior.
>
> ### Installed-browser acceptance
>
> 1. Create a scheduled workout from a template.
> 2. Modify its exercise list, order, targets, supersets, and notes.
> 3. Modify the reusable template differently afterward.
> 4. Start from each user-facing scheduled-workout entry point.
> 5. Assert the active session matches the scheduled snapshot, not the template.
> 6. Refresh/resume and verify persistence.
> 7. Confirm no duplicate session/card or false auto-link.
>
> ## Implementation evidence required
>
> - Exact before/after payloads for each start surface
> - Focused web and API test results
> - Full uncached lint, typecheck, test, and build
> - Installed-Chrome screenshots or trace showing scheduled detail and resulting active session
> - Database/API readback proving schedule/session linkage and snapshot identity
>
> ## Related
>
> - #104 fixed dashboard routing to scheduled workout details, but did not fix the Workouts-list inline Start payload.
>
>
> ## Acceptance clarification from September 2 production evidence
>
> When a scheduled workout is started, acceptance must verify persisted snapshot provenance even when the visible exercise list happens to equal the reusable template:
>
> - [ ] The active session contains a symmetric schedule/session link: `workout_sessions.scheduled_workout_id` points to the schedule and the scheduled workout's `session_id` points back to that session.
> - [ ] Every active-session set carries the exact source scheduled-set ID (`source_scheduled_set_id`) for all source scheduled sets; no source IDs are omitted.
> - [ ] Scheduled target values, explicit null/cleared targets, set order, sections, and superset groups survive materialization exactly.
> - [ ] Programming Notes, Agent Notes, and their metadata survive materialization exactly, including when exercise names and visible sets match the template.
> - [ ] Regression and installed-browser acceptance checks assert these persisted links, IDs, targets/nulls, ordering, supersets, programming notes, and agent notes/metadata—not only visible exercise equality.
>
> This clarification promotes the September 2 comment evidence into the body's acceptance criteria; the original comment remains unchanged.

### Exact live issue comment

The only live issue comment at capture time was comment `5517108054`, by `derekbeau`, created `2026-09-02T22:07:41Z`. It is preserved verbatim:

> ### Third production reproduction: September 2, 2026
>
> The Workouts-list inline Start path was used again.
>
> This time the visible workout happened to remain structurally correct because the reusable `Upper Strength + Back Width` template had been deliberately aligned with the scheduled snapshot immediately before scheduling. The user completed every intended exercise and target load.
>
> The hidden provenance still failed exactly as predicted:
>
> - `workout_sessions.scheduled_workout_id` was `NULL`.
> - The scheduled card's `session_id` pointed to the completed session, creating asymmetric linkage.
> - All 20 `session_sets.source_scheduled_set_id` values were `NULL`.
> - Scheduled target fields were absent from the session rows.
> - `exercise_agent_notes` was missing.
> - `exercise_programming_notes` contained null values rather than the scheduled snapshot notes.
>
> This demonstrates that visual equality between template and snapshot can hide the bug while progression/audit provenance is still corrupted.
>
> The production data was repaired after completion by mapping all 20 session sets to the exact scheduled exercise/set rows using `(exercise_id, section, set_number)`, restoring targets, order, supersets, Programming Notes, Agent Notes, and the symmetric scheduled-workout link without changing any logged performance.
>
> Additional acceptance requirement: tests must assert persisted `scheduled_workout_id`, every `source_scheduled_set_id`, target fields, and note snapshots, not only the visible exercise list.

## Known baseline and inspected implementation surface

The approved base is clean in the isolated worktree at `85930bd6497286bcc3153b77885e44feb1f31a82`, the merged PR #144 head. The original checkout `/Users/meridian/Projects/pulse-fitness-app` has pre-existing untracked artifacts; they are intentionally preserved and not copied, staged, or modified.

Observed baseline behavior and files:

- `apps/web/src/features/workouts/components/workout-list.tsx:357-483`: scheduled-card start fetches the reusable template, calls `buildInitialSessionSets(templateQuery.data)`, and sends `templateId`; it omits `scheduledWorkoutId`.
- `apps/web/src/features/workouts/components/workout-calendar.tsx:430-509`: scheduled calendar start has the same template-seeding shape.
- `apps/web/src/features/workouts/components/scheduled-workout-detail.tsx:254-289`: already sends `scheduledWorkoutId`, optional `force`, `startedAt`, and no template-generated sets; stale-snapshot conflict opens force-start recovery.
- `apps/web/src/hooks/use-workout-session.ts:172-212`: mutation caches the session and invalidates sessions, schedule list, the specific schedule when `variables.scheduledWorkoutId` exists, and cross-feature keys.
- `apps/api/src/routes/workout-sessions/index.ts:599-879`: request schema supports exactly one scheduled/template/ad-hoc mode. The scheduled branch reads the snapshot, checks ownership, handles an existing live link, stale exercise conflicts, builds snapshot sets/facts/notes, then calls the store with linking enabled. The template branch builds current template sets.
- `apps/api/src/routes/workout-sessions/store.ts:1358-1475`: creation is transactional; it inserts the session and set rows, then sets `scheduled_workouts.session_id` under owner + null-link predicates. The session foreign key is `scheduledWorkoutId`; set provenance/facts include `sourceScheduledSetId`, target fields, exercise/name/tracking snapshots, section, order, and supersets.
- `apps/api/src/db/schema/workout-sessions.ts:87-235`: persisted session linkage, note JSON, set target fields, source scheduled-set ID, snapshot facts, section/order, and superset group are present.
- `apps/api/src/db/schema/scheduled-workouts.ts:17-51`: schedule has `templateVersion`, date, nullable `sessionId`, and user/date/template/session indexes.
- `packages/shared/src/schemas/workout-sessions.ts:295-547`: session and request schemas preserve nullable targets and enforce exactly one start mode; `force` is a request-only recovery flag.
- `packages/shared/src/schemas/scheduled-workouts.ts:22-119`: schedule detail schema exposes exercise order, sections, notes, agent metadata, sets, targets, supersets, tempo/rest, drift, and stale-exercise state.
- Existing tests: `apps/api/src/routes/workout-sessions/index.test.ts` has scheduled snapshot, consumed/restart, stale, force, cancellation, and persistence coverage; `apps/web/src/features/workouts/components/{workout-list,scheduled-workout-detail,workout-calendar}.test.tsx` and `apps/web/src/hooks/use-workout-session.test.tsx` cover current mutations and UI behavior; shared schema tests cover contracts.
- `docs/DEVELOPMENT-PROCESS.md` is not tracked/present on this approved branch. The applicable Foundry/Goal-Mode contract is the loaded `derek-dev-workflows` reference, recorded here by its required execution rules.

## Fixed product and architecture decisions

1. The scheduled snapshot, not the reusable template, is canonical once a schedule exists.
2. All scheduled entry points use one shared client payload builder or equivalent single contract. No surface may hand-build template sets for an existing schedule.
3. A scheduled materialization has symmetric links: session `scheduled_workout_id = schedule.id` and schedule `session_id = session.id`.
4. Every source snapshot set carries its exact `source_scheduled_set_id`, including when visible values equal the template. No provenance inference after creation.
5. Snapshot values are copied exactly: exercise identity/name, section, order, set numbers/count, all target fields including explicit nulls, supersets, tempo/rest where active, programming notes, agent notes, metadata, and tracking facts.
6. “Start anyway” for an existing active session and “force” for stale exercises remain explicit flows; neither may change the source of truth.
7. “Create another anyway” is an explicit template/ad-hoc start. It creates an independent session and never consumes, links, or silently repairs the schedule.
8. Prefer a deterministic server-side scheduled path. Any ambiguous implicit matching must fail closed with a structured conflict rather than auto-linking a template-built session.

## Complete implementation surface

### Web entry paths

Audit and normalize every path that can start a scheduled workout: Workouts list inline Start, calendar scheduled-card Start, dashboard/snapshot links and actions, scheduled-workout detail, and any shared/template/session resume or duplicate actions. Detail already demonstrates the target contract. Preserve navigation query parameters, loading/disabled states, early-start confirmation, active-session conflict confirmation, stale-exercise recovery, toast/error behavior, and query invalidation. Do not require template detail data to start an existing schedule.

The shared scheduled-start payload must carry only schedule identity plus intentional start-time/session fields (`scheduledWorkoutId`, authoritative current date semantics, `startedAt`, optional `force`, and optional display name if the API allows it). It must not carry `templateId` or template-generated `sets` for an existing schedule. The duplicate/template path remains separate and may carry `templateId` and generated sets.

### API, persistence, and atomicity

Keep one validated start-mode discriminator. A request with `scheduledWorkoutId` must be owned by the authenticated user, read the immutable snapshot, and never fall through to template construction. A missing, malformed, foreign, deleted, or nonexistent schedule ID must return a structured 4xx/409 outcome without creating or linking a session. A template/ad-hoc request must not opportunistically attach itself to a same-day schedule; remove, guard, or redesign the fallback auto-link so no template-built session can masquerade as a scheduled materialization. Preserve explicit duplicate creation.

Create session row, all set rows, and the reverse schedule link in one transaction. On any insert/link conflict, roll back all rows and leave the schedule link unchanged. Make retry behavior explicit: a live linked session returns the existing-session conflict; after cancellation/unlink, a new scheduled start may materialize again; concurrent starts cannot create two linked sessions. Verify both link columns after creation.

### Canonical snapshot mapping

Map each snapshot exercise in stored `orderIndex` order and section. For each source set map source ID, set number, all reps min/max/exact, weight min/max/exact, seconds, distance, zone, section/order, superset group, and the session's mutable performance defaults. Copy exercise ID/name/tracking-type snapshot facts and programming/agent notes + metadata. Preserve null versus omitted semantics through Zod, JSON serialization, Drizzle, API response, and UI. Do not reconstruct provenance later from `(exercise_id, section, set_number)`; that tuple is only a diagnostic fallback for historical repair, never the implementation path.

### Authorization, dates, timezone, and idempotency

Every schedule/session/read/write query remains scoped to authenticated `userId` for both JWT and AgentToken paths. Agent conveniences must remain middleware-based and must not bypass schedule ownership. Use the existing authoritative local-day/date authority hook; early starts begin now but materialize the schedule snapshot and intentionally retain the scheduled date semantics defined by the existing API contract. Document and test the timezone boundary around local midnight and stale date authority. Do not use browser/template date guesses to select a schedule.

### Backwards compatibility

Preserve existing template starts, ad-hoc starts, AgentToken `templateName` convenience, direct scheduled starts, cancellation/unlink/resume behavior, soft-deleted/missing exercise stale handling, existing response envelopes and error codes, OpenAPI generation, legacy sessions with null provenance, and read paths that tolerate nullable historical fields. No production repair, migration, backfill execution, deployment, or launch is part of this PR. If a schema change is genuinely required, include only the migration and compatibility tests needed for new code; do not mutate canonical/production data.

## Acceptance matrix

1. **Structural divergence:** create a schedule, remove template exercises, add/swap scheduled exercises, reorder, alter sections/supersets, add/remove sets, and diverge the reusable template afterward. Start from every scheduled entry path. Assert exact active structure and no template leakage.
2. **Targets and nulls:** cover reps, weight range/exact, seconds, distance, zone, and explicit null clears. Assert persisted DB rows and API response, not only rendered text.
3. **Provenance:** assert `workout_sessions.scheduled_workout_id`, schedule `session_id`, every non-null `session_sets.source_scheduled_set_id`, set IDs, exercise/name/tracking snapshots, order/section/set number, and note/meta JSON. Include the identical-visible-template / 20-set-shaped regression described by the live comment.
4. **Notes and metadata:** programming notes, agent notes, author/generatedAt/scheduledDateAtGeneration/stale metadata survive exactly, including null values.
5. **Entry-point equivalence:** list, calendar, dashboard, and detail submit the same scheduled contract and yield equivalent materialization. Use populated UI inputs and production-shaped legacy fixtures.
6. **Early start/time authority:** confirm early-start UX, local-day semantics, midnight/date authority changes, and persistence after refresh/resume.
7. **Conflict and idempotency:** active linked schedule returns the existing-session conflict; stale exercises require confirmation then force-start uses the same snapshot minus explicitly skipped stale exercises; concurrent/repeated submission cannot create duplicate linked sessions; cancelled/unlinked restart behavior remains intentional.
8. **Isolation/auth:** JWT and AgentToken authorized paths work as intended; unauthenticated and cross-user schedule IDs return the existing safe errors and create no rows; template/ad-hoc starts never attach to a schedule.
9. **Atomicity/failure:** inject/cover duplicate link, invalid exercise, invalid target, and transaction failure. Assert no partial session/sets/link remain.
10. **UI quality:** loading, unavailable/deleted template, stale conflict, active-session confirmation, errors, responsive mobile layout, keyboard/accessibility states, and navigation are covered without requiring a template fetch for canonical scheduled start.
11. **Repository gate:** run focused shared-schema, API route/store, web mutation/component tests; then one full **uncached** lint, typecheck, test, and build at final implementation HEAD. Do not claim this gate in this docs-only handoff.
12. **Installed browser:** once implementation is final, use isolated real Chrome flows for create/customize/diverge/start from each path/refresh-resume. Retain raw command logs, API/database readbacks, and screenshot/trace paths. Record the exact tested code SHA. Evidence must be generated after the final code commit and must not be committed into the code/evidence commit itself.
13. **Git hygiene:** one implementation lane, no unrelated files, no secrets, clean final worktree, no merge by executor. A draft PR may be pushed/opened only with explicit authorization; production data repair/deploy/launch remain separate approval gates.

## Required executor completion report

Return `COMPLETE` or `BLOCKED`, exact branch and full SHA, commits/files, requirement-to-evidence mapping, all reviewer assignments/findings/dispositions, literal focused and full gate results, raw log/screenshot/trace paths, browser/API/DB readbacks, tested code SHA, remaining blockers, prohibited-action confirmation, and `git status --porcelain`. Do not use a self-referential evidence commit: evidence must identify the exact code/docs commit it tests, and any generated manifest/logs/screenshots remain outside the implementation commit unless separately approved.

## Explicit non-goals and approval boundaries

- Do not implement production code, migrations, schema changes, or tests in this docs-only preparation lane.
- Do not start tests, launch the UI, run browser flows, deploy, merge, repair production/canonical data, or touch Foundry.
- Do not assume the September production repair is a substitute for code correctness.
- Do not silently reinterpret template duplicate behavior as scheduled start.
- Push/open a **draft** PR only if the parent agent explicitly authorizes it after review; the executor must not merge.
