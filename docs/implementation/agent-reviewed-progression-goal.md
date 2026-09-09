# Pulse #153 — agent-reviewed progression (frozen docs-only handoff)

## Lane and authority

- Repository: `/Users/meridian/Projects/pulse-agent-reviewed-progression`
- Branch: `feat/agent-reviewed-progression`
- Approved base: `b8c22e98cfcd2fb341f7d89d59c66da19db40f05` (`main`, semantic template diff head)
- Preparation is docs-only. No implementation, tests, app/server launch, Codex UI/app-server launch, production/env/live-DB access, deployment, merge, or premature PR.
- Main checkout `/Users/meridian/Projects/pulse-fitness-app` contains pre-existing untracked artifacts. Preserve them exactly; do not copy, stage, delete, or modify them.
- User authorizes kickoff token-usage efficiency. Primary implementation preference: GPT-5.6 Sol, medium, Fast OFF. Review/support: GPT-5.6 Luna, medium, Fast OFF. These are launcher routing preferences, not acceptance gates.

## Outcome

Add an explicit, owner-authorized, agent-managed progression review opt-in for a single owner's scheduled workout prescriptions. The agent may preview evidence and propose bounded final dispositions; only an explicit accepted/edited disposition may mutate the current scheduled targets through the existing action path. Self-managed directly coached and non-progression dispositions remain available. This is a focused #153 implementation contract, not a new progression algorithm, form engine, global migration, dashboard redesign, or historical repair.

## Frozen product and safety decisions

1. **Opt-in and ownership.** Agent-managed review is enabled only by an explicit owner-authorized opt-in/configuration for that owner/scheduled exercise. Never hard-code Derek, assume opt-in, globally backfill, auto-enroll, or grant an agent broader access. Every read/write remains owner-scoped for JWT and AgentToken; actor, owner, reason, policy revision, and evidence are retained.
2. **Existing contracts only.** Reuse the real `PUT /scheduled-exercises/:id/configuration` for policy/configuration and the existing `POST /preview`, `GET /recommendations/:id`, and `POST /recommendations/:id/actions` routes. Do not invent a GET configuration route or fabricate API behavior. Preserve existing auth, AgentToken middleware/enrichment, response envelopes, and OpenAPI generation.
3. **Disposition modes.** Support managed review plus self-managed/directly coached and non-progression dispositions (including keep/hold) without treating them as missing policy. `MISSING_POLICY` is a valid unavailable/hold reason, never a false error or a reason to invent a target. A missing history is honest unknown/no-history, not evidence of fatigue or ease. Exclude legacy #149 derived/unknown feedback from actionable progression; do not turn symptoms into fatigue or pain into a numeric recovery score.
4. **No new algorithm.** Use the existing deterministic policy families, evidence construction, fingerprinting, recommendation evaluation, bounded edit rules, stale checks, and action semantics. Add only the review/authorization/disposition contract needed to select and safely expose them. Native RIR/RPE remains native evidence; do not infer effort from symptoms, feedback, completion, or unrelated fields.
5. **Atomic and idempotent writes.** A final disposition is one transactional, owner-scoped operation with stable request/recommendation fingerprint, actor/reason, and concurrency protection. Stale fingerprint or schedule changes fail before any partial write. Replays with the same actor-bound idempotency key/body return the same result; conflicts fail closed. Never double-progress an already agent-progressed target; current active targets remain stable until an explicit accepted/edited action.
6. **Evidence and policy provenance.** Final summaries include source session/set IDs, original prescription, completed actuals, native RIR/RPE, current target, proposed target, policy family/version/configuration revision, actor, reason, evidence fingerprint, and disposition. Preserve immutable recommendation snapshots and action audit history. An evidence flag may mark unavailable/safety-invalid/needs-explicit-correction, but must not auto-mutate targets.
7. **Both starts and provenance.** Review logic must distinguish and preserve: original scheduled prescription, session adjustment, and completed actuals. Both relevant session-start paths must freeze the original prescription and source scheduled-set provenance; one session's adjustment must not update the reusable template or become a new template baseline. Current semantic diff is meaningful; a template hash is not a universal block. Do not regress scheduled snapshot provenance or #152 semantic-diff behavior.
8. **Safety invalidation.** Invalid target/evidence, unsafe policy/context, stale source, ownership failure, or ambiguous identity produces an explicit unavailable/hold or correction-required outcome. It cannot silently increase, reduce, or replace targets. Explicit correction is the only route to repair invalid source data; no historical rewrite or production backfill.
9. **UI.** Show final target/disposition summary and evidence/provenance; summary may be optional where the current surface already supplies it. Start must have zero accept/deny mutation. In managed mode, explicit accept/deny is required before target mutation; self-review is optional. An explicit mode change may change review mode, never targets. Keep keyboard accessibility, populated 375px and desktop behavior, errors, and no automatic target mutation.

## Required source reads and frozen inventory (before implementation)

