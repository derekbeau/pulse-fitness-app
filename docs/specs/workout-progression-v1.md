# Workout Progression and Muscle Analytics v1

Status: implementation contract for GitHub issue #112.

## Scope

This specification adds deterministic next-session exercise recommendations and descriptive
muscle-training analytics. It does not diagnose injury, select substitute exercises, or claim a
universal optimal training volume.

The existing workout model remains authoritative:

- completed `workout_sessions` and `session_sets` are immutable evidence except through the
  existing completed-session correction route;
- scheduled-workout snapshot sets are the editable next-session plan;
- starting a session copies the accepted scheduled snapshot into the live session;
- exercise identity is never inferred from name when a canonical exercise id exists.

## Recommendation lifecycle

A recommendation is an immutable, versioned evidence snapshot. It records the exact source
session/set ids, prior prescription, completed performance, policy configuration, deterministic
output, source fingerprint, and generation/effective time. It never mutates when source evidence is
corrected.

Actions are an append-only sequence attached to the recommendation:

1. `accept` applies the exact recommended targets.
2. `edit` applies a bounded user/agent-provided target override while retaining the original
   recommendation.
3. `keep` explicitly retains the current prescription.
4. `hold` records a temporary no-change decision and reason.

Before a material action, the server rebuilds the source fingerprint. A mismatch returns a stable
stale conflict and performs no plan or action write. Re-previewing creates or reuses one current
recommendation for the corrected fingerprint; the old snapshot remains readable. AgentToken
actions require an idempotency key. Replaying the same key returns the same result; reusing it with
a different body fails closed.

Only scheduled-workout targets may be changed by v1. Template prescriptions and completed/live
sessions are never mass-updated. The UI must show current and proposed values and require an
explicit accept, edit, keep, or hold action.

## Policy selection

Every result names a policy family and version. V1 supports:

| Family               | Intended evidence              | Deterministic v1 rule                                                                                                                                                                                      |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `double_progression` | Load plus rep range            | Increase one configured load increment after every required set reaches the top of the range. Known high effort holds; missing optional effort lowers confidence without blocking the rep-completion rule. |
| `strength_load`      | Exact load/reps                | Increase by the configured percentage, rounded to the configured increment, after every required set is completed. Known high effort holds; missing optional effort lowers confidence.                     |
| `rpe_regulated`      | Load/reps plus RPE             | High effort reduces one increment; clearly low effort with all work completed increases one increment; otherwise hold. Missing effort always holds with limited confidence.                                |
| `time_distance`      | Seconds, distance, and/or zone | Increase the configured time or distance step when every required effort is completed and any logged zone/RPE ceiling is respected. Missing optional RPE lowers confidence.                                |
| `rehab_capacity`     | Conservative capacity work     | Never silently increases. It holds after successful work and reduces only when the explicit policy permits reduction after high effort or missed work.                                                     |

The selected policy is stored in the recommendation snapshot; later policy-version changes do not
rewrite older advice. Weight increments are explicit input (including non-standard equipment
increments), never guessed from display units. Rounding occurs once at the recommendation boundary.

## Confidence and explanations

Confidence is `supported`, `limited`, or `unavailable` and includes machine-readable reason codes.
Missing effort for an effort-dependent policy is never treated as easy work. Skipped/missed sets,
identity mismatch, unsupported tracking combinations, or missing prior prescriptions cannot produce
an increase.

Human explanations are rendered from server-owned facts. They state the prior result, the policy
rule that fired, the exact proposed change, rounding/increment behavior, and why the result is an
increase, hold, or reduction. The client does not recompute recommendation math.

## Corrections and staleness

The source fingerprint covers:

- scheduled workout, exercise, and set identities and current targets;
- source completed session/set identities and corrected values;
- exercise tracking type and policy-selection inputs;
- policy family, version, thresholds, increments, and caps.

The completed-session correction route therefore invalidates any affected unapplied recommendation
without deleting it. A corrected recommendation must be explicitly reviewed again.

## Muscle contribution model

V1 normalizes exercise-to-muscle attribution as explicit versioned contributions:

- `primary` contribution factor: `1.0`;
- `secondary` contribution factor: `0.5`;
- factors are stored per exercise and sum independently across qualifying sets;
- historical analytics resolve the contribution rows effective for the completed session date.

Legacy `exercise.muscleGroups` values are backfilled deterministically: the first unique muscle is
primary and later unique muscles are secondary. This migration rule is compatibility scaffolding,
not a physiological claim. Users/agents may later revise live attribution; immutable analytics
responses state the contribution version used.

Qualifying sets are completed, not skipped, and have a supported measurement for the exercise
tracking type. Muscle analytics report 7/30/90-calendar-day completed exposure, planned exposure,
qualifying-set equivalents, session frequency, exercise count, and volume load only where weight ×
reps is meaningful. They link every aggregate to source session, set, exercise, and contribution
ids. No band is labeled optimal.

## API and authorization

JWT and AgentToken callers receive the same strict recommendation, detail, and analytics data.
AgentToken may preview and apply bounded recommendation actions through the existing unified auth
surface. Cross-user ids return 404.

Material action writes are transactional and idempotent. Applying targets validates ownership,
scheduled-workout editability, recommendation freshness, action sequence, target bounds, and
idempotency before updating the scheduled snapshot and appending the immutable action.

## UI contract

Planning surfaces show current versus proposed targets, the prior performance, confidence, policy,
and concise reason. No target changes merely by opening a page. Active sessions only prefill targets
already accepted into their scheduled snapshot; they may show the accepted recommendation source
but do not re-run progression.

Muscle analytics use the shared chart frame and exact-values table. State, role, contribution,
missed work, and change are expressed with text in addition to color. Controls are at least 44 px,
keyboard operable, responsive from 320 px through desktop, and preserve strict diagnostics.
