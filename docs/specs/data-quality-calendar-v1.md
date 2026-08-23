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
- An explicitly supplied, `Intl`-supported IANA time zone controls today and completed-day cutoff.
  Otherwise the latest effective Adaptive program time zone is used, followed by the user
  preference and then UTC.
- Date-only keys are authoritative local calendar dates. Clients must not reinterpret them through
  the browser time zone.
- The store performs a fixed set of bounded range queries and batched relation queries. Query count
  must not grow with the number of dates or records.
- The endpoint is read-only. A GET must not change any source, review, action, target, or context row.

## Composition sources

### Nutrition

`nutrition_logs`, `meals`, and `meal_items` are the recorded source. The explicit log status remains
`unknown`, `partial`, or `complete`; a missing row remains `no_records`. Calories and macros are
nullable summaries and are never converted to zero when the log is absent.

Algorithm evidence is separate from the recorded status:

- today's record is `pending_cutoff` in a live view;
- the existing #103 eligibility evaluator classifies current source rows as `usable` or `excluded`
  for each completed local-date boundary; immutable calculation/review snapshots retain the reason
  codes and treatment that supported past decisions;
- a complete low day is `suspected_partial` only when an existing immutable weekly-review
  data-quality module says so. The calendar does not run a second anomaly heuristic.

### Weight

`body_weight` is canonical and already contains one selected measurement per user/local date. The
calendar returns that exact row, its entry unit, recorded/updated timestamps, and a `corrected`
flag when the retained row was updated after creation. Product Trend Weight and Adaptive snapshots
supply derived inclusion, suspect, stale, and pending-cutoff facts. Missing measurements and missing
trend estimates stay null.

Pulse currently has no deleted-weight event ledger, so the calendar does not claim to reconstruct a
deleted measurement. If such a ledger is added later, it may be composed without changing this
source-of-truth rule.

### Workout

`scheduled_workouts` and non-deleted `workout_sessions` provide planned, active, paused, completed,
and cancelled facts. A completed session is `corrected` only when its retained update timestamp is
later than completion. `schedule_change` or `training_change` context is displayed as context; it is
not treated as proof that a schedule moved.

Pulse currently has no immutable schedule-movement ledger. The calendar therefore uses `moved`
only when an authoritative future schedule-event source exists; v1 otherwise reports the retained
plan/session state and any bounded context honestly.

### Algorithm and decisions

Append-only program revisions, immutable check-in calculation snapshots, weekly-review snapshots,
and review actions provide the algorithm history. The calendar distinguishes `no_program`,
`pre_program`, `learning`, `updating`, and `holding`, plus dated pending/accepted/declined/deferred
decisions. For each date through today, it reuses the existing #103 evaluator over the canonical
source rows; it does not implement new eligibility or recommendation math. Future dates may show a
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

- `/data-quality` renders a month grid and an adjacent selected-date audit panel from one response.
- Each day is a native button with a full accessible name and compact text/icon domain indicators;
  state is never communicated by color alone.
- Filters hide/show domains without changing server facts. Summary counts remain clearly labeled by
  domain rather than collapsing unlike meanings into one score.
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