| Surface | Current source and boundary |
|---|---|
| Shared progression contract | `packages/shared/src/schemas/workout-progression.ts`: strict policy/target/evidence/recommendation/action schemas, `MISSING_POLICY`, diagnostics, RIR/RPE provenance, fingerprint/action inputs, and stale/idempotency invariants. Reuse; do not fork the algorithm. |
| Progression engine | `apps/api/src/routes/workout-progression/store.ts`: evidence from scheduled targets and completed session sets, native effort, policy selection, `sourceFingerprint`, recommendation persistence, stale projection, transactional action application and actor-bound idempotency. Inspect the remaining action transaction before coding. |
| Progression routes | `apps/api/src/routes/workout-progression/index.ts`: real PUT configuration, POST preview, GET recommendation, POST action; owner/auth and error mapping. No invented GET/config route. |
| Scheduled snapshot | `apps/api/src/routes/scheduled-workouts/snapshot-store.ts`, `store.ts`, `index.ts`, `packages/shared/src/schemas/scheduled-workouts.ts`: immutable snapshot/template projection and semantic diff. Preserve owner isolation and current semantic comparison; do not turn template hash into a universal gate. |
| Session starts | `apps/api/src/routes/workout-sessions/index.ts`, `store.ts`, `apps/web/src/features/workouts/components/workout-list.tsx`, `workout-calendar.tsx`, `scheduled-workout-detail.tsx`, `apps/web/src/hooks/use-workout-session.ts`: both scheduled starts must use snapshot materialization, preserve original prescription/source scheduled-set IDs, and keep adjustments local to the session. Verify every start surface before editing. |
| Feedback/provenance | `docs/implementation/feedback-provenance-goal.md`, `docs/specs/rir-logging-v1.md`, `packages/shared/src/schemas/workout-sessions.ts`, `apps/api/src/routes/workout-sessions/store.ts`: #149 legacy derived/unknown feedback is non-actionable; native RIR/RPE and original answers remain intact. No symptom-to-fatigue inference. |
| Existing progression spec | `docs/specs/workout-progression-v1.md`, `docs/implementation/progression-preview-goal.md`: existing policy families, four dispositions, exact source fingerprint, target-only scheduled mutation, missing policy/no-history semantics, auth, stale, and UI boundaries. |
| Prior semantic diff | `docs/implementation/semantic-template-diff-goal.md`: current effective prescription semantic diff, no automatic mutation/adoption, stale/invalid integrity warnings, both API paths and both start paths. |

## Implementation boundaries

- Prefer the smallest shared typed review/disposition helper and existing route/storage extensions; do not introduce a second progression engine or duplicate client/server math.
- Keep configuration via the existing PUT path and explicit owner/actor provenance. If schema/migration work is genuinely required, stage-aware fixture inventories are required; no historical rewrite, canonical migration execution, or production data repair.
- Preserve self-managed/directly coached/non-progression paths and existing recommendation snapshots. No global backfill or automatic review of legacy recommendations.
- Do not mutate reusable templates, completed/live session history, original prescription, or session actuals. Do not use one session's adjustment as a template update.
- Do not build a new form/question engine, clinical interpretation, fatigue model, notification/scheduler, or universal template-blocking rule.

## Scoped acceptance and verification

Focused tests must cover: policy opt-in/owner authorization; JWT/AgentToken and cross-owner isolation; real PUT configuration plus existing preview/read/action routes; actor/reason/policy/evidence provenance; atomic action and rollback; retry/idempotency; stale fail-before-partial; concurrency; zero-RIR increment; hold/missing-policy/no-history; legacy #149 exclusion; native RIR/RPE; invalid/safety evidence and explicit correction; no double progression for already agent-progressed targets; both starts preserving original prescription/session adjustment/actual provenance; semantic current diff; and end-to-end build/publish → Start → adjust → next-context behavior. Add migration stage-aware fixtures only if the implementation truly needs a schema change; never rewrite historical fixtures/data.

After implementation/review repairs, one final agreed uncached gate is required, not repeated full setup suites: capture raw stdout/stderr, argv, exit code, timing, tested SHA, source/test/config/lock hashes, and binding manifest. Browser evidence must be authentic from start through final readback: 375px and desktop, keyboard/console/network checks, no receipt-loop claims. Reuse unchanged verified evidence only when source/test/harness/dependency/environment identity is proven; rerun only invalidated checks.

## Executor contract

Read this frozen goal and the listed source before editing; confirm exact branch/base and preserve unrelated untracked state. Implement, focused-test, self-review, run one bounded Luna-medium review, consolidate repairs, then run the final affected matrix. Return exact HEAD, changed files, focused/final command results, raw evidence paths, actor/owner/stale/idempotency/atomicity/browser readbacks, prohibited actions not taken, and clean status. Commit docs/implementation coherently; draft a PR only after complete IR and explicit parent authorization. Future executor owns the draft PR after complete IR and parent closeout.

## Explicit non-goals

No production code in this preparation lane; no full setup tests; no premature PR; no Codex UI/app-server launch; no app/server launch; no production/env/live-DB deploy, migration, repair, or merge; no global backfill; no invented API routes; no new progression algorithm; no template update from one session; no hard-coded owner.
