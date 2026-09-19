# Activity / Journal / Body Context / Calendar release

## Authority and lane
Derek approved Vector's coordinated release plan and authorized kickoff. This supersedes historical planning-only language for implementation on the release branch, dependency/reference cleanup, and eventual release PR preparation. No production access/migration/deploy, cron/reminders, account/config changes, main edits, merge, issue closure, or unrelated cleanup. Final personal QA and Vector acceptance precede merge; deployment needs separate approval.

Product base: a2525a61347f7b62c9014fc47d1518e38f34d3ef. Exact editing lane: /Users/meridian/Projects/pulse-activity-journal-release, branch feat/activity-journal-release. Read AGENTS.md and relevant conventions. Preserve other worktrees and main's untracked artifacts. One editor. Ordinary locked dependency/build downloads allowed; no production secrets/data. Use fictional fixtures.

Canonical product intent: docs/planning/activity-journal-body-context.md. Historical status wording is superseded by this authority only as stated above. Issue snapshots in docs/planning/activity-journal-issues.json retain original full acceptance. No requirement may be silently dropped.

## Release checkpoints
1. #176 foundation: executable contracts and complete runtime ownership inventory.
2. #177 Activity lifecycle then #178 concerns/guidance/flare runtime.
3. #179 canonical cross-thread check-in then #180 Journal/weekly grounding.
4. #181 session-specific context then #182 shared Calendar read model/UI.
5. #183 remaining UI, agent guide, integrated release acceptance.

STOP at the end of the CURRENT checkpoint for Vector-managed independent review. Do not independently advance to later checkpoints, open a docs-only PR, merge, or claim epic completion.

Proposed corrected dependency DAG: 176 none; 177<-176; 178<-176,177 (routine reschedule/proposals); 179<-176,177,178; 180<-176,179; 181<-177,178,179,180; 182<-177,178,179,180,181; 183<-176..182. Daily-context core must not require Journal writes to initialize: Journal reads that core; downstream aggregation may incorporate Journal without a build-time cycle.

## Fixed invariants
Agent-managed conversation/voice capture, not an in-app recorder, manual capture forms, direct PT integration, or LLM API. Preserve meaning, timing, uncertainty, source and provenance; unknown is not a negative. Agent interprets/proposes; backend owns identity, persistence, timezone/date semantics, immutable revisions, recurrence, auth, retries/conflicts and derived reads. Distinguish clinician-authored, user-relayed clinician guidance, user observations and agent suggestions. No diagnosis, inferred healing/clearance, unsupported pain causality, silent meaningful plan changes, or fabricated load/recovery scores.

Activities stay distinct from structured workouts. Planned/assigned and actual execution stay linked but separate. Preserve recurrence assignments and correction history. Record flares before follow-up. Meaningful plan changes require explicit approval; explicit routine move instructions execute directly once with rescheduling history. Concerns remain tracked when irrelevant today. Journal is meaningful health/nutrition/movement/injury observations, not copied routine logs or broad diary. Shared daily questions are resumable across threads, deduplicated, concurrency-safe. Weekly reflection traces to facts and exposes gaps. Session context includes positive focus plus relevant cautions with provenance/freshness. Calendar is a shared read model, not a second schedule; Workouts remains a filtered view. No fake product data.

## CURRENT checkpoint: #176 canonical foundation
Inspect existing shared schemas, Drizzle/routes, workout feedback question/revision/planning mechanisms, scheduled snapshots, nutrition/day semantics, journal schema and mock Activity/Journal/Session Context. Do not duplicate working primitives or assume issue code links prove existing implementation.

Deliver shared Zod/types and executable contract tests/fixtures for Activities, assignments/executions, goals, recurrence revisions, workout links, concerns/capabilities, guidance, observations, check-in question/answer revisions, actor/subject ownership, source/uncertainty/freshness, proposals/approval, request idempotency and stale conflict errors. Enumerate actual planned endpoints/read models with exact implementing child; clearly distinguish implemented contracts from unimplemented runtime. Docs alone are not completion; do not install placeholder routes returning fake success.

Record explicit decisions for concern state transitions, recurrence effective dates (past assignments never silently rewritten), correction conflicts (visible stale failure, immutable prior revisions), idempotency key scoping and mismatched-payload retries, actor versus subject identity, timezone/day versus timestamp interpretation, approval binding to the exact proposal revision and stale-target behavior. Choose conservative consistent defaults preserving the approved contract; escalate genuine product ambiguity instead of weakening it. Existing records/migrations immutable; runtime migrations belong to owning slices unless essential shared foundation requires one, in which case rehearse on fictional predecessor/fresh DB fixtures.

Required executable cases: cross-user/link rejection shape; all four provenance classes survive; planned Tuesday/actual Thursday and timezone boundary; duplicate retry vs changed-payload conflict; immutable prior revision and visible stale conflict; recurrence revision preserving past assignment; meaningful proposal cannot be represented as approved implicitly; unknown remains distinct from negative; structured workout identity remains separate. Label contract-level evidence honestly, not as deployed persistence or endpoint verification.

Produce docs/implementation/activity-journal-contracts.md with compact route/owner inventory and decisions, and docs/implementation/activity-journal-status.md with checkpoint/head, requirements-to-tests mapping, commands/results, deferred runtime owners and real gaps. Independent review is Vector-owned explicit Terra 5.6 medium (Fast off) CLI workers; do NOT spawn generic/internal reviewer agents or inherit Grok/Luna defaults. Primary launch settings are launcher-owned Sol 5.6 medium Fast off; do not modify global settings.

## Efficient evidence and stopping gate
Focused tests during editing; self-review; consolidate repairs. For this shared-contract checkpoint run shared tests/typecheck and affected lint/build plus affected existing consumers' checks when exports change. Inspect actual package names/scripts first; root commands are pnpm test, pnpm typecheck, pnpm lint, pnpm build. Follow mandatory repository hooks/checks; do not bypass them. Capture raw first-run stdout/stderr, exit status and source/test/config identity in /Users/meridian/Projects/qa-reports/pulse-activity-journal-release/checkpoint-176 (external evidence is allowed). Retain failed attempts, no retry-to-green loop. Use tool-side wait or completion events, never repeated LLM polling. No UI/browser gate for contract-only work; final release requires populated mobile/desktop, real persistence reloads, auth/concurrency, legacy migration rehearsals and integrated API/browser readbacks.

Commit coherent checkpoint work with conventional descriptive subject/body and leave lane clean. Pushing only this feature branch is allowed. Return exact head, files, tests, evidence index and gaps, ending 'Ready for independent review: #176'. Do not close GitHub issues, open PR, merge, deploy or proceed to #177 before Vector review.
