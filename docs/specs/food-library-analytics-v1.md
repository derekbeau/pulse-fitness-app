# Food Library Analytics v1

## Historical and current truth

Food Library Analytics reports two deliberately separate fact groups. Observed facts come only
from immutable meal-item calorie and macro snapshots linked by the persisted `foodId`. Pulse never
infers a saved-food link from a matching name. Current-definition facts come from the mutable saved
food row and therefore describe future defaults, not historical entries.

Selected ranges use nutrition-log local dates. `30D` and `90D` are inclusive calendar windows
ending on the response reference date; `All` begins with the first owned nutrition log. For a live
request, the latest effective Adaptive Nutrition program time zone is authoritative. For an
explicit historical end, only a program revision effective on that date can supply the zone; a
future revision is never backfilled. When no revision is effective, the validated request zone (or
UTC when omitted) is used. A caller-supplied zone that conflicts with the effective program zone is
rejected rather than silently changing calendar membership.

Bounded presets materialize the authenticated user's selected `nutrition_logs(user_id, date)`
slice before joining meals and meal items. They never begin from a food's lifetime item index; old
out-of-range occurrences therefore do not add proportional work. `All` intentionally scans the
owned lifetime. Summary, rows, portions, and detail occurrences all reuse this range-first contract
without mutable rollups or per-food queries.

Program-zone resolution is also bounded. Live requests select the latest immutable revision by
sequence with `LIMIT 1`; explicit historical requests select the highest sequence whose projected
causal local date is on or before the requested end, also with `LIMIT 1`. Both lookups are scoped to
the authoritative owned program. A present program with a missing or inconsistent latest projection
fails closed; an end before the valid program history retains the request-zone or UTC fallback.

Complete, partial, and unknown nutrition days all contribute their recorded snapshots. The response
preserves those day states so partial or unknown evidence is never presented as complete.

## Algebra and provenance

- Observed calories, protein, carbohydrate, and fat are sums of stored meal-item snapshots.
- Observed protein density is `100 * observed protein / observed calories` when calories are
  positive; otherwise it is unavailable, not zero.
- Current-definition protein density uses the current serving calories and protein.
- Current-definition calorie density uses current serving grams. Historical calorie density exists
  only when every selected occurrence was explicitly logged in grams; current serving grams never
  backfill historical mass.
- A food row's calorie share uses active linked-food calories as its denominator. The summary linked
  share uses all meal-item calories. The API and UI label these denominators separately.
- Active linked, unlinked, inactive-linked, and unresolved item buckets reconcile to all selected
  meal-item calories and occurrences. Foreign identifiers are never exposed.
- Food merge relinks only meal items reached through the authenticated user's nutrition logs. A
  malformed cross-user food reference is preserved for repair rather than mutated across owners.

Portion summaries use the display quantity and unit only when both were saved; otherwise they use
the required amount and unit. Pulse normalizes lexical aliases such as `gram`, `grams`, and `g` but
does not convert dimensions or infer serving weights. A median is available only when every selected
portion has one compatible normalized unit.

## Definition review

Review reasons are deterministic and neutral: unverified, source missing, serving grams missing,
macro-calorie mismatch, and no linked usage in the selected range. Macro-calorie mismatch compares
stated calories with `4 * protein + 4 * carbohydrate + 9 * fat` and flags only a difference greater
than `max(10 kcal, 5% of stated calories)`. This is a library-maintenance heuristic, not a health or
food-quality score. The exact boundary is not flagged.

Pulse does not invent a stale-definition reason because the current data model has no immutable food
definition revision ledger or reviewed-at timestamp. Editing a definition changes future defaults;
historical meal snapshots remain unchanged.

## API and UI contract

`GET /api/v1/foods/analytics` owns range selection, summary algebra, filtering, sorting, facets, and
pagination. Its summary is independent of filters and pages. Every server sort uses null-last rules
where applicable and ends with case-insensitive name, brand, and food-ID tie breakers.

`GET /api/v1/foods/:id/analytics` returns bounded recent occurrences in local-date, item-created-time,
and item-ID order. JWT and AgentToken callers receive identical factual `data` payloads for the same
user and query.

The Food Library workspace labels observed history and current definitions separately, exposes exact
facts without hover-only evidence, allows direct repair of every flagged definition field, and links
an occurrence to its exact nutrition-log date and meal. Mobile uses cards; desktop uses a table with
server-owned sort state. Null density and incompatible portions use explicit unavailable copy rather
than fabricated zeroes. Detail evidence includes definition update time, observed portion and gram
density facts, and every snapshotted macro. Loading, retry, empty-library, filtered-empty, and
background-refresh states never expose stale detail actions.
