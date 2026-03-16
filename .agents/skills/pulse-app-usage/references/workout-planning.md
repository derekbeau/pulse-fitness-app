# Workout Planning (Pulse)

Use this reference when planning a new workout session or adjusting an existing one.

## Planning Context

Review these before proposing a session:

- Current status and recent sessions: `~/Obsidian/Master/2-Areas/Health & Fitness/Workouts/Training Logs/`
- Injury notes/protocols: `~/Obsidian/Master/2-Areas/Health & Fitness/Workouts/Resources/Injuries/`
- Equipment context: `~/Obsidian/Master/2-Areas/Health & Fitness/Workouts/Equipment List.md`
- Templates: `~/Obsidian/Master/2-Areas/Health & Fitness/Workouts/2025.11.12 - Balanced Full-Body/`
- Recent workouts in Pulse: `GET /api/v1/context/` → `recentWorkouts`

## Pre-Workout Check-In

Ask 2-4 brief questions:

1. Energy/recovery today (1-10)
2. Any pain flare-up or movement limitation today
3. Time available
4. Training location and equipment access

## Session Design Rules

- Avoid back-to-back loading on the same stressed areas from recent sessions.
- Use conservative loading when recovery is poor.
- Prefer substitutions that preserve intent when pain is present.
- Build with existing template conventions before inventing new structure.
- Search existing exercises (`GET /api/v1/exercises/?q=<term>`) before creating duplicates.

## Known Constraints (if applicable)

- Shoulder sensitivity: avoid painful overhead patterns and control eccentric phases on pulls.
- Disc/back sensitivity: avoid heavy spinal loading and floor-pull variations when symptomatic.
- Recovery sessions: lower total working sets and leave reps in reserve.
- Full sessions: moderate working volume with controlled RPE.

## Output Scope

- Create workout templates via `POST /api/v1/workout-templates/`.
- Start sessions via `POST /api/v1/workout-sessions/`.
- Log sets and complete via `PATCH /api/v1/workout-sessions/:id`.
- All through the Pulse `/api/v1/*` API — no manual JSON file editing.

## Post-Workout Capture

Record short notes for future planning:

1. Overall session feel and difficulty
2. Any pain signals or red flags
3. What to keep, reduce, or change next time

Persist these via `PATCH /api/v1/workout-sessions/:id` with `notes` field.
