# Design System Conventions

This document is the source of truth for Pulse UI tokens and theme behavior.

## Theme Color Tokens

All colors are defined as CSS custom properties on the root theme class.

| Token                  | Light     | Dark (default) | Midnight  |
| ---------------------- | --------- | -------------- | --------- |
| `--color-background`   | `#F7F8FC` | `#10131A`      | `#070B14` |
| `--color-foreground`   | `#1C2230` | `#F5F7FF`      | `#EAF2FF` |
| `--color-card`         | `#FFFFFF` | `#181D27`      | `#0F1728` |
| `--color-primary`      | `#2F6FED` | `#7AA2FF`      | `#5EA2FF` |
| `--color-secondary`    | `#E8ECF8` | `#273246`      | `#18233B` |
| `--color-accent-cream` | `#FFF3D6` | `#F3D7A8`      | `#E7C78C` |
| `--color-accent-pink`  | `#FFD9E6` | `#F5B5CB`      | `#E9A7C7` |
| `--color-accent-mint`  | `#D6F5EA` | `#9EDCC9`      | `#8BD7C3` |
| `--color-muted`        | `#687185` | `#9AA6BF`      | `#93A4C2` |
| `--color-border`       | `#D8DEEA` | `#2D384C`      | `#233250` |

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

Typography is tokenized for size, line-height, and weight. Use Tailwind classes (`text-*`, `leading-*`, `font-*`) as the primary API.

### Font size + line-height

| Token                | Value      |
| -------------------- | ---------- |
| `--font-size-xs`     | `0.75rem`  |
| `--line-height-xs`   | `1rem`     |
| `--font-size-sm`     | `0.875rem` |
| `--line-height-sm`   | `1.25rem`  |
| `--font-size-base`   | `1rem`     |
| `--line-height-base` | `1.5rem`   |
| `--font-size-lg`     | `1.125rem` |
| `--line-height-lg`   | `1.75rem`  |
| `--font-size-xl`     | `1.25rem`  |
| `--line-height-xl`   | `1.75rem`  |
| `--font-size-2xl`    | `1.5rem`   |
| `--line-height-2xl`  | `2rem`     |
| `--font-size-3xl`    | `1.875rem` |
| `--line-height-3xl`  | `2.25rem`  |

### Font weights

| Token                    | Value | Tailwind mapping |
| ------------------------ | ----- | ---------------- |
| `--font-weight-regular`  | `400` | `font-normal`    |
| `--font-weight-medium`   | `500` | `font-medium`    |
| `--font-weight-semibold` | `600` | `font-semibold`  |
| `--font-weight-bold`     | `700` | `font-bold`      |

## Border Radius Tokens

| Token          | Value      | Tailwind mapping |
| -------------- | ---------- | ---------------- |
| `--radius-sm`  | `0.375rem` | `rounded-sm`     |
| `--radius-md`  | `0.5rem`   | `rounded-md`     |
| `--radius-lg`  | `0.75rem`  | `rounded-lg`     |
| `--radius-xl`  | `1rem`     | `rounded-xl`     |
| `--radius-2xl` | `1.25rem`  | `rounded-2xl`    |

## Theme Switching Mechanism

Theme behavior is class-based and controlled by a `useTheme` hook.

Implementation contract:

- Theme classes live on the document root: `theme-light`, `theme-dark`, `theme-midnight`.
- Persist user choice in `localStorage` under key `pulse-theme`.
- `useTheme` is the single source of truth for reading/updating theme.
- Initialization order:

1. Use saved `pulse-theme` value if present.
2. Otherwise detect `prefers-color-scheme` and map to `dark`/`light`.
3. If detection is unavailable, default to `dark`.

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
