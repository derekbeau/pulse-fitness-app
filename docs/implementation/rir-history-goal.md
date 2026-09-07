# RIR-first history and provenance — frozen implementation contract

## Status and authorization

This is the frozen, implementation-ready contract for Pulse issue #139, “Make resistance workout history RIR-first while preserving legacy effort provenance.” It authorizes documentation preparation and, after the parent confirms the PR156 closeout archive, one isolated implementation lane only. It does **not** authorize a Codex UI launch, production access, production data repair, deployment, merge, or issue closure.

- Repository: `/Users/meridian/Projects/pulse-rir-history`
- Branch: `fix/rir-history-provenance`
- Approved base: `origin/main` at `c1c95fc3ae498a205e78f2d7ece1d4d5211a1a83`
- Issue: #139; related context: #130 and #136
- Primary implementation owner: GPT-6 Astra xhigh (explicitly user-approved); the exact visible launcher label/effort selection is launcher-owned and must not be inferred here
- Review/support: GPT-5.6 Luna, medium effort
- Read-only counterpart: issue #133 owns nutrition; do not modify its surface or contract
- Required launch precondition: parent verifies the PR156 closeout archive
- Executor constraint: full gates and browser verification require a later per-lane final-verification slot from the parent; focused isolated checks may run during implementation. Do not create a global lock or coordinate through shared mutable state.

The source worktree used for this contract is clean at the approved base. The original `/Users/meridian/Projects/pulse-fitness-app` worktree contains unrelated untracked artifacts and is not an implementation lane; preserve it.

## Issue evidence read before defaults

The live GitHub issue body was read in the managed built-in browser at `https://github.com/derekbeau/pulse-fitness-app/issues/139`. No additional issue comments were visible. The issue establishes these non-negotiables:

- Resistance effort displays use RIR for `weight_reps`, `bodyweight_reps`, and `reps_only`.
- Native RIR is exact, including `0` and stored bucket `5` displayed as `5+`.
- Legacy RPE-only resistance records remain raw RPE facts and receive understandable derived/approximate RIR presentation with accessible provenance.
- Missing effort remains missing; do not invent an estimate.
- Cardio/duration effort and whole-session RPE remain unchanged.
- Raw API fields, progression calculations, evidence/fingerprints, and historical data are not rewritten for this presentation change.
- One centralized formatter must serve completed detail, compact history, exercise history, comparison, last-performance, and progression review surfaces.
- Provenance must be discoverable by keyboard and mobile users, not hover-only.
- Scope excludes production repair, deployment, merge, and unrelated issues #155, #154, and #140/#142.

## Current source facts inspected

- `docs/specs/rir-logging-v1.md` currently defines nullable native `rir` buckets `0..5`, where `5` means five or more, mutual exclusion with native `rpe`, raw API facts, and the current display rule that labels historical RPE as `RPE N`.
- `apps/web/src/features/workouts/lib/tracking.ts` currently appends native RIR and stored RPE literally in `appendEffort`; `formatCompactSets` is the existing compact-history path.
- `apps/web/src/features/workouts/components/workout-exercise-card/last-performance-chip.tsx`, `exercise-detail-modal.tsx`, and `session-exercise-list.tsx` consume the compact formatter for last-performance and history displays.
- `apps/web/src/features/workouts/components/workout-progression-review.tsx` contains comparison/progression evidence presentation and must use the same formatter semantics rather than a parallel conversion.
- Existing progression evidence and source fingerprints retain raw nullable `rpe`, raw nullable `rir`, and provenance. This issue changes presentation only.

## Frozen presentation semantics

### Supported native RIR

For resistance tracking types only (`weight_reps`, `bodyweight_reps`, `reps_only`):

1. If raw `rir` is non-null, it has precedence over raw `rpe` for the preferred display scale.
2. Native `rir = 0..4` displays as exact `0 RIR` through `4 RIR`.
3. Native `rir = 5` displays as `5+ RIR`; it is a lower-bound bucket, never exact five.
4. When native RIR exists alongside an inconsistent/non-null RPE in a fixture or legacy response, do not reinterpret or rewrite either raw value. The preferred display follows RIR precedence and the provenance detail exposes the raw facts according to the API contract.

### Legacy RPE-only resistance records

When `rir` is null and `rpe` is a supported stored integer `1..10`, derive a preferred RIR display using the documented approximate relationship `RIR ≈ 10 − RPE`, then clamp only to the supported RIR presentation domain:

- `RPE 10 → approximately 0 RIR` (display `0 RIR`, marked derived/approximate).
- `RPE 9 → approximately 1 RIR`.
- `RPE 8 → approximately 2 RIR`.
- `RPE 7 → approximately 3 RIR`.
- `RPE 6 → approximately 4 RIR`.
- `RPE 5, 4, 3, 2, 1 → approximately 5+ RIR` because the result is at or above the existing 5+ bucket; never display an invented exact `5`, `6`, `7`, `8`, or `9 RIR`.

