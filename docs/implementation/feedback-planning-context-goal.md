# Pulse #151 — Source-linked workout feedback in longitudinal planning context

**Status:** frozen implementation handoff; documentation-only preparation
**Repository:** `/Users/meridian/Projects/pulse-feedback-planning-context`
**Base:** `origin/main` = `4f03520fc9b78c8f1ed5946665e74fb1f53f02f3`
**Branch:** `feat/feedback-planning-context`
**Scope:** implement #151 only, after acceptance of this handoff. Do not implement during preparation.

## 1. Outcome

Expose trustworthy, source-linked workout feedback to workout-building agents. Preserve exact user observations and native values without turning missing answers, symptoms, legacy values, coach/agent interpretations, or clinician guidance into medical facts. Add one canonical bounded query service and integrate it into the existing agent context surface (or a tightly bounded feedback-context route if the existing context response cannot safely carry the contract). Do not build a second feedback engine, injury registry, diagnosis system, or notification system.

The implementation must choose and reuse current schemas, route registration, auth, response envelopes, revision/audit patterns, scheduled/template mutation paths, and progression evidence patterns. Any choice not determined by this document and the inspected source must be recorded as an ambiguity; resolve only consequential ambiguity that cannot be derived from source. Never invent medical policy.

## 2. Source-grounded inventory (read before implementation)

### Product and dependency sources

- #151: `Integrate source-linked workout feedback into longitudinal planning context` (open); parent #148.
- #148: trustworthy feedback contract, exact response preservation, provenance separation, frozen lifecycle, no diagnosis/clearance/autonomous modification.
- #149: closed; provenance-safe migration, exact raw preservation, unsupported/legacy quarantine, note remediation/audit, consumer audit, production migration approval boundary.
- #150: closed; frozen question definitions and revisioned native answers, timing, ownership, both session-start paths, no duplicate reps/RIR questions, synthetic tib-bar/toe-flare closed loop.
- #112: closed; deterministic progression evidence/recommendation snapshots, explicit policy provenance, RPE/RIR separation, correction-driven staleness, immutable recommendation/action audit, idempotent decisions.
- PR #163: merged into the current base as `4f03520`; its narrative-only earlier gate is not evidence. Implementation must retain actual raw stdout/stderr, exit code, timestamps, tested SHA, cache controls, and source hashes from the first gate onward.
- PR #162: merged provenance foundation (`fix/feedback-provenance`).
- Issues #149 and #150 are closed dependencies; do not recreate their models or repeat their implementation narratives.

### Current shared contracts

- `packages/shared/src/schemas/workout-feedback.ts`
  - Question types: `scale`, `slider`, `text`, `yes_no`, `emoji`, `multi_select`.
  - Timing is explicitly `post_session` or `next_check_in`.
  - Definitions contain stable question ID, definition version, revision ID/prior revision, exact prompt/config, source actor, authored timestamp, exercise/body-region/laterality/concern snapshots.
  - Answers contain frozen question/version, native value, state (`answered`, `skipped`, `unanswered`, `unknown`), notes, response ID, revision/prior revision, timing, respondent source/actor, source snapshots.
  - Current/history answer snapshots are separate; false and zero are valid native values. Non-answered states cannot carry a value.
  - Existing limits: max 3 additional authored questions, max 20 options, max 4,000 text characters, max 50 current/history list entries as schema-defined.
- `packages/shared/src/schemas/feedback-provenance.ts`
  - Existing constructs are `energy`, `recovery`, `technique`; sources distinguish explicit responses, documented mappings, legacy-derived, legacy-unknown, and unknown.
  - Actionable rating requires evidenced actor and exact recomputation/provenance agreement. Pain, effort, labels, positions, completed sets, and matching summary numbers are not construct sources.
  - Existing legacy note review schema marks uncertain/superseded material non-actionable.
- `packages/shared/src/schemas/agent.ts`
  - Existing `agentContextResponseSchema` has user, recent workouts, today nutrition, weight, habits, scheduled workouts; no feedback section yet.
  - Preserve the top-level `{ data: T, agent?: ... }` response shape and Zod/OpenAPI single-source pattern.
