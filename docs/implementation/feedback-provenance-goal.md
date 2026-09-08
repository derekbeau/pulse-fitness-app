# Pulse #149 — provenance-safe workout feedback

**Frozen execution contract**

- Issue: [#149](https://github.com/derekbeau/pulse-fitness-app/issues/149)
- Parent: [#148](https://github.com/derekbeau/pulse-fitness-app/issues/148)
- Related downstream contracts: [#150](https://github.com/derekbeau/pulse-fitness-app/issues/150), [#151](https://github.com/derekbeau/pulse-fitness-app/issues/151), [#153](https://github.com/derekbeau/pulse-fitness-app/issues/153)
- Required base: `b869d41858d8fbe6bd989e100de8f08f183a422f` (`origin/main` verified at launch preparation)
- Required worktree: `/Users/meridian/Projects/pulse-feedback-provenance`
- Required branch: `fix/feedback-provenance`
- One implementation editor only. Preserve the original `main` worktree, its untracked files, all other projects, and all existing jobs.

## Objective

Remove fabricated recovery and technique evidence, preserve historical raw evidence without inventing provenance, and make every downstream reader treat unsupported legacy values as non-actionable.

This task is a capability implementation on **synthetic/local copies only**. Do not deploy, merge, create a real-data backup, run a production migration, alter live workout data, change real loads, or mutate completed performance. A production execution/runbook approval is a separate decision.

## Confirmed current behavior to replace

Read the current source before editing. These facts were inspected at the required base:

1. `apps/web/src/pages/active-workout.tsx`, `mapFeedbackDraftToSessionFeedback`:
   - maps `pain-discomfort=true` to `recovery=2` and `false` to `recovery=4` through `toPainFeedbackScore`;
   - maps `session-rpe` to `technique=Math.round(rpe / 2)` through `toRpeFeedbackScore`;
   - falls back positionally through scale entries and `toFeedbackScore` supplies `3` for absent/invalid input;
   - `toWorkoutSessionFeedbackResponse` currently supplies defaults for required unanswered scale/slider, yes/no, emoji, and multi-select inputs.
2. `packages/shared/src/schemas/workout-sessions.ts` currently requires numeric `energy`, `recovery`, and `technique` scores in `workoutSessionFeedbackSchema`, while `responses[]` has original `id`, `label`, `type`, `value`, and optional `notes`.
3. `apps/api/src/db/schema/workout-session-feedback.ts` permits only those summary keys and requires all three numeric scores during parse; `workoutSessions.feedback` is serialized JSON.
4. `apps/api/src/routes/workout-sessions/store.ts` serializes that feedback at create/update and parses it when returning a session. Session records also preserve sets, native set RPE/RIR, timing, notes, programming notes, and agent notes.
5. Confirmed direct score consumers include:
   - `apps/web/src/features/workouts/components/session-detail.tsx` renders Energy/Recovery/Technique cards;
   - `apps/api/src/routes/workout-progression/store.ts` treats low `feedback.technique` as a progression evidence fact;
   - `apps/api/src/routes/adaptive-nutrition/review-store.ts` treats missing recovery as `5` and uses low recovery in review context.

Before edits, produce a checked-in consumer inventory covering every direct and indirect reader/writer: schema, parser/serializer, create/update routes, active/completed/history/comparison UI, progression, adaptive nutrition, `/api/v1/context`/agent context, caches/recommendations, OpenAPI/client generation, tests, migrations, and note stores. A search hit is not proof a consumer is safe; record the path, behavior, actionability decision, test coverage, and whether it is changed or explicitly deferred. If a purported consumer cannot be proven from source, say so rather than inventing it.

## Non-negotiable evidence model

### 1. Native evidence only

A summary value may represent only an explicit answer to the same construct. No pain-to-recovery conversion, RPE-to-technique conversion, positional scale fallback, required-field default, label-heuristic inference, reverse inference from a numeric score, or conversion from completion/sets/RIR is allowed.

- Preserve a documented energy-emoji mapping only when it is an explicit energy response and the mapping/version is recorded as same-construct provenance.
- `false`, `0`, empty text, unanswered, skipped, null, absent, and unknown must remain distinguishable wherever the construct/type allows them.
- Valid pain/discomfort responses remain pain evidence. Do not erase, reinterpret, or globally score them.
- Native set RPE, RIR, all sets, timing, feedback notes, original labels/types/values, and completed-session performance are not to be changed by this feature.

### 2. Explicit, nullable provenance contract

Design one shared contract used consistently by persistence, API, UI, OpenAPI/client surfaces, analytics, progression, and agent context. It must contain schema/version metadata, explicit provenance, and nullable/absent ratings where a value is unavailable. Do not retain a compatibility shape that makes clients believe an unsupported numeric score is trusted.

At minimum distinguish:

- `explicit_user_response` — evidence explicitly answered by the user for that construct;
- `explicit_agent_or_other_response` — only when source evidence proves the actor; never mislabel historic agent-entered data as user-entered;
- `same_construct_documented_mapping` — e.g. documented energy emoji mapping, with mapping version/source;
- `legacy_derived` — known generated score with supporting source evidence; non-actionable;
- `legacy_unknown` — missing original answer, conflicting evidence, unsupported source, or any ambiguity; non-actionable;
- `unknown` / unanswered / skipped as explicit state where applicable.

Use terminology and exact enum names selected from current conventions, but preserve the semantics above. Raw input and the migration classification are not a substitute for one another. Provenance must name source response/revision identifiers when available, source kind/actor when evidenced, schema/mapping version, classification reason, and classified-at timestamp.

### 3. Old-client/API quarantine

Old clients may still send generated summary fields. At the API boundary, validate and quarantine rather than accepting them as trusted coaching evidence. Define and test the compatibility behavior precisely: accepted legacy payload content is retained only in access-controlled audit/quarantine storage with explicit non-actionable provenance, while trusted/actionable fields stay null/unknown unless a same-construct explicit source validates them. Reject malformed or contradictory payloads with actionable errors where retention cannot safely preserve them. Do not silently coerce, default, or discard raw submitted values.

All JWT and AgentToken paths remain owner scoped. Do not expose access-controlled raw audit data in generic logs, generic context, or cross-owner results.

## Historical migration and audit safety

Implement a deterministic owner-scoped migration tool and migrations needed to support it.

1. **Preflight and inventory**
   - Validate schema/version and source table/column availability before any apply operation.
   - Enumerate source records deterministically by owner and stable record ID. Produce per-owner and global counts for scanned, classified by reason, migrated/preserved, quarantined, skipped (with reason), unchanged-on-resume, notes examined, confirmed remediations, and uncertain review candidates.
   - Reconcile every source record exactly once: no silent skips. Stable IDs and source checksums/version markers must make an interrupted run resumable and a second apply idempotent.
2. **Classification**
   - Explicit original recovery/technique response: preserve the native answer even where its numeric value matches an old formula.
   - Known derived score plus supporting source evidence: classify `legacy_derived`, retain raw value in audit storage, and keep it non-actionable.
   - Missing original response, conflicting sources, unknown source, agent-entered history without actor proof, or ambiguous legacy record: classify `legacy_unknown`, retain raw value in audit storage, and keep it non-actionable.
   - Never derive a source answer by inspecting a score. Never resolve contradictions by preference/recency unless a documented source revision relation proves supersession.
3. **Execution modes and safety**
   - `--dry-run` performs full preflight/classification/counting and writes **nothing**.
   - `--apply` requires an explicit local synthetic input/copy guard; refuse production-shaped/live paths and require an explicit acknowledgement flag suitable for local fixtures only. Do not include a production command that could be run accidentally.
   - Each bounded batch and its classification/audit writes run transactionally. Failure must roll back the batch; prove rollback in a synthetic failure test.
   - Preserve the original database/copy and provide a tested local restore/rollback procedure. The migration must not delete or overwrite raw legacy values, notes, sets, RIR, session timestamps, or completed performance.
   - Resume must verify the stored source ID/checksum/version before treating a record as done. A re-run cannot duplicate audit rows, revisions, corrections, or counts.
4. **Tests with synthetic fixtures only**
   - dry-run no-write assertion; apply twice no-op assertion; interrupted-resume assertion; forced transactional rollback; exact owner/global count reconciliation; stable record IDs; schema preflight failure; raw-payload preservation.
   - fixtures include pain yes/no without recovery, RPE without technique, explicit valid recovery/technique values coinciding with legacy formulas, partial/no responses, null/false/zero, custom fields, conflicting records, and historically agent-created sessions.

## Downstream actionability and remediation

Unsupported scores must be excluded from every decision path, summary, chart/card, history/comparison view, context payload, cache, and recommendation. They must never gate future training, be rendered as reported ratings, or be treated as evidence of readiness, fatigue, recovery, form, injury state, or training quality.

- Deterministic progression: use native set RPE/RIR and valid source-linked evidence only. A legacy technique score cannot generate a technique/form fact.
- Nutrition/adaptive review: remove missing-recovery-as-`5` and never use legacy/unavailable recovery as an actionable condition.
- History/comparison UI: preserve audit visibility but label non-actionable/unknown honestly; do not render a null/legacy score as a normal rating.
- Agent/planning context: preserve history and links while excluding legacy-untrusted/superseded interpretations from actionable summaries. Do not turn pain into global recovery. Do not turn RPE into technique. Missing feedback is unknown, not no pain or symptom-free.
- Caches/recommendations dependent on migrated or corrected evidence need a deterministic invalidation/revision strategy with audit history; never overwrite an old recommendation invisibly.

### Coaching-note remediation

Cover session notes and exercise programming/agent notes, scheduled/template notes, agent/programming notes, and cached recommendations where present.

- Preserve original note text, author/actor, timestamps, and revision history.
- A correction/supersession may be written only for a **confirmed** contaminated interpretation with an explicit source link to the invalid evidence and a reason.
- Candidate detection may use bounded heuristics only to queue uncertain records for review. A heuristic does not prove causation.
- Do not bulk rewrite prose by regex. Do not change loads, current/finished performance, or unrelated notes.
- Active planning must exclude a confirmed superseded interpretation while audit/history remains readable. Uncertain candidates remain visible but unmodified/non-actionable until reviewed.

## Required implementation and acceptance work

1. Read `AGENTS.md`, issue #149, #148, #150, #151, #153, current schemas/routes/UI/tests, migration utilities, and all identified consumers before editing. Keep a concise implementation plan and consumer inventory in this document or a linked checked-in evidence file.
2. Implement the shared provenance schema, persistence/audit migrations, API boundary quarantine, UI behavior, consumer changes, migration runner/restore guidance, tests, and API/OpenAPI documentation necessary to satisfy this issue without pre-implementing #150/#151's dynamic question system.
3. Keep #150 and #151 interfaces forward-compatible only where necessary: no competing form engine, injury registry, diagnosis, scheduler, notification system, automatic future-workout writes, or automatic clinical interpretation.
4. Do not weaken historical migration fixtures. Use stage-aware fixture inventories for migration/schema references.
5. UI changes require automated browser coverage and built-in-browser-first manual checks at 375px and desktop, keyboard/screen-reader behavior, populated synthetic data, persisted/error/reload flows, screenshots/readbacks, and console/network evidence. If the executor lacks a built-in browser/review tool, report the capability gap explicitly; do not silently omit the required acceptance.

### Acceptance matrix

- Pain yes/no without an explicit recovery question produces recovery unknown, never 2/4.
- Session RPE without an explicit technique question produces technique unknown, never rounded RPE/2.
- Explicit recovery/technique answers survive even if values equal historic formulas.
- Same-construct documented energy mapping remains only with documented mapping provenance.
- No absent/required form control creates a fake response or default score; false/zero/null/unanswered/skipped remain distinct.
- New and old API/client payloads cannot smuggle generated summary scores into trusted evidence/context.
- Raw pre-migration payloads and labels/types/values/notes remain exact and access controlled; native pain, sets, RIR, timing and completed performance remain unchanged.
- Deterministic classification and per-owner/global totals reconcile; dry-run writes nothing; apply twice makes no further changes; resume and transactional rollback work on synthetic data.
- Direct and indirect consumer inventory is complete and every actionable consumer excludes unsupported values.
- A confirmed contaminated coaching interpretation gains a sourced supersession/correction; unrelated notes do not change; uncertain candidates queue for review without rewrite.
- Owner isolation holds for JWT and AgentToken callers; raw private text does not enter generic logs/context.

## Required verification and delivery evidence

Run focused tests while implementing, then actual repository gates from this exact worktree/commit:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Do not claim a gate passed without the command result. Separate existing/unrelated failures from this work, preserve evidence paths, inspect final diff and clean status, and commit only coherent implementation changes with a Conventional Commit. A draft PR is allowed only after the full uncached gates and required browser evidence; no merge.

Final implementation report must include: branch, commit, clean status, changed files, exact commands/results, migration dry-run/apply/rollback evidence and counts, browser evidence, consumer inventory, note-remediation counts, known capability gaps, and explicit confirmation that no production/deploy/live migration/merge occurred.
