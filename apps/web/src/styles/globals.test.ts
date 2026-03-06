import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentFilePath = fileURLToPath(import.meta.url);
const stylesDirectory = path.dirname(currentFilePath);
const globalsCssPath = path.join(stylesDirectory, 'globals.css');

describe('globals.css design tokens', () => {
  it('defines Tailwind imports and light/dark/midnight token sets', () => {
    const css = readFileSync(globalsCssPath, 'utf8');

    expect(css).toContain('@import "tailwindcss";');
    expect(css).toContain('@import "tw-animate-css";');
    expect(css).toContain('@import "shadcn/tailwind.css";');
    expect(css).toContain(':root');
    expect(css).toContain('.dark');
    expect(css).toContain('.theme-midnight');
    expect(css).toContain('--color-background: #ffffff;');
    expect(css).toContain('--color-card: #f8f9fa;');
    expect(css).toContain('--color-on-accent: #111827;');
    expect(css).toContain('--color-background: #1a1a2e;');
    expect(css).toContain('--color-secondary: #16213e;');
    expect(css).toContain('--color-foreground: #e8e8e8;');
    expect(css).toContain('--color-background: #0d1b2a;');
    expect(css).toContain('--color-card: #1b2838;');
    expect(css).toContain('--color-foreground: #ccd6f6;');
    expect(css).toContain('--color-primary: #3b82f6;');
    expect(css).toContain('--color-accent-pink: #b8a1ff;');
    expect(css).toContain('--color-accent-cream: #f4c95d;');

    const requiredTokens = [
      '--color-background',
      '--color-foreground',
      '--color-card',
      '--color-on-accent',
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

  it('maps shadcn semantic variables to the design token system', () => {
    const css = readFileSync(globalsCssPath, 'utf8');

    const expectedMappings = [
      '--background: var(--color-background);',
      '--foreground: var(--color-foreground);',
      '--card: var(--color-card);',
      '--accent-foreground: var(--color-on-accent);',
      '--primary: var(--color-primary);',
      '--secondary: var(--color-secondary);',
      '--muted-foreground: var(--color-muted);',
      '--border: var(--color-border);',
      '--input: var(--color-border);',
      '--ring: var(--color-primary);',
      '--color-primary-foreground: var(--primary-foreground);',
      '--color-ring: var(--ring);',
      '--color-input: var(--input);',
    ];

    for (const mapping of expectedMappings) {
      expect(css).toContain(mapping);
    }
  });
});
