# RIR logging v1

## Scope

Pulse stores repetitions in reserve (RIR) as an optional, native set-level observation for
`weight_reps`, `bodyweight_reps`, and `reps_only` exercises. RIR is not a prescribed workout
target, does not complete a set, and is not copied to another set. Duration, distance, cardio,
`weight_seconds`, `seconds_only`, and `reps_seconds` keep their existing metrics and RPE behavior.

## Persistence and writes

`session_sets.rir` is nullable and accepts the integer buckets `0` through `5`; `5` means five or
more repetitions remained. A set may contain native RPE or native RIR, never both. The database,
shared request schemas, direct set routes, session mutations, batch upserts, AgentToken transforms,
and completed-session corrections all enforce the same rule.

Replacing one effort scale with the other is one atomic write:

- RIR selection sends `{ rir, rpe: null }`.
- RPE selection sends `{ rpe, rir: null }`.
- Explicit `{ rir: null }` and `{ rpe: null }` clears are valid.
- Both non-null is rejected without changing the row.

The migration rebuilds `session_sets` so SQLite enforces both the RIR range and mutual-exclusion
checks. It copies every pre-existing column, preserves native RPE rows unchanged, gives legacy rows
`rir = null`, recreates every index/foreign key/unique/check constraint, and is covered by a
populated pre-migration upgrade test plus integrity and foreign-key checks.

## Read and presentation flow

The API returns raw `rpe` and `rir` facts through active sessions, completed history,
last-performance facts, correction responses, and AgentToken/JWT responses. The UI formats native
RIR as `0 RIR` through `4 RIR` or `5+ RIR`; it never displays a converted RPE value as though the
user logged it. Historical RPE remains labeled `RPE N`.

Resistance set rows expose an optional RIR picker with `RIR —`, buckets `0`–`5+`, and Clear. The
picker uses an accessible radiogroup, 44 px choices, persistent selected state, explanatory copy,
and returns focus to its trigger. Completed-session correction uses the same choices and atomic
replacement semantics. Optimistic updates use the existing server-backed mutation path and restore
the prior native effort facts on failure.

## Progression evidence

Progression evidence contains raw nullable `rpe`, raw nullable `rir`, and provenance
`native_rpe | native_rir | none`. The source fingerprint includes all three facts. Policy evaluation
uses an internal interpretation only:

- native RIR `0`–`4` has exact effective RPE `10 - RIR`;
- native RIR `5` is a lower-effort bucket whose effective RPE is at most `5`, never an exact RPE 5;
- missing native effort retains the existing limited-confidence behavior.

The persisted `rpe_regulated` policy family name remains unchanged. Corrections to either native
effort field change the evidence fingerprint so stale recommendations are replaced through the
existing recomputation lifecycle.