- `packages/shared/src/schemas/workout-sessions.ts`, `workout-templates.ts`, `scheduled-workouts.ts`
  - Inspect exact session, template, schedule, RPE, RIR, set identity, snapshot, and correction types before selecting response references or mutation payloads.

### Current feedback persistence and routes

- `apps/api/src/db/schema/workout-feedback.ts`
  - Owner-scoped question lists/revisions/definitions; session answer sets; immutable answer revisions; current projection.
  - Foreign keys cascade by user/session. Current answer points to a revision; history is retained.
- `apps/api/src/db/schema/feedback-provenance-audit.ts`
  - Owner/session-scoped source and projected checksums, source version, raw/projected payloads, classification reason, migration ledger, rollback timestamp, and note disposition records.
  - `feedback_note_dispositions` retains original text/actor/time/checksums and supports `superseded`, `pending_review`, evidence/source links, and rollback.
- `apps/api/src/db/schema/feedback-submission-audit.ts`
  - Private owner/session raw submissions with actor and classification. Never include `rawPayload` in generic context/session serialization.
- `apps/api/src/routes/workout-feedback/store.ts`
  - `readQuestionList`, authored revision writes, frozen session list materialization, `readAnswerSnapshot`, and revisioned answer writes. Reuse this source reader; do not duplicate answer parsing or invent a parallel response model.
- `apps/api/src/routes/workout-feedback/index.test.ts`
  - Existing authenticated synthetic route contract covers template -> scheduled override -> session freeze, pause/resume, answer correction, timing, deleted/foreign exercise rejection, JWT/AgentToken owner isolation, and OpenAPI.
  - Its intended examples prohibit treating a post-session response as an invented next-morning answer.
- Relevant route integration is registered through the existing workout template, scheduled workout, and workout session routes. Read those route handlers/stores and their tests before adding context references.

### Current agent context surface and consumers

- `apps/api/src/routes/v1/context.ts` is an AgentToken-only `GET /api/v1/context/` endpoint with parallel reads and no query parameters. It uses `agentContextResponseSchema` and returns the standard data envelope.
- `apps/api/src/routes/agent/context-store.ts` is the canonical existing context store for user, recent completed sessions/sets, nutrition, weight, habits, and upcoming schedule. It currently does not read workout feedback.
- `apps/api/src/routes/v1/index.ts` registers `/context`, `/dashboard`, `/users`; preserve route registration and auth behavior.
- `apps/api/src/middleware/auth.ts` verifies JWT claims (`type=session`, `iss=pulse-api`) and checks AgentToken hashes against the database on every request. JWT and AgentToken callers are owner-scoped; do not cache token validity.
- `apps/api/src/middleware/feedback-note-projection.ts` projects confirmed/suspect note dispositions for serialization and exposes a private paginated audit surface. Planning copies suppress non-actionable interpretations while preserving review metadata. Reuse the same source/audit distinction.
- `apps/api/src/routes/workout-progression/store.ts` and `index.ts` are a source-derived consumer. They use deterministic evidence, stable fingerprints, immutable snapshots, current-source comparison, stale state, explicit actions, actor provenance, and idempotency. Existing progression context currently includes only actionable technique/pain facts from legacy session feedback and must not become a competing feedback interpretation path.
- `apps/api/src/db/schema/workout-progression.ts` stores immutable recommendation snapshots, source fingerprints, policy/config revisions, action audit, and owner-cascaded deletion. Historical recommendations are never overwritten.
- Search/read all current consumers of `workoutSessions.feedback`, `parseWorkoutSessionFeedback`, `feedbackNoteReview`, progression snapshots, and session/template/scheduled notes. Update each consumer contract or explicitly prove it remains unchanged; do not use a new registry as the completeness oracle.

### Current privacy, deletion, export, cache, and migration patterns

