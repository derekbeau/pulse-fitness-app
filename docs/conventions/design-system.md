# Design System Conventions

This document is the source of truth for Pulse UI tokens and theme behavior.

## Theme Color Tokens

All colors are defined as CSS custom properties on the root theme class.

| Token                  | Light (`:root`) | Dark (`.dark`) | Midnight (`.theme-midnight`) |
| ---------------------- | ---------------- | -------------- | ----------------------------- |
| `--color-background`   | `#FFFFFF`        | `#1A1A2E`      | `#0D1B2A`                     |
| `--color-foreground`   | `#1A1A2E`        | `#E8E8E8`      | `#CCD6F6`                     |
| `--color-card`         | `#F8F9FA`        | `#202942`      | `#1B2838`                     |
| `--color-primary`      | `#3F63C7`        | `#9BB1FF`      | `#3B82F6`                     |
| `--color-secondary`    | `#EEF2F7`        | `#16213E`      | `#14263A`                     |
| `--color-accent-cream` | `#F7E8C4`        | `#F3D7A8`      | `#F4C95D`                     |
| `--color-accent-pink`  | `#F4CADB`        | `#F5B5CB`      | `#B8A1FF`                     |
| `--color-accent-mint`  | `#CDEEE2`        | `#9EDCC9`      | `#6EC3FF`                     |
| `--color-muted`        | `#5D6476`        | `#AEB6CC`      | `#91A2BF`                     |
| `--color-border`       | `#D6DCE8`        | `#303B59`      | `#31465F`                     |

## Spacing Scale

Use CSS variables for semantic spacing references, and Tailwind spacing classes for implementation.

| Token        | Value     | Tailwind class examples  |
| ------------ | --------- | ------------------------ |
| `--space-0`  | `0rem`    | `p-0`, `m-0`, `gap-0`    |
| `--space-1`  | `0.25rem` | `p-1`, `m-1`, `gap-1`    |
| `--space-2`  | `0.5rem`  | `p-2`, `m-2`, `gap-2`    |
| `--space-3`  | `0.75rem` | `p-3`, `m-3`, `gap-3`    |
| `--space-4`  | `1rem`    | `p-4`, `m-4`, `gap-4`    |
| `--space-5`  | `1.25rem` | `p-5`, `m-5`, `gap-5`    |
| `--space-6`  | `1.5rem`  | `p-6`, `m-6`, `gap-6`    |
| `--space-8`  | `2rem`    | `p-8`, `m-8`, `gap-8`    |
| `--space-10` | `2.5rem`  | `p-10`, `m-10`, `gap-10` |
| `--space-12` | `3rem`    | `p-12`, `m-12`, `gap-12` |
| `--space-16` | `4rem`    | `p-16`, `m-16`, `gap-16` |

Rules:

- Prefer Tailwind utility classes first (`px-4`, `py-6`, `gap-3`).
- Use token variables in CSS only for semantic layout primitives that need reuse across multiple components.

## Typography Scale

Typography is utility-first. Use Tailwind classes (`text-*`, `leading-*`, `font-*`) as the primary API.

Current typography token contract:

- `--font-sans` defines the global sans stack.
- Font size/line-height/weight are applied via Tailwind classes directly (`text-3xl`, `font-semibold`, `leading-tight`, etc.).
- No `--font-size-*` or `--line-height-*` CSS variables are currently part of the required token contract.

## Border Radius Tokens

| Token          | Value      | Tailwind mapping |
| -------------- | ---------- | ---------------- |
| `--radius-sm`  | `0.375rem` | `rounded-sm`     |
| `--radius-md`  | `0.5rem`   | `rounded-md`     |
| `--radius-lg`  | `0.75rem`  | `rounded-lg`     |
| `--radius-xl`  | `1rem`     | `rounded-xl`     |
| `--radius-2xl` | `1.25rem`  | `rounded-2xl`    |

Additional shadcn/radix integration tokens:

- `--radius` (base radius primitive used for derived tokens)
- `--radius-3xl` and `--radius-4xl` are derived in `@theme inline`

## Theme Switching Mechanism

Theme behavior is class-based and controlled by a `useTheme` hook.

Implementation contract:

- Light theme is the default `:root` token set with no theme class.
- Alternate theme classes live on the document root: `dark`, `theme-midnight`.
- Persist user choice in `localStorage` under key `pulse-theme`.
- `useTheme` is the single source of truth for reading/updating theme.
- `index.html` includes a pre-hydration bootstrap script that mirrors `useTheme` logic to prevent initial flash.
- Initialization order:

1. Use saved `pulse-theme` value if present.
2. Otherwise detect `prefers-color-scheme` and map to `dark`/`light`.
3. If detection is unavailable, default to `dark`.

## shadcn Semantic Token Bridge

Pulse color tokens are the source-of-truth. shadcn semantic variables are aliases layered on top:

- Example mappings: `--background -> --color-background`, `--primary -> --color-primary`, `--border -> --color-border`.
- Tailwind utilities should continue to use semantic utility names (`bg-background`, `text-foreground`, `border-border`, etc.) through the `@theme inline` bridge.
- New primitives should map through existing `--color-*` tokens rather than introducing parallel color systems.

## Component Composition Patterns

All shared components follow these rules:

- Always accept `className?: string`.
- Merge internal + external classes with `cn(...)`.
- Prefer composition over configuration.
- Keep variant props limited to stable primitives (for example `size` and `intent`), not large boolean matrices.

Minimal component shape:

```tsx
type Props = React.ComponentProps<'div'>;

export function Card({ className, ...props }: Props) {
  return <div className={cn('rounded-xl border bg-card', className)} {...props} />;
}
```

## Accent Card Usage Guidelines

Use pastel accents intentionally to encode meaning:

- `--color-accent-cream`: nutrition summaries, calorie/macronutrient context, planning widgets.
- `--color-accent-pink`: habits, streak milestones, recovery/wellness emphasis.
- `--color-accent-mint`: workout performance, progress deltas, completion/success states.

Guardrails:

- Do not stack multiple accent backgrounds inside one card.
- Use one accent per card and keep dense data regions on `--color-card`.
- Always verify foreground contrast before shipping.
