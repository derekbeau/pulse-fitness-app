# Pulse #151 consumer inventory and decisions

This inventory was reconciled from the frozen goal and the tracked source before implementation.
The canonical planning reader is
`apps/api/src/routes/feedback-planning/store.ts`; no second feedback parser, injury registry, or
progression engine was added.

## Existing feedback consumers

- `apps/api/src/routes/workout-sessions/store.ts` remains the canonical serializer/parser for the
  legacy `workout_sessions.feedback` blob and the reader that attaches frozen question and answer
  snapshots. It is unchanged.
- `apps/api/src/routes/adaptive-nutrition/review-store.ts` still reads only provenance-safe legacy
  session feedback for its nutrition review contract. It is unchanged; #151 evidence does not flow
  into nutrition constructs.
- `apps/api/src/routes/workout-progression/store.ts` still reads only actionable provenance-safe
  legacy technique/pain facts for deterministic progression evidence. It is unchanged and does not
  interpret #151 native answers, so it cannot compete with the new planning service.
- `apps/api/src/db/schema/workout-session-feedback.ts` remains the only parser for the legacy blob.
  The planning service reads revisioned native answers through the #150 tables and quarantines the
  legacy blob in its separate audit relation.
- `apps/api/src/middleware/feedback-note-projection.ts` remains the serialization/planning-copy
  authority for uncertain or superseded note interpretations. Its note disposition rows are
  included only as separately classified audit dependencies.
- Existing web `feedbackNoteReview` consumers are UI-only and unchanged because #151 has no UI
  scope.

## Note and mutation paths

- Template, scheduled, and session Programming Notes remain separate snapshots. The explicit #151
  decision route can change only named, owner-scoped, not-yet-started scheduled exercise rows with
  optimistic before values. It never writes a template default or historical/active session.
- Question publication/retirement continues through the existing revisioned template/scheduled
  feedback-question mutations. Context reads and precaution decisions do not publish questions.
  Session question definitions are frozen when the session is created, so a later template or
  schedule question revision does not rewrite or invalidate that historical session source. The
  exact frozen question revision and its content hash remain decision dependencies; any applicable
  source-definition change is detected without treating an unrelated future revision as a change
  to past evidence.
- General safeguards are exact caller-declared substrings and must survive every changed future
  note. No text classifier decides what is medical guidance.
- A current unrolled note disposition explicitly classified as `clinician_guidance` blocks revise
  or retire. Unknown authorship stays `programming_precaution`; it is never promoted to clinician
  guidance or medical fact.

## Export, deletion, and cache boundary

The repository has no general account export endpoint. The narrow established integration is the
same canonical bounded context service with `view=export`: it removes the date filter, retains
pagination, and includes exact private audit payloads under the same owner/auth rules. It does not
create an unrelated account portal. Consumers iterate each independently counted relation through
`hasMore`; set evidence is scoped to the feedback-source sessions on each response page and is
reconciled by stable set/session IDs.

Session purge already cascades revisioned question/answer and provenance/submission rows. #151 adds
source-session cascade for decisions/response links and explicitly removes session-linked note
dispositions before the session hard delete. Account deletion remains user-FK cascade. There is no
derived-context cache; responses declare `recompute_on_read` and set `private, no-cache`.

Planning dependencies also hash the source session/update marker, native set rows, note
dispositions, and provenance/migration classification rows. Corrections to any applicable source
are reflected on the next read; immutable decisions remain present but become stale with explicit
reasons. No read fabricates a source-change timestamp or performs an invalidation write; the
response generation timestamp records when recomputation observed current state.

An authored question's non-null opaque `concernRef` is the existing explicit tracking signal; no
second inferred injury/open-state registry exists. Missing, skipped, unanswered, not-tested, and
symptom-free answers never close that tracked reference. Only an explicit current `retire`
decision closes it, and recurrence, contradiction, or dependency change reopens it.

## Consequential ambiguity resolved from source

The existing AgentToken-only `/api/v1/context` payload has no pagination and is intentionally small.
Adding longitudinal feedback there would make its auth and response size unsafe. The implementation
therefore uses the dedicated unified `/api/v1/context/feedback` child route while leaving the root
context contract unchanged. Both JWT and AgentToken callers can read it; only AgentToken callers can
apply explicit future-note decisions.
