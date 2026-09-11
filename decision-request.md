# Pulse #132 — resolved decision record

User approval: “Yeah it should only change that day.” Parent recommendation is resolved as follows:

1. **Partial updates — approved:** numeric fields replace that selected-day override; `null` restores that field to the selected-day baseline; omission preserves the existing override field. If no fields remain overridden, delete the row canonically. Explicit restore/delete is idempotent.
2. **Reason — approved:** optional trimmed text; omission preserves, `null` clears; whitespace-only rejects; maximum **2,000 Unicode code units after trim**, reusing the established nutrition editable-text bound. Unknown fields follow existing schema strictness.
3. **Adaptive interaction — approved:** override affects selected-day target displays, adherence, summary/history/week display only. Adaptive calorie calculations and review eligibility remain unchanged. Actual logged intake and weight continue through the normal adaptive model path. No expenditure, compensation, learning input, check-in, or target-event fabrication/mutation.
4. **Baseline — approved:** existing causal date resolution (effective date + recorded-at/sequence) wins; program revision supplies date/timezone context. Source labels do not override causal ordering. Historical responses are stable against later baseline edits; future edits cannot rewrite logged history.
5. **Future dates — approved:** use the existing nutrition date policy; allow only what it already allows, fail closed on unresolved date authority, and never let a future override affect another date or current/next-day targets. No new restriction invented.

The complete frozen contract is `docs/implementation/daily-nutrition-targets-goal.md`. This record does not authorize CodeX/UI/app-server launch, implementation, browser/app execution, production/env changes, deployment, merge, or a premature PR.
