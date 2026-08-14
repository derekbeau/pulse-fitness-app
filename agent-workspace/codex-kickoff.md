# Historical Codex Desktop Kickoff: Adaptive TDEE Final Goal-Strategy Repair

This file preserves the assignment that produced the completed final goal-strategy repair. It is retained as
historical evidence and must not be followed again as an active assignment.

## Completed assignment record

The completed assignment repaired the then-confirmed final goal-strategy findings in the primary feature
worktree. The steps below describe that past assignment; they do not authorize implementation, commit, push,
PR edits, deployment, or production access now.

Use only the tracked `pnpm dev:gate0` environment and its regular, non-symlink
`apps/api/data/pulse-tdee-dev.db`. Never access production, deploy, merge, make PR #100 ready, or alter a
nutrition target outside the existing explicit recommendation-acceptance flow.

Historical completion sequence:

1. Add permanent migration, direct-SQL, store, API, shared-schema, UI, concurrency, replayability, and
   browser regressions for every confirmed finding.
2. Self-review the complete repair diff and run focused adversarial tests plus `git diff --check`.
3. Run the repository's exact uncached lint, typecheck, test, and build pipeline.
4. Run installed-Chrome acceptance with exactly:

   ```bash
   API_PORT=3102 BASE_URL=http://127.0.0.1:5274 PLAYWRIGHT_CHANNEL=chrome pnpm --filter @pulse/web exec playwright test e2e/adaptive-preview-fixtures.spec.ts --project=chromium
   ```

5. Walk every affected goal/history/completion surface in the built-in browser while recording console,
   page, request, and HTTP diagnostics.
6. Reconcile all handoff Markdown and replace PR #100's description from `agent-workspace/pr-body.md`.
7. Create and push exactly one Conventional Commit, verify PR #100 remains draft, and stop at
   `AWAITING VECTOR FINAL GOAL-STRATEGY RE-REVIEW`.

The subsequent independent review withdrew approval for three legacy-history blockers: unsafe historical
final-trend backfill, missing backfill of existing completion transitions, and cancellation fallback that could
fabricate a closing trend. A separately issued bounded correction repaired those findings. The current state is
`AWAITING VECTOR FINAL GOAL-STRATEGY RE-REVIEW`; do not duplicate either completed repair from this archived
prompt.
