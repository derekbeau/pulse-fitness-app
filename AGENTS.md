# Pulse — Agent Instructions

> **Note:** `CLAUDE.md` is a symlink to this file. Both paths load these instructions.

## Project Overview

Pulse is a personal health and fitness tracking app focused on AI agent-driven data entry and interactive workout logging UI. See `README.md` for full feature list and tech stack.

## Monorepo Structure

```
apps/web/       — React 19 + Vite SPA (frontend)
apps/api/       — Fastify 5 REST API (backend)
packages/shared — Zod schemas + shared TypeScript types
```

Package manager: **pnpm** (workspaces). Build system: **Turborepo**.

## Commands

```bash
pnpm dev                    # Start all apps in dev mode
pnpm build                  # Build all packages
pnpm test                   # Run all tests (Vitest)
pnpm lint                   # ESLint across all packages
pnpm typecheck              # TypeScript type checking
pnpm format                 # Prettier format

# Run commands in a specific workspace
pnpm --filter web dev       # Start frontend only
pnpm --filter api dev       # Start backend only
pnpm --filter shared build  # Build shared package
```

## Tech Stack Quick Reference

| Area     | Stack                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, React Router v7 (declarative SPA), TanStack Query v5, Zustand, React Hook Form + Zod, Recharts |
| Backend  | Fastify 5, TypeScript, Drizzle ORM, SQLite (better-sqlite3), JWT auth                                                                                  |
| Shared   | Zod schemas as single source of truth — types derived via `z.infer<>`                                                                                  |
| Testing  | Vitest + React Testing Library (unit/integration), Playwright (E2E)                                                                                    |
| Quality  | ESLint flat config, Prettier, Husky + lint-staged pre-commit hooks                                                                                     |

## Conventions

### Code Organization

- Frontend features live in `apps/web/src/features/<feature>/` with colocated components, hooks, and queries
- API routes follow Fastify plugin pattern in `apps/api/src/routes/`
- Shared Zod schemas in `packages/shared/src/schemas/` — import from `@pulse/shared`
- Convention docs live in `docs/conventions/` — consult these before working on a domain

### API Design

- All API routes live under `/api/v1/` and accept either `Authorization: Bearer <jwt>` or `Authorization: AgentToken <token>` when the route uses shared auth.
- API documentation: OpenAPI spec at `GET /api/docs/json`, Swagger UI at `/api/docs`
- JWTs are for web app sessions; AgentToken auth is for agent integrations.
- Agent-specific convenience features such as name resolution, auto-create behavior, and response enrichment activate automatically when a request uses AgentToken auth.
- Sensitive routes such as auth management and agent token CRUD are JWT-only.
- JWTs issued by Pulse include `type: "session"` and `iss: "pulse-api"` claims; hand-crafted JWTs without these claims are rejected.
- Success response: `{ data: T, agent?: AgentEnrichment }`
- Error response: `{ error: { code: string, message: string } }`
- Paginated: `{ data: T[], meta: { page, limit, total }, agent?: AgentEnrichment }`
- All inputs validated with Zod
- Request and response schemas are auto-generated from Zod schemas into the OpenAPI spec

### Frontend Patterns

- **Mobile-first** responsive design (375px → 768px → 1280px+)
- Dark theme default, light theme supported, accent themes switchable
- CSS custom properties for design tokens via Tailwind v4
- TanStack Query for all server state; Zustand only for cross-component UI state
- React Hook Form + Zod for all forms (schemas from `@pulse/shared`)

### Database

- Drizzle ORM with SQLite — all queries scoped to authenticated `userId`
- Migrations managed by Drizzle Kit
- No cross-user data access — every table with user data has a `userId` column

### Testing

- Unit/integration: Vitest — test files colocated as `*.test.ts(x)`
- E2E: Playwright — tests in `apps/web/e2e/`
- Run `pnpm test` before committing

## Key Domain Notes

- **Nutrition**: Meals are entered by AI agents only — no manual entry UI. The frontend is read-only for meal data.
- **Workouts**: The most complex UI domain. Templates → Sessions → Sets. Active session state is server-side. Completed sessions can be corrected via `PATCH /api/v1/workout-sessions/:id/corrections` — set values (weight, reps, rpe) can be updated without changing session status or timestamps.
- **Habits**: User-configurable with boolean/numeric/time tracking types, plus referential habits (`weight`, `nutrition_daily`, `nutrition_meal`, `workout`) that auto-resolve completion from linked data unless manually overridden. Feed into dashboard "don't break the chain" widgets.
- **Foods**: Per-user database. `lastUsedAt` and `usageCount` are automatically maintained by the meal store layer whenever saved-food meal items are created, updated, or deleted.
- **Trash & Soft Delete**: User-facing habits, workout templates, exercises, foods, and workout sessions use `deletedAt` soft delete; restore/purge flows are handled via `/api/v1/trash`.

## PRD & Build Plan

Full PRD: `.orchestrator/health-fitness-app/prd/PRD.md`
Summary: `.orchestrator/health-fitness-app/prd/SUMMARY.md`
Build plan: `.orchestrator/health-fitness-app/plan.json`
