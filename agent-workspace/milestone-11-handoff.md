# Milestone 11 Handoff

> Historical checkpoint superseded by Vector's confirmed final findings and the bounded final-QA repair.
> Its verdict and counts describe the pre-repair commit, not the current branch.

Verdict: `AWAITING VECTOR FINAL GOAL-STRATEGY REVIEW`

## Release scope

- Finalized the goal-strategy extension documentation, OpenAPI operation descriptions, Nutrition help
  text, API conventions, data-model conventions, agent-integration guidance, and the tracked Pulse agent
  skill.
- Preserved the v1 decision boundaries: canonical trend weight is authoritative for goal progress; scale
  weight is separately labeled; goal changes remain proposals until explicit target acceptance; and a
  reached goal requires a separate reviewed completion-to-maintenance transition.
- Added permanent API/OpenAPI and Nutrition help assertions for those boundaries. No feature expansion,
  production deploy, merge, or PR-ready promotion is included.

## Production-history and migration evidence

- The backward-compatible original JSON replay produced an eligible 2026-04-02 row from 20 complete days
  and 8 weights, then a held 2026-08-13 row with zero current weight inputs and no proposed TDEE.
- The final anonymized production-history cohort is selected by its reviewed aggregate, never by database
  row order: 19 canonical weights from 2026-03-11 through 2026-04-07. It produced an eligible 2026-04-08
  row with proposed TDEE 2,430 kcal and a held 2026-08-13 row with zero current weight inputs.
- An initial first-user replay was rejected because its reverse chronology made it invalid evidence. The
  runbook now forbids that shortcut and records the aggregate cohort contract.
- The snapshot source family remained byte-identical before and after the rehearsal:
  `.db=fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`,
  `-wal=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, and
  `-shm=fd4c9fda9cd3f9ae7c962b0ddf37232294d55580e1aa165aa06129b8549389eb`.
- The separate private history source family also remained byte-identical:
  `.db=536bd528d7413422a1ded82549891cc75c5de1c451458e1a61175e791915fcb6`, with the same
  empty-WAL and SHM hashes above.
- A fresh isolated clone of the snapshot required an explicit one-user pounds map for 19 legacy rows.
  The secure mode-0600 map hash was
  `edf9c53e0d2f0714de7c37f708a94a7028bf9de13826c11e4f0734e6c7c7d751`.
- First startup passed `legacy-mapped`; second startup passed `already-canonical`. All 19 rows had canonical
  kilograms and entry-unit provenance, and the pounds compatibility delta was zero.
- The source and migrated clone both retained the same 37 pre-existing foreign-key violations. Their sorted
  violation-set hash was
  `e4504203d53b83a34f839da256dd26385f8b1950949c58a54646d6e293d18812`; issue #101 remains the owner.
- A separate empty Gate0 database migrated with `fresh-database`, 44/44 tracked migrations, `quick_check=ok`,
  zero foreign-key violations, and zero domain rows before seeding.

## Original-plus-goal acceptance

- Installed Chrome passed 19/19 original lifecycle plus deterministic goal-strategy journeys against the
  tracked Gate0 API 3102, web 5274, and ignored `pulse-tdee-dev.db`.
- The strict monitor failed on console warnings/errors, page errors, transport failures, and unexpected HTTP
  failures. It covered setup, equation review, learning, actionable/stale recommendations, nutrition-day
  downgrade, pending decisions, reached-target acceptance, loss/maintenance cards, edit/new-direction,
  pending replacement, revision/prior-goal audit, stale completion, lost-response retry, keyboard focus,
  and explicit completion.
- Responsive acceptance passed 320, 375, 390, 430, 768, and 1280 px with no horizontal overflow.
- The built-in browser independently walked all 13 deterministic accounts using only `pnpm dev:gate0`,
  inspected the Recharts goal-history dialog and native-table text equivalent, completed the explicit
  maintenance transition, and confirmed Escape restores focus to `Edit goal`. All observed product requests
  in the Gate0 log returned 200. Exact width and strict diagnostic evidence comes from installed Chrome
  because the in-app viewport remains fixed at 1280.
- After mutation QA, the final database was recreated from an empty regular file and reseeded. It reports
  `quick_check=ok`, no foreign-key rows, 44 migrations, 13 users, 81 weights, 12 programs, 13 goals,
  12 active goals, and 3 pending check-ins.

## Automated gates

| Check                                          | Observed result                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| Focused API OpenAPI route tests                | 8/8                                                                 |
| Focused Nutrition page tests                   | 17/17                                                               |
| Installed Chrome original-plus-goal acceptance | 19/19                                                               |
| `TURBO_FORCE=true pnpm lint`                   | 3/3, 0 cached, zero errors; four pre-existing Fast Refresh warnings |
| `TURBO_FORCE=true pnpm typecheck`              | 3/3, 0 cached                                                       |
| `TURBO_FORCE=true pnpm test`                   | Startup/isolation 9; shared 412, API 684, web 1004; 0 cached        |
| `TURBO_FORCE=true pnpm build`                  | 3/3, 0 cached; Vite transformed 3,848 modules                       |
| Formatting and diff                            | Prettier and `git diff --check` passed                              |
| Remote PR checks                               | 4/4: CI lint, typecheck, build, and Claude Code Review              |

## Final stop

Milestones 7–11 each have exactly one commit. PR #100 must remain draft. Production was not opened writable,
deployed, restarted, or changed. Vector owns the independent final goal-strategy review; Codex must not
promote the PR or begin another milestone without a new authorization.

## Superseding final-QA repair handoff

Current verdict: `AWAITING VECTOR FINAL GOAL-STRATEGY RE-REVIEW`

Vector's confirmed post-Milestone-11 findings were repaired in one bounded follow-up: database-authoritative
strategy revisions, revision-effective server history, the canonical maintenance range, persisted final
trends, the immutable completion transition, and goal-history pagination. Permanent migration, direct-SQL,
store, API, shared-schema, concurrency, replayability, UI, and browser regressions cover those behaviors.

Current evidence is authoritative in `current-status.md` and the final section of
`verification-report.md`. The historical 44-migration, 13-goal, 19-journey, and pre-repair test counts above
remain valid only for the original Milestone 11 commit. The repair ends with 45 migrations and 32 seeded
goals because the load-more fixture permanently owns 21 goal records. PR #100 remains draft; production,
deployment, merge, readiness promotion, and nutrition-target automation remain out of scope.
