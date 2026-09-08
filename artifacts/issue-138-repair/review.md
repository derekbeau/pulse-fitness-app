# Consolidated internal repair review

Reviewer: `/root/repair_review`, explicitly requested `gpt-5.6-luna`, medium. Runtime exposed no Fast control; no Fast claim is made. Read-only, no duplicate gates.

- P2: historical executor README still asserted a legacy ranked score. **Fixed:** replaced the rejected claim and marked the historical receipt superseded. Raw historical logs remain unchanged.
- Reviewer reported no additional actionable immediate-transaction, retry-bound, rollback, owner-isolation, three-surface mutation, automatic-promotion/history, or public-ranked-score findings.

IR-1: removed ranked-match `score` from runtime, shared schema/types, frequent/nested matches, docs and fixtures. Raw response/OpenAPI exact-key tests preserve categorical evidence and separate shorthand scoring.
IR-2: all current meal creates/appends use immediate writer acquisition before final owner-local recheck. Four attempts, 25/50/100ms delay, per-attempt busy_timeout=0 restored before yielding; whole write unit retries; only transient SQLite BUSY/LOCKED codes. Created IDs publish after successful commit. No migration, unique-index, history or identity-model change.

Prior full-suite failures: bounded direct reproduction passed 14 API and the 3 named web tests with existing assertions/timeouts. API cases exercise synchronous migrations/SQLite work; web cases use UI rendering and fake-timer advancement. No deterministic defect reproduced, so no unrelated test/config changes. Focused web selection skipped unmatched cases only; no committed skip/quarantine/retry was added.

The initial repair run passed the genuine process proof but exposed a test-only OpenAPI traversal mistake (nullable object uses direct properties, not anyOf). Fixed the traversal and reran the affected matrix green. See retained first-run log, not a suppressed failure.

The first fresh lint run found one forbidden non-null assertion in the new IPC fixture. Replaced it with explicit missing-URL validation; corrected full lint passed. The failed raw lint log is retained.

Fresh default test initially failed: the display-field DB mock omitted the newly used sqlite export (2 assertions could not run), the existing usage merge test hit its 15s timeout, a session-exercise-list web case hit 5s, and new child startup exceeded its explicit 5s IPC deadline under full load. Direct API reproduction confirmed only the missing mock export; usage and all 7 process tests passed unchanged. Added sqlite.pragma to the display mock without weakening assertions. No startup/test/global timeout, concurrency, or retry settings changed. Final rerun and any serial diagnostic are reported separately.

Bounded Luna medium follow-up: no actionable findings in the corrected README, late-duplicate coverage, or minimal display-field mock adaptation. Direct reproduction of the newly observed web timeout passed (598ms); assertions and timeout remain unchanged.
