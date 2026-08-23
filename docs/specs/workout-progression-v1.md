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

Each completed source set carries both its immutable scheduled-set source id (when available) and
the session-set id, the previous prescribed targets copied into that session, and the completed
values. Recommendation thresholds use that previous prescription. Editing a future plan can change
the proposed destination but cannot reinterpret whether the historical work met its prescription.

Actions are an append-only sequence attached to the recommendation:

1. `accept` applies the exact recommended targets.
2. `edit` applies a bounded user/agent-provided target override while retaining the original
   recommendation.
3. `keep` explicitly retains the current prescription.
4. `hold` records a temporary no-change decision and reason.

Before a material action, the server rebuilds the source fingerprint. A mismatch returns a stable
stale conflict and performs no plan or action write. Re-previewing creates or reuses one current
recommendation for the corrected fingerprint; the old snapshot remains readable. AgentToken
actions require an idempotency key. Replay is bound to the authenticated actor identity, exact
recommendation resource, and body. Replaying that complete request returns the same result; using
the key for another token, recommendation, or body fails closed. Token display-name changes do not
break a safe lost-response retry.

Only scheduled-workout targets may be changed by v1. Template prescriptions and completed/live
sessions are never mass-updated. The UI must show current and proposed values and require an
explicit accept, edit, keep, or hold action.

Recommendation and action rows snapshot their source identifiers rather than retaining live
foreign keys to schedules, exercises, or source sessions. Supported schedule removal, exercise
swap/removal, session trash/restore/purge, and exercise purge therefore do not destroy or block the
immutable audit record. Account deletion remains the only path that deletes that user's audit.

## Policy selection

Every result names a policy family and version. V1 supports:

| Family               | Intended evidence              | Deterministic v1 rule                                                                                                                                                                                      |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `double_progression` | Load plus rep range            | Increase one configured load increment after every required set reaches the top of the range. Known high effort holds; missing optional effort lowers confidence without blocking the rep-completion rule. |
| `strength_load`      | Exact load/reps                | Increase by the configured percentage, rounded to the configured increment, after every required set is completed. Known high effort holds; missing optional effort lowers confidence.                     |
| `rpe_regulated`      | Load/reps plus RPE             | High effort reduces one increment; clearly low effort with all work completed increases one increment; otherwise hold. Missing effort always holds with limited confidence.                                |
| `time_distance`      | Seconds, distance, and/or zone | Increase the configured time or distance step when every required effort is completed and any logged zone/RPE ceiling is respected. Missing optional RPE lowers confidence.                                |
| `rehab_capacity`     | Conservative capacity work     | Never silently increases. It holds after successful work and reduces only when the explicit policy permits reduction after high effort or missed work.                                                     |

Policy family, thresholds, valid increments, context requirements, and priority are explicit
persisted programming configuration with actor and revision provenance. Exercise category and tags
never select policy. Without configuration, the result is an unavailable hold. The selected policy
is stored in the recommendation snapshot; later configuration or exercise-metadata changes do not
rewrite older advice. Weight increments are explicit input (including non-standard equipment
increments), never guessed from display units. Rounding occurs once at the recommendation boundary.
A configured rule that cannot produce a positive, materially different, tracking-compatible target
fails closed as an unavailable hold.

V1 context facts are bounded to pain, symptoms, form failure, and explicit programming hold, with a
programming-configuration or session-feedback source. Any observed adverse fact overrides an
increase. A policy that requires context fails closed when that context is unavailable.

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
- source completed session/set identities, previous prescriptions, and corrected values;
- immutable scheduled-set identities, including same-value replacement, order, addition, removal;
- exercise identity/name/tracking snapshots;
- policy provenance, family, version, thresholds, increments, caps, priority, and context facts.

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

Planned fulfillment reconciles only through the scheduled-set id copied into a completed session
set. Unmatched or ad-hoc completion remains descriptive completed exposure but cannot satisfy an
unrelated plan. Fulfillment is `fully_completed`, `partially_completed`, or `missed` from those
exact linked equivalents; a muscle without a plan is `no_plan`. Cancelled linked schedules are not
expected exposure. Priority is true only for an explicit current programming configuration.

Exercise name, identity, and tracking type required for historical qualification are snapshotted
when a schedule/session set is created. Rename, tracking-type edit, merge, or deletion therefore
cannot rewrite completed history. Contribution lookup returns the revision active at each date and
streams range-bounded source rows directly into date/muscle aggregates instead of materializing the
full expanded set-by-contribution history in application memory. Aggregate truth is never
truncated; exact source references are deterministically capped at 5,000 globally and 500 per muscle
row with explicit total counts and truncation flags. The UI discloses both the shown count and total
count while retaining the full aggregate values.

## API and authorization

JWT and AgentToken callers receive the same strict recommendation, detail, and analytics data.
AgentToken may preview and apply bounded recommendation actions through the existing unified auth
surface. Cross-user ids return 404.

Material action writes are transactional and idempotent. Applying targets validates ownership,
scheduled-workout editability, recommendation freshness, action sequence, target bounds, and
idempotency before updating the scheduled snapshot and appending the immutable action.

## UI contract

Planning surfaces show an exact four-way comparison: previous prescription, completed performance,
current plan, and proposed target, plus confidence, policy provenance, and concise reason. No target
changes merely by opening a page. Active sessions only prefill targets
already accepted into their scheduled snapshot; they may show the accepted recommendation source
but do not re-run progression.

Muscle analytics use the shared chart frame and exact-values table. State, role, contribution,
missed work, and change are expressed with text in addition to color. Controls are at least 44 px,
keyboard operable, responsive from 320 px through desktop, and preserve strict diagnostics.