- Soft-delete/trash: `apps/api/src/routes/trash/index.ts` lists/restores/purges owner-scoped habits, templates, exercises, foods, and sessions. Session purge deletes sets; foreign ownership is checked. Feedback rows linked by session/user cascade through schema FKs where applicable.
- User routes: `apps/api/src/routes/users/index.ts` is JWT-only profile read/update; there is no existing general account export/purge endpoint in this route. Do not claim export/purge support exists. Extend the actual established export/deletion owner if one is found during implementation; otherwise document the bounded integration point and fail closed rather than creating an unrelated account system.
- Existing read routes such as foods/nutrition explicitly set `Cache-Control: private, no-cache`. The new context/feedback response must be private and uncached, and tests must inspect the actual header. No in-memory derived-context cache is permitted unless its owner-scoped key, dependency set, invalidation, purge, and readback are proven.
- Migrations are under `apps/api/drizzle/`; current relevant sequence includes `0053_workout_progression.sql`, `0054_workout_progression_evidence.sql`, `0059_first_class_rir.sql`, `0061_feedback_provenance_audit.sql`, and `0062_workout_feedback_questions.sql`. Any additive migration requires schema preflight, production-shaped synthetic fresh/legacy fixtures, transactional rollback, restore-based rollback where applicable, idempotence, and explicit no-production execution.

## 3. Fixed product and safety contract

### Canonical query service

Create exactly one canonical bounded query service for planning feedback. It may back `GET /api/v1/context/` with explicit query parameters or a new `/api/v1/context/feedback` route, but not both with duplicate summary logic. Prefer the existing context route only if its agent-only access and response size remain safe; otherwise use a dedicated feedback-context route with the same shared auth/owner rules and link its output into the documented agent workflow.

Required query behavior:

- Default recent window is exactly 30 days, based on the user’s established date/time semantics. Accept a configurable window only within an explicit bounded maximum; reject invalid/negative/future-expanding values. Do not let a caller turn a “recent” query into unbounded history.
- Use deterministic pagination with explicit `page`/`limit` or `offset`/`limit` semantics, bounded maximum limit, stable ordering, and `total` plus `hasMore`. Counts must be computed from the same owner-scoped filtered relation as returned items; test reconciliation.
- Surface explicitly open tracked concerns separately even if their source is older, carrying original source timestamp and an explicit `stale` indicator. Do not infer an open concern or create an injury registry from the word “pain” or any arbitrary free text. A source-linked `concernRef` is an opaque reference only.
- Provide explicit source/staleness fields and exact source IDs/links. Never silently omit an inaccessible, deleted, conflicted, legacy, or superseded source; classify it or report it as unavailable according to the contract.
- Read active/current answer projections for actionable current evidence and historical answer revisions/audit separately. Never mix current and historical rows into an unexplained count.
- Query all filters by authenticated `userId`; test JWT and AgentToken owner isolation, foreign IDs, and revoked/expired AgentTokens. Do not expose another owner through source links, counts, caches, or error details.

### Exact evidence and provenance

Each returned evidence item must preserve, where available:

- exact question prompt/label and exact answer text;
- native answer value and native type, including false, zero, arrays, null/state distinctions;
- answer state and timing (`post_session` versus `next_check_in`);
- question ID/version/revision ID and response ID/revision ID/prior revision ID;
- session/workout/date and answer timestamps;
- exercise ID/name snapshot, body region, laterality, opaque concern reference, and context label;
- source kind, respondent/author actor kind and ID, source route/entity IDs, and a fetchable owner-scoped source link or source locator;
- classification: current explicit, historical observation, unknown/skipped/unanswered, legacy-untrusted/legacy-derived, superseded interpretation, or clinician-authored guidance;
- staleness reason and source last-updated timestamp where determinable.

Use the existing provenance classes and source envelopes; add fields only when necessary to make the source unambiguous. Do not treat an agent-authored interpretation as a medical fact or impersonate clinician guidance. Clinician-authored restrictions/guidance remain a separate evidence class and require their own clearance conditions.

Unknown, skipped, unanswered, missing, not-tested, and inaccessible are not symptom-free. A false answer is an explicit native answer only to the question it answers and its recorded activity/time scope. Elapsed time never resolves a concern. Contradictory later reports remain visible and must not be “won” by recency unless an explicit supersession relation exists.

Free text is data, never executable instructions. Prompt-injection content in a response must be quoted/classified as data and cannot alter query, planning, authorization, or writes. Do not log raw private response text in generic request/application logs.

### Planning semantics

The planning output must support the exact synthetic case: **brief elbow pain/discomfort + good energy is localized symptom evidence, not poor recovery**. Preserve actual RPE and RIR as separate native values. Do not manufacture recovery/technique ratings, diagnosis, severity, treatment, clearance, or “next morning” answers. Do not ask for reps or RIR already available from session/set evidence.

