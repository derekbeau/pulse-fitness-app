# Pulse #141: Progression preview compatibility and bounded error UX

## Goal

Complete this contract 100%. Restore scheduled-workout progression preview for persisted legacy prescription shapes without weakening strict validation, provenance, authorization, or action safety. Continue until implementation, tests, adversarial review, final verification, clean commit(s), and literal evidence are complete. Do not stop at a plan, a happy-path test, or a status summary.

This is the executor's implementation contract. The preparation commit that contains this file is docs-only; after the verified Goal Mode launch, the executor is authorized to implement the complete in-scope behavior below. Do not deploy, repair production data, or merge.

## Exact execution context

- Repository: `/Users/meridian/Projects/pulse-progression-preview-fix`
- Approved base: `origin/main` / `4f9574e607be99fee2396a673154e41699853a31` (PR #145 merge, scheduled-session provenance)
- Working branch: `fix/progression-preview-compatibility`
- Required first reads: `AGENTS.md`, `docs/specs/workout-progression-v1.md`, this file
- Related issue: GitHub #141, “Fix progression preview crashes on legacy rep targets and repeated error toasts”
- Related prior work: #112/#128 progression and muscle analytics; #134/#145 scheduled snapshot provenance. Do not regress #134's source-session prescription identity.
- Pre-existing state: the original checkout `/Users/meridian/Projects/pulse-fitness-app` is intentionally dirty with unrelated untracked `CODEX-ISSUE-*` files and artifact directories. Do not edit, stage, delete, or copy those artifacts. Work only in this isolated worktree.

Fail before editing if the worktree is not the named branch at the approved base, or if unrelated files appear in this worktree.

## Confirmed current behavior and evidence

At the approved base, a real persisted shape can contain `reps: 6, repsMin: 6, repsMax: 6` (also 8/8/8 and 5/5/5). The shared `workoutProgressionTargetSchema` currently rejects any exact reps combined with either range field, so `buildEvidenceForScheduledWorkout` in `apps/api/src/routes/workout-progression/store.ts` throws while constructing `priorTargets` or historical `performance[].prescribed`. The exception escapes `POST /api/v1/workout-progression/preview` in `apps/api/src/routes/workout-progression/index.ts` rather than becoming a recoverable domain result.

Relevant paths inspected:

- `packages/shared/src/schemas/workout-progression.ts`: strict target/evidence/recommendation/action schemas and lifecycle invariants.
- `apps/api/src/routes/workout-progression/store.ts`: scheduled target writer/read, historical `session_sets` prescription read, evidence construction, evaluation, fingerprinting, persistence, stale/idempotent action application.
- `apps/api/src/routes/scheduled-workouts/store.ts`, `snapshot-store.ts`, and `index.ts`: scheduled-set construction/update and snapshot writers.
- `apps/api/src/routes/workout-sessions/store.ts` and `index.ts`: copying scheduled prescriptions into live session sets and completed-session correction/history paths.
- `apps/web/src/features/workouts/api/progression.ts`: preview query and action mutation.
- `apps/web/src/features/workouts/components/workout-progression-review.tsx`: comparison, empty/error/retry UI, explicit actions, stale/unavailable rendering.
- `apps/web/src/lib/query-client.ts`: global query error toast and one default retry; unrelated auth handling must remain unchanged.
- `apps/api/src/routes/workout-progression/*.test.ts`, shared progression tests, `apps/web/src/features/workouts/components/workout-progression-review.test.tsx`, and `apps/web/e2e/workout-progression.spec.ts`: existing contract and regression surface.

The preview is a POST and may persist recommendations. Therefore retries/remounts must be bounded and safe; do not describe this as polling or assume a toast per HTTP retry without testing.

## Frozen product and compatibility decisions

1. **Target meaning is field-preserving and deterministic.** For each target independently, exact-only means `reps != null` and both `repsMin`/`repsMax` null; range-only means `reps == null` with a valid range (both bounds for a complete range, or the existing explicitly supported partial-bound semantics); no rep target means all three null.
2. **Lossless legacy redundancy rule.** If exact reps is present and every non-null rep-range bound equals that exact value (`repsMin === reps` and/or `repsMax === reps`), treat it as equivalent redundant legacy encoding. Normalize only at the validation boundary to the canonical exact representation (`reps` retained; redundant equal range fields become null), and record deterministic compatibility provenance/reason/source in evidence or diagnostics. Do not mutate the scheduled row or historical row.
3. **Conflicts fail closed.** Any exact/range mismatch (including `reps=8, repsMin=6, repsMax=8`, `reps=8, repsMin=8, repsMax=10`, invalid bound order, or non-finite/out-of-domain values) is not silently selected, clipped, or fabricated. It must produce structured source-aware invalid evidence and an unavailable/hold outcome for that exercise. The original raw persisted values remain readable in diagnostics/evidence where schema-safe.
4. Apply the same compatibility/conflict handling to both current `priorTargets` and historical `performance[].prescribed`; never normalize current while leaving historical contradictory or vice versa.
5. **Safe isolation.** One malformed exercise must not abort valid exercises in the same scheduled workout. The valid exercise can produce a normal recommendation. The malformed exercise must be unavailable/hold, with stable machine-readable reason and source (`current scheduled target` versus `historical prescribed target`, set identity/number), and must not enable target application.
6. Missing policy is a distinct valid unavailable state (`MISSING_POLICY`), not a target-compatibility crash. Missing history is also informative and non-crashing. Preserve policy provenance and clearly distinguish no policy, no completed history, invalid current evidence, and invalid historical evidence.
7. New writers must prevent recreating equivalent/conflicting shapes. At every scheduled and session prescription writer/copy/update boundary, validate or canonicalize equivalent redundancy and reject conflicts fail-closed. Do not rewrite existing production rows and do not add a migration unless absolutely necessary; if a migration is proposed, stop for approval rather than silently adding it. Prefer shared helpers so all writers use one rule.
8. Preview never changes scheduled targets merely by opening, remounting, retrying, or recomputing. Only explicit `accept`/bounded `edit` may update targets, and only after existing stale, ownership, editability, transaction, and idempotency checks. `keep`/`hold` remain no-change actions. Preserve recommendation snapshots and action audit history.
9. JWT and `AgentToken` use the same schemas and behavior. Keep every query and action scoped to authenticated `userId`; cross-user resources remain indistinguishable from not-found. AgentToken idempotency remains actor-bound. Do not weaken auth or enrichment middleware.
10. UI errors are scoped inline to the progression panel with one explicit retry. Avoid repeated global toast noise for this persistent preview failure, without globally suppressing unrelated query errors or changing unauthorized logout/redirect behavior. Show loading, success, unavailable/no-policy, no-history, error/retry, and stale states with useful text and accessible roles; preserve the exact previous/current/proposed comparison when evidence is available.

These are deterministic compatibility/safety semantics. Do not ask for product clarification unless the repository makes them impossible or reveals a consequential contradiction (for example, an existing public contract that requires preserving both redundant forms in a schema where they are currently forbidden). Escalate such a contradiction with exact file/test evidence; do not guess.

## Implementation surface

### Shared compatibility and diagnostics

- Add a shared, typed target compatibility/validation helper (or the smallest equivalent abstraction) used before strict target parsing.
- Keep valid exact-only and range-only targets lossless.
- Define stable reason/source discriminants for redundant-equivalent normalization, current invalid target, historical invalid prescription, malformed set identity, and other necessary fail-closed evidence conditions.
- Ensure normalized values used for evaluation/fingerprinting are deterministic; never include nondeterministic error ordering.
- Preserve strict schemas for accepted canonical targets and recommendation/action invariants.

### API evidence and preview

- Refactor evidence construction so each exercise is isolated and parse failures become structured unavailable/hold recommendations or an equivalent response contract, rather than an unhandled 500.
- Ensure invalid evidence cannot be accepted or edited and cannot cause another exercise's recommendation to change.
- Verify recommendation persistence/query projection, stale fingerprinting, and action application remain coherent for normalized evidence.
- Preserve no-policy (`MISSING_POLICY`), no-history, unsupported tracking, and historical-source explanations.
- Add/retain explicit route tests for 200 partial results, stable invalid reasons, 404 ownership, JWT/AgentToken parity, and cross-user isolation.

### Writers and historical provenance

Audit and cover every writer identified in the inspected paths: scheduled template/snapshot creation and edits; scheduled-to-session copying; session correction/read projection; any agent/import writer that sets target reps fields. New writes must canonicalize equal redundancy or reject contradictions before persistence. Do not repair existing data.

### UI/query behavior

- Keep TanStack Query request count bounded: no automatic retry loop, no repeated preview POST caused by render/remount, and explicit retry only.
- Scope suppression to this preview query/mutation using existing mechanisms or a feature-specific error policy; do not alter global auth behavior or silence unrelated errors.
- Render informative inline unavailable/error states, including retry affordance and “plan has not changed”; distinguish missing policy/no history from transport/server failure.
- Preserve comparison rows and exact source/provenance text for valid and partially invalid exercises. Ensure keyboard operation, 44px controls, responsive 320px+ layout, and accessible loading/alert/status semantics.

## Invariants and non-goals

- No production deployment, production DB access/repair, historical rewrite, migration execution against canonical data, merge, or executor auto-merge.
- No target changes until explicit accepted/edited action passes stale and idempotency checks.
- No cross-user evidence, recommendation, configuration, or action access.
- No silent discard of conflicting fields, no fabricated target, no global toast-policy regression.
- Existing #134 scheduled snapshot provenance and completed-session correction semantics remain intact.

## Acceptance matrix

Add focused tests with populated, isolated legacy-shaped fixtures (not only freshly normalized schedules):

1. exact-only reps;
2. range-only reps;
3. exact plus equal min/max redundancy, including historical `performance.prescribed`;
4. exact plus one equal bound;
5. exact/range conflicts in each direction and invalid range ordering;
6. missing/no measurable reps target where otherwise valid;
7. malformed current exercise alongside valid exercise, proving per-exercise isolation;
8. malformed historical prescription alongside valid current target;
9. missing policy (`MISSING_POLICY`) and no completed history as separate informative outcomes;
10. writer/copy/update canonicalization or rejection, with no persisted contradictory new row;
11. JWT and AgentToken parity, user scoping, cross-user 404, and agent idempotency;
12. preview reopen/remount/explicit retry request counts and no target mutation;
13. accept/edit/keep/hold, stale recommendation, stale schedule, idempotency replay/conflict, and schedule-lock behavior;
14. UI tests for loading, success, unavailable/no-policy, no-history, server error + inline retry, bounded retry, unchanged targets, stale and accessible responsive content;
15. installed Chrome meaningful flows at mobile and desktop widths: loading, successful legacy compatibility preview, unavailable/no-policy, malformed/conflict error, explicit retry, and proof scheduled target values are unchanged before accept;
16. full uncached repository gates from clean final head: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (with exact outputs and exit codes). Run relevant installed-Chrome command(s) with exact output; if unavailable, report the concrete blocker and do not substitute a screenshot claim.

For evidence, save raw exact-SHA logs, request-count/assertion output, and screenshots under a repo-contained or explicitly reported ignored evidence path. Every artifact must identify commit SHA, branch, fixture/scenario, viewport, and whether it is pre/post action. Do not treat empty screenshots or DOM-only value assertions as visual usability proof.

## Required executor completion loop

Read all required context and inspect actual code first. Write a bounded plan. Implement the full contract. Run focused checks, then the complete uncached matrix. Spawn distinct internal Luna-medium adversarial reviews for: (a) schemas/evidence/provenance/failure atomicity, (b) auth/isolation/idempotency/writers, (c) UI/query retry/accessibility/Chrome, and (d) tests/evidence/git hygiene. Consolidate all concrete findings once, repair every in-scope finding, rerun affected and full gates, inspect final diff, commit coherent implementation and literal evidence. Do not hand back known defects.

Use GPT-6 Astra at the lowest visible effort setting for primary implementation; report the exact UI label observed without asserting a label-to-effort mapping. Review/support agents remain GPT-5.6 Luna at medium effort.

## Final report contract

Return `COMPLETE` or `BLOCKED`, exact branch and full SHA, commits/files, requirements-to-evidence mapping, every adversarial finding/disposition, exact commands/results, Chrome evidence, remaining blockers, prohibited-actions confirmation, and final `git status --porcelain`.
