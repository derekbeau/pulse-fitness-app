# Pulse Chart Exploration v1

This document defines the shared interaction and presentation contract for analytical charts in
Pulse. The system is deliberately small and compositional: domain code owns health and fitness math;
shared chart code owns date windows, framing, interaction, states, and exact-value access.

## 1. Existing chart inventory

| Surface                | Data and summaries                                                                        | Current interaction/state contract                                                                   | Migration boundary                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nutrition Macro Trends | Client fills daily date keys, plots calories/protein/carbs/fat, computes logged-day means | `7D/30D/90D`, hover-only tooltip, visual-only chart, loading/empty/error variants                    | Keep daily filling and logged-day means in nutrition; adopt `1W/1M/3M`, shared frame, tooltip, states, summary, persistent detail, and table              |
| Dashboard Weight Trend | Server-owned Trend Weight workspace and range summaries                                   | `1M/3M/6M/1Y/All`, annotations, persistent point detail, exact table, loading/error/empty/stale      | Preserve server facts; replace duplicated shell controls/states/table treatments with shared primitives                                                   |
| Exercise Trend         | Client computes metric per completed session and latest value                             | `30d/90d/All`, metric selector, hover-only tooltip, empty state, visual-only chart                   | Keep exercise metric calculations local; adopt `1M/3M/All`, shared frame, tooltip, summary, detail, and table                                             |
| Injury Severity        | Domain interpolates severity only to place dated context markers                          | No range control, keyboard event dots, custom event tooltip, insufficient-data state, no exact table | Keep interpolation/event semantics local; adopt shared frame, annotations, persistent detail, state, and exact table; severity zero remains a valid value |
| Energy Balance         | Server-owned ranges, aggregation, summaries, state runs, comparison, provenance           | `1W/1M/3M/6M/1Y/All`, loading/error/retry, annotations, exact table                                  | Preserve all server math; adopt shared controls, frame, states, tooltip shell, legend, annotation lane, and table shell                                   |
| Trend Weight           | Server-owned Product Trend series, deltas, gaps, goal bands, annotations                  | `1M/3M/6M/1Y/All`, tap detail, table, strict date-only coordinates, loading/error/stale              | Preserve all server facts; make its proven date and inspection behavior the baseline shared contract                                                      |
| Goal Trajectory        | Server-owned Product Trend display plus separate Adaptive strategy/forecast facts         | Range/lookback controls, annotations, tap detail, exact table, empty/historical states               | Preserve domain series and consent semantics; adopt shared shell primitives without genericizing trajectory math                                          |
| Dashboard Sparklines   | Server/domain-owned compact macro, protein, workout, and Trend Weight series              | Hover tooltip, links, compact loading/error/empty states                                             | Keep as bounded compact wrappers; share tooltip/date/state tokens where useful, without forcing full-chart controls                                       |
| Goal History Progress  | Server-owned weekly goal facts and maintenance classification                             | Hover tooltip plus text lists                                                                        | Retain as a compact historical visualization; use shared tooltip/date/table conventions when migrated                                                     |

## 2. Date and range contract

Chart dates are authoritative `YYYY-MM-DD` calendar keys. A date key is never interpreted in the
browser's ambient time zone. Numeric chart coordinates use UTC midnight only as a stable coordinate;
formatters use UTC so the literal key cannot shift in Detroit DST, Tokyo, Kiritimati, or GMT-12.

Real instants such as measurement creation timestamps remain separate and must be formatted in the
domain-provided IANA time zone.

Named presets are inclusive trailing calendar-date windows ending on the supplied reference date:

- `1W`: 7 dates
- `1M`: 30 dates
- `3M`: 90 dates
- `6M`: 180 dates
- `1Y`: 365 dates
- `All`: earliest domain-supplied date through the reference date
- `Custom`: explicit inclusive start and end dates

The chart system never reads browser "today" while resolving a range. A live domain may first derive
its reference date from an instant and an IANA time zone, then pass that date key explicitly.

## 3. Aggregation contract

Domains request aggregation explicitly. The shared utility supports daily, Monday-based weekly, and
calendar-month buckets with one named numeric strategy:

- `sum`
- `mean`
- `last`
- `min_max`
- `count`

Null values remain missing. `sum` and `mean` use only valid observations and return null for an empty
bucket. `last` means the last valid dated observation, never the last array element. `min_max` returns
a band only when at least one valid observation exists. Every bucket reports valid and total record
counts so domains can present completeness honestly. A chart component never chooses an aggregation
strategy.

## 4. Primitive boundaries

Shared web primitives live under `apps/web/src/components/charts/`:

- `ChartFrame`: figure/card structure, title, description, control and annotation slots
- `ChartRangeControl`: accessible 44 px pressed buttons and range announcement
- `ChartSummary`: semantic `dl` summary facts
- `ChartTooltip`: exact date/series/value/unit shell with honest unavailable values
- `ChartLegend`: line, dot, dash, and pattern samples with text labels
- `ChartAnnotationLayer`: selectable, wrapping text-equivalent annotation lane
- `ChartState`: loading, empty, insufficient, partial, stale, and retryable error states
- `ChartPointDetail`: persistent `aria-live` inspection result
- `ChartDataTable`: keyboard-operable exact-value fallback

The primitives accept React composition slots and narrow typed data. They do not accept an arbitrary
chart configuration object and do not calculate Trend Weight, TDEE, workout progression, injury
severity, goal pace, or nutrition summaries.

## 5. Interaction and accessibility

- Hover and tap inspection must expose exact date, series, value, and unit.
- Tap selection persists below the visual chart. Escape clears the selection where the visual chart
  owns focus.
- The visual Recharts subtree is not the sole accessible representation. Every full analytical chart
  exposes the same values in a semantic table or an equivalent domain-specific list.
- Range and series controls are native buttons with `aria-pressed` and 44 px minimum targets.
- Annotation meaning is available as selectable text and never color-only.
- Missing, partial, unknown, and stale states use words as well as visual styling.
- Animation respects reduced-motion preferences; analytical lines default to no entrance animation.

## 6. Incremental migration plan

1. Establish and test date/range/aggregation utilities plus shared shell primitives.
2. Migrate Nutrition Macro Trends and Exercise Trend; these expose the largest current accessibility
   gaps while keeping their domain calculations local.
3. Migrate Injury Severity, preserving event interpolation and valid zero semantics.
4. Migrate the Dashboard Weight Trend wrapper by composing its existing Trend Weight domain workspace
   with the shared shell.
5. Adopt the same shell pieces in Energy Balance, Trend Weight, and Goal Trajectory where the shared
   contract replaces duplication without weakening their stricter server-owned behavior.
6. Add deterministic sparse, dense, multi-series, band, annotation, missing, empty, error, theme,
   reduced-motion, and responsive browser fixtures before closing issue #110.
