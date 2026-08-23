# Product Trend Weight v1

## Contract

Product Trend Weight is the user-facing smoothing contract established by issue #105. For an
as-of local calendar date, Pulse selects observed weigh-ins from the inclusive trailing 30-day
window `[asOf - 29 days, asOf]` and applies observation-only EWMA with `alpha = 0.1`. It does not
interpolate unmeasured days. Two observations are required before a trend value exists.

The canonical implementation is `calculateCanonicalTrendWeightCurrent` and
`calculateCanonicalTrendWeightSeries` in `packages/shared/src/utils/ewma.ts`. The server calculates
the full series before cropping it to the selected display range. A date therefore has the same
Product Trend Weight in `1M`, `3M`, `6M`, `1Y`, and `All` views.

Persistence allows one authoritative body-weight row per user and local date. A same-date POST
replaces that row, a PATCH edit recomputes every affected response, and DELETE removes the
observation. Responses fingerprint the strict, rounded response facts (with the fingerprint field
omitted), so identical user-visible analytics have an identical fingerprint while any visible
measurement, provenance, state, goal, marker, or explanation change produces a new one. An explicit
historical `end` excludes later rows; a later-dated write cannot alter that historical response,
while a measurement edit or deletion inside the historical evidence window intentionally does.

Historical requests supply an explicit local `end`. Live requests omit `end` and must supply the
caller's IANA time zone; the server does not derive local “today” from its host time zone. The
dashboard passes its selected historical date, so the compact chart and full workspace share the
same as-of boundary.

Date-only response keys remain literal calendar dates in every browser zone. The chart maps each
`YYYY-MM-DD` key to a UTC-midnight numeric coordinate and formats that coordinate in fixed UTC;
points, range endpoints, markers, tooltips, selected details, and exact-value tables therefore
cannot shift the server-owned date. Real timestamps such as a measurement's recorded time continue
to render in the response's IANA time zone.

## Product and model trend distinction

Pulse has a pre-existing Adaptive TDEE model trend with daily interpolation, a seven-day half-life,
and a warmup window. That model is versioned calculation evidence for expenditure, goal ETA,
completion safeguards, maintenance, and accepted recommendations. Issue #108 does not silently
change those consent-sensitive calculations.

The `/api/v1/weight/trend` response states the policy explicitly:

- Product Trend Weight drives the dashboard, the Trend Weight workspace, coaching direction, and
  the primary historical line in Goal Trajectory.
- Scale weight remains the measurement history.
- The Adaptive model trend continues to drive Adaptive TDEE and Goal Trajectory strategy facts:
  completed/remaining distance, weekly contributions, recent strategy pace, ETA/forecast,
  maintenance, completion, and celebration safeguards. Those facts remain explicitly labeled and
  are never presented as Product Trend Weight.

UI code must consume these server facts and must not recompute EWMA, deltas, rates, confidence, or
goal comparison.

## Evidence and rate semantics

- `no_data`: no weight is available on or before the as-of date.
- `scale_only`: a recent scale value exists, but fewer than two observations support a trend.
- `developing`: a trend exists, but fewer than three observations or fewer than 14 elapsed evidence
  days support it.
- `sufficient`: at least three observations span at least 14 days and the latest is no more than
  seven days old.
- `stale`: the latest observed weight is more than seven days old.

Recent pace is dated ordinary least-squares regression over Product Trend Weight observations in
the trailing 14 calendar days. It requires at least three supported trend observations spanning at
least seven elapsed days. A stale current estimate exposes neither a recent pace nor current deltas.
Deltas expose the requested as-of date and the actual prior/current trend dates. Unsupported
intervals are null with a reason; they are never displayed as zero.

Raw scale observations are discrete dots. Only Product Trend Weight is a connected line, and a gap
of more than seven days starts a new visible segment. The accessible table is the exact-value
equivalent of the chart. Goal, revision, and check-in markers use continuous date
coordinates, group same-date labels, and remain available as dated text even when no weigh-in exists
on the marker date.

Historical goal context is selected by the goal's effective local start and end dates, not by its
current active status. Loss and gain compare the observed pace with a signed selected goal rate.
Maintenance reports pace separately from whether Trend Weight is inside or outside its configured
corridor. Distant targets remain textual and do not compress the measurement chart.

The response also provides structured confidence, pace freshness, scale-versus-trend, and goal
comparison facts alongside user-facing prose. The UI renders the server facts, includes the latest
scale measurement's recorded timestamp in the analytics time zone, and does not parse prose to
recover state.
