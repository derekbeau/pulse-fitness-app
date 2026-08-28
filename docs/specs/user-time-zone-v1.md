# User time-zone authority v1

Pulse treats the user's local calendar day as a server-owned fact. Current-day features must not
derive that day from the API host, UTC, or the browser after an authority has been established.

## Persistence and precedence

1. Registration requires a valid IANA time zone and persists it in the user's typed preferences.
2. A user can correct that persisted time zone from Settings. Existing users without one remain
   explicitly unresolved until they save a valid value; Pulse does not pretend UTC is local time.
3. An effective Adaptive Nutrition program time zone overrides the persisted profile time zone.
4. Without a program, the persisted profile time zone is authoritative.

The resolved response includes the authoritative IANA `timeZone`, its `timeZoneSource`
(`adaptive_program` or `user_profile`), and the server-stamped `localDate`. When the authority is
unresolved, all three fields are `null` and current-day reads fail closed with
`TIME_ZONE_REQUIRED` where a date is mandatory.

## Consumer contract

Dashboard, Nutrition, habits, scheduled workouts, Agent context, and live weight analytics use the
same resolved authority. Browser zones can initialize the registration field, but cannot override
an established profile or program zone. Pages refetch the server authority at the next local-day
boundary and on foreground return. A failed initial authority read shows an error with retry rather
than a fabricated day; a failed refresh retains the last verified date with a stale disclosure and
disables date-based writes until recovery.

API requests that omit a calendar date resolve it from this authority as well. This includes the
Dashboard snapshot and trend endpoints, relative body-weight ranges, and the current accepted
nutrition target. They fail with `TIME_ZONE_REQUIRED` when the authority is unresolved; they never
substitute the API host's UTC date. Settings stamps new nutrition targets with the server-returned
local date, rather than the browser date.

Creating or changing an Adaptive program, or changing the profile time zone, invalidates every
current-day cache (Dashboard, Nutrition, habits, scheduled workouts, and weight). The next read is
therefore evaluated under the new authority without rewriting any stored historical date.

Historical nutrition and Trend Weight reads select the effective program revision for the requested
date, then fall back to the persisted profile time zone. Real timestamps remain instants; only
calendar-date interpretation follows this contract.
