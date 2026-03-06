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
    '--color-background': '#F7F8FC',
    '--color-foreground': '#1C2230',
    '--color-card': '#FFFFFF',
    '--color-primary': '#2F6FED',
    '--color-secondary': '#E8ECF8',
    '--color-accent-cream': '#FFF3D6',
    '--color-accent-pink': '#FFD9E6',
    '--color-accent-mint': '#D6F5EA',
    '--color-muted': '#687185',
    '--color-border': '#D8DEEA',
  },
  dark: {
    '--color-background': '#10131A',
    '--color-foreground': '#F5F7FF',
    '--color-card': '#181D27',
    '--color-primary': '#7AA2FF',
    '--color-secondary': '#273246',
    '--color-accent-cream': '#F3D7A8',
    '--color-accent-pink': '#F5B5CB',
    '--color-accent-mint': '#9EDCC9',
    '--color-muted': '#9AA6BF',
    '--color-border': '#2D384C',
  },
  midnight: {
    '--color-background': '#070B14',
    '--color-foreground': '#EAF2FF',
    '--color-card': '#0F1728',
    '--color-primary': '#5EA2FF',
    '--color-secondary': '#18233B',
    '--color-accent-cream': '#E7C78C',
    '--color-accent-pink': '#E9A7C7',
    '--color-accent-mint': '#8BD7C3',
    '--color-muted': '#93A4C2',
    '--color-border': '#233250',
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
    expect(designSystemDoc).toContain('## Component Composition Patterns');
    expect(designSystemDoc).toContain('## Accent Card Usage Guidelines');
    expect(designSystemDoc).toContain('localStorage');
    expect(designSystemDoc).toContain('useTheme');
    expect(designSystemDoc).toContain('className?: string');
    expect(designSystemDoc).toContain('cn(');
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
    expect(featureStructureDoc).toContain('Create New Feature vs Extend Existing');
  });
});
