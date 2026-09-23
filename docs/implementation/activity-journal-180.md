# #180 — Journal observations and grounded daily/weekly reflection

Parent Astra owns final approval of this spec. Do not implement, launch, merge, deploy, or close issues until Astra accepts it. This file is the executable checkpoint once approved.

## Authority and trial

Derek authorizes continuation on the existing isolated release lane after independent #179 acceptance at `50c95e26e08faf884fae968d92901c18289be565`. Work ONLY in `/Users/meridian/Projects/pulse-activity-journal-release` on `feat/activity-journal-release`. Verify shell cwd, branch, HEAD, and writable root before edits. Do not create a new worktree. Preserve `main` and other worktrees. Draft PR #187 exists; ordinary feature-branch commits/pushes are authorized. No merge, production, deployment, issue closure, or #181.

This checkpoint supersedes 5.6 routing and prior stop clauses for this task only. No new model trials.

Trial (launcher-owned; executor does not change models): GPT-6 Sol medium implements; a separate independent GPT-6 Sol medium review; Fast OFF always. Parent launches Desktop CUA after Astra spec approval. No internal reviewer/subagent fan-out. Localized in-scope repairs stay with the implementer; structural/spec mismatch escalates to parent. Stop for independent acceptance at this checkpoint.

Read AGENTS.md, live GitHub #180, `docs/planning/activity-journal-body-context.md`, `activity-journal-release.md`, `activity-journal-contracts.md`, `activity-journal-179.md`, shared `activity-journal-contracts.ts` / `daily-check-in-runtime.ts`, `apps/api/src/db/schema/journal.ts`, daily-check-in store/routes/source-authority/read-model, and existing journal/check-in tests before editing. Search coverage first; do not duplicate foundation schema tests or replay #179 suites. Preserve #176–#179 invariants, trusted agent-relayed approval, guarded workout dates, and check-in identity.

## Outcome

Agent-managed Journal persistence records meaningful health, nutrition, movement, and injury observations with owned source links, provenance, uncertainty, and immutable corrections. Daily retrieval and weekly reflection are derived from saved facts, with explicit gaps and repeat-safe aggregation. Check-in remains the one question/answer authority. No UI, voice recorder, LLM API, diagnosis, plan mutation, reminders/cron, broad diary, or replacement of canonical daily check-in.

## Inspected current state (do not regress)

- Foundation already exports `journalObservationSchema`, `createJournalObservationInputSchema`, `weeklyReflectionReadModelSchema`. There is no correction input schema and no journal runtime module.
- Shared `journalEntrySchema` / table `journal_entries` is the legacy flat row (type/title/content/createdBy). No registered Journal route or store. Existing journal schema tests cover only that legacy shape.
- Daily context `observations` are flare rows mapped to `healthObservationSchema`. That array is not the Journal. Check-in source kinds include `observation` (flare) and exclude `journal_entry`.
- Latest additive migration is `0071_daily_check_in_runtime`. Next owner migration is `0072`.
- Web `/journal` remains mock preview until #183.

## Architecture (fixed)

### Records and authority

| Kind                                                                    | Owner                  | Current revision                          | Deletion             | Usable facts                                                                                         |
| ----------------------------------------------------------------------- | ---------------------- | ----------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| Canonical journal observation                                           | #180 store             | `currentRevisionId`                       | cascade with subject | title, content, category, localDate/timeZone, provenance, source ref set                             |
| Legacy `journal_entries`                                                | unchanged table        | none                                      | existing cascade     | date/title/type/content only; no source, timezone, actor, revisions                                  |
| Check-in question/answer                                                | #179 store             | existing                                  | unchanged            | Journal may **link** to current owned answers/questions; Journal must not create/answer/correct them |
| Flare `observation`                                                     | #178                   | semantic fingerprint via source-authority | unchanged            | Daily context `observations`; Journal may link, must not rewrite flares                              |
| Activity / workout / nutrition / concern / capability / guidance / meal | existing domain stores | #179 source-authority tokens              | unchanged            | Journal source refs only; do not copy routine logs into Journal                                      |

Reuse `apps/api/src/routes/daily-check-in/source-authority.ts` for every non-journal source kind. Do not reimplement lifecycle rules inside the Journal aggregate. Do not add `journal_entry` to `dailyCheckInSourceKindSchema` in this checkpoint (check-in identity frozen).

### Canonical identity

Journal observations are new records. Identity is the server-assigned id, not a semantic topic hash. Deduplication is idempotency `(subjectUserId, route, operation, key)` only. Two different keys with similar text are two observations. Prompt wording, thread id, and client fingerprint are not identity.

