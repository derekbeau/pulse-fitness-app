# Body Progress analytics v1

Body Progress analytics is a server-owned, current-facts summary of compatible circumference
check-ins, Product Trend Weight v1, and available workout-progression v1 decisions. It is an
evidence summary, not a diagnosis or an estimate of body fat, fat mass, lean mass, or muscle gain.

## Source ownership

- Circumference values, repeated readings, quality, correction provenance, and protocol snapshots
  come from completed Body Check-ins. Site, laterality, and exact protocol version define a
  compatible segment.
- Legacy scalar Body Measurement values remain `legacy_unknown` and `unsupported`; they never gain
  replicated-reading or protocol provenance and never enter a directional segment.
- Weight state, direction, pace, dates, goal corridor, and fingerprint come directly from Product
  Trend Weight v1. Analytics does not recalculate EWMA, pace, or weight deltas.
- Strength evidence aggregates only current server-owned workout-progression decisions whose source
  sessions fall inside the selected range, bounded to the 100 newest applicable decisions.
  Training-exposure change is not treated as strength.

## Measurement policy

Two compatible points expose an exact dated raw delta. Direction requires at least three completed
compatible points, at least three points separated successively by ten calendar days, and at least
28 elapsed calendar days. All compatible raw points remain visible and dated OLS uses those actual
dates without interpolation.

The fitted total change is the OLS slope multiplied by elapsed days from the first to last point.
Direction is `up` or `down` only when its magnitude strictly exceeds the versioned product noise
floor: 20 mm for waist and 10 mm for chest, hips, upper arm, and thigh. Otherwise it is
`stable_within_measurement_noise`.

V1 freezes high variance as `blocks_direction_preserves_history`: the raw point and delta remain
visible, but the affected segment cannot independently support a directional signal. Freshness
requires the latest compatible point to be no older than the configured measurement cadence plus
seven days. Missing cadence is unresolved; there is no fallback.

## Time and history

Live requests use server-resolved user time-zone authority and fail closed with
`TIME_ZONE_REQUIRED` when unresolved. A caller-provided browser zone may agree with authority but
cannot override it. Historical `end` is a literal local date, uses the authority effective for that
date through the Product Trend Weight owner, and excludes all later observations. Corrections and
deletes recompute the visible response and fingerprint from current facts; this is not an
as-known-at-time or bitemporal contract.

## Signal policy

The strict signal enum and gain, recomp/unset, loss, and maintenance rules are those frozen in issue
#122. Global readiness and freshness gates precede interpretation. Every result includes structured
supporting, contradictory, and unavailable facts, confidence, limitations, and a next action.
Missing progression evidence lowers confidence but does not erase circumference or weight facts.
No result mutates nutrition, workouts, goals, cadence, preferences, or history.
