# #183 — Activity / Journal / Body / Session Context live UI and integrated acceptance

Parent Astra owns final approval of this spec. Do not implement, launch, merge, deploy, or close issues until Astra accepts it. This file is the executable checkpoint once approved.

## Authority and trial

Derek authorizes continuation on the existing isolated release lane after independent #182 acceptance at `ed3d6257875dc3b6fab8ce8fd2e39ed35473b032` (PR #187 comment). Work ONLY in `/Users/meridian/Projects/pulse-activity-journal-release` on `feat/activity-journal-release`. Verify shell cwd, branch, HEAD, and writable root before edits. Do not create a new worktree. Preserve `main` and other worktrees. Draft PR #187 exists; ordinary feature-branch commits/pushes are authorized. PR stays draft. No merge, production, deployment, issue closure, or second PR.

Live GitHub #183 still lists Calendar as remaining UI and still carries stale “current checkpoint: #177” wording; it is not authority. #182 already shipped the live Calendar page, nav, workout-only shared-record adapter, registered GET, and populated browser gate. Do not rebuild Calendar. Canonical intent: `docs/planning/activity-journal-body-context.md`. Closed #149/#151 remain constraints: no fabricated recovery/technique scores and no second injury registry. `GET /api/v1/context` and `GET /api/v1/context/feedback` stay unchanged owners.