Source references are a deterministic set of structured `[kind, id, revisionId]` tuples. Validate **every** supplied token (owned, current, allowed kind, non-null revisionId copied from current readback) **before** dropping exact duplicates and sorting. Stale/foreign/wrong-kind/soft-deleted/missing sources fail closed as `OWNED_LINK_NOT_FOUND` without disclosing the foreign id. Reorder/repetition of the same valid set is the same stored set. Distinct source revisions or a different source are a different observation payload (idempotency conflict if the key is reused).

Allowed Journal source kinds: `activity`, `activity_assignment`, `activity_execution`, `activity_goal`, `workout_session`, `scheduled_workout`, `body_concern`, `capability`, `guidance`, `observation`, `check_in_question`, `check_in_answer`, `proposal`, `nutrition_log`, `meal`. Reject `journal_entry` on create (no self-link). Workout feedback is linked via current `workout_session` fingerprint and/or the owned `check_in_answer` that captured it; do not invent a new owned-entity kind.

### Meaningful vs routine (executable)

Create/correct must be an observation, not a log clone.

- Runtime write categories: `health | nutrition | movement | injury` only. Reject `weekly_reflection` on POST/PATCH-equivalent correction (`VALIDATION_ERROR`). Weekly reflection is a derived read, not a stored row.
- Require `min(1)` owned source refs and non-empty title/content (foundation already requires this).
- After sources load, reject `ROUTINE_LOG_COPY` when normalized content equals any linked source’s canonical name, summary, flare text, check-in prompt, or current answer value, or equals `completed {name}` / `{calories} kcal` derived from that source. Positive control: same sources plus additional observation text must succeed.
- Do not NLP-filter arbitrary prose. Do not copy every workout/activity/nutrition row into Journal or weekly facts.

### Daily context integration

Additive only on `dailyContextRuntimeResponseSchema`: `journalObservations` as `journalObservationSchema[]` for the requested local date, owner-scoped, bounded, deterministic order (`createdAt`, `id`). Do not put Journal rows into `observations` (flares). Do not change pending question identity, answer CAS, or GET `/context` compatibility. Journal reads check-in; check-in does not initialize from Journal.

### Weekly reflection (derived, no LLM)

`GET /api/v1/journal/weekly-reflection?start=YYYY-MM-DD&end=YYYY-MM-DD` uses the subject’s authoritative IANA timezone. `end >= start`, inclusive, max 14 days. No LLM API.

Facts, in stable order (`localDate`, kind, id):

- canonical Journal observations in range (summary = persisted content; source refs = stored set plus the journal_entry current revision)
- current **answered** check-in answers whose question `localDate` is in range (summary = answer value; source refs = question sources plus the answer)
- flare observations in range (summary = flare text; source ref = `observation`)

Gaps (required, not empty when data is missing):

- each local date in range with no journal observation and no answered check-in
- `unknown` / `skipped` answers (explicit; not facts, not negatives)
- missing nutrition or workout for a date is a gap label, never zero intake or “cleared”

Repeat GET with unchanged persisted facts yields identical `facts` and `gaps` (ignore `generatedAt`). No diagnosis, healing, causality, or unsupported certainty in summaries (copy persisted text only; do not paraphrase into medical claims).

### Persistence

Additive `0072_journal_runtime.sql`: current journal observations, immutable revisions (root `createdAt` vs revision `recordedAt`, actor, reason, priorRevisionId, snapshot of title/content/category/source set/provenance), idempotency receipts. Never mutate historical SQL or convert `journal_entries`. List may include legacy rows as `legacy_date_only` with an explicit statement that source links, timezone, actor, and revisions were never recorded. Canonical correction of a legacy id is `404` / not-found, not an in-place update.

Auth: AgentToken-only writes; JWT or AgentToken reads. Subject and actor come only from authentication. External request schemas omit subject/actor (mirror daily-check-in-runtime). CapturedBy/capturedAt are server-stamped. Four provenance classes survive. `unknown` is not `denied`.

Corrections: expected current revision CAS; non-empty `correctedFields`; required reason; append immutable revision; prior source/time/actor intact; current projection equals latest revision. Empty correctedFields rejected.

Concurrency: transactional uniqueness + CAS. Reuse the existing independent-writer worker harness (two API processes, distinct SQLite WAL handles, deterministic barrier). One durable winner; visible stale/idempotency loser; no partial row/receipt.

Failed writes roll back atomically. Account erasure cascades. Read/resume after DB reopen uses persisted rows, not process cache.

## Routes

Register under `/api/v1` with real OpenAPI. Register `GET /journal/weekly-reflection` **before** `GET /journal/:id`.

