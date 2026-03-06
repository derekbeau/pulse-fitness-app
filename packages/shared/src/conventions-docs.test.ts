import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const COLOR_TOKENS = [
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
] as const;

const THEME_COLORS: Record<
  'light' | 'dark' | 'midnight',
  Record<(typeof COLOR_TOKENS)[number], string>
> = {
  light: {
    '--color-background': '#FFFFFF',
    '--color-foreground': '#1A1A2E',
    '--color-card': '#F8F9FA',
    '--color-primary': '#3F63C7',
    '--color-secondary': '#EEF2F7',
    '--color-accent-cream': '#F7E8C4',
    '--color-accent-pink': '#F4CADB',
    '--color-accent-mint': '#CDEEE2',
    '--color-muted': '#5D6476',
    '--color-border': '#D6DCE8',
  },
  dark: {
    '--color-background': '#1A1A2E',
    '--color-foreground': '#E8E8E8',
    '--color-card': '#202942',
    '--color-primary': '#9BB1FF',
    '--color-secondary': '#16213E',
    '--color-accent-cream': '#F3D7A8',
    '--color-accent-pink': '#F5B5CB',
    '--color-accent-mint': '#9EDCC9',
    '--color-muted': '#AEB6CC',
    '--color-border': '#303B59',
  },
  midnight: {
    '--color-background': '#0D1B2A',
    '--color-foreground': '#CCD6F6',
    '--color-card': '#1B2838',
    '--color-primary': '#3B82F6',
    '--color-secondary': '#14263A',
    '--color-accent-cream': '#F4C95D',
    '--color-accent-pink': '#B8A1FF',
    '--color-accent-mint': '#6EC3FF',
    '--color-muted': '#91A2BF',
    '--color-border': '#31465F',
  },
};

describe('convention documentation', () => {
  const currentFileDir = dirname(fileURLToPath(import.meta.url));
  const monorepoRoot = resolve(currentFileDir, '..', '..', '..');
  const designSystemPath = resolve(monorepoRoot, 'docs', 'conventions', 'design-system.md');
  const featureStructurePath = resolve(monorepoRoot, 'docs', 'conventions', 'feature-structure.md');

  it('documents all design-system requirements', async () => {
    const designSystemDoc = await readFile(designSystemPath, 'utf8');

    expect(designSystemDoc).toContain('# Design System Conventions');
    expect(designSystemDoc).toContain('## Theme Color Tokens');
    expect(designSystemDoc).toContain('## Spacing Scale');
    expect(designSystemDoc).toContain('## Typography Scale');
    expect(designSystemDoc).toContain('## Border Radius Tokens');
    expect(designSystemDoc).toContain('## Theme Switching Mechanism');
    expect(designSystemDoc).toContain('## shadcn Semantic Token Bridge');
    expect(designSystemDoc).toContain('## Component Composition Patterns');
    expect(designSystemDoc).toContain('## Interaction Affordance');
    expect(designSystemDoc).toContain('## Accent Card Usage Guidelines');
    expect(designSystemDoc).toContain('localStorage');
    expect(designSystemDoc).toContain('useTheme');
    expect(designSystemDoc).toContain('`dark`, `theme-midnight`');
    expect(designSystemDoc).toContain('className?: string');
    expect(designSystemDoc).toContain('cn(');
    expect(designSystemDoc).toContain('cursor-pointer');
    expect(designSystemDoc).toContain('Buttons and button-like controls');
    expect(designSystemDoc).toContain('--radius-sm');
    expect(designSystemDoc).toContain('--radius-2xl');

    COLOR_TOKENS.forEach((token) => {
      expect(designSystemDoc).toContain(token);
      expect(designSystemDoc).toContain(THEME_COLORS.light[token]);
      expect(designSystemDoc).toContain(THEME_COLORS.dark[token]);
      expect(designSystemDoc).toContain(THEME_COLORS.midnight[token]);
    });
  });

  it('documents all feature-structure requirements', async () => {
    const featureStructureDoc = await readFile(featureStructurePath, 'utf8');

    expect(featureStructureDoc).toContain('# Feature Structure Conventions');
    expect(featureStructureDoc).toContain('Current Prototype Layout');
    expect(featureStructureDoc).toContain('src/features/{name}/');
    expect(featureStructureDoc).toContain('components/');
    expect(featureStructureDoc).toContain('hooks/');
    expect(featureStructureDoc).toContain('api/');
    expect(featureStructureDoc).toContain('lib/');
    expect(featureStructureDoc).toContain('types.ts');
    expect(featureStructureDoc).toContain('index.ts');
    expect(featureStructureDoc).toContain('Barrel Export Pattern');
    expect(featureStructureDoc).toContain('No Cross-Feature Imports');
    expect(featureStructureDoc).toContain('@/components');
    expect(featureStructureDoc).toContain('@/lib');
    expect(featureStructureDoc).toContain('@pulse/shared');
    expect(featureStructureDoc).toContain('Route-Level Composition');
    expect(featureStructureDoc).toContain('src/pages/');
    expect(featureStructureDoc).toContain('Naming Conventions');
    expect(featureStructureDoc).toContain('PascalCase');
    expect(featureStructureDoc).toContain('camelCase');
    expect(featureStructureDoc).toContain('kebab-case');
    expect(featureStructureDoc).toContain('App.tsx');
    expect(featureStructureDoc).toContain('Create New Feature vs Extend Existing');
  });
});
