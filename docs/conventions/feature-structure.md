# Feature Structure Conventions

This document defines the required frontend feature layout and import boundaries for `apps/web`.

## Feature Directory Layout

Each feature lives under `src/features/{name}/`.

```text
src/features/{name}/
  components/
  hooks/
  api/
  lib/
  types.ts
  index.ts
```

Rules:

- `components/`: feature-scoped UI only.
- `hooks/`: feature-scoped React hooks.
- `api/`: feature API clients, query keys, and data mappers.
- `lib/`: pure feature utilities (formatters, calculators, selectors).
- `types.ts`: shared feature-level TypeScript types/interfaces.
- `index.ts`: feature public API barrel.

## Barrel Export Pattern

Every feature must expose a stable public surface through `index.ts`.

Example:

```ts
export { HabitCard } from './components/habit-card';
export { useHabitsQuery } from './hooks/use-habits-query';
export type { Habit, HabitStreak } from './types';
```

Rules:

- Re-export only what should be consumed outside the feature.
- Keep internal helpers private (do not export from barrel).

## Import Boundaries (No Cross-Feature Imports)

Features must not import directly from other features.

Allowed external imports from feature code:

- `@/components/*` (shared app UI)
- `@/lib/*` (shared app utilities)
- `@pulse/shared` (cross-app shared package)

Disallowed:

- `@/features/other-feature/*`
- Relative paths that traverse into another feature (`../other-feature/*`)

## Route-Level Composition

Pages compose features; features do not know about routes.

Rules:

- Route/page files live in `src/pages/`.
- Pages orchestrate data and compose feature components.
- Feature modules must not import route objects, route constants, or router hooks that encode page-level navigation policy.

## Naming Conventions

- Components: PascalCase symbol names (`WorkoutSummaryCard`).
- Hooks/utilities: camelCase symbol names (`useWorkoutTemplate`, `formatMacroValue`).
- File names: kebab-case (`workout-summary-card.tsx`, `use-workout-template.ts`).
- Feature folder names: kebab-case (`workout-logging`, `nutrition-overview`).

## Create New Feature vs Extend Existing

Create a new feature when:

- The domain concept is distinct (new business capability).
- It owns separate API/query behavior.
- It can evolve on an independent cadence.

Extend an existing feature when:

- The change is a direct extension of existing behavior.
- It reuses the same data model and API boundary.
- Splitting would create noisy duplication or circular ownership.

Decision check:

1. If users would describe it as a separate product area, create a new feature.
2. If it is a sub-flow of an existing area, extend the current feature.
