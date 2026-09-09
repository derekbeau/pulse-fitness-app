# Pulse #152 internal review

- Model: `gpt-5.6-luna`
- Reasoning effort: `medium`
- Mode: read-only
- Review scope: uncommitted #152 implementation against `AGENTS.md` and the frozen goal
- Review command exit: 0

## Findings and disposition

1. High: malformed current-template reps could throw while normalizing legacy data. Fixed by retaining invalid raw rep values for the inspector, which now emits an integrity warning; regression added.
2. Medium: an exercise swap was categorized as quiet customization. Fixed by categorizing unmatched exercise identity as an integrity warning; regression added.
3. Medium: the new browser test itself did not exercise scheduled start. No product change: required start coverage already exists in the focused detail and scheduled-start surface suites, including stale rejection and explicit force retry in both routes. Those suites are included in the retained focused receipt.
