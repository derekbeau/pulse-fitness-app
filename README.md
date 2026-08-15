# Pulse

A personal health and fitness tracking app. Most data entry happens via AI agents through an authenticated API; the UI is for viewing data, managing configurations, and manually logging workouts during gym sessions.

## Features

- **Dashboard** — Configurable widgets with habit chains, trend sparklines, macro progress rings, calendar navigation, and a sidebar card picker with drag-to-reorder
- **Workouts** — Interactive session logging with reusable templates, set tracking, rest timers, pause/resume, cancel flows, and session feedback
- **Active Workout Sessions** — Multiple concurrent active sessions, server-side session state, and agent-driven mid-session exercise add/remove/reorder updates
- **Workout Planning** — Calendar scheduling plus reschedule/remove workflows linked to templates and sessions
- **Exercise Management** — Taxonomy improvements (category/form cues/tags), dedup-aware creation, metadata enrichment workflows, card/table library view toggle, and a unified exercise detail modal across templates/sessions/library
- **Nutrition** — Tabbed nutrition workspace with `Log`, `Coach`, `Foods`, and `Trends` views, explicit `unknown | partial | complete` day status, review-before-apply Adaptive TDEE recommendations, and persistent trend-weight goals with honest progress, immutable revisions/history, and explicit completion-to-maintenance review (meals entered via agent API)
- **Foods** — Per-user food database inside Nutrition (`/nutrition?view=foods`) with search, management, soft delete support, and recency tracking (`lastUsedAt`)
- **Unified List Controls** — Exercises, foods, and workout templates use shared sort controls and per-page pagination
- **Standardized Route Headers** — Shared `PageHeader` pattern for consistent title, description, back-navigation, and header action layouts across pages
- **Habits** — Configurable daily habits, referential auto-complete (weight/nutrition/workout), and manual override/reset behavior
- **Trash & Restore** — Soft delete for user content (habits, templates, exercises, foods, workout sessions) with restore/purge tools in Settings
- **Trends** — Charts for weight, macros, workout consistency, and exercise progress
- **Multi-user** — Fully isolated data per user with separate agent API tokens
- **Themes** — Dark/light mode with switchable accent themes

## Tech Stack

| Layer    | Technologies                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query v5, Zustand, React Hook Form + Zod, Recharts |
| Backend  | Fastify 5, TypeScript, Drizzle ORM, SQLite (better-sqlite3), JWT auth                                               |
| Shared   | `packages/shared` — Zod schemas as single source of truth, types via `z.infer<>`                                    |
| Monorepo | pnpm workspaces, Turborepo                                                                                          |
| Testing  | Vitest, React Testing Library, Playwright                                                                           |
| Quality  | ESLint, Prettier, Husky pre-commit hooks                                                                            |

## Project Structure

```
pulse/
  apps/
    web/          # React SPA (Vite)
    api/          # Fastify REST API
  packages/
    shared/       # Zod schemas + shared types
  docs/
    conventions/  # Living convention docs (created during development)
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+

### Setup

```bash
pnpm install
```

### Development

```bash
pnpm dev        # Start web + api in parallel
```

For feature work, create a fully initialized worktree from the primary checkout. The initializer
creates the branch and worktree, assigns isolated ports, takes a consistent copy of the live OrbStack
database, installs dependencies, and proves both servers start successfully:

```bash
pnpm worktree:init -- codex/my-feature
cd ../pulse-fitness-app-codex-my-feature
pnpm dev
```

See [Working with worktrees](docs/worktrees.md) for options, security boundaries, cleanup, and
troubleshooting.

### Adaptive TDEE acceptance tools

The Adaptive TDEE replay is read-only and accepts either a versioned JSON export or a migrated SQLite
database. This deterministic fixture demonstrates an eligible March–April estimate followed by an
August hold that cannot reuse stale weights:

```bash
pnpm --silent backtest:adaptive-tdee -- \
  --input scripts/fixtures/adaptive-tdee-backtest.json \
  --format json > adaptive-tdee-backtest.json
```

Use `pnpm --silent` when redirecting JSON or CSV so pnpm's command banner does not precede the
machine-readable output.

The isolated Coach preview uses only `apps/api/data/pulse-tdee-dev.db`. Start Gate 0 once to migrate a
fresh database, stop it, then seed every Coach state and restart the preview:

```bash
pnpm dev:gate0
pnpm seed:adaptive-tdee-preview -- --date 2026-08-13
pnpm dev:gate0
```

For a tailnet preview, bind the web server to this machine's exact Tailscale IPv4 address with
`pnpm dev:gate0 -- --web-host=<tailscale-ipv4>`. The startup guard accepts only loopback or an address
inside Tailscale's `100.64.0.0/10` range; it rejects all-interface, LAN, and public binds. Never expose a
production-derived database copy. Recreate `pulse-tdee-dev.db` as a fresh migrated database containing
only the deterministic fixtures before starting a tailnet preview.

### Other Commands

```bash
pnpm build      # Build all packages
pnpm test       # Run all tests
pnpm lint       # Lint all packages
pnpm typecheck  # Type-check all packages
pnpm format     # Format with Prettier
```

## Architecture

### API Routes

- `/api/v1/` — Single API surface with auth-aware behavior. Use `Authorization: Bearer <jwt>` for web app sessions and `Authorization: AgentToken <token>` for agent integrations.
- OpenAPI-generated clients using the `agentToken` security scheme must still prefix the header value manually as `AgentToken <token>`.
- API documentation available at `/api/docs` (Swagger UI) and `/api/docs/json` (OpenAPI 3.1 spec).
- Agent-specific conveniences such as name resolution, auto-create behavior, and enriched hints activate automatically for AgentToken callers on `/api/v1/*`.
- Sensitive auth-management routes, including agent token CRUD, remain JWT-only.
- Meal summaries can be explicitly updated via meal PATCH routes (`PATCH /api/v1/meals/:id` and `PATCH /api/v1/nutrition/:date/meals/:mealId`) by sending `summary` as text or `null`.
- `/api/v1/adaptive-nutrition` exposes program/check-in state plus current goal, goal history, and canonical trend-detail reads to JWT and AgentToken callers. Program and goal lifecycle decisions are JWT-only. Goal changes create reviewable recommendations; previews and goal mutations never apply nutrition targets automatically, and completion is a separate reviewed transition after target acceptance.

### Response Format

Response schemas are Zod-validated and documented in the OpenAPI spec.

```json
// Success
{ "data": { ... } }

// Success with optional agent enrichment for AgentToken callers
{ "data": { ... }, "agent": { "hints": ["..."], "suggestedActions": ["..."] } }

// Error
{ "error": { "code": "NOT_FOUND", "message": "..." } }

// Paginated list
{ "data": [...], "meta": { "page": 1, "limit": 20, "total": 42 }, "agent": { ... } }
```

### Key Design Decisions

- **Mobile-first** — Designed at 375px, scales to tablet and desktop
- **Agent-first data entry** — Meals and foods are entered via AI agents; the UI is read-only for nutrition
- **SQLite** — Simple setup for personal use without an external database dependency
- **Shared Zod schemas** — Single source of truth for validation on both client and server

## Deployment

Runs on a home server accessible via Tailscale. No public registration or social features.