Accepted predecessor heads (PR #187 comments where present; earlier Vector records for #176–#178):

| Child | Accepted head                              |
| ----- | ------------------------------------------ |
| #176  | `e32812100d73af2cd23be380ce275895c0459488` |
| #177  | `a46ffface3f80e3c89ba8dd9ed93f6ceee8d579c` |
| #178  | `dfea3ae66e625d669d870bf61a64154a3402c891` |
| #179  | `50c95e26e08faf884fae968d92901c18289be565` |
| #180  | `fde6124bf5d6793f5b4db7d3116ed943bf90555a` |
| #181  | `0a635e976474b29acd8cbfcee3a699e1de71fd61` |
| #182  | `ed3d6257875dc3b6fab8ce8fd2e39ed35473b032` |

Trial (launcher-owned; executor does not change models): GPT-6 Sol medium implements; a separate independent GPT-6 Sol medium review; Fast OFF always. Live UI plus provenance, approval, date/identity, and connected persistence warrant medium. Parent launches Desktop CUA only after Astra spec approval. No internal reviewer/subagent fan-out. Localized in-scope repairs stay with the implementer; structural/spec mismatch escalates to parent. Stop for independent acceptance at this checkpoint.

The later separate GPT-6 Sol actual-browser release + previous-10-PR audit is **not** this checkpoint and does not replace the #183 integrated live-UI gate.

Read AGENTS.md, live GitHub #183 and #182, the planning proposal, `activity-journal-release.md`, `activity-journal-contracts.md`, `activity-journal-182.md`, `activity-journal-181.md`, `session-context-migration.ts`, `apps/web/src/pages/{activity,journal,journal-entry,calendar,active-workout,injuries}.tsx`, `session-context.tsx`, `apps/web/e2e/calendar-182.spec.ts`, and registered Activity / Journal / body-context / daily-context / session-context / calendar runtime schemas before editing. Search coverage first. Preserve #176–#182 invariants. No new data ownership.

## Outcome

Replace preview/mock Activity, Journal, and Session Context with live reads of accepted canonical records. Users browse assigned vs actual Activity history, Journal source links and uncertainty, body-context cautions/guidance/flares, pending vs executed typed proposals, cross-thread check-in readback, and session-specific “What matters today.” Capture remains agent-managed. Calendar stays the #182 surface; this checkpoint only lands canonical Activity/Journal source links and proves connected identity. Missing stays missing. Unknown is not negative. No diagnosis, clearance, causality, cron, recorder, manual capture forms, LLM API, or fake product data.

## Inspected current state (do not regress)

- `/activity` uses `PreviewBanner`, page-local `mockActivities`, and `ActivityForm` (unauthorized manual capture). Preview `Activity` type is a single date/type/duration row; canonical Activity is activity + assignments + executions.
- `/journal` and `/journal/:entryId` use `PreviewBanner` and `mockJournalEntries`. Preview types (`post-workout`, habit chips, `createdBy: agent|user`) are not the canonical observation/provenance model.
- Session Context still hard-codes `hasPreviewCards = true`, sleep/recovery copy, inferred phase badges, and `workoutSessionContext` overlay in `active-workout.tsx`. #181 already ships `projectWhatMattersToday` and forbids populating `sleepStatus` / `trainingPhaseLabel` / mock injury ids from runtime.
- `#182` Calendar `hrefFor` sends activity/journal/body items to `/activity` or `/journal` list routes, not record ids. Workout/nutrition links are already canonical.
- `/profile/injuries` remains a separate preview. Do not convert it into a second concern registry.
- Writes for Activity, Journal, flares, proposals, check-in questions/answers remain AgentToken-only. Web JWT is read-only for those captures.
- Latest additive migration is `0072_journal_runtime`. #183 is UI + agent guide + integrated acceptance: no `0073`, no new tables, no new public write routes, no calendar rewrite.

## Frozen practical fixture (before any UI code)

One fictional America/Detroit owner. Isolated tmp SQLite named `pulse-activity-183-<id>.db` (tmp only, no symlink; same isolation rules as `calendar-182.spec.ts`). Distinct ports from any parallel lane. Seed the **primary** browser/HTML fixtures through registered authenticated APIs (JWT register + AgentToken writes + JWT reads). Do not complete this checkpoint from jsdom, mock-data, or Playwright `route.fulfill` as the only evidence. Label any later SQLite tamper as fixture-DB, not an API bypass.

Required seeded facts (stable ids in `data-record-id` / source links):

1. Canonical Activity with planned assignment local date Tuesday and completed execution local date Thursday (distinct ids).
2. Two owned workout sessions on the same subject: upper-body vs lower-body, with different relevant concerns / positive focus. One overlapping irrelevant knee concern retained on both. Soft-deleted exercise muscle authority remains a caution where #181 requires it; missing muscle identity is uncertain, not clearance.
3. Canonical Journal observation with at least one valid source link, `uncertainty: unknown`, and provenance class `user_observation`. A second observation uses `agent_suggestion` and must not display as clinician-authored.
4. Body concern + current guidance (clinician_authored or user_relayed_clinician) + flare recorded before any plan mutation. Typed proposal `activity_assignment_reschedule` or `scheduled_workout_reschedule` captured with an approval-statement and **not** approved; a second proposal is approved via the existing direct-JWT or trusted-relay API (not a new in-app capture form).
5. Daily check-in: one canonical question answered from thread A; thread B with a second AgentToken resumes the same question/answer (no duplicate). Include one `skipped`/`unknown` answer distinct from `denied`.
6. Weekly-reflection window that includes a saved Journal fact, an empty-day gap, and no scheduled-only workout counted as actual coverage.
7. Unstarted scheduled workout plus a completed session so Calendar workout-only ids still match #182 pairing. Do not restage the full #182 nutrition matrix.

HTML fixture `docs/implementation/activity-journal-183-fixtures/live-ui.html`: self-contained, openable as a file, embedded envelopes copied from registered GETs (`/activities`, `/activities/:id`, `/journal`, `/journal/:id`, `/journal/weekly-reflection`, `/daily-context`, `/workout-sessions/:id/session-context` for both sessions, `/planning/what-matters`, `/plan-change-proposals/:id`, `/calendar` for the same range). Correspondence test must equal those GET bodies. Not a substitute for the live pages.

## Architecture (fixed)

Reuse existing React Query + `apiRequest` + `.strict()` runtime parse pattern from `features/calendar/api/calendar.ts`. Parse with the owning shared runtime schemas. Do not invent a parallel client model that drops provenance, uncertainty, planned/actual dates, or missingInputs.

### Live pages this checkpoint owns

| Surface                                        | Reads                                                                                                                        | Must show                                                                                                                                                                                                                   | Must not                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/activity` and `/activity/:id`                | `GET /api/v1/activities`, `GET /api/v1/activities/:id`                                                                       | Canonical name; assignment `plannedLocalDate` vs execution `actualLocalDate`/outcome; provenance; source links; legacy rows as `legacy_date_only` with missing provenance; loading/empty/error                              | `ActivityForm`; page-local mock writes; conflating planned and actual into one date                         |
| `/journal` and `/journal/:entryId`             | `GET /api/v1/journal`, `GET /api/v1/journal/:id`, `GET /api/v1/journal/weekly-reflection`, `GET /api/v1/daily-context?date=` | Observation text; source links; uncertainty/freshness; four provenance classes; weekly facts vs explicit gaps; same-day check-in questions/answers; skipped/unknown ≠ denied                                                | Create/edit capture form; copying workout/activity logs as journal; unaided weekly recall copy              |
| Active workout Session Context                 | `GET /api/v1/workout-sessions/:id/session-context`                                                                           | `projectWhatMattersToday`: focus, relevant cautions, irrelevant retained, uncertain relevance, guidance, workload identities/native durations, missingInputs, co-occurrence `same_local_date` only, derived stale freshness | Sleep/recovery/phase cards; `workoutSessionContext`; empty relevant list as “no injuries”; composite scores |
| Journal date “What matters” (optional compact) | `GET /api/v1/planning/what-matters?date=`                                                                                    | Date-target facts for the Journal day under review                                                                                                                                                                          | A new primary nav item                                                                                      |

Remove `PreviewBanner` from Activity, Journal, and Session Context once they read live APIs. Keep it on `/profile/injuries` and other true previews.

### Calendar consumer (not a rebuild)

Allowed Calendar edits: `hrefFor` (and tests) so activity items resolve the owning canonical Activity and select the exact assignment or execution occurrence; journal items link to `/journal/:entryId`. Assignment and execution ids are not canonical Activity ids. Never pass a Calendar occurrence id blindly to `GET /activities/:id`. The link may instead resolve an occurrence through an existing owned API. Prove every deep link after hard reload. Do not change Calendar grid/agenda, filters, nav, nutrition overlay, workout-only adapter, or GET contract. Reuse valid #182 source-bound Calendar evidence; add only the missing connected link/identity sequence.

### Body context live UI (no new registry)

Body context appears on Session Context (concerns/guidance), Journal/Calendar (flares as observations), and Activity (typed proposal readback: pending vs executed, exact proposal revision, `approvedBy` vs `relayedBy`, statement/source/time). Do not rewrite `/profile/injuries`. Do not add in-app concern/flare/proposal capture forms. Derek’s trusted chat-relay policy stands: no second in-app approval product. Browser proof of approval is registered API then UI/Calendar reload.

### Agent operating guide

Add `docs/implementation/activity-journal-183-agent-guide.md` (pointer from `docs/conventions/agent-integration.md`, do not rewrite that file). Examples must call **real** #177–#182 routes, derive subject/actor from auth, and distinguish user / clinician-relay / agent provenance. Cover:

1. Initial conversation/voice capture of an Activity and a Journal observation (AgentToken writes; grammar/typo cleanup allowed; meaning/timing/uncertainty/source preserved).
2. Follow-up that asks only unanswered grounded check-in questions (`GET /daily-context` then answer).
3. Explicit routine reschedule via existing assignment-reschedule primitive (not a proposal).
4. Flare-first: record flare, optional pending follow-up, no silent plan mutation; then typed proposal + statement + approval.
5. Daily check-in resume across two tokens/threads.
6. Weekly grounding from `GET /journal/weekly-reflection` facts/gaps.
7. Safe refusal: no diagnosis, clearance, healing, pain causality, reminders/cron, fabricated load/recovery scores, LLM-inside-Pulse, voice recorder, or manual Pulse form.

`GET /context` and `/context/feedback` examples stay as they are.

Update `activity-journal-contracts.md` (#183 implemented UI; Calendar remains #182) and `activity-journal-status.md` after code exists. Do not edit historical SQL.

## Frozen hostile / integrated cases

Registered API seed + live browser (and focused web tests). Fictional fixtures only.

1. Planned Tuesday + actual Thursday remain two Activity identities/dates after reload; Calendar shows both; reschedule of the assignment does not move the execution.
2. Journal source link survives detail view and hard reload; `unknown` is labeled unknown, not denied/cleared.
3. Agent suggestion cannot be presented as clinician-authored. All four provenance classes remain distinguishable where present.
4. Flare appears without plan movement. Statement capture without approval leaves Calendar/Activity assignment unmoved. After registered approval, UI and Calendar show the committed effect only. Direct vs relayed audit fields remain honest.
5. Two AgentTokens: one check-in question/answer; Journal/daily readback does not duplicate it.
6. Upper vs lower sessions: different relevant concerns/focus; shared irrelevant concern retained; no sleep/phase; missingInputs include honest gaps (`sleep`, `training_phase`, `positive_focus` when applicable). Uncertain muscle evidence ≠ irrelevant ≠ cleared.
7. Weekly reflection lists saved facts and explicit gaps; scheduled-only workout does not suppress the actual-workout gap.
8. Legacy activity/journal rows render as date-only missing provenance; they are not correctable from the UI.
9. Owner isolation: another user’s JWT sees empty-or-unrelated Activity/Journal/Session Context, never foreign ids. Unauthenticated → visible 401/login, not mock data.
10. Empty owner: empty states, not mocks. Real API 422 overflow (if fixture hits a documented list limit) is visible and not truncated success. Playwright `route.fulfill` error rendering, if used, is labeled separately from real server errors.
11. Desktop 1280 and mobile 390: Activity, Journal, Session Context, and Calendar link targets remain usable; keyboard focus on primary controls; no product console errors.
12. Hard reload after seed: same canonical ids persist from the server (not React remount of the same store).
13. Product pages do not import `mockActivities`, `mockJournalEntries`, or `workoutSessionContext` as display data. Preview mock still fails `sessionContextRuntimeSchema` parse.
14. GET UI does not write plans, journal, flares, check-in, or receipts.
15. Do not rerun the full #176–#182 API hostile matrices unless a UI change could break a caller; reuse source-equivalent predecessor receipts.

## UI / browser acceptance (this checkpoint)

Codex built-in browser first; Playwright via `apps/web` e2e is the registered live-page gate (follow `calendar-182.spec.ts` isolation). Do not require installed-Chrome CUA.

- Live Activity, Journal, Session Context, and Calendar link identity on populated fixture
- Mobile and desktop, reload/persistence, empty/error/401, provenance/uncertainty
- Connected sequence: AgentToken mutation → originating UI → consuming Calendar/Journal/Session Context reload → registered GET readback of the same ids/dates
- Screenshots/readbacks retained under the evidence root
- HTML fixture correspondence is additional, not a substitute

## Verification (usage-efficient)

Focused checks while editing. Search/reuse Activity/Journal/session-context/calendar tests. One bounded self-review. Consolidated repairs. **One** final risk-relevant matrix after last substantive repair — do not rerun identical full suites per reviewer, for evidence-only commits, or as a giant #176–#182 rerun ritual.

Final matrix (inspect actual package scripts first): new web API adapters + page tests; Playwright `activity-journal-183` populated/connected/reload/error/mobile; Calendar href tests only; then `pnpm typecheck`, `pnpm lint`, `pnpm build` if source/web changed. Honor mandatory hooks; **no bypass**. Root `pnpm test` only if hooks did not already run that exact suite on the same source identity, or if fail-fast skipped it — then capture the missing gate independently. Reuse valid #181/#182 source-bound receipts for unchanged APIs/Calendar grid.

Evidence: `/Users/meridian/Projects/qa-reports/pulse-activity-journal-release/checkpoint-183`. Raw first-run stdout/stderr, exit, argv, source/test/config hashes. Record local command wall time and child CPU separately from CI queue/execution. Preserve failures and label superseded runs. No LLM polling. No retry-to-green. No model fan-out.

Commit coherent source/tests/docs, push only this feature branch, verify `HEAD == origin/feat/activity-journal-release` and a clean worktree. Return exact SHA, requirement-to-evidence map, gaps. End `Ready for independent GPT-6 Sol medium review: #183`. Do not open a second PR, merge, deploy, close issues, start the separate release-wide browser audit, or claim personal QA / production acceptance.

## Non-goals

New backend contracts or migrations; Calendar rewrite; `/profile/injuries` rewrite; voice recorder; manual capture/correction/approval forms; in-app LLM; diagnosis/clearance; reminders/cron; production data; merge; issue closure; the separate previous-10-PR audit.
