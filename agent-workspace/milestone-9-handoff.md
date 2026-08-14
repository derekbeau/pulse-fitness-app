# Milestone 9 Handoff

> Historical checkpoint for the Milestone 9 commit. The state and counts below are not current; use the
> final-QA repair handoff for present verification.

**State:** `MILESTONE 9 COMPLETE; MILESTONE 10 IN PROGRESS`
**Branch:** `feat/adaptive-tdee-v1`
**Environment:** tracked isolated `pnpm dev:gate0` only; production unchanged

## Delivered

- Persistent loss, gain, and maintenance goal cards in every post-setup Coach state.
- Preferred-unit edit and new-direction flows with current trend, safe rates, projection review, final
  confirmation, and explicit pending-recommendation replacement.
- Goal-change comparison copy and separate expenditure/strategy/guardrail/macro attribution.
- Strict response parsing, Adaptive TDEE query invalidation, 44 px actions, keyboard focus restoration,
  deterministic preview fixtures, RTL, and installed-Chrome journeys.

## Runtime findings repaired

1. Closing the goal dialog did not restore focus to its invoking action. Explicit trigger tracking and a
   permanent RTL/Playwright regression now cover the fix.
2. Goal-reached UI copy still implied target acceptance automatically entered maintenance. All affected
   copy now requires a separate reviewed completion step.

## Verification

- Focused adaptive RTL/API: 28/28.
- Installed Chrome: 9/9 strict journeys; exact 320/375/390/430/768/1280 width matrix.
- Full uncached tests: startup/isolation 9, shared 412, API 684, web 999.
- Uncached lint, typecheck, and build: 3/3 each, zero cached Turbo tasks; four pre-existing lint warnings.
- Built-in browser: loss, maintenance, edit, pending replacement, new direction, confirmation, and focus
  restoration passed with empty final console warnings/errors. The in-app viewport capability stayed fixed
  at 1280 despite explicit overrides; exact width evidence is therefore the installed-Chrome run.
- Isolated database restored: `quick_check=ok`, 13 preview users, 12 active goals, 3 pending check-ins.

## Milestone 10 boundary

Milestone 10 may add detailed progress, chart text equivalents, revision/prior-goal history, and the
reviewed completion-to-maintenance flow. Migration rehearsal, complete release acceptance, final docs,
remote CI, deployment, merge, and PR-ready promotion remain Milestone 11 or later scope.
