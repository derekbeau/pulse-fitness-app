# Pulse #151 internal adversarial review

- Reviewer: Luna 5.6
- Effort: medium
- Fast: off; no executor/model setting override was supplied
- Scope: complete uncommitted diff from required start `696f6776641c51e0132ceb021f951937803247c6`
- Mode: read-only; no reviewer edits, server/UI launch, or live-data access

## Consolidated findings and disposition

1. **Accepted and fixed:** future-note targets were owner-scoped but not required to match the
   source precaution exercise. The write boundary now requires an exact exercise match and the
   API fixture proves a same-owner unrelated target fails without mutation.
2. **Resolved from the frozen contract:** a non-null authored `concernRef` is the explicit opaque
   tracking signal; no second injury/open-state registry is inferred. Missing, skipped,
   unanswered, not-tested, and symptom-free states do not close it. The docs and counterexamples
   now state and prove that boundary.
3. **Accepted as an evidence gap and fixed:** bounded export iteration and count reconciliation are
   now explicit in docs and synthetic pagination readback. The repository has no general account
   export owner, so the narrow canonical `view=export` integration remains the source-grounded
   choice instead of inventing a portal.
4. **Accepted and fixed:** the read-derived `createdAt + 1` stale timestamp was removed. Staleness
   is recomputed with deterministic reasons; `generatedAt` records observation time without
   fabricating a source-change time.
5. **Accepted and fixed:** owner and foreign callers now fetch the emitted source link; soft-delete
   readback proves the link becomes null. The same-owner unrelated target test and existing quoted
   prompt-injection fixture prove explicit mutation inputs—not response text—control the sole
   future scheduled-note write.
6. **Accepted and fixed:** migration acceptance now executes a deliberately interrupted migration
   and proves the partial table and migration-journal entry roll back, while exact source counts,
   fresh/current upgrade, repeat application, predecessor restore, owner links, immutable rows,
   and cascade purge remain covered.

Additional consolidation tightened decision counts to SQL aggregation, paginated the open-concern
relation with reconciled totals, exposed nested evidence truncation, hashed all current evidence
for the same concern so recurrence invalidates prior decisions, and cascaded later decision-chain
links when a purged predecessor source disappears.

## Independent-review blocker remediation

- Reviewer: Luna 5.6, medium effort, Fast off
- Scope: the changed-loading/exposure remediation diff from reviewed candidate
  `7a046b15130fc54e70ed1eb64a32d3e837eb74b0`
- Mode: read-only; no reviewer edits, server/UI launch, or live-data access
- **Accepted and fixed:** the first comparison required completed/non-skipped set rows but did not
  independently require the baseline session to be completed. The baseline query now joins the
  owner-scoped session, requires `completed` status, and excludes soft-deleted sessions. A focused
  counterexample authors an answered next-check-in on an in-progress session, records later changed
  completed loading, and proves no changed-exposure draft is emitted for the incomplete baseline.
- Focused re-review found no residual issue. The reviewer confirmed stable structural comparison,
  RPE/RIR exclusion, bounded candidates, linked fingerprints, one draft per concern, read-only
  retrieval, and preservation of unknown/skipped, recurrence/contradiction, clinician, and
  symptom/recovery boundaries.
