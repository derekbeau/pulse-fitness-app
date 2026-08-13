# Vector Review: Adaptive TDEE Gate 0

**Reviewed commit:** `db5ea0d5c776a112f65bdd82b318132d4da3b9c2`  
**Verdict:** `VECTOR GATE 0 CHANGES REQUIRED`  
**Date:** 2026-08-12

## Blocking findings

### 1. Browser-clean claim is false: Dashboard still emits Recharts warnings

The verification report claims the clean browser rerun had zero console warnings/errors, but Vector independently reproduced two identical Recharts warnings when navigating from Nutrition back to Dashboard:

```text
The width(-1) and height(-1) of chart should be greater than 0...
```

The remaining source is the dashboard trend sparkline path at `apps/web/src/features/dashboard/components/trend-sparkline.tsx:212`, which still renders `ResponsiveContainer` without an initial dimension. The warnings fire twice under React development rendering.

Required correction:

- Fix the remaining Dashboard sparkline initialization warning without hiding/suppressing console output.
- Add executable regression coverage for the affected component behavior.
- Rerun a clean built-in-browser navigation sequence, including Dashboard -> another route -> Dashboard.
- Record the actual console and failed-network evidence. Update any statement that previously claimed zero warnings before this correction.

### 2. Gate 0 needs a repeatable, fail-closed isolated startup command

The current isolated environment depends on ignored `.env` state. There is no tracked command/script that enforces the isolated DB and ports, validates the resolved database path, or refuses to start when it points at production/default storage. A missed/malformed local variable can fall back to `apps/api/data/pulse.db` because `apps/api/src/db/index.ts` defaults to `./data/pulse.db`.

Vector also confirmed the ignored `.env` is not shell-sourceable because an unquoted display-name value contains spaces. The app's env-file parsers accept it, but a reviewer cannot safely use a normal `source .env` startup workflow.

Required correction:

- Add a tracked Gate 0 development command/script that explicitly sets or validates:
  - `DATABASE_URL` to the isolated writable DB
  - API port `3102`
  - web port `5274`
  - Vite proxy port `3102`
- Fail closed if the resolved DB is the default `apps/api/data/pulse.db`, `/data/pulse.db`, the read-only snapshot, or another production-designated path.
- Do not embed credentials or secrets in the tracked script.
- Document exact startup and shutdown commands in the workspace evidence.
- Add a focused executable test for the path guard/startup configuration where practical.

## Independently verified as passing

- Branch/worktree are clean, pushed, and bound correctly.
- PR #100 remains draft; GitHub lint, typecheck, build, and Claude review checks are green.
- Uncached local `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all passed; 1,862 tests passed across 242 files.
- Isolated API/web health returned HTTP 200 on ports 3102/5274.
- The live API process had only `pulse-tdee-dev.db` plus WAL/SHM open.
- Snapshot SHA-256 remained `fdd3b6657a8bc0937f06d5ee82bb39e225dcb64df8d4d7b5bccf9eebc5aa7cf4`.
- The isolated user and weight write exist only in `pulse-tdee-dev.db`, not the snapshot.
- Both databases return `PRAGMA quick_check = ok`.
- No Milestone 1 schema/algorithm/Coach work was started.

## Resubmission requirements

Codex must resume **Milestone 0 only**, resolve both blockers, self-review, rerun automated and built-in-browser QA, update the workspace evidence, commit and push, then stop again at `AWAITING VECTOR GATE 0 REVIEW`. Do not begin Milestone 1.
