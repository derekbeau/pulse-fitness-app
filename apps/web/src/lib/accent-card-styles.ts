const darkBorder =
  'dark:border-l-4 dark:border-t-border/60 dark:border-r-border/60 dark:border-b-border/60 dark:bg-card dark:text-foreground';

export const accentCardStyles = {
  cream: `bg-[var(--color-accent-cream)] text-on-cream border-transparent shadow-sm ${darkBorder} dark:border-l-amber-500`,
  pink: `bg-[var(--color-accent-pink)] text-on-pink border-transparent shadow-sm ${darkBorder} dark:border-l-pink-500`,
  mint: `bg-[var(--color-accent-mint)] text-on-mint border-transparent shadow-sm ${darkBorder} dark:border-l-emerald-500`,
} as const;

export type AccentColor = keyof typeof accentCardStyles;