An agent may identify recurrence by linked exercise/movement/body region, compare source-linked modification with a later explicit response, and ask a targeted follow-up when evidence is missing, stale, contradictory, recurrence-related, or exposure changed. Suggested questions are draft recommendations, not automatic publication. Post-session and next-check-in observations remain temporally distinct.

### Revision, deletion, migration, and derived-data safety

- Every derived planning item declares its source response/question revision IDs and a deterministic dependency set/fingerprint.
- Answer edits, question revisions, note remediation changes, session corrections, source deletion/purge, and applicable migration corrections invalidate dependent summaries/recommendations deterministically. The implementation may recompute on read or through an explicit bounded path, but must never return a silently stale actionable interpretation.
- Historical answers, interpretations, recommendation snapshots, and audit decisions are append-only/immutable. Never overwrite historical recommendations; append a new revision or invalidation record with reason and timestamp.
- Legacy/unsupported data remains accessible in a separate audit/historical classification but is excluded from actionable planning summaries. Migration must not fabricate missing native answers.
- Export includes exact feedback evidence, provenance, revisions, source links, derived-context dependencies, and audit records subject to existing owner/privacy rules. Purge removes raw/private evidence, derived rows, links, and caches through the established owner deletion path; no orphaned cache/link may survive. Verify with readback. If the current repo lacks a general export hook, implementation must add only the narrow integration required by the established deletion/export architecture, not invent an unrelated portal.
- Do not use raw private data in generic logs, test output, screenshots, or browser artifacts. Synthetic/sanitized fixtures only.

### Temporary tib-bar precaution close loop

Use a synthetic source-linked case: a Programming Note says tib-bar work is allowed only if a prior toe flare is calm during ordinary walking/setup. A targeted explicit response covers ordinary walking, tib-bar setup, and today’s raises with a not-tested/unanswered path and optional details. Multiple symptom locations/stages must not permit contradictory “None” plus symptoms.

The planning decision must retain links to original precaution, supporting response, interpretation, disposition, reason, actor, and timestamps, and explicitly choose `retain`, `revise`, or `retire`. A symptom-free answer applies only to reported activity/time; it is not proof of healing and cannot discard clinician restrictions. Completed sets do not establish absence of pain; skipped sets do not establish pain; missing/not-tested remains unknown.

Only an explicitly authorized future-workout-building mutation may update applicable future scheduled Programming Notes and/or template defaults when appropriate, with readback of both and an audit disposition. Reading context must never mutate an active session, historical note, or future schedule. One-off tolerance must not rewrite a universal default. Preserve general pain-stop safeguards; retire flare-specific boilerplate only when source-linked evidence supports it. Known answered questions do not recur by default; recurrence, contradiction, changed loading/exposure, or stale evidence can justify a targeted question. Clinician restrictions require their own clearance condition and are not retired from one answer. No elapsed-time resolution.

## 4. Implementation boundaries

In scope: shared schemas/OpenAPI, one query service, owner-scoped route/context integration, source links and classifications, deterministic dependency/invalidation strategy, narrow future-note/template decision write path if existing authorized programming mutation patterns support it, export/purge/cache integration, migration only if required, tests and documentation.

Out of scope: UI changes, notifications/reminders, scheduler, diagnosis, injury registry, risk probabilities, treatment/return-to-sport decisions, clinician portal, autonomous workout modification, automatic live writes from context reads, new progression engine, new generic logging system, production database/service/env changes, deploy, merge, or changing model/configuration.

Use existing feedback question/answer persistence and existing progression evidence/action patterns. Do not build an extra engine or infer a registry from pain text. Preserve clinician restrictions, general pain-stop behavior, historical wording, native RPE/RIR, set identity, and audit history.

## 5. Acceptance and evidence gates

### End-to-end authored fixture

On a disposable synthetic SQLite database, author scheduled questions through existing authenticated operations; create/start a scheduled workout; complete it; record exact post-session and next-check-in states; correct an answer to create a new revision; retrieve planning context through both JWT and AgentToken where the route permits; verify exact prompts/native values/IDs/provenance/source links, owner isolation, counts, stale/open concern behavior, and no invented next-morning/diagnosis/recovery/technique values.

