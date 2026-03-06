# Feature Structure Conventions

This document defines the frontend structure and import boundaries for `apps/web`.

## Current Prototype Layout

The current prototype is route-first and shared-component-first. This is intentional until domain modules need independent ownership.

```text
src/
  components/
    layout/
    ui/
    <app-level providers/context>
  hooks/
  lib/
  pages/
  styles/
  test/
```

Rules:

- `src/pages/` owns route-level composition.
- `src/components/layout` owns shell/navigation composition.
- `src/components/ui` owns reusable primitives (shadcn wrappers + custom primitives).
- `src/components/` root may contain app-level providers/context wrappers shared across routes.
- `src/hooks` and `src/lib` own shared app-level hooks/utilities.
- `src/test` owns shared test setup utilities.

## Feature Directory Layout

When a domain area grows beyond simple page composition, move it into `src/features/{name}/`.

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
- Feature folders and file names are kebab-case.

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
- `@/hooks/*` (shared app hooks)
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

For current prototype pages that are not yet split into feature modules:

- Page files in `src/pages/` may directly compose shared primitives from `@/components/*`, `@/hooks/*`, and `@/lib/*`.
- Keep page files focused on composition and avoid embedding large data/business logic blocks; move that logic into a feature module once it becomes non-trivial.

## Naming Conventions

- Components: PascalCase symbol names (`WorkoutSummaryCard`).
- Hooks/utilities: camelCase symbol names (`useWorkoutTemplate`, `formatMacroValue`).
- File names: kebab-case (`workout-summary-card.tsx`, `use-workout-template.ts`).
- Feature folder names: kebab-case (`workout-logging`, `nutrition-overview`).
- App entrypoint exceptions are allowed: `App.tsx`, `main.tsx`, and `vite-env.d.ts`.

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
