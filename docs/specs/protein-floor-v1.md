# Protein floor v1

Protein in Pulse is a daily minimum, not a maximum or an exact-limit warning.

## Authoritative facts

- `actualProteinGrams` is the sum of the immutable protein snapshots on meal items for the selected
  nutrition-log date.
- `proteinFloorGrams` comes from the accepted, event-effective nutrition target for that date.
  Pending Adaptive proposals never change it.
- `remainingToFloorGrams = max(proteinFloorGrams - actualProteinGrams, 0)`.
- `amountAboveFloorGrams = max(actualProteinGrams - proteinFloorGrams, 0)`.
- A valid positive floor is `below_floor` only when actual protein is strictly below it. Equality and
  every value above it are `floor_met`.
- Missing evidence, a missing or nonpositive accepted floor, and future dates are `unavailable`.
- `isFinal` is true only when the selected nonfuture nutrition log is explicitly complete. It is
  independent of Daily Energy's completed-day grading cutoff.

All comparisons use the raw finite nonnegative values. Display rounding cannot change state. A
positive distance that rounds below one gram is displayed as `<1g`, not zero.

## Presentation

Below the floor, surfaces say `Xg to minimum`. At or above the floor they say `Minimum met`.
Protein never receives destructive, over-target, failure, or negative-remaining presentation.
Calories, carbohydrates, and fat retain their existing plan-target behavior.

Incomplete/current evidence is qualified as `Based on food logged so far`. Future and unavailable
facts never imply success. The Nutrition Log, Dashboard snapshot and macro rings, and Agent context
consume the same structured protein-floor object. Trend charts remain actual-intake series unless a
historically event-effective floor series is added explicitly.

## Causality and mutations

Accepted target events are ordered by effective local date, recorded time, sequence, and stable ID.
A later target cannot rewrite an earlier date. Meal-item corrections or deletion update observed
protein while leaving accepted target provenance unchanged. Read endpoints are side-effect free.

Completeness scoring, Adaptive calculations, target persistence, and recommendation algorithms are
outside this presentation contract and are unchanged.