Include the tib-bar precaution flow: source precaution -> targeted question -> explicit response -> source-linked retain/revise/retire decision -> revised future note when explicitly authorized -> readback shows no obsolete repeat warning/question. Counterexamples must cover unanswered, skipped/not-tested, recurrence, conflicting later response, changed exposure, and clinician restriction.

### Invalidation and privacy

Test answer revision, question revision, migration classification change, session correction, source deletion/soft-delete/purge, and note disposition change. Each must deterministically stale/invalidate dependent planning output without overwriting historical recommendation/audit rows. Test export/readback includes exact revisions and dependencies; purge/readback proves raw evidence, derived context, links, and caches are gone. Test no raw private text in generic logs.

### Query correctness and security

Test 30-day default, configured bounded window, open older concerns with stale indicator, pagination, stable ordering, accurate `total`/`hasMore`, source fetch authorization, deleted/unavailable sources, unknown versus symptom-free, legacy/untrusted/superseded/clinician classifications, prompt-injection-as-data, JWT claims, AgentToken revocation/expiry, and two-owner isolation.

### Migration and regression

If a migration is required, test production-shaped synthetic fresh install, populated legacy database, current database, forward migration, rollback/restore, interrupted transaction rollback, repeated/idempotent migration, exact source counts/classification counts, and unchanged historical blobs. Never weaken historical fixtures. If no migration is required, state why and test the existing schema path.

### Actual uncached verification receipts

From the first gate, retain machine-readable manifests/receipts containing command argv, start/end timestamps, tested commit SHA, branch/worktree, environment-safe cache controls, combined stdout/stderr, and exit code. Run actual uncached/serial `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`; use supported Turbo cache bypass and state the exact controls. Include focused tests and any browser/API acceptance with real commands and readbacks. A narrative-only result is non-authoritative. Record failures honestly and distinguish unrelated pre-existing failures. Verify source-hash manifest against the tested tree and final commit.

UI is out of scope for #151 unless source inspection proves a UI change is unavoidable; do not launch a browser/desktop/app server for preparation. If the eventual implementation has a real API/browser acceptance requirement, use the built-in browser first and retain screenshots/readbacks, but do not require a ritual browser matrix for a non-UI route.

## 6. Executor contract

The executor must:

1. Confirm repo, `origin/main`, branch, clean/dirty state, and preserved pre-existing untracked files before editing.
2. Read this frozen goal and all source paths in the inventory before planning implementation.
3. Choose existing patterns and one canonical query path; document any consequential ambiguity and resolve only from source or explicit product contract.
4. Keep all writes owner-scoped and authorized; no production/live DB/env/deploy/merge/Codex UI/CUA/app-server launch from this assignment.
5. Use synthetic fixtures and no raw private medical text in logs/artifacts.
6. Implement focused tests first for pure classification/query/dependency invariants, then integration/migration/API tests as applicable.
7. Produce actual uncached receipts, source hashes, final diff, `git diff --check`, and clean status.
8. Make a docs/code commit only after evidence is complete and open a **draft PR** linked to #151. Do not merge. Then request independent internal review by Luna 5.6 medium Fast OFF; return review findings and exact evidence. The executor must not self-accept or claim a green gate from a narrative.

Approved routing for eventual authorized execution: primary Sol 5.6 medium Fast OFF; internal review Luna 5.6 medium Fast OFF; setup/preparation does not change configuration and does not launch either runtime.

## 7. Required executor report

Return: branch and exact commit SHA; base SHA; changed files; migration/rollback status; source-hash manifest path and verification result; every focused/full command with actual exit code and uncached controls; API/browser evidence and readbacks; pagination/count results; invalidation/export/purge results; owner/auth results; tib-bar disposition results; known failures; confirmation that no production/live DB/deploy/merge/UI/CUA action occurred; draft PR URL; and internal review status.

## 8. Preparation stop condition

This file is the complete frozen source-grounded handoff. Preparation ends with this docs-only commit and clean isolated worktree. Do not implement source changes, launch an app/server/browser/Desktop/Codex UI, create a draft PR, deploy, migrate production, mutate live data, merge, or change config during preparation.
