# PR-1 Decisions

## [pr-1] Harden SQLite shutdown and checkpoint handling
**Choice:** Wrap API shutdown in `try...catch` with explicit success/failure exits, and log periodic WAL checkpoint failures instead of swallowing them silently.
**Rationale:** Graceful shutdown should still terminate predictably if `app.close()` or the final checkpoint fails, and silent checkpoint errors would make production diagnosis harder if the failure is not just an expected shutdown race.
**Alternatives considered:** Leaving shutdown unguarded; continuing to ignore all checkpoint errors during the periodic background task.

## [pr-1] Keep mobile workout-calendar status cues consolidated
**Choice:** Leave the unavailable-workout warning inside the desktop-only inline status row instead of moving it into the mobile layout.
**Rationale:** Mobile tiles already expose unavailable state through the bottom status dots, so showing the warning icon there as well would duplicate the same signal and crowd the compact tile header.
**Alternatives considered:** Moving the warning icon outside the responsive container; adding a separate mobile-only unavailable badge.

## [pr-1] Close this review pass as a verified branch-state audit
**Choice:** Keep product code unchanged and satisfy the round with a fresh audit plus required gate reruns.
**Rationale:** The checked-out worktree already matches all four reviewer asks: `LOOKBACK_LABEL` is in place, API shutdown is guarded, WAL checkpoint failures are logged, and unavailable scheduled workouts remain visible on mobile. Re-editing those files would add churn without improving behavior.
**Alternatives considered:** Reapplying the same fixes in source to force a diff; expanding the pass into unrelated cleanup.

## [pr-1] Close iteration-2 with branch-local verification only
**Choice:** Leave application source unchanged and complete this pass with a fresh audit of the four reviewed files plus updated PR traceability notes.
**Rationale:** The live worktree already contains the reviewer-requested outcomes in both web and API code, so additional source edits would be redundant churn. The missing work for this iteration was proving the checked-out branch still matches those comments and passes `build`, `typecheck`, `lint`, and `test` locally right before handoff.
**Alternatives considered:** Reapplying already-landed fixes to the same files to force a source diff; widening the scope beyond the explicit review feedback.
