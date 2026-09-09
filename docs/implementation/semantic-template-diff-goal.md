# Pulse #152 — semantic template diff (frozen handoff)

## Lane and authority
- Repo: `/Users/meridian/Projects/pulse-semantic-template-diff`
- Branch: `branchfix/semantic-template-diff`
- Required base: `origin/main` / `6672b57599f2da4e3794ed02dc79879b7c27332a`
- Read `/AGENTS.md`; preserve the 25 pre-existing untracked files in the source checkout. Do not copy, stage, or delete them.
- Primary: GPT-5.6 Sol, medium, Fast OFF. Review: GPT-5.6 Luna, medium. These are routing preferences, not acceptance gates.

## Outcome
Replace the noisy always-visible template-drift marker with one canonical semantic comparison shared by both scheduled-workout API paths and the existing detail UI. The scheduled snapshot remains authoritative; never refresh/adopt template content or mutate an active/completed session. Prefer the existing edit workflow. Inspect-only is the scope: no new adoption/refresh feature, comparison engine, or unnecessary migration.

## Read before editing (actual current source)
- `AGENTS.md`
- `apps/api/src/routes/scheduled-workouts/snapshot-store.ts` — snapshot/template projections, current and legacy fingerprints, compatible-version check.
- `apps/api/src/routes/scheduled-workouts/store.ts` and `index.ts` — the two detail/API builders that currently emit `templateDrift`; preserve owner isolation for JWT and AgentToken paths.
- `packages/shared/src/schemas/scheduled-workouts.ts` — shared detail contract/OpenAPI source.
- `apps/web/src/features/workouts/api/workouts.ts` — detail query/mutation contract.
- `apps/web/src/features/workouts/components/scheduled-workout-detail.tsx` — current banner and existing edit surface.
- Focused existing tests: `apps/api/src/routes/scheduled-workouts/{snapshot-store,store,index}.test.ts`, `apps/web/src/features/workouts/components/scheduled-workout-detail.test.tsx`, plus scheduled-start surface tests. Read only directly relevant helpers/fixtures.

## Semantic contract
Use one shared API/domain diff representation; both API paths return the same semantics and the UI renders it without reimplementing comparison logic.

Compare normalized current effective prescription, ignoring IDs, timestamps, serialization order, and equivalent `null`/absent optional fields. Normalize template set targets/top-level reps against per-set scheduled fields and support compatible legacy exact-reps representations. Do **not** treat materially different tracking types/units or invalid targets as equal/collapsed.

Identity and prescription fields:
- exercise identity, section, order
- sets and reps
- weight, duration, distance, zone targets
- rest, tempo, supersets
- `programmingNotes`

Keep informational cues/description/notes separate from prescription differences. Preserve schedule-specific `agentNotes`, schedule context, and safety guidance; their presence alone is not template drift and reconciliation must not erase them.

Typed differences must identify exercise/field, scheduled current value, template current value, severity/category, and available provenance. Human-readable field-level output is required; do not require a raw JSON dump.

## UX and integrity
- Default collapsed and accessible at 375px and desktop; expand to concrete field differences.
- Matching current content produces no drift warning, including ID/timestamp-only or equivalent serialization changes.
- Intentional customization is quiet (“Customized for this session” or equivalent), not an error; no false attribution of who changed a value or which side is newer. If provenance cannot be reconstructed for a legacy record, say `provenance unknown` while keeping current diff accurate.
- Acknowledged informational/version-bound differences stay quiet; a meaningful subsequent content change reappears. If version-bound acknowledgment is included, its identity must be explicit and compatible with #153 review/fingerprint semantics; preserve #153 compatibility, do not implement #153.
- Keep actionable integrity warnings for stale/unavailable/deleted exercises, invalid targets, malformed/unresolved conflicts, and template deletion. A stale exercise warning must remain visible through both scheduled-start paths.
- No automatic mutation, adopt/refresh control, or active/completed-session mutation. Existing edit workflow remains the only edit path.

## Acceptance (all required; do not hide or scope-cut)
1. Changed source template, then scheduled snapshot made semantically equal: no banner.
2. Intentional schedule difference: quiet customization state, exact diff, Start remains allowed.
3. IDs/timestamps/serialization-only changes: no warning.
4. Meaningful rep/load/order/note change: named concrete difference, no mutation.
5. Tracking-unit/type mismatch and invalid target: not collapsed; actionable integrity warning remains.
6. Missing/deleted exercise, template deletion, exercise swap, legacy missing baseline/provenance unknown: accurate warning/diff behavior retained.
7. Acknowledge/version-bound state, then change one real target: the new difference reappears.
8. Both API detail paths, both JWT/AgentToken ownership paths, both session-start paths, and no-op matching snapshot covered.
9. Agent notes/schedule context/safety remain visible; completed sessions are untouched.
10. API/OpenAPI/shared contract, focused regression tests, and UI behavior agree.

## Verification contract
Use focused tests while editing, then one uncached full gate after repairs; retain raw logs, exit codes, tested HEAD SHA, and source/test hash manifest. Do not rerun identical full matrices or create giant redundant receipts.

Focused coverage must include semantic normalization/diff cases, both API builders, legacy/invalid/stale integrity cases, and detail UI. Browser verification uses synthetic populated data: mobile 375 and desktop, keyboard/accessibility, collapsed/expanded concrete diffs, network/API errors, and changed-content reappearance. Check console/network and screenshot/readback evidence; no raw JSON-only proof.

Final commands (actual repo scripts; report unrelated failures separately):
```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```
Also run `git diff --check`, verify exact base ancestry/HEAD, and finish with a clean worktree except intentional commit state.

## Delivery boundaries
Docs-only setup ends here; implementation/review are a later authorized step. No Codex UI, app server, launch, source implementation, production data/env changes, deployment, merge, or premature PR. If implementation is authorized: use one editor, read this frozen goal, implement/review gates above, create a Conventional Commit and draft PR only when explicitly requested, then stop for IR (independent review). Return actual commands/results, branch/HEAD/status, changed files, screenshots/readbacks, blockers, and prohibited actions not taken.
