# Pulse #132 — daily nutrition target overrides

## Frozen contract / execution boundary

**Frozen docs-only handoff.** This authorizes preparation only, not implementation or launch. Do not use CodeX UI/app-server, edit source/UI/server code, run the app/browser, access live or canonical databases, change production/env/config, deploy, merge, or open a premature PR. The parent owns implementation launch, review, final gates, and PR/merge decisions.

- Repository: `/Users/meridian/Projects/pulse-daily-nutrition-targets`
- Upstream: `https://github.com/derekbeau/pulse-fitness-app.git`
- Base and `main`: `d4210730bfe45be9f0b3e8fe8f735ad9b214cbfe`
- Branch: `feat/daily-nutrition-targets`
- Primary: GPT-5.6 Sol, medium, Fast OFF
- Review/support: GPT-5.6 Luna, medium, Fast OFF
- One implementation editor in this isolated worktree after separate parent authorization.

Fail closed before implementation if branch, repository, base SHA, or docs-only state differs from this contract.

## User outcome

Issue #132 adds a date-scoped override for any subset of calories, protein, carbs, and fat. It changes only the selected calendar date's target presentation and adherence comparison; it does not change the ongoing target timeline or adaptive model state. The selected date must show provenance, baseline-versus-override values, optional reason, and an adjusted indicator.

## Source inventory (targeted; no rescan ritual)

- `docs/specs/user-time-zone-v1.md`: effective Adaptive program zone > persisted profile zone; unresolved authority fails closed with `TIME_ZONE_REQUIRED`; browser zone cannot override; historical reads use the effective program revision for the requested date, then profile fallback.
- `docs/specs/adaptive-tdee-v1.md`: immutable target events, causal historical selection, accepted expenditure separate from target mutation, no fabricated/backfilled facts, and review/energy-balance rules.
- `docs/specs/protein-floor-v1.md`: existing protein-floor behavior remains authoritative.
- `apps/api/src/db/schema/nutrition-targets.ts`, `packages/shared/src/schemas/nutrition-targets.ts`, `apps/api/src/db/migrate.ts`: persistence, immutable target events, and existing finite/nonnegative bounds (calories max 10,000; macros max 1,000).
- `apps/api/src/routes/nutrition/store.ts`, `daily-energy-store.ts`, `apps/api/src/routes/adaptive-nutrition/{store,review-store,analytics-store,goal-trajectory-store}.ts`, `apps/api/src/routes/agent/context-store.ts`: target/adherence/adaptive consumers to inspect and centralize through one resolver.
- `apps/api/src/routes/nutrition/index.ts`, `apps/web/src/pages/nutrition.tsx`, nutrition API/query keys, `nutrition-week-strip.tsx`, `daily-energy-adherence-card.tsx`, `query-invalidation.ts`, `use-date-authority.ts`: existing authenticated API and selected-date/week-strip UI surfaces.

## Explicit product decisions (frozen)

1. **Partial update semantics:** each field accepts a finite nonnegative number, `null`, or omission. `null` means inherit the selected date's baseline for that field; omission preserves the existing override field on update. When no fields remain overridden, delete the override row canonically (do not persist an empty override). Restore/delete is idempotent and date-scoped.
2. **Reason:** optional trimmed text; omission preserves the existing reason, explicit `null` clears it. Reuse the established editable-text bound of **2,000 Unicode code units after trim** (the same bound used by existing nutrition notes/food notes). Reject whitespace-only text and unknown fields according to existing schema conventions. Do not invent another reason limit.
3. **Adaptive interaction:** the resolved override is used only for the selected date's target displays, daily summary/adherence comparison, week/history display, and other consumers proven to display target facts for that selected date. Adaptive calorie calculations, review eligibility, learning inputs, accepted expenditure, check-in snapshots, target events, and compensation/catch-up logic are unchanged. **Actual logged intake and weight remain available to and modeled normally by existing adaptive calculations; the override must not exclude them, fabricate expenditure, or fabricate compensation.**
4. **Baseline precedence:** resolve the baseline using the existing causal date resolution (effective date, recorded-at, and sequence rules). The effective Adaptive program revision controls program/date context; an `adaptive` source label does not beat a causally newer/manual event merely by label. A later baseline edit cannot rewrite a historical resolved response; future edits cannot leak backward.
5. **Future dates:** follow the existing nutrition date policy. Valid future-date overrides are allowed only where that policy allows writes, remain confined to that date, and never change current/next-day targets or completeness. Unresolved date authority fails closed; do not invent a new future-date restriction.

## Non-negotiable invariants

- One user/date override; all reads and writes are owner-scoped. JWT/Bearer and AgentToken use identical schemas and behavior.
- Date is literal `YYYY-MM-DD`, resolved by program timezone then profile fallback. Browser timezone never overrides. Historical reads use the causally effective program revision for that date. Authority changes do not rewrite prior dates.
- Partial resolution distinguishes baseline values, override values, effective values, source/provenance, and reason. Missing baseline remains missing; never write zero or manufacture a complete target.
- The override is not a target event, accepted recommendation, check-in, learning input, review decision, expenditure fact, or compensation instruction. No historical target-event rewrite, permanent target revision, adaptive-state mutation, or future leak.
- Preserve existing numeric bounds and finite/nonnegative rules. Do not add macro-calorie consistency validation unless an already-authoritative contract requires it.
- Invalidate only selected-date detail/summary/adherence, week-strip/history, and demonstrably dependent target consumers. Never cross-date cache leak; do not invalidate adaptive consumers unless source inspection proves they consume resolved daily targets.

## Implementation shape after parent authorization

- Add a dedicated user/date override model/migration only if inspection proves no existing representation is safe; never edit immutable target events or backfill live/history data.
- Use one shared schema, authenticated `/api/v1/*` route following exact nutrition conventions, `{ data: ... }` envelopes, and one server-side resolver consumed by selected-date target/adherence/history consumers. Do not duplicate formulas in UI.
- Cover create/update/delete/restore, null/omitted semantics, reason limit, ownership/auth parity, causal historical baseline, timezone boundaries, future-policy behavior, cache keys, and adaptive non-interference. Use fictional users and isolated temporary SQLite only.
- After implementation authorization, run focused checks during work, then one final uncached risk-relevant gate and one built-in-browser pass at 375px and desktop with keyboard, selected historical/future boundaries, create/edit/restore/delete, reload/readback, raw console/network capture, and clean pinned source/config/fixture binding. No repeated evidence cycles.

## Out of scope / forbidden

No CodeX UI/app-server launch from this docs lane; no source implementation, production/env/config change, live/canonical DB access, deployment, merge, premature PR, external account mutation, or invented restrictions. Parent handles authorization and any new product ambiguity as one consolidated request.
