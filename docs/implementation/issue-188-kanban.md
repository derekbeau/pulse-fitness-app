# Issue #188 implementation contract

## Outcome and frozen decisions

Expand the existing versioned Body Progress check-in domain without reinterpreting historical facts.

- Bilateral sites: `upper_arm_midpoint_flexed`, `thigh_midpoint`, new `calf_maximum_relaxed`, and new `forearm_maximum_relaxed`. Preferences offer Left / Right / Both; Both is represented as two independent `(site,laterality)` entries and measurements.
- Non-lateral sites: new `neck_below_larynx_relaxed` and `shoulder_girth_deltoid`. Existing `hips_maximum` remains the sole hips/glutes series and is labeled “Hips / glutes (maximum buttocks circumference).”
- Existing defaults and saved preferences remain unchanged. New sites are opt-in. The maximum enabled measurement-pair count is 13 (three existing non-lateral + eight entries across four bilateral sites + two new non-lateral).
- Existing site protocol identifiers, frozen measurement rows, version snapshots, labels, instructions, source URLs, and `body-circumference-v1` provenance stay readable and immutable. New-site protocols use `body-circumference-v2`; protocol compatibility remains exact-version based.
- New-site product bounds, chosen as plausibility/data-entry guards rather than clinical reference ranges: calf 15–80 cm, forearm 10–60 cm, neck 20–80 cm, shoulder girth 50–200 cm. Existing-site 20–300 cm compatibility remains unchanged.
- New sites receive raw protocol-bound trend series but no directional classification/noise floor or recomp “muscular support” interpretation. Their analytics state is explicitly unsupported until a separately approved interpretation policy exists.
- Paired comparison is derived only from left/right canonical values in the same check-in with identical site and protocol version. Missing side is unavailable. Any high-variance side marks the comparison unreliable. No thresholds or diagnostic language.

## Source-checked product protocols

These are repeatability-oriented Pulse product protocols, not medical standards.

- Calf: selected side, standing upright with feet about shoulder-width and weight distributed consistently; leg relaxed; find and mark the maximum calf circumference; tape horizontal and snug without skin compression. Sources: WHO physical-status/anthropometry tradition and the published maximum-calf protocol comparison (https://pdfs.semanticscholar.org/6488/d2bae5225cf0b4547ca49a13440d9ac4f4fb.pdf).
- Forearm: selected side relaxed at the side with palm facing forward; measure the maximum forearm circumference below the elbow; tape perpendicular to the forearm’s long axis, snug without compression. Source/landmark context: U.S. Army Anthropometry Handbook (https://apps.dtic.mil/sti/tr/pdf/ADA170298.pdf). This exact self-measurement wording is a Pulse repeatability protocol.
- Neck: stand upright, head in the Frankfort/horizontal gaze position, shoulders relaxed; place tape just below the laryngeal prominence, perpendicular to the neck axis; look forward and do not tense the neck. Source/landmark context: U.S. Army Anthropometry Handbook (https://apps.dtic.mil/sti/tr/pdf/ADA170298.pdf). This is a Pulse product protocol and does not inherit legacy scalar-neck provenance.
- Shoulder girth: stand upright with arms relaxed at sides after tape placement; tape encircles both deltoids, upper chest, and upper back at the maximum shoulder/deltoid circumference, level and snug; record after a normal exhalation. Self-measurement is difficult, so use a mirror and ask another person for help when needed. Source context: ISAK-oriented anthropometry descriptions distinguish shoulder girth from biacromial width (https://www.researchgate.net/publication/333585249_Standards_for_Anthropometry_Assessment); the exact repeatability wording is Pulse’s product protocol.

Every protocol ships with a static landmark diagram, short CSS motion cue, and equivalent text. General cues require consistent conditions, horizontal/perpendicular tape as specified, snug tension without compression, and repeatable posture/relaxation.

## Acceptance map

1. Shared/API persistence: strict site/laterality enum, pair uniqueness, all-13 capacity, site-specific bounds, both auth modes, OpenAPI, immutable raw/canonical/quality/version history, populated predecessor migration preserving existing rows.
2. Preferences and entry: old defaults unchanged; Left / Right / Both survives save/reload; Both renders and persists two independently editable measurements; disabling/changing sides does not alter history.
3. History/comparison: all sites render exact values and correction/delete flows; separate side series; same-check-in exact-protocol pair differences with units; missing/high-variance limitations and non-diagnostic copy.
4. Analytics: new raw segments cannot crash parsing/charts; new sites are visibly unsupported for direction/recomp until approved; existing analytics outputs regress unchanged.
5. UX/media: hips/glutes wording reuses `hips_maximum`; all new protocol guidance/media and accessible labels work without overflow on populated mobile and desktop fixtures.

## Verification commands

Focused while editing:

- `pnpm --filter @pulse/shared test -- body-check-ins.test.ts body-progress-policy.test.ts`
- `pnpm --filter @pulse/api test -- src/db/body-check-in-migration.test.ts src/routes/body-check-ins/api.integration.test.ts src/routes/body-check-ins/analytics-api.integration.test.ts`
- `pnpm --filter @pulse/web test -- src/features/body-progress/components/body-preferences-form.test.tsx src/features/body-progress/components/guided-check-in-form.test.tsx src/pages/body-progress.test.tsx`

Final source-bound gates (capture first final run):

- `TURBO_FORCE=true pnpm lint`
- `TURBO_FORCE=true pnpm typecheck`
- `TURBO_FORCE=true TURBO_CONCURRENCY=1 pnpm test`
- `TURBO_FORCE=true pnpm build`
- focused Playwright against an isolated fictional fixture DB and non-production ports: `pnpm --filter web exec playwright test e2e/body-progress.spec.ts --project=chromium`

No production DB, production auth/media, Docker Compose, deployment, merge, or production backfill is in scope. This implementation worker may commit, push, and open one PR that closes #188; independent acceptance and integration remain parent-owned.
