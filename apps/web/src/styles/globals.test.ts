import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentFilePath = fileURLToPath(import.meta.url);
const stylesDirectory = path.dirname(currentFilePath);
const globalsCssPath = path.join(stylesDirectory, 'globals.css');

describe('globals.css design tokens', () => {
  it('defines Tailwind import and required tokens', () => {
    const css = readFileSync(globalsCssPath, 'utf8');

    expect(css).toContain('@import "tailwindcss";');

    const requiredTokens = [
      '--color-background',
      '--color-foreground',
      '--color-card',
      '--color-primary',
      '--color-secondary',
      '--color-accent-cream',
      '--color-accent-pink',
      '--color-accent-mint',
      '--color-muted',
      '--color-border',
      '--radius-sm',
      '--radius-md',
      '--radius-lg',
      '--radius-xl',
      '--radius-2xl',
      '--font-sans',
      '--space-0',
      '--space-1',
      '--space-2',
      '--space-3',
      '--space-4',
      '--space-5',
      '--space-6',
      '--space-8',
      '--space-10',
      '--space-12',
      '--space-16',
    ];

    for (const token of requiredTokens) {
      expect(css).toContain(token);
    }
  });
});
