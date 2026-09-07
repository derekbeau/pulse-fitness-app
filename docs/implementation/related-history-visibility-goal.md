# Issue #154 — Related-history visibility

## Frozen execution contract

**Issue:** #154, “Hide related history when no meaningful completed performance exists”
**Implementation worktree:** `/Users/meridian/Projects/pulse-related-history-visibility`
**Branch:** `fix/related-history-visibility`
**Frozen base:** `9540148adefe886d78a353eaa0cc60e368c225a0` (`origin/main`, verified before this contract)
**Scope authorization:** Implementation begins only after the user pastes the accompanying launcher into Codex. This document itself authorizes no implementation, external mutation, merge, deployment, environment change, production data operation, or backfill.

## Product outcome

Do not show a **Related history** disclosure merely because related exercise definitions exist. Render it only when one or more related exercises have a real, meaningful completed performance that can be represented by the canonical preview semantics. In a mixed response, render only qualifying related rows.

If no related rows qualify, render none of the following: Related badge, Related history heading, disclosure/details container, placeholder/empty-state copy, unusable **View all** control, or related-history layout gap.

The primary exercise’s direct History card, its independent full-history navigation, and valid related-row name/preview/notes/**View all** navigation remain intact.

## Known source behavior to preserve and correct

- The active card is `apps/web/src/features/workouts/components/session-exercise-list.tsx`. It presently gates the disclosure on `historySummary.related.length > 0`, formats each related `history` through local `formatHistoryPreviewEntries`, and otherwise renders “No completed sets yet.”
- `apps/web/src/hooks/use-last-performance.ts` maps API payloads into the active-workout shape. Its map currently filters usable set fields with null checks, preserving zero values; do not replace that with truthiness checks.
- The `includeRelated` API route calls `findExerciseHistoryWithRelated` in `apps/api/src/routes/exercises/store.ts`. The related-query path must select the newest **meaningful completed** performance, not select a newest session first and then discover it has no qualifying set. A newer empty, unstarted, skipped-only, or otherwise non-qualifying result must not conceal older valid completed performance.
- Existing history output is user-scoped and soft-delete scoped. Preserve this source safety and authorization boundary for every related exercise. No cross-user lookup, deleted exercise inclusion, relationship mutation, or history data mutation is permitted.

## Canonical meaningful-performance rule

Use or extract one shared, tracking-type-aware selector/formatter-adjacent predicate; do not add a divergent duplicate truthiness rule in the component. A qualifying row must come from successfully fetched history and contain at least one completed, non-skipped set with meaningful performance for its tracking type.

The predicate must retain valid zero-valued data:

- `weight_reps`: zero added load can be meaningful when reps are recorded.
- `bodyweight_reps`: bodyweight/zero added load with recorded reps is meaningful.
- `reps_only`: recorded reps are meaningful.
- Timed/duration/seconds-oriented tracking types: recorded duration/seconds are meaningful, including valid numeric zero where the established native schema/formatter treats it as a performance value.
- Distance/cardio-oriented tracking types: recorded distance or native supported performance fields are meaningful under the same canonical tracking logic.
- Native `rir: 0` is valid effort metadata and must survive selection/formatting. RIR alone must not fabricate a completed performance where the tracking-value contract says none exists.

Do not use JavaScript truthiness for load, reps, seconds, distance, RIR, or RPE. Preserve established compact-preview formatting, including native/legacy RIR presentation from #139, and do not redesign effort semantics.

## Fetch-state and selection rules

1. A successfully loaded, semantically empty related result is eligible to be omitted.
2. Loading and error states are not proof of empty history. Preserve normal TanStack Query loading/error/retry behavior and do not show a fabricated empty related disclosure to represent them.
3. Do not infer a missing history result from a failed, partial, truncated, malformed, unauthorized, or unavailable response. Parse/transport failures remain failures; do not convert them to empty data.
4. In complete successful source data, select the latest qualifying completed performance per related exercise. A newer non-qualifying session must not mask an older qualifying one.
5. Preserve deterministic ordering of related definitions among the qualifying rows unless an existing canonical source ordering requires otherwise.

## Required implementation checks

Add/adjust focused automated coverage at the selector/query/API boundary and component boundary for all of the following:

- no related definitions;
- related definitions with `null` history;
- all entries with no completed set;
- skipped-only and unstarted-only entries;
- mixed empty and valid related entries (only valid rows render);
- an older valid completed entry after a newer empty/skipped/non-qualifying one (older valid row is selected/rendered);
- bodyweight and zero-added-load cases;
- native `rir: 0` retained in preview/effort details;
- reps-only and timed/duration/cardio/distance meaningful performance;
- loading, error, and retry behavior remains distinct from successful emptiness;
- valid related row retains name, compact preview, notes affordance, and **View all** opens the same direct related exercise history/navigation flow;
- direct current-exercise History and its **View all** behavior remain unchanged;
- no Related disclosure, empty copy, button, or layout artifact when every related row is omitted.

Extend browser coverage with synthetic isolated data for the user-facing acceptance surface. Codex’s **built-in browser is first choice** for app acceptance: verify mobile 375px and desktop responsive presentation, disclosure keyboard interaction, no empty layout artifact, valid-row navigation, and console/network error state where applicable. Do not use native desktop/computer-use as a ritual; use it only for a concrete capability gap and record that gap. The user, not the executor, owns Codex model/Fast UI proof.

## Boundaries

- Read and obey `AGENTS.md`; do not edit it or other protected instructions.
- Preserve dirty/untracked artifacts in other worktrees. Work only in this isolated worktree.
- Keep #155’s merged RIR trigger behavior and #139’s merged RIR-first provenance behavior intact; their commits are already ancestors of the frozen base (`9540148adefe886d78a353eaa0cc60e368c225a0`).
- #160 (`feat/ranked-food-reuse`) has an independent reviewer and owns the serialized heavy validation/browser slot. Do not modify, inspect as an executor, or wait on its lane.
- Focused implementation checks are allowed. Do **not** run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, or browser-heavy/full-suite acceptance until parent grants the serialized heavy-slot handoff. Record those gates as pending rather than blocking implementation, draft PR creation, or push.
- Draft PR creation and push are authorized after implementation and focused checks. Do not merge, deploy, alter production or environment state, perform data cleanup/backfill, mutate history data, or change exercise relationships.
- Do not introduce a migration unless a separately approved, unavoidable requirement emerges; none is expected.

## Completion handoff

Before reporting implementation complete: inspect the final diff and status; run `git diff --check`; commit a coherent implementation change; push the branch; create/update a **draft** PR referencing `Fixes #154`; and report exact commit/PR URL, focused command results, browser evidence, pending heavy gates, changed files, and any product ambiguity. Do not claim independent acceptance until the parent has granted and completed its heavy-gate and browser review.
