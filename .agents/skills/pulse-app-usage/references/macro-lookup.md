# Macro Lookup (Pulse)

Use this when a requested food is not already in the user's Pulse food database.

## Source priority

1. User-provided nutrition label photo
2. Official manufacturer nutrition page
3. USDA FoodData Central (whole foods)
4. Reliable nutrition aggregators
5. Estimate from similar verified foods

## Workflow

1. Identify food variant: brand, flavor, cooked/raw state, and serving unit.
2. Search existing foods first (`GET /api/v1/foods/?q=<term>`) to avoid duplicates.
3. Prefer reusing an existing food when materially equivalent.
4. Capture source macros and normalize to one clear serving.
5. Scale macros proportionally for consumed amount.
6. Create food via `POST /api/v1/foods/` with `source` field indicating provenance.

## Confidence rules

- Use `source: "USDA"` or `source: "label"` for verified values.
- If sources differ by more than about 20 percent on calories or protein, treat as low confidence.
- For low confidence values, use `source: "estimated"` and add uncertainty in `notes`.

## Notes for ambiguous meals

- If portions are unclear, state assumptions explicitly.
- For restaurant or mixed dishes, provide conservative estimates and ask one follow-up clarification when needed.
