# Issues #184 and #185 — Goal-Mode Implementation Contract

Complete this specification 100%. Two coherent logical fixes land in one isolated branch/PR surface. Do not stop at a plan, partial pass, or happy-path test. Independent Hermes review happens later; do not self-accept.

## Exact execution context

- Repository worktree (implementation command cwd / only writable source root): `/Users/meridian/Projects/pulse-184-185-tdee-occurrence`. Desktop may open through the existing Pulse project; before editing, verify actual command cwd, branch and permission to write this isolated worktree. Do not edit the canonical project root. Receipts may also be written under `/Users/meridian/Projects/qa-reports/pulse-184-185/`. If supported permissions do not permit these paths, stop for approval rather than switching to main or widening scope.
- Canonical checkout (do not edit): `/Users/meridian/Projects/pulse-fitness-app` on `main` at `a22cfd8f33d23b06cde430cdf91f581202efeb59`, with unrelated untracked historical docs/artifacts. Preserve all of them.
- Other worktree to preserve (do not reset/reuse/remove): `/Users/meridian/Projects/pulse-body-progress-ui` on `feat/body-progress-ui`
- Approved base: `origin/main` exact SHA `a22cfd8f33d23b06cde430cdf91f581202efeb59`
- Working branch: `fix/184-185-tdee-idempotency-occurrence-isolation`
- GitHub issues (authoritative product text): [derekbeau/pulse-fitness-app#184](https://github.com/derekbeau/pulse-fitness-app/issues/184), [derekbeau/pulse-fitness-app#185](https://github.com/derekbeau/pulse-fitness-app/issues/185)
- This frozen contract path: `docs/implementation/issue-184-185-tdee-and-occurrence-isolation.md`
- Lane prepare identity (bootstrap only; `AGENTS.md` was the only tracked file usable at the approved base): `/Users/meridian/Projects/qa-reports/pulse-184-185/prepare-identity.json`
- Setup manifest after this contract commit: `/Users/meridian/Projects/qa-reports/pulse-184-185/lane.json`
- Final gate JSON: `/Users/meridian/Projects/qa-reports/pulse-184-185/gates.json`
- Receipt destination: a **new** directory under `/Users/meridian/Projects/qa-reports/pulse-184-185/receipts/` (never overwrite)
- Receipt runner: `python3 /Users/meridian/.hermes/skills/software-development/derek-dev-workflows/scripts/dev_lane.py run --worktree /Users/meridian/Projects/pulse-184-185-tdee-occurrence --gates /Users/meridian/Projects/qa-reports/pulse-184-185/gates.json --out /Users/meridian/Projects/qa-reports/pulse-184-185/receipts/<new-id>`
- Fail before editing if HEAD is not this contract’s committed SHA, the branch/worktree differ, or this worktree is dirty with unrelated files.

Read first: `AGENTS.md`; live #184/#185 bodies; `docs/specs/adaptive-tdee-v1.md` (do not change the 21-day window or ±150 cap); `packages/shared/src/utils/adaptive-tdee.ts`; `packages/shared/src/schemas/adaptive-nutrition.ts`; `apps/api/src/routes/adaptive-nutrition/{store,review-store,index}.ts` and their integration tests; Adaptive Nutrition UI under `apps/web/src/features/adaptive-nutrition/`; `apps/web/src/pages/active-workout.tsx`; `apps/web/src/features/workouts/lib/{active-session,session-notes,session-persistence}.ts`; session/template/scheduled stores and schemas; `apps/api/src/db/schema/workout-sessions.ts` unique index; existing tests named below.

Follow usage-efficient delivery. Launcher owns model/effort/Fast/permissions. No LLM polling. Focused checks while editing, one bounded independent review later, consolidated repairs, one final agreed matrix with raw first-run receipts.

## User outcomes

1. **#184.** After accepting an Adaptive TDEE recommendation, immediately running **Check in now** (or the weekly path) against the same completed evidence window must not produce another actionable calorie/TDEE increase. The 2410 → 2450 → 2480 ratchet is blocked. The UI states when the next eligible check-in is available.
2. **#185.** The same canonical exercise scheduled twice in different sections (Peloton warmup 300s and later ride 900s) behaves as two independent workout occurrences. Completing/editing one cannot mutate the other. History may aggregate under the canonical exercise without overwriting or double-counting sets.

## Inspected current behavior (source-bound)

### #184 ratchet

- `buildRecommendationBundle` seeds `priorTdee` from `findLatestAccepted` (`proposedTdeeKcal` of newest `status=accepted` check-in). A just-accepted proposal becomes the next prior even when analysis dates and observed expenditure are unchanged (`apps/api/src/routes/adaptive-nutrition/store.ts`).
- `SAME_DATE_TARGET_EXISTS` is appended as a reason code when a target already exists for the local date; it does **not** prevent an actionable `updating` recommendation.
- `acceptCheckIn` throws `AdaptiveSameDateTargetExistsError` only when `replaceSameDateTarget` is false. The UI (`adaptive-coach.tsx`) treats the reason code as a confirmation prompt and retries with `replaceSameDateTarget: true`. That is same-date **replacement**, not evidence-window consumption.
- Existing integration test explicitly accepts replacement of a same-day **manual** target (`store.integration.test.ts` around the `SAME_DATE_TARGET_EXISTS` case). Preserve first adaptive accept over a same-day **manual** target unless a test proves that path is the reported ratchet. Block a **second adaptive** accept/replacement that uses the same evidence window.
- `previewCheckIn` reuses a pending row only on identical fingerprint; after accept, a new preview with the same nutrition/weight days but a new prior TDEE is a **new** fingerprint and a new pending recommendation.
- Weekly review preview (`review-store.ts` `previewWithinTransaction`) calls `adaptiveStore.previewCheckIn`. Same-window weekly must be idempotent and non-actionable after an accepted adaptive check-in for that window.
- `getState().checkInDue` / `nextCheckInDate` are weekly-schedule fields, not “next eligible evidence” fields. **Check in now** remains enabled even when not due (`adaptive-coach.tsx` `CheckInActions`). After a same-window accept, the UI must explain the next eligible time (next completed-day cutoff and/or scheduled weekly date) and must not present a new actionable adjustment.

### #185 occurrence collision

- Live issue: schedule/session already has two Peloton Bike occurrences (warmup `targetSeconds=300`, supplemental `targetSeconds=900`), same canonical `exerciseId` and `setNumber=1`, different `sourceScheduledExerciseId`, session set IDs, and `sourceScheduledSetId`. One logged 500s; the other unlogged. **Do not reassign that historical 500s.**
- `templateExerciseById` is `Map(exercise.exerciseId → exercise)` (`active-workout.tsx` ~284–304). Duplicate `exerciseId` across sections last-write-wins.
- `setDrafts`, `exerciseNotes`, rest timer, add/remove set, and `getWorkoutSets` are keyed by `exerciseId` (`active-session.ts`, `session-notes.ts` `extractExerciseNotes`).
- `createSessionSetDrafts` merges session sets into `drafts[sessionSet.exerciseId]` by `setNumber`, so two section occurrences with `setNumber=1` overwrite each other.
- `toExerciseSectionKey(exerciseId, section)` exists for some remove/order paths; it is **not** sufficient for same-section duplicates and is not the setDrafts key.
- Session start snapshot `exercisePrescriptions` is keyed `${section}::${exerciseId}` (`workout-sessions/index.ts` ~521–535). Cross-section duplicates are distinct; same-section duplicates collide.
- API already has a test: `adds duplicate exercise ids in different sections and keeps section-local set numbering` (`workout-sessions/index.test.ts`). Persistence can store two sectioned occurrences; the active UI maps collapse them.
- Unique index `session_sets_session_exercise_section_set_number_unique` is `(sessionId, exerciseId, section, setNumber)`. Cross-section `setNumber=1` is allowed. Same-section two occurrences both `setNumber=1` would violate it.
- `session-detail.tsx` drafts are keyed by **set id** (safer). Audit completed-edit, corrections, template/scheduled updates, finalization, progression linkage, and history aggregation anyway.
- Last-performance/history APIs aggregate by canonical `exerciseId` (`exercises/store.ts`). Aggregation is allowed; occurrence/section must remain visible and sets must not overwrite or double-count.

## Fixed decisions

### Shared

- One branch, two logical commits or one commit with two clearly separated change surfaces. Do not mix unrelated refactors.
- No merge, no deploy, no production/canonical DB mutation, no `pnpm worktree:init`, no OrbStack/production snapshot, no Tailscale bind of a production-derived DB, no silent historical repair.
- `pnpm install` in **this** worktree is allowed. Do not copy `.env` or databases from the canonical checkout.
- JWT and AgentToken ownership isolation remains fail-closed.
- Do not change models/settings. Launcher-owned.

### #184

- An accepted adaptive weekly/manual check-in **consumes its evidence window** for target-decision purposes.
- A later weekly or manual preview/accept with the same analysis window and source evidence must return a deterministic hold / no-new-evidence outcome (`status` held or equivalent non-pending non-actionable). It must **not** create an actionable `updating` adjustment or a new target.
- A new adaptive recommendation requires `analysisEnd` strictly after the last accepted adaptive check-in’s `analysisEnd`, **or** another explicit, tested material-evidence rule (new eligible complete nutrition dates and/or weigh-ins inside an advanced completed-day boundary). Document the chosen rule in the PR/report. Do not invent silent extra sensitivity that re-enables the ratchet.
- Same-date accepted **adaptive** target cannot be silently replaced by another adaptive acceptance based on the same evidence. `SAME_DATE_TARGET_EXISTS` for that case must block, not merely annotate. Confirmation UI must not be a bypass for same-window adaptive ratchets.
- Preserve first-time adaptive accept that replaces a same-day **manual** target if that remains current product behavior (existing test). If implementation cannot distinguish those cases without breaking the ratchet fix, fail closed on second adaptive replacement and add tests for both.
- Do not change 21-day analysis window or ±150 TDEE safety cap.
- Do not remove manual check-ins when **new** eligible evidence exists.
- Do not retroactively mutate accepted review history or auto-revert an accepted target.
- UI must clearly explain when the next eligible check-in is available (next completed-day cutoff and/or scheduled weekly date). Empty/loading/error/disabled states must be honest on mobile and desktop.
- Manual-review idempotency and weekly scheduler/review preview must be covered by API/integration tests.

### #185

- Distinguish canonical exercise identity from workout **occurrence** identity across template → schedule → session → client state → persistence → history.
- Reuse existing occurrence IDs: `sourceScheduledExerciseId` when present; session set IDs for set-level drafts/mutations; `sourceScheduledSetId` for planned-set provenance. Do not create library exercises such as “Peloton Warmup” vs “Peloton Main”.
- Ad hoc/legacy sessions without scheduled IDs: define a stable fallback that does **not** merge ambiguous duplicates. Prefer explicit occurrence ids already on rows; otherwise a deterministic key that includes section and a per-occurrence discriminator (scheduled exercise id, template-exercise row id, or generated occurrence id persisted on the session). Bare `exerciseId` or `exerciseId+setNumber` is forbidden as a map/React key/mutation identity.
- Section-only fallback cannot support same-section duplicates. If same-section duplicate occurrences are product-forbidden, **fail clearly** (API 4xx / UI error) instead of silently merging. Do not change `session_sets_session_exercise_section_set_number_unique` unless tests prove same-section duplicate occurrences are required; the reported bug is cross-section.
- Each occurrence has independent targets, actuals, completion/skips, notes, timers, rest state, order, and grouping. Editing/completing/removing/reordering one cannot affect another occurrence of the same `exerciseId`.
- Use stable occurrence/set IDs in React keys, draft maps, callbacks, mutation payloads, optimistic updates/rollback, and restore-from-server. Trace start, pause/resume, refresh, failed-write retry, and completion.
- History may aggregate under canonical `exerciseId` but must retain occurrence/section and must not overwrite or double-count sets. Preserve native RIR and set provenance.
- **No silent repair of ambiguous historical actuals.** The live 500s log must not be reassigned. Read-only inventory: implement an owner-scoped, non-mutating query against **synthetic** fixtures in this lane proving suspected collisions can be listed (same canonical `exerciseId`, multiple `sourceScheduledExerciseId` / section occurrences, mismatched actuals). If a safe authorized production-derived snapshot is **not** present in this worktree (it is not; do not create one), **do not invent** a real-user inventory. Report `GATE: historical inventory requires authorized safe snapshot or explicit read approval` rather than guessing production sessions. A correction proposal, if any, is text-only and requires user confirmation later. No writes to historical actuals.

## Implementation surface (likely files; do not churn unrelated code)

**#184:** `packages/shared/src/utils/adaptive-tdee.ts` and reason-code schema if a new named code is required; `apps/api/src/routes/adaptive-nutrition/store.ts` (preview/accept/prior/same-date); `review-store.ts`; `index.ts`; Adaptive Nutrition UI (`adaptive-coach.tsx`, `format-adaptive-nutrition.ts`, weekly review components); tests: `store.integration.test.ts`, `review-store.integration.test.ts`, `index.test.ts`, `adaptive-coach.test.tsx`, `weekly-decision-review.test.tsx`.

**#185:** `apps/web/src/pages/active-workout.tsx` and colocated tests; `features/workouts/lib/{active-session,session-notes,session-persistence}.ts`; session-detail/completed-edit components; `apps/api/src/routes/workout-sessions/{index,store}.ts`; scheduled/template snapshot mapping; progression source linkage; history aggregation in `exercises/store.ts` as needed. Tests including `workout-sessions/index.test.ts` duplicate-section case, active-workout tests, session-detail tests.

Do not implement Activity epic #175. Related issues #104/#134/#90/#130/#139/#153 are different; do not reopen them except to avoid regressing their merged behavior.

## Acceptance matrix

### #184

1. Regression: unchanged inputs that produced 2410 → 2450 → 2480. First accept may move 2410 → 2450 (or the fixture’s equivalent). Immediate second preview/accept with the same analysis window (`analysisEnd` unchanged, same complete nutrition dates, same observed TDEE) is blocked: no 2480, no 2760 → 2790, no new adaptive target row. Reproduce the exact 2410 → 2450 → 2480 sequence against unchanged fixture inputs on the old behavior and prove the second adjustment is blocked after the fix. An equivalent-number case may supplement but does not replace this issue acceptance requirement; report a blocker if exact reproduction cannot be established.
2. Repeat **Check in now** (manual) and weekly preview/scheduler after accept: deterministic hold/no-new-evidence; idempotent; no extra target events.
3. New eligible completed-day evidence **does** allow a later recommendation (boundary advanced). Incomplete/pending today does not.
4. Same-date adaptive-on-adaptive replacement blocked. Manual-then-first-adaptive behavior covered by test.
5. Immutable accepted snapshots and historical target selection remain correct; no history rewrite.
6. UI: after same-window accept, user sees why a new adjustment is unavailable and when the next eligible check-in is. Mobile 390 and desktop 1280. Loading/error/disabled honest. Confirmation dialog must not bypass the new block.
7. Cross-user isolation: user B cannot consume or see user A’s window.

### #185

1. Synthetic plan: same seconds-only bike in warmup (300s) and supplemental (900s), each `setNumber=1`. Log 300/completed on warmup → supplemental stays 900/unlogged. Log 500 on supplemental → warmup remains 300. Verify API records, not only UI.
2. Independent notes, clear/skip, start/stop timer, add/remove set, reorder.
3. Repeated resistance exercise with distinct loads/RIR in different sections.
4. Both session-start routes (template start and scheduled start).
5. Refresh, pause/resume, failed-write optimistic rollback, finalize, completed-history and completed-edit views.
6. Legacy/ad-hoc instances without scheduled IDs: independent records or explicit rejection; never silent merge.
7. Same-section duplicates: permitted path with unique occurrence ids **or** clear failure; never silent merge.
8. Cross-owner isolation; no duplicate progression application; existing single-occurrence behavior unchanged.
9. Read-only synthetic inventory query + explicit production-inventory gate (no invented real sessions).

### Shared gates

- Focused unit/integration tests while editing (exact commands below).
- After last substantive repair: **one** final `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` via `dev_lane.py run` and `gates.json`. Do not also run identical package suites as separate final gates. Do not rerun the full matrix per reviewer or for evidence-only edits.
- Browser: Codex built-in browser first. Synthetic populated fixtures only. Widths **390** and **1280** required; 320/430/768 if a layout risk is real. Screenshots, accessibility readbacks, console errors, failed network requests. Installed Chrome/computer-use only for a documented capability gap.
- Clean worktree at the reported HEAD. Conventional Commits. Never edit `main`. No merge/deploy/prod.

## Precise known testing commands

Focused (iteration; adjust paths if files move, but run the real affected tests):

```bash
pnpm --filter @pulse/shared exec vitest run src/utils/adaptive-tdee.test.ts src/schemas/adaptive-nutrition.test.ts --maxWorkers=1
pnpm --filter @pulse/api exec vitest run src/routes/adaptive-nutrition/store.integration.test.ts src/routes/adaptive-nutrition/review-store.integration.test.ts src/routes/adaptive-nutrition/index.test.ts --maxWorkers=1 --no-file-parallelism
pnpm --filter @pulse/web exec vitest run src/features/adaptive-nutrition/components/adaptive-coach.test.tsx src/features/adaptive-nutrition/components/weekly-decision-review.test.tsx --maxWorkers=1
pnpm --filter @pulse/api exec vitest run src/routes/workout-sessions/index.test.ts --maxWorkers=1 --no-file-parallelism
pnpm --filter @pulse/web exec vitest run src/pages/active-workout.test.tsx src/pages/active-workout.remove-set.test.tsx src/features/workouts/lib/active-session.test.ts --maxWorkers=1
```

Add focused tests you create. Do not require Playwright as a launch blocker; if e2e is the honest way to lock a UI path, use a synthetic config and record the exact argv.

Final matrix (once after last repair):

```bash
python3 /Users/meridian/.hermes/skills/software-development/derek-dev-workflows/scripts/dev_lane.py run \
  --worktree /Users/meridian/Projects/pulse-184-185-tdee-occurrence \
  --gates /Users/meridian/Projects/qa-reports/pulse-184-185/gates.json \
  --out /Users/meridian/Projects/qa-reports/pulse-184-185/receipts/<new-id>
```

`gates.json` is `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`. Capture raw stdout/stderr, exit status, argv, cwd, SHA, hashes. Preserve failed receipts and label superseded runs. Narrative counts are not evidence.

## Browser evidence

Synthetic Adaptive Nutrition user (eligible program, Detroit timezone if reproducing #184 numbers) and synthetic workout with two Peloton-like duration occurrences. No production data.

Required retained evidence, bound to exact HEAD:

- #184: accept first recommendation; immediate Check in now; prove no second actionable target; UI copy for next eligibility; weekly path if in-scope in the running app.
- #185: log warmup 300 without touching supplemental 900; log supplemental 500 without changing warmup 300; notes/timer isolation; refresh/resume.
- Console/network: no unexplained errors; mutation payloads use occurrence/set ids, not bare `exerciseId` maps.
- Screenshots at 390 and 1280 with readbacks.

## Git and side effects

- Never edit `main`. Do not touch the canonical dirty/untracked files or `pulse-body-progress-ui`.
- Coherent Conventional Commits (`fix(nutrition): ...`, `fix(workouts): ...` or equivalent). Multiple internal commits OK.
- Do not merge. Do not deploy. Do not push or open a PR from this contract-only setup. After **implementation** is verified, push and open **one draft PR** linking #184 and #185 only if the PR contains the product fixes (not contract-only). Leave merge to humans.
- No production, no canonical data repair, no historical actual reassignment, no spend, no external accounts.

## Final report

Return:

- `COMPLETE` or `BLOCKED`
- branch and full HEAD SHA
- commits and files changed
- identity strategy for #185 (occurrence key, fallback, same-section policy)
- #184 evidence-window rule
- requirements → evidence mapping for every checkbox in both issues
- exact commands and literal results (receipt paths + hashes)
- browser evidence paths
- historical inventory: synthetic query result **or** the production-inventory gate (never invented sessions)
- remaining risks
- confirmation prohibited actions were not taken
- `git status --porcelain --untracked-files=all`
