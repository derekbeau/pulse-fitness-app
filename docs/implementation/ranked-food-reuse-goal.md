# Ranked food reuse: frozen implementation contract

## Status and execution context

**Frozen policy approved. This document authorizes the scoped executor launch below; source implementation remains owned by the assigned Codex executor.**

- Issue: [#138 Reduce food-logging web lookups with ranked reuse and ad-hoc promotion](https://github.com/derekbeau/pulse-fitness-app/issues/138)
- Repository/worktree: `/Users/meridian/Projects/pulse-food-reuse`
- Branch: `feat/ranked-food-reuse`
- Approved base: `origin/main` / `main` at `49bc640d03a4f9b4be6b1e8be7b500525aa64683`
- Primary launch target after gate: Astra, Extra High reasoning, Fast enabled only if the actual launcher readback shows it.
- Review/support target after gate: Luna, medium reasoning, Fast enabled only if the runtime exposes and confirms it. Never claim a Terra runtime is Luna.
- One fresh Pulse Goal Mode chat, one isolated worktree, one implementation editor. Use Codex built-in browser first.
- Issue #155 owns the heavy suite/browser slot. This executor may run focused source/tests during implementation, then must stop and wait for the parent to grant the serialized full-gate/browser slot.
- A draft PR and branch push are permitted after implementation and verification. No merge, deployment, production/canonical-data access, reconciliation/backfill, environment mutation, history repair, or changes to the #155 lane.

## Live issue and repository facts

Issue #138 was read from GitHub on 2026-09-07. It has no comments. Its scope is ranked, explainable saved-food reuse; deterministic candidates for intentionally promoting stable recurring ad-hoc entries; meal persistence semantics; provenance preservation; and removal of redundant summary-fetch guidance.

Existing implementation facts on the approved base:

1. `GET /api/v1/nutrition/logging-context` is authenticated through the shared JWT/AgentToken route surface and is database-only. Its schema currently returns `query`, current-day nutrition/summary, recent meal items, saved-food matches, frequent foods, shorthand expansions, and water state.
2. The existing matcher in `apps/api/src/routes/nutrition/store.ts` normalizes lower case and punctuation to space-separated alphanumeric tokens. It searches saved-food name, brand, serving size, and tags through hard-coded query expansion, then ranks by score, `usageCount`, and name. It does not have persisted aliases, token-order matching, a confidence category, ambiguity detection, or recent-item matching.
3. `foods` has name, brand, serving metadata, macros, fiber, sugar, verification, source, notes, tags, and owner-scoped usage fields. It has no alias field. `meal_items` preserves immutable per-item macro snapshots and a nullable `foodId`.
4. Agent meal transformation resolves a non-ad-hoc `foodName` by exact owned-food name only. If complete inline macros are supplied, it currently attempts auto-create before that exact lookup. The food auto-create payload currently retains only name, serving-size/unit, core macros, source, and notes; it drops fiber, sugar, serving grams, verified status, and tags.
5. Current `mealItemInputSchema` rejects `adhoc: true` with `saveToFoods: true`, but does not reject `adhoc: true` with non-null `foodId`. For ad-hoc input, the transform silently changes non-string `foodId` to `null`; a supplied string can survive to persistence. This must become explicit validation failure.
6. Existing meal persistence validates linked food ownership and persists snapshot macros in `meal_items`; current food-definition changes do not rewrite those snapshot columns. Food-usage count/recency is the companion #143 invariant and must not be changed by this issue.
7. Meal create responses currently return regular meal items only. Agent enrichment has no per-item persistence classification and always includes day-summary guidance, even when `returnSummary: true` has already embedded the daily summary.
8. The merged #143 contract defines food usage as the owner-scoped projection of linked meal-item rows and requires no foreign-user reads or writes. The #133 notes contract preserves meal counts, macro snapshots/totals, food counts/recency, and learned nutrition facts on note-only activity. Neither contract is editable here.

## Frozen non-ambiguous outcome

### Logging-context ranking

Extend the existing logging-context read model rather than creating a parallel endpoint or client-side matcher.

- Preserve current response fields and `{ data: ... }` envelope.
- Return deterministic ranked saved-food candidates with a machine-readable match reason, score/confidence representation, and enough exact evidence to explain the rank to an agent.
- Candidate sources must cover normalized name, brand, tags, explicit aliases/common shorthand, token-order and punctuation/possessive normalization, and recent owned meal-item names.
- Ranking is advisory. It must never silently bind a meal to a candidate merely because a fuzzy/alias/recent match ranked first. Existing explicit `foodId` remains an intentional link and exact owned-name resolution remains subject to the final ambiguity contract below.
- Tie-breaking must be deterministic and owner-local; no foreign foods or meal items may influence returned candidates, scores, aliases, recent evidence, or promotion candidates.
- Do not create a database migration solely to support aliases unless the executor proves a persisted alias model is required by the approved decision. A deterministic, documented built-in alias set is acceptable only after the gate resolves ownership/governance of aliases.

### Promotion candidates

Add `promotionCandidates` to logging context, based only on the authenticated user's unlinked (`foodId IS NULL`) historical meal-item snapshots.

- Window: the preceding 30 calendar days relative to the requested context date; do not include the selected date.
- Recurrence floor: the same final normalized identity occurring on at least **two distinct local nutrition-log dates**. Occurrences on one date never satisfy it.
- Return deterministic normalized and display name, occurrence count, distinct-day count, most recent date, recent serving/unit and macro snapshots, an explicit stability/evidence category, likely saved-food match when one exists, and a machine-readable reason. At minimum support `REPEATED_ADHOC`, `EXACT_SAVED_MATCH`, and `POSSIBLE_SAVED_MATCH`. Evidence must not be silently discarded when snapshots differ or cannot be compared losslessly: retain recurrence evidence and mark it review-only.
- Existing adequate saved-food matches take precedence over creating a duplicate. A candidate that has a match stays advisory and must not cause automatic relinking, duplicate creation, historical backfill, or a food-definition rewrite.
- Restaurant, travel, and variable composite/home-cooked dishes remain eligible to be logged as explicit ad hoc items. Their suitability for an intentional current promotion is an explicit agent decision based on the concrete entry and evidence, not a name-based heuristic or deny-list; recurrence alone never auto-promotes them.
- Promotion is an explicit current-write action. Historical unlinked entries remain untouched; no backfill or relink is permitted.

### Agent meal persistence

Apply the same semantics to the date-scoped create route, preferred create route, and append-items route wherever the current shared schema/middleware applies.

- Reject `adhoc: true` plus non-null `foodId` at schema validation with a stable validation error. Continue rejecting `adhoc: true` plus `saveToFoods: true`.
- Each AgentToken meal mutation response must clearly identify each submitted/persisted item as `reused`, `created`, or `adhoc`. JWT response compatibility must be preserved; do not add agent-only route forks.
- `adhoc` produces a null food link and requires complete inline core macros under the existing schema convention.
- `reused` links an owned saved food and writes that food's resolved per-serving values into the immutable meal-item macro snapshot.
- `created` is allowed only with complete inline core macros and only after the final saved-food matching decision has ruled out an adequate reusable definition. It must retain all supported submitted food provenance: brand, source, notes, fiber, sugar, serving grams, verification status, and tags. Do not invent fields that the food schema does not support.
- The saved-food library definition may later change, but historic meal-item calorie, protein, carbohydrate, fat, fiber, sugar, amount, and display snapshots must remain unchanged unless an existing explicit meal-item correction route changes that item. This issue must not mutate history to promote/reuse an item.
- `returnSummary: true` must suppress enrichment text/actions directing the caller to fetch or review the same daily summary again. With `returnSummary: false`, keep existing guidance unless a targeted contract change is required.

### Contracts, documentation, and verification

- Update shared Zod schemas/types, OpenAPI response contracts, `docs/agents/foods-api.md`, and `docs/conventions/agent-integration.md` to describe final inputs, outcome classification, ranking/promotion evidence, auth parity, and no-auto-relink rule.
- Preserve JWT session claims and AgentToken header semantics. Prove JWT/AgentToken parity where the route is shared and strict owner isolation for foods, recent items, candidate computation, writes, and response payloads.
- Preserve #143 food usage counts/recency and #133 note-only behavior; add tests that prove the #138 changes do not change their existing evidence/invariants.
- Use only temporary/isolated SQLite fixtures and fictional users. No production data, browser tab, or reconciliation command.

## Required implementation/test matrix

1. Exact normalization, punctuation, possessives, abbreviations/aliases, brand, tag, token-order, recent-name, deterministic ties, low-confidence, and materially ambiguous ranked candidates.
2. No automatic selection from fuzzy, alias, recent-item, or materially ambiguous candidates; explicit `foodId` ownership validation remains fail-closed.
3. Promotion window boundaries, two-distinct-day floor, deterministic display/macro snapshots, saved-match reasons, user isolation, and no foreign rows.
4. Stable exact examples; review-only macro/serving uncertainty examples that retain recurrence evidence; and restaurant/travel/composite examples proving explicit agent suitability decision rather than a heuristic deny-list.
5. Intentional current promotion/create with no historical backfill or relink; saved-match reuse before create.
6. `adhoc + foodId` rejection, `adhoc + saveToFoods` rejection, and reused/created/adhoc response classification across create and append surfaces.
7. Auto-create provenance preservation and full historical macro snapshot invariance before/after food-definition updates.
8. `returnSummary: true` returns summary data but omits redundant summary-fetch guidance.
9. JWT and AgentToken route behavior, authentic ownership isolation, generated OpenAPI/schema checks, and no #143 count/#133 note regressions.
10. Focused checks during implementation. After parent grants the full-gate/browser slot: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, plus built-in-browser/API/SQLite readbacks against an isolated fixture.

## Approved v1 policy decisions

The parent approved the following conservative v1 policy. These decisions remove the product-launch blocker; the executor must implement them literally and must not substitute unapproved numeric thresholds or heuristics.

1. **No fuzzy auto-binding.** Ranked candidates are advisory only. A bare `foodName` may resolve only to one unique exact normalized owned-food identity. Any fuzzy, alias, recent-item, tied, or otherwise ambiguous candidate must fail closed to unresolved/explicit ad hoc handling; never silently bind it.
2. **Evidence categories, not numeric confidence.** Expose categorical evidence such as `exact_normalized`, `alias_exact`, `brand_or_tag`, `token_order`, and `recent_name`, plus explicit ambiguity where applicable. Search ranking values are not calibrated confidence and must not be surfaced or used as an auto-binding threshold.
3. **Stable recurrence is exact and lossless.** A recurrence candidate is stable only when qualifying snapshots have identical complete core macros and a losslessly matching serving identity, including amount/unit identity. Any difference or uncertainty is review-only, not promotable automatically. It must still retain and return its recurrence evidence rather than silently dropping the candidate or its occurrences.
4. **Restaurant/composite suitability is explicit.** Do not use a restaurant/travel/hotel/homemade/composite name heuristic or deny-list to approve or exclude promotion. The agent makes an explicit current-write suitability decision; explicit ad hoc logging remains available and must be preserved.
5. **Aliases are small, reviewed, versioned, and advisory.** Use only server-owned code aliases/constants with literal tests and documented versioning. There is no user-managed alias schema, migration, endpoint, or UI in v1. Alias evidence never authorizes auto-binding.
6. **Adequate reusable saved-food match is narrow and fail-closed.** It requires a unique exact normalized owned-food identity and, when the input supplies a brand, an exact normalized brand match. Any identity or brand ambiguity fails closed; preserve the caller's explicit ad hoc choice. Non-exact candidates are never automatically adequate.
7. **No automatic promotion or history mutation.** No candidate, including stable recurrence or exact saved match, may auto-promote, auto-create, historically relink, backfill, or rewrite a prior meal-item snapshot. Promotion/create is only an explicit current write under the shared persistence rules.

## Executor operating boundaries

Before typing anything into Codex, verify a fresh empty Pulse NEW composer in the same fresh snapshot that shows: Pulse project identity, new-chat state, full prompt, Send control, actual selected model/reasoning, and Fast state if supported. Do not reuse stale AX selectors/coordinates, wander among threads, use Sites/browser ChatGPT/Foundry, or type into a pre-existing chat. If that exact state cannot be verified, stop and report the concrete UI blocker before typing.

The launcher must point Codex at this contract, require reading `AGENTS.md` and issue #138, and require it to record literal preflight (actual worktree, branch, and HEAD SHA), approved-policy implementation, focused evidence, Luna review findings/dispositions, commit/push/draft-PR state, and the required wait for the parent full-gate slot. Do not claim the primary/reviewer model or Fast state without launcher readback.

## Prohibited actions

No source implementation from this preparation lane; no #155 edits; no heavy suite/browser use; no merge, deployment, environment mutation, production/canonical-data access, production reconciliation/backfill, history repair, or automatic historical linking. The executor may use focused isolated checks only and must wait for explicit parent approval before the serialized full gate/browser verification.
