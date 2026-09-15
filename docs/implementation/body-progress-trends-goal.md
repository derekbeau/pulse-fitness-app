# Body Progress trends and recomp signals — Goal-Mode implementation contract

**Issue:** #122 — Add explainable body-progress trends and recomp signals  
**Status:** frozen source-ground handoff; documentation-only preparation before implementation  
**Deployment hold:** Body Progress must not deploy until this milestone, its tests, real-browser acceptance, and the whole feature gate are ready.  
**Scope boundary:** implement analytics only. Do not implement photos (#123/#125), redesign the existing check-in UX (#124), deploy, backfill, mutate production data, or change nutrition/workout/goal state.

## Exact execution context

- Repository: `/Users/meridian/Projects/pulse-fitness-app`
- Approved base: `main` / `origin/main` at `5989eddf41ef5a0d4f890cf24ecf772e4c169972` (`feat(web): add complete Body Progress UI`, dependent work verified merged)
- Intended isolated worktree: `/Users/meridian/Projects/pulse-body-progress-trends`
- Intended branch: `feat/body-progress-trends`
- Preparation commit: the docs-only commit containing this file on the branch above
- Runtime intent: primary GPT-5.6 Sol, medium, Fast OFF; bounded internal review GPT-5.6 Luna, medium, Fast OFF. Runtime settings are not product acceptance gates.
- Before editing: verify actual `cwd`, branch, full `HEAD`, clean status, and that the approved base is exact. Preserve unrelated untracked files in the main worktree; do not copy or delete them.

Fail before source edits if the branch/worktree/base identity differs, the base is dirty in this lane, or a prerequisite contract is absent or contradictory. Do not repair ambiguity by inventing a medical threshold or a second domain algorithm.

## User outcome

An authenticated user can open the existing Body Progress workspace and understand whether available measurement history, Product Trend Weight, and optionally available server-owned performance evidence are moving consistently with the selected goal. The result exposes raw facts, compatibility, quality, confidence, limitations, and dated provenance. It presents explainable probabilistic signals, never a body-fat or muscle-mass estimate.

## Authoritative sources and required reading

Read the live source, not only this handoff or old UI receipts:

- Issue #120 parent and issue #121 measurement contract; issue #124 implementation and current UI are dependencies, not templates to extend blindly.
- `packages/shared/src/schemas/body-check-ins.ts`, `packages/shared/src/utils/body-reading-quality.ts`, and the body-check-in DB/schema/store/routes/tests.
- `apps/api/src/routes/body-check-ins/store.ts` and route registration, including immutable version/history and correction semantics.
- `apps/api/src/routes/body-measurements/store.ts` and schema, treating scalar legacy data as a separate provenance class.
- `apps/api/src/routes/weight/trend-store.ts`, `packages/shared/src/utils/ewma.ts`, `docs/specs/trend-weight-v1.md`, and Trend Weight tests.
- `apps/api/src/routes/workout-progression/muscle-store.ts` and the existing workout-progression schemas/routes/tests. Consume its server-owned evidence; do not create a progression engine.
- `apps/api/src/routes/v1/context.ts` and agent context store/tests; add only a bounded summary if the existing context integration has a real owner.
- `apps/web/src/features/body-progress/api/body-progress.ts`, `apps/web/src/features/body-progress/`, `apps/web/src/pages/body-progress.tsx`, and `apps/web/e2e/body-progress.spec.ts`.
- `apps/web/src/components/charts/` (especially range, markers, exact-value table, state, tooltip, and date primitives) and current Trend Weight workspace/tests. Reuse the merged chart/range contract.
- `docs/specs/user-time-zone-v1.md` and the existing date-authority helpers.

### Targeted source inventory before code

Record exact file paths and symbols in the implementation report after inspection. At minimum inventory:

| Boundary | Existing owner to inspect | Rule for #122 |
|---|---|---|
| Circumference facts | body-check-in store/schema/history and legacy body-measurement store | Use canonical values plus source date, site, laterality, protocol version, entry unit, quality, correction status. Never convert legacy unknown provenance into replicated data. |
| Reading quality | `calculateCanonicalBodyReading` and frozen #121 quality enum | Preserve `single_reading`, `needs_third_reading`, `replicated`, `replicated_with_tiebreaker`, and `high_variance`. Do not reclassify or silently mix rules. |
| Protocol compatibility | body protocol identifiers and site/laterality definitions | Same site, laterality, and exact protocol version are required for a directional segment. A protocol change starts a new segment. |
| Product weight | `getTrendWeightAnalytics` and Trend Weight v1 | Consume server facts, state, dates, pace, provenance, and fingerprint. Never recompute EWMA, pace, deltas, or adaptive model trend in UI/analytics. |
| Performance evidence | server-owned workout progression/muscle analytics contract | Consume only the existing contract. If unavailable, return explicit `unavailable`; absence lowers confidence but does not erase circumference/weight facts. |
| Time/range | user time-zone authority and shared chart/date/range code | Live requests fail closed when authority is unresolved. Historical `end` is an explicit local date and excludes later observations. |
| Existing UI | Body Progress page/API/query keys and chart primitives | Add the analytics workspace without replacing setup/check-in/history semantics or adding another range/chart algorithm. |
| Context | bounded `/api/v1/context/` response and agent context tests | Add a compact source-linked summary only; never inject full point arrays or silently mutate anything. |

## Fixed product and safety decisions

### Interpretation honesty

- Signals are evidence summaries, not diagnoses or composition measurements.
- Never render or return “gained X lb of muscle,” “lost X lb of fat,” an exact body-fat percentage, fat mass, lean mass, or causal certainty.
- The response must state limitations and source facts even when prose is favorable.
- The product noise floors are interpretation floors, not clinical thresholds: waist `2.0 cm`; chest/hips/arm/thigh `1.0 cm`. Version and return these constants. A fitted change below the relevant floor is `stable_within_measurement_noise`, not exactly zero.
- Do not mix protocol versions, sites, laterality, or legacy scalar records into one trend. Legacy values remain visible as `legacy_unknown`/unsupported provenance unless the source contract proves compatibility; never label them replicated.
- High-variance measurements remain in history. They cannot independently support a directional conclusion unless the response explicitly downgrades confidence according to the frozen policy; do not silently discard or pretend they are normal-quality.
- Do not invent clinical cutoffs, health-risk thresholds, recommended body-fat ranges, or a “safe” rate. If a consequential interpretation cannot be derived from the product contract, return an explicit unsupported/insufficient state and explain what additional product fact is needed.

### Evidence gates

For a site direction:

1. At least three **completed, compatible** check-ins.
2. At least 28 elapsed calendar days from the first to last supported point.
3. Same site, laterality, and protocol version across the segment.
4. No high-variance point in the calculation window unless the frozen response explicitly downgrades confidence and preserves the reason.
5. Latest supported check-in is no older than one configured cadence interval plus seven days.
6. Points less than 10 days apart remain in history but cannot independently satisfy the elapsed-evidence gate.

Two compatible points may expose an exact raw delta with dates, values, units, quality, protocol, and correction status. They do not establish a directional trend. Do not interpolate missing days.

Direction uses dated ordinary least-squares regression over compatible canonical values in the selected evidence window. Fitted total change is the slope multiplied by elapsed days between first and last supported dates. `up`/`down` requires fitted total change to exceed the site noise floor; otherwise use `stable_within_measurement_noise`. A protocol change begins a new segment.

Freshness is evaluated server-side using the configured cadence and the same authoritative date/time rules as the check-in domain. If cadence is not available, do not invent a fallback cadence: return freshness as unresolved/insufficient and report the dependency.

### Weight and adaptive semantics

Use Product Trend Weight v1 exactly as returned by its server contract. Preserve `no_data`, `scale_only`, `developing`, `sufficient`, and `stale`, its source dates, pace freshness, and provenance. Adaptive TDEE model trend and Goal Trajectory facts remain separate and explicitly labeled; they are not Product Trend Weight and must not be substituted.

### Signal policy

The server returns a strict enum:

- `insufficient_data`
- `favorable_gain_signal`
- `possible_recomp_signal`
- `possible_fat_gain_signal`
- `favorable_loss_signal`
- `maintenance_signal`
- `mixed_signal`
- `stale`

Global gates take precedence: fewer than three compatible check-ins, less than 28 elapsed days, or missing required evidence yields `insufficient_data`; a freshness failure yields `stale` when no supported current interpretation remains. Missing waist, missing goal, unavailable strength evidence, incompatible protocol, high variance, and contradictory facts must be represented structurally and in confidence/limitations, not hidden by prose.

- **Gain:** favorable only when Product Trend Weight is up, waist is stable within noise, and a muscular site is up or strength evidence is improving, with no supported contradictory waist-up signal. Weight up + waist up is `possible_fat_gain_signal`; improvements elsewhere do not erase the caution. Conflicting or absent support is `mixed_signal`.
- **Recomp or unset:** `possible_recomp_signal` only when Product Trend Weight is stable or down, waist is stable/down, and muscular circumference or server-owned strength evidence is improving. Otherwise `mixed_signal`.
- **Loss:** `favorable_loss_signal` when Product Trend Weight and waist are down while strength is stable/improving or explicitly unavailable without contrary evidence. Conflicting evidence is `mixed_signal`.
- **Maintenance:** use the existing goal corridor, not a new maintenance band. `maintenance_signal` requires Product Trend Weight inside that corridor and circumference sites stable within noise.

Reason codes, supporting facts, contradictory facts, unavailable inputs, confidence, headline, detail, limitations, and next action are server-owned structured fields. UI renders them and does not infer policy from prose or recreate calculations.

### Corrections, deletion, and history

Analytics is current-facts based, not as-known-at-time or bitemporal. A correction or deletion inside the selected range recomputes all affected facts and the deterministic fingerprint. A historical `end` excludes observations after that local date, including future-dated observations. Preserve check-in correction markers and protocol-change markers. No signal mutates calories, training, goals, preferences, cadence, or history.

## Complete implementation surface

### Shared contract and policy

Add a strict shared schema, types, enums, reason codes, and algorithm/version constants for the analytics response. Put pure policy/calculation in one shared/server-owned path, with tests for regression, compatibility, noise floors, gates, stale/freshness, high variance, legacy provenance, missing inputs, contradictions, and deterministic fingerprints. Do not duplicate formulas in React.

Likely paths (confirm against live source before editing):

- `packages/shared/src/schemas/body-progress-analytics.ts`
- `packages/shared/src/utils/body-progress-policy.ts`
- shared exports and focused tests
- `docs/specs/body-progress-analytics-v1.md`

The contract must include selected range and as-of date, algorithm version, constants, goal context, Product Trend Weight summary/provenance, readiness/freshness/quality, per-site points and segments, raw deltas, fitted direction, noise floor, strength evidence state, signal, reason/supporting/contradictory/unavailable facts, user-facing copy, dated markers, and stable fingerprint over visible facts.

### API and integration

Add the server-authoritative endpoint:

`GET /api/v1/body-check-ins/analytics?range=1m|3m|6m|1y|all&end=YYYY-MM-DD&timeZone=...`

Live requests omit `end` and use the existing date authority; unresolved authority fails closed with `TIME_ZONE_REQUIRED`, and browser zones cannot override it. Historical requests use explicit local `end` and exclude observations after it. Enforce authenticated user scoping and no cross-user leakage.

Likely boundaries:

- `apps/api/src/routes/body-check-ins/analytics-store.ts`
- analytics route registration beside body check-in routes
- Trend Weight adapter
- server-owned progression-evidence adapter
- bounded context summary in the existing context owner, if source inspection confirms its integration point
- OpenAPI and integration tests

Do not add a migration unless source inspection proves persistence is required for this response; current analytics should derive from authoritative history. Do not backfill or mutate existing records.

### Existing Body Progress UI integration

Extend the already-merged Body Progress workspace with:

- goal context and latest Product Trend Weight/recent pace linked to the existing `/weight` facts;
- latest compatible waist and enabled muscular-site facts;
- readiness/quality state;
- the existing `1M`, `3M`, `6M`, `1Y`, `All` shared range contract;
- per-site raw points and supported direction;
- exact-value table matching chart values;
- signal card with headline, evidence, limitations, and next useful action;
- dated check-in, correction, goal-revision, and protocol markers.

Use existing query, loading/error/empty/stale, chart, marker, tooltip, and exact-table primitives. Preserve check-in setup, guided entry, correction, delete, history, legacy display, and route behavior. Do not create a second range selector, chart math, weight engine, progression engine, or photos/media surface.

### Agent/context integration

If the live context contract has an established bounded body destination, add a compact summary containing current signal/state, confidence, key supporting/contradictory facts, unavailable inputs, and source dates. Never include full point arrays. Agent hints may recommend maintain course, gather another check-in, review surplus, or review training progression; they may not mutate data or accept adaptive calorie changes.

## Acceptance matrix

The implementing agent must map each row to literal tests and source/browser evidence against the final committed head.

| Acceptance | Required evidence |
|---|---|
| Exact compatible raw deltas | API/schema test proves dates, canonical source values, units, protocol, quality, correction status, and no fabricated repeats. |
| Three-check-in/28-day gate | Pure/store/API tests prove direction is unavailable before both gates; two points may expose raw delta only. |
| Ten-day spacing | Test proves close entries remain history but cannot independently satisfy trend readiness. |
| Protocol/site/laterality compatibility | Tests prove incompatible points segment or become unavailable; no mixed protocol result. |
| Quality and high variance | Tests prove all quality states preserve source truth; high variance downgrades or blocks per frozen policy without deletion. |
| Noise floors | Constants are versioned, returned, explained, and tested for waist 2.0 cm and other sites 1.0 cm; below-floor changes are stable-within-noise. |
| OLS direction | Pure tests prove dated regression, fitted total change, no interpolation, and thresholded up/down/stable results. |
| Product Trend Weight | Adapter tests bind to existing server facts and fingerprint; no duplicate EWMA/rate math; Adaptive model trend remains separate. |
| Strength evidence | Adapter tests consume existing server-owned progression facts or return explicit `unavailable`; no ad hoc direction. |
| All signal states | Deterministic tests cover every enum, missing goal/waist, absent strength, contradiction, stale, and insufficient paths. |
| Honest language | Schema/UI tests reject or snapshot-check prohibited exact fat/muscle claims, diagnosis, and false certainty; limitations are present. |
| Historical end/timezone | Route tests prove explicit local `end`, future exclusion, authority precedence, browser-zone non-override, and `TIME_ZONE_REQUIRED`. |
| Corrections/deletes | Integration tests prove recomputation of visible facts and fingerprint after in-range correction/delete, with markers preserved. |
| User isolation | JWT and AgentToken tests prove owner scoping and no cross-user existence/fingerprint leakage. |
| Stable fingerprint | Identical visible facts yield identical fingerprint; any visible source, state, goal, marker, explanation, or quality change changes it. |
| Shared chart/range | UI tests/source inspection prove all supported ranges use the existing shared contract; chart, tooltip, markers, and exact table agree. |
| Responsive/accessibility | Real browser acceptance at 320, 390, 430, 768, and 1280 px proves no overflow, keyboard/focus labels, readable exact facts, loading/error/empty/stale states, console/network cleanliness. |
| Existing feature regressions | Body setup/check-in/history, legacy unknown provenance, Trend Weight, Adaptive TDEE, workout history/progression, navigation, and context tests remain green. |
| No side effects | Tests/report confirm no nutrition/workout/goal/preference mutation, production access, deployment, backfill, photos, or external account action. |

Required repository gates are the strongest applicable focused tests during implementation, then one final risk-relevant uncached matrix: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, focused shared/API/UI tests, and relevant Playwright/browser acceptance. Do not claim a browser gate from generated fixtures or a screenshot alone; retain source bindings, populated fixtures, console/network logs, mutation/readback evidence where applicable, and exact command results.

## Explicit non-goals

- Exact body-fat, fat-mass, or lean-mass estimation.
- Photo analysis, upload, storage, capture, comparison, or media UI (#123/#125).
- Replacing or extending measurement setup/check-in/history ownership of #124.
- Clinical diagnosis or medical advice.
- A second Product Trend Weight, Adaptive TDEE, chart/range, or workout progression algorithm.
- Automatic calorie, workout, goal, cadence, or preference changes.
- Cross-user comparisons, rankings, sharing, exports, or public URLs.
- Production deployment, production DB/env access, migration backfill, or Foundry updates.

## Coding-agent completion contract

Read this contract and the live sources first, write a bounded plan, implement complete in-scope behavior, add critical pure/integration/UI tests, self-review the actual diff, and run one bounded independent acceptance pass. Fix in-scope findings in one consolidated bundle; rerun affected checks after repairs. Do not merge. Commit a Conventional Commit and push/open a draft PR only because the launch assignment explicitly authorizes it. Finish with clean status at the exact reported commit.

Return:

- `COMPLETE` or `BLOCKED`;
- exact worktree, branch, base and final SHA;
- changed files and requirements-to-evidence map;
- raw command results, browser screenshots/readbacks, console/network status, and source bindings;
- all unresolved blockers, with no invented health policy;
- explicit prohibited-actions confirmation;
- final `git status --porcelain`.

## Sources

[1] https://pmc.ncbi.nlm.nih.gov/articles/PMC10271771 — measurement error of waist circumference (background only; not a product threshold)  
[4] https://pmc.ncbi.nlm.nih.gov/articles/PMC8399582 — body-composition method limitations (background only; not a product estimator)
