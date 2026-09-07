# Consolidated adversarial review

Reviewer: `gpt-5.6-luna`, medium effort, one consolidated read-only pass.
Assignments: data/contracts and linked writers; auth/owner isolation/atomicity;
tests/evidence/hygiene. No reviewer source edits, production access, or duplicated
full suite. Review returned no P0/P1 exploit and the following two P2 findings.

## R1: scope above 500 foods

Finding: the all-or-nothing reconciliation bound cannot process an owner with more
than 500 foods; add paging or explicitly classify this as an intentional limit.

Disposition: intentional, documented fail-closed bound. The contract requires a
bounded operation and failure rather than partial work. `limit` defaults to 100,
may explicitly increase to 500, and reads at most limit+1 food targets before
rejecting an oversized scope without writes. Cursors and unknown selectors are
rejected. No universal repair claim is made for larger scopes. A future paginated
or larger-scope operation requires its own design; the current invocation remains
atomic for the complete selected owner scope. See behavior.md and bounded-scope
regressions in food-usage-reconciliation.test.ts. This is a disclosed product limit,
not an unresolved implementation failure.

## R2: historical reimport of trashed foods

Finding: active-only name lookup during static reimport could replace a historical
trashed-food link with null when rebuilding a day.

Disposition: fixed. Historical reimport now uses owner-scoped mappings including
trashed foods; canonical refresh still derives both old and new affected food
projections within the day transaction. The static-import regression now trashes
the linked eggs fixture between two imports, requires the same positive linked-row
count after reimport, preserves Trash state, and compares all owner foods (including
Trash) against independent COUNT/MAX queries. Ordinary new meal writes retain
active-food validation.

The primary consolidated these findings, repaired R2, documented R1, and will
record final gate results in results.md. Reviewer findings are distinct from
implementer verification; no merge or production acceptance is implied.

## R3: primary final-audit finding, stored negative/fractional counters

A separate primary audit reproduced a response serialization error for a stored
negative counter: the old response schema rejected the `before` value after apply
had committed. Literal isolated probe: HTTP 500, `Response serialization failed`,
while the stored count had become zero. This was not a Luna finding.

Disposition: fixed. Preview faithfully accepts numeric drift in stored `before`
values while projected values retain integer/nonnegative invariants. The canonical
helper validates its entire response before leaving the caller transaction, so an
invalid source timestamp or other invalid projection rolls back all target writes.
Regressions cover negative and fractional stored counters, default dry-run byte
identity, successful/idempotent apply, and complete rollback on a malformed linked
source timestamp. The full final uncached matrix is rerun after this repair.