| Route                                             | Auth       | Result                                                                                                            |
| ------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/journal`                             | shared     | bounded list; query `from`/`to` YYYY-MM-DD, default subject-local today, max 31 days; canonical + explicit legacy |
| `POST /api/v1/journal`                            | AgentToken | create; `createJournalObservationApiInput`                                                                        |
| `GET /api/v1/journal/:id`                         | shared     | current + ordered history                                                                                         |
| `POST /api/v1/journal/:id/corrections`            | AgentToken | immutable correction                                                                                              |
| `GET /api/v1/journal/weekly-reflection?start&end` | shared     | `weeklyReflectionReadModelSchema`                                                                                 |

Add `packages/shared/src/schemas/journal-runtime.ts` for API inputs/list query/detail (auth-derived; do not weaken foundation). Additive daily-context field documented in contracts inventory. Minimal agent-integration examples. Update `activity-journal-contracts.md` runtime status and `activity-journal-status.md`.

## Frozen hostile / compatibility cases

Registered API tests, fictional fixtures only:

1. AgentToken capture of all four provenance classes; uncertainty `unknown` ≠ denied; restart/readback preserves links, actor, capturedAt vs sourceOccurredAt vs createdAt vs recordedAt (controlled clock).
2. Meaningful observation with Activity execution + concern sources succeeds; verbatim workout-name / answer-value / flare-text copy is `ROUTINE_LOG_COPY` with no row.
3. Same idempotency key/payload replays including after restart; changed payload same key is `IDEMPOTENCY_KEY_REUSE` and no mutation; spoofed subject/actor/scope ignored or 400; JWT write 401/403.
4. Missing, stale, wrong-kind, foreign, soft-deleted, and nested subject-mismatch sources: `OWNED_LINK_NOT_FOUND`, no disclosure, validate-before-dedupe (valid duplicate must not hide a stale alternate).
5. Correction CAS: winner appends revision; loser `STALE_REVISION` with expected/current; prior revision bytes unchanged; new source set on current only.
6. Two agent tokens / threads: Journal write does not duplicate or answer check-in questions; GET daily-context still one canonical question/answer; `observations` remain flares; `journalObservations` lists the new entry.
7. Genuine two-process WAL races: duplicate create same key; competing corrections. Assert one winner, visible loser, no partial receipts.
8. Weekly: facts trace to saved rows; gaps for empty days and unknown/skipped; two generations match facts/gaps; DST spring/fall and UTC-day boundary keep local dates; range inverted or >14 days 400; `weekly-reflection` is not captured as `:id`.
9. Legacy `journal_entries` row survives 0072; listed only as `legacy_date_only`; cannot be corrected; no fabricated provenance.
10. Additive migration: fresh DB, populated exact predecessor through 0071, rerun no-op, transactional rollback, FK/`integrity_check`, account deletion. Never edit old migration SQL. Advance older complete-chain counts precisely, do not weaken them.
11. Journal create/correct never mutates plans, workouts, flares, or check-in rows. Label any fixture-DB tamper probes as such; they are not API bypasses.
12. Check-in source-kind enum and identity algorithm unchanged.

No browser/UI gate. No production DB.

## Verification (usage-efficient)

Focused checks while editing. Search/reuse existing journal and check-in tests. One bounded self-review. Consolidated repairs. **One** final risk-relevant matrix after last substantive repair — do not rerun identical full suites per reviewer or for evidence-only commits.

Final matrix (inspect actual package scripts first): new journal shared/runtime tests; registered journal API/persistence/auth; independent-writer; 0072 migration lifecycle; affected daily-context/check-in regressions that would break if the additive field or source-authority reuse is wrong; then `pnpm typecheck`, `pnpm lint`, `pnpm build` if source/API/shared changed. Honor mandatory hooks; **no bypass**. Root `pnpm test` only if hooks did not already run that exact suite on the same source identity, or if a fail-fast skipped it — then capture the missing gate independently.

Evidence: `/Users/meridian/Projects/qa-reports/pulse-activity-journal-release/checkpoint-180`. Raw first-run stdout/stderr, exit, argv, source/test/config hashes. Record local command wall time and child CPU separately from CI queue/execution; do not infer CPU from wall. Preserve failures and label superseded runs. No LLM polling. No retry-to-green.

Commit coherent source/tests/docs, push only this feature branch, verify `HEAD == origin/feat/activity-journal-release` and a clean worktree. Return exact SHA, requirement-to-evidence map, gaps. End `Ready for independent GPT-6 Sol medium review: #180`. Do not open a second PR, merge, deploy, close issues, or start #181.
