# Data Quality & Algorithm Trust Calendar v1

## Purpose

The Data Quality calendar is a bounded, read-only composition of Pulse's existing nutrition,
weight, workout, Adaptive TDEE, weekly-review, and context records. It explains what was recorded,
what the algorithms could use, and why evidence was pending or excluded. It does not grade the
user, infer an unrecorded fact, or persist a parallel cross-domain truth.

Domain mutations remain authoritative. Nutrition status changes use the nutrition status route,
weight and workout corrections use their existing correction routes, weekly-review refresh uses
the review route, and context creation/editing/deletion uses the existing bounded review-context
routes. The calendar may link to those actions but does not replace them.

## Endpoint and bounds

`GET /api/v1/data-quality/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD&timeZone=IANA`

- JWT and AgentToken callers receive the same strict `data` payload for the same user and query.
- The range is inclusive and limited to 42 calendar days. `start` must be on or before `end`.
- Omitting both `start` and `end` is the bootstrap request. The server resolves the authoritative
  local `today` and returns its complete Monday-through-Sunday month grid. The client must not issue
  a browser-local month request before this response.
- An explicitly supplied, `Intl`-supported IANA time zone controls today and completed-day cutoff.
  Otherwise the latest effective Adaptive program time zone is used, followed by the user
  preference and then UTC.
- Date-only keys are authoritative local calendar dates. Clients must not reinterpret them through
  the browser time zone.
- The store performs a fixed set of bounded range queries and batched relation queries. Query count
  must not grow with the number of dates or records. Program revisions are reduced to the latest
  revision before the bounded window plus revisions that can become effective inside it. Review
  projection filters terminal history before hydration. Workouts, contexts, check-ins, and reviews
  use date-partitioned caps with exact per-date omitted counts so a dense early date cannot starve a
  later date.
- The endpoint is read-only. A GET must not change any source, review, action, target, or context row.

## Composition sources

### Nutrition

`nutrition_logs`, `meals`, and `meal_items` are the recorded source. The explicit log status remains
`unknown`, `partial`, or `complete`; a missing row remains `no_records`. Calories and macros are
nullable summaries and are never converted to zero when the log is absent.

Algorithm evidence is separate from the recorded status:

- today's record is `pending_cutoff` in a live view;
- the existing #103 eligibility evaluator classifies current source rows as `usable` or `excluded`
  for each completed local-date boundary;
- a complete low day is `suspected_partial` only when the current, fingerprint-fresh weekly-review
  data-quality module says so. A stale immutable review remains visible as historical evidence but
  never overwrites the current evaluator projection.

### Weight

`body_weight` is canonical and already contains one selected measurement per user/local date. The
calendar returns that exact row, its entry unit, and recorded/updated timestamps. Product Trend Weight and Adaptive snapshots
supply derived inclusion, suspect, stale, and pending-cutoff facts. Missing measurements and missing
trend estimates stay null.

`body_weight.updated_at` is a generic row timestamp: a notes-only edit changes it. Pulse has no
measurement-correction ledger, so Data Quality and Trend Weight report correction history as
unavailable and do not create a correction marker from that timestamp.
The calendar therefore exposes only `not_applicable` and `history_unavailable` correction states;
it does not publish corrected-record summary counters that the source model cannot substantiate.

Pulse currently has no deleted-weight event ledger, so the calendar does not claim to reconstruct a
deleted measurement. If such a ledger is added later, it may be composed without changing this
source-of-truth rule.

### Workout

`scheduled_workouts` and non-deleted `workout_sessions` provide planned, active, paused, completed,
and cancelled facts. The calendar never treats a general session update timestamp as correction
proof. `schedule_change` or `training_change` context is displayed as context; it is
not treated as proof that a schedule moved.

Pulse currently has no immutable schedule-movement ledger. When a schedule and session retain a
foreign-key link but have different dates, the calendar exposes both IDs/dates and labels the
relation `linked_different_date`; `moved` describes that retained relationship, not a reconstructed
event. The response states this limitation. Original-only and destination-only ranges retain the
linked counterpart needed to explain the relationship.

### Algorithm and decisions

Append-only program revisions, immutable check-in calculation snapshots, weekly-review snapshots,
and review actions provide the algorithm history. The calendar distinguishes `no_program`,
`pre_program`, `learning`, `updating`, and `holding`, plus dated pending/accepted/declined/deferred
decisions. Review state is projected by the authoritative weekly-review store, including current
fingerprint staleness and its safe refresh route. Historical program state reuses the same check-in
state primitive as Adaptive analytics plus #103 eligibility; eligibility by itself never implies an
accepted update. Future dates may show a
planned workout, but Algorithm is `future` with `not_applicable` evidence rather than a forecast.

### Context

Active `adaptive_nutrition_review_contexts` are included only when their bounded subject maps to a
date in the requested range. Date/range subjects map directly. Entity subjects map through the
owned nutrition, weight, schedule, session, or check-in row. Context is shown with actor provenance,
revision, timestamps, and resolution. Free-form context never changes nutrition/weight status or
algorithm inclusion.

Context rows exist only inside an Adaptive program today. Users without a program still receive
nutrition, weight, and workout calendar truth, with an empty context list.

## Client contract

- `/data-quality` bootstraps its month from the response `today`, then renders a month grid and an
  adjacent selected-date audit panel.
- Each day is a native button with a full accessible name and compact text/icon domain indicators;
  state is never communicated by color alone.
- Filters hide/show domains without changing server facts. Summary counts are explicitly labeled
  for the complete visible calendar grid, including adjacent-month dates.
- Previous/next month and a date input request an authoritative bounded range. The selected date is
  retained when possible and announced politely.
- Date detail shows source labels, recorded timestamps, reason codes/copy, provenance, related IDs,
  and links to existing correction/review surfaces. It never provides manual meal-entry controls.
- Loading uses a status region; errors keep navigation available, explain that source records are
  safe, and provide Retry.
- The layout must not overflow at 320, 390, 430, 768, or desktop widths. All interactive targets are
  at least 44 px and keyboard operable.

## Explicit non-claims

- Absence of a row is not a zero measurement.
- A complete nutrition status is not automatically algorithm-usable.
- A context annotation is not proof of causation or exclusion.
- An `updatedAt` timestamp is not a general-purpose audit ledger.
- The calendar does not diagnose a weight change, auto-complete nutrition, accept a recommendation,
  or modify production data.
