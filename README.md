# Pulse

A personal health and fitness tracking app. Most data entry happens via AI agents through an authenticated API; the UI is for viewing data, managing configurations, and manually logging workouts during gym sessions.

## Features

- **Dashboard** — Configurable widgets with habit chains, trend sparklines, macro progress rings, and calendar navigation
- **Workouts** — Interactive session logging with reusable templates, set tracking, rest timers, and session feedback
- **Nutrition** — Daily meal cards with macro progress visualization (meals entered via agent API)
- **Foods** — Per-user food database with search, management, and recency tracking
- **Habits** — Configurable daily habits with don't-break-the-chain visualization
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

- `/api/v1/` — App endpoints (user session auth)
- `/api/agent/` — Agent endpoints (token auth, scoped per user)

### Response Format

```json
// Success
{ "data": { ... } }

// Error
{ "error": { "code": "NOT_FOUND", "message": "..." } }

// Paginated list
{ "data": [...], "meta": { "page": 1, "limit": 20, "total": 42 } }
```

### Key Design Decisions

- **Mobile-first** — Designed at 375px, scales to tablet and desktop
- **Agent-first data entry** — Meals and foods are entered via AI agents; the UI is read-only for nutrition
- **SQLite** — Simple setup for personal use without an external database dependency
- **Shared Zod schemas** — Single source of truth for validation on both client and server

## Deployment

Runs on a home server accessible via Tailscale. No public registration or social features.
