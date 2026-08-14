# Adaptive TDEE goal strategy — Milestone 7 handoff

Status: `MILESTONE 7 COMPLETE; CONTINUING TO MILESTONE 8`

Milestone 7 establishes the authoritative goal foundation only: constrained goals, immutable revisions,
check-in provenance, per-user migration/backfill, strict shared/OpenAPI contracts, and read-only goal APIs.
It deliberately does not include progress calculations, goal mutations, or goal UI.

## Acceptance evidence

- Fresh migration, legacy preservation, lose/gain/maintain backfill, trend preference, scale fallback,
  no-weight blocking, idempotency, per-user rollback, immutability, ownership, account deletion, and real
  two-connection serialization all have executable coverage.
- The isolated snapshot rehearsal mapped 1 user/19 legacy rows, preserved all source-family hashes, returned
  `quick_check: ok`, and introduced 0 foreign-key violations. Its 37 pre-existing violations remain issue #101.
- Focused tests: API 84/84, shared 17/17, startup/isolation 9/9.
- Exact uncached gates: lint 3/3, typecheck 3/3, tests 6/6 plus startup/isolation, build 3/3; zero cached tasks.
  Full package totals were shared 404/404, API 677/677, and web 989/989.
- Built-in-browser QA used only tracked Gate 0. Coach loaded cleanly; authenticated Swagger current, history,
  and detail reads returned 200; the temporary AgentToken was removed; final database integrity was `ok`;
  and fixed ports were stopped.

## Self-review findings resolved

1. Removed the legacy silent transition to maintenance on goal-reached target acceptance; completion is an
   explicit Milestone 8 operation.
2. Made Swagger advertise the exact reachable Gate 0 web origin so authenticated browser requests use the
   isolated proxy rather than unreachable `localhost:3001`.
3. Compared migration foreign-key evidence as a set so SQLite row ordering cannot mislabel unchanged
   baseline violations as newly introduced.
4. Updated the deterministic preview fixture to assert that goal-reached acceptance leaves the active loss
   goal unchanged until explicit completion.

PR #100 remains draft. Production was not accessed or modified. No deploy, merge, or readiness promotion
was performed.
