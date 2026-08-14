# Adaptive TDEE v1 Decision Log

The specification is authoritative. Record only decisions that clarify implementation or intentionally deviate from it. Any material deviation requires Derek's approval before implementation.

## D-001: Adaptive TDEE, not “true BMR”

**Status:** Accepted  
**Decision:** Intake and weight change estimate effective TDEE. Mifflin-St Jeor provides only an onboarding RMR prior. User-facing copy must not claim measured or true BMR.

## D-002: Kilograms are canonical internally

**Status:** Accepted  
**Decision:** Store and calculate weight in kilograms. Convert pounds only at input/output boundaries. The UI continues to honor user display preference.

## D-003: Explicit nutrition completeness

**Status:** Accepted  
**Decision:** Only user-confirmed complete days enter the algorithm. Existing target-attainment completeness is unrelated and cannot be reused. Any meal/item mutation downgrades a complete day to partial.

## D-004: Recommendations require acceptance

**Status:** Accepted  
**Decision:** Weekly/manual check-ins propose targets. They never silently replace current targets in v1.

## D-005: No scheduler infrastructure in v1

**Status:** Accepted  
**Decision:** Due state is computed lazily. Weekly attempts are created through user interaction, not cron or startup jobs.

## D-006: One mutable lifetime program per user

**Status:** Accepted  
**Decision:** v1 updates/pauses/resumes one program row. Multiple archived/recreated programs are deferred; immutable check-ins preserve history.

## D-007: Repository state is the cross-agent source of truth

**Status:** Accepted  
**Decision:** Codex Desktop may own the primary implementation loop; Hermes/Vector performs independent acceptance. All agents use this directory for current status, decisions, and verification rather than relying on chat history.

## D-008: One primary implementation owner

**Status:** Accepted  
**Decision:** Subagents may investigate, test, or review, but concurrent editors must use separate worktrees. Only reviewed commits enter the primary feature branch.

## D-009: One draft implementation PR

**Status:** Accepted  
**Decision:** The specification remains the first commit in `feat/adaptive-tdee-v1`; implementation milestones follow in the same draft PR. The PR is the visible execution ledger and remains draft until independent acceptance passes.

## New decision template

```text
## D-XXX: Title

Status: Proposed | Accepted | Rejected | Superseded
Date:
Owner:
Context:
Decision:
Consequences:
Spec sections affected:
Approval, if required:
```