The UI must label these values as derived/approximate and provide accessible detail such as `Derived approximately from stored RPE 8; raw value unchanged`. The exact wording may follow existing design-system patterns, but it must communicate both the original scale/value and the derived nature. Do not present a legacy RPE conversion as native RIR.

### Missing, mixed, and non-resistance effort

- `rir = null` and `rpe = null`: display no effort value; do not infer `5+`, zero, or any other estimate.
- Mixed sets/history containing native RIR, legacy RPE-only, and missing effort use the same per-set rules without normalizing the collection or rewriting history.
- Cardio/duration effort, including duration RPE/zone, and whole-session RPE retain their existing scale, labels, calculations, and behavior. The resistance conversion must be gated by tracking type and must not affect `weight_seconds`, `seconds_only`, `reps_seconds`, `duration`, `distance`, or `cardio` semantics.
- Raw historical rows, API payloads, progression evidence, source fingerprints, and persistence are read-only for this issue. No backfill, migration, repair, or mutation of stored history is allowed.

## Central formatter contract

Create or extend one shared presentation formatter/model for resistance effort provenance. All of these surfaces must consume it rather than implementing local conversion logic:

1. completed-session detail;
2. compact history and exercise history;
3. comparison views;
4. last-performance chips;
5. progression review/evidence displays.

The shared result must retain enough structured information for visible text plus accessible provenance (at minimum: preferred display text, raw RIR, raw RPE, native/derived/missing provenance, and whether the displayed value is a 5+ lower-bound bucket). It must be safe for populated realistic fixtures and must not alter API/domain types merely to make presentation convenient.

Provenance discovery must work through keyboard focus and mobile/touch interaction. A tooltip may supplement, but may not be the only route. Use the existing accessible help/detail/popover conventions where appropriate, and ensure the original RPE remains readable without hover.

## Explicit non-goals and exclusions

- No implementation outside this issue’s presentation/provenance scope.
- No production or canonical database access, repair, backfill, deployment, environment/secrets changes, or Foundry operation.
- No changes to active-entry RIR picker behavior, mobile numeric input/layout, numeric shortcuts, session completion, correction persistence, or RIR/RPE write atomicity except where a display-only reuse is strictly necessary.
- No changes to nutrition; read-only counterpart issue #133 owns that lane.
- No work on #155, #154, #140, #142, or unrelated regression cleanup.
- No UI launch before the parent verifies the PR156 closeout archive.

## Required evidence and gates

During implementation, use focused isolated tests with realistic populated fixtures covering:

- native RIR `0`, `4`, and `5` (`5+`), including keyboard/touch provenance discovery;
- legacy RPE `10`, `9`, `8`, `7`, `6`, `5`, and a low RPE such as `1`, proving approximate labels and the `5+` bound without false precision;
- missing effort;
- mixed native/legacy/missing history;
- all six listed display families, with the formatter called by each;
- unchanged cardio/duration and whole-session RPE;
- raw fields and progression evidence/fingerprints unchanged.

After the parent grants this lane’s final-verification slot, the executor must run the complete agreed repository gate once (uncached lint, typecheck, test, and build), then the relevant installed-Chrome/browser flow against an isolated fixture/server. Browser evidence must use populated data, include mobile and keyboard provenance discovery, and include screenshots/readbacks sufficient to prove visual usability; DOM text assertions alone are insufficient. Do not claim full/browser verification before that grant.

## Executor completion contract

The executor reads this file, `AGENTS.md`, the live issue evidence, the current formatter/source/tests, and the relevant design-system accessibility patterns before editing. It owns implementation, focused checks, internal read-only review, consolidated repairs, final diff inspection, and literal evidence. It must stop and report if a consequential product ambiguity appears rather than choosing a new default.

The branch must finish with only the intended implementation/docs changes, no generated artifacts or environment files, and a clean working tree. Commit with a conventional commit and report the exact commit SHA, focused/full commands and outcomes, browser evidence paths, and any remaining limitation. This contract itself is the only prepared tracked file for the frozen lane; no implementation source or test files are authorized in this preparation step.

## Remaining decisions / ambiguity report

No consequential unresolved product ambiguity remains for the conversion domain after reading issue #139: the supported-bound rule is frozen as `RIR ≈ 10 − RPE`, exact-looking values only where the result is within `0..4`, and `5+` for results at or above the bucket boundary. The implementation may choose accessible wording and the existing design-system presentation primitive, but must not change the semantics above. If the API ever returns an out-of-contract RPE outside `1..10`, preserve the raw fact and report the case rather than inventing a conversion.

The parent still must make two execution decisions before launch: verify the PR156 closeout archive, and grant the per-lane final-verification slot. Those are process gates, not product defaults.
