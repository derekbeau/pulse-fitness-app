# #182 Calendar read example

For an existing owned AgentToken, read a bounded local date range. The API derives the subject from the token; do not send a subject or actor field.

```http
GET /api/v1/calendar?from=2026-03-08&to=2026-03-14&domain=activity&domain=workout
Authorization: AgentToken <token>
```

`domain` and `state` may repeat. This is a read only; it does not materialize recurrence, reschedule an assignment, approve a proposal, or create nutrition evidence. A target-only nutrition row has a stable `nutrition-day:YYYY-MM-DD` read identity, `actual: null`, and no `sourceReference`. Resolve a source link only when a persisted canonical record exists. An Activity assignment and its later execution are separate records, even when linked. `GET /api/v1/context` and `/context/feedback` are unchanged.
