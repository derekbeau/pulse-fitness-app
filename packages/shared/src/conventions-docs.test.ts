import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const COLOR_TOKENS = [
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
] as const;

const THEME_COLORS: Record<
  'light' | 'dark' | 'midnight',
  Record<(typeof COLOR_TOKENS)[number], string>
> = {
  light: {
    '--color-background': '#FFFFFF',
    '--color-foreground': '#1A1A2E',
    '--color-card': '#F8F9FA',
    '--color-on-accent': '#111827',
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
    '--color-on-accent': '#111827',
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
    '--color-on-accent': '#111827',
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
  const workoutDomainPath = resolve(monorepoRoot, 'docs', 'conventions', 'workout-domain.md');
  const dataModelsPath = resolve(monorepoRoot, 'docs', 'conventions', 'data-models.md');
  const apiConventionsPath = resolve(monorepoRoot, 'docs', 'conventions', 'api-conventions.md');

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
    expect(designSystemDoc).toContain('--accent-foreground');
    expect(designSystemDoc).toContain('--color-on-accent');
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

  it('documents all workout-domain requirements', async () => {
    const workoutDomainDoc = await readFile(workoutDomainPath, 'utf8');

    expect(workoutDomainDoc).toContain('# Workout Domain Conventions');
    expect(workoutDomainDoc).toContain('## Template Structure');
    expect(workoutDomainDoc).toContain('name');
    expect(workoutDomainDoc).toContain('description');
    expect(workoutDomainDoc).toContain('tags');
    expect(workoutDomainDoc).toContain('warmup');
    expect(workoutDomainDoc).toContain('main');
    expect(workoutDomainDoc).toContain('cooldown');
    expect(workoutDomainDoc).toContain('ordered `exercises` array');
    expect(workoutDomainDoc).toContain('## Exercise In Template');
    expect(workoutDomainDoc).toContain('exerciseId');
    expect(workoutDomainDoc).toContain('sets');
    expect(workoutDomainDoc).toContain('reps');
    expect(workoutDomainDoc).toContain('tempo');
    expect(workoutDomainDoc).toContain('restSeconds');
    expect(workoutDomainDoc).toContain('formCues');
    expect(workoutDomainDoc).toContain('badges');
    expect(workoutDomainDoc).toContain('## Session Structure');
    expect(workoutDomainDoc).toContain('templateId');
    expect(workoutDomainDoc).toContain('status');
    expect(workoutDomainDoc).toContain('startedAt');
    expect(workoutDomainDoc).toContain('completedAt');
    expect(workoutDomainDoc).toContain('duration');
    expect(workoutDomainDoc).toContain('## Set Logging');
    expect(workoutDomainDoc).toContain('weight');
    expect(workoutDomainDoc).toContain('completed');
    expect(workoutDomainDoc).toContain('timestamp');
    expect(workoutDomainDoc).toContain('## Exercise Types');
    expect(workoutDomainDoc).toContain('compound');
    expect(workoutDomainDoc).toContain('isolation');
    expect(workoutDomainDoc).toContain('cardio');
    expect(workoutDomainDoc).toContain('mobility');
    expect(workoutDomainDoc).toContain('## Badge Types');
    expect(workoutDomainDoc).toContain('push');
    expect(workoutDomainDoc).toContain('pull');
    expect(workoutDomainDoc).toContain('legs');
    expect(workoutDomainDoc).toContain('## Feedback Questions');
    expect(workoutDomainDoc).toContain('energy');
    expect(workoutDomainDoc).toContain('recovery');
    expect(workoutDomainDoc).toContain('technique');
    expect(workoutDomainDoc).toContain('notes');
    expect(workoutDomainDoc).toContain('## Tempo Notation');
    expect(workoutDomainDoc).toContain('eccentric');
    expect(workoutDomainDoc).toContain('pause at stretch');
    expect(workoutDomainDoc).toContain('concentric');
    expect(workoutDomainDoc).toContain('3110');
    expect(workoutDomainDoc).toContain('--color-on-accent');
  });

  it('documents all data-model requirements', async () => {
    const dataModelsDoc = await readFile(dataModelsPath, 'utf8');

    expect(dataModelsDoc).toContain('# Data Model Conventions');
    expect(dataModelsDoc).toContain('## Storage Conventions');
    expect(dataModelsDoc).toContain('## User Scope Rules');
    expect(dataModelsDoc).toContain('## Table Inventory');
    expect(dataModelsDoc).toContain('## Relationship Patterns');
    expect(dataModelsDoc).toContain('## JSON Field Patterns');
    expect(dataModelsDoc).toContain('## Normalization Decision Framework');
    expect(dataModelsDoc).toContain('UUIDs stored as `text`');
    expect(dataModelsDoc).toContain('`YYYY-MM-DD`');
    expect(dataModelsDoc).toContain('Unix milliseconds');
    expect(dataModelsDoc).toContain('integer` `0`/`1`');
    expect(dataModelsDoc).toContain("text('col', { mode: 'json' }).$type<T>()");
    expect(dataModelsDoc).toContain('journal_mode = WAL');
    expect(dataModelsDoc).toContain('busy_timeout = 5000');
    expect(dataModelsDoc).toContain('synchronous = NORMAL');
    expect(dataModelsDoc).toContain('foreign_keys = ON');
    expect(dataModelsDoc).toContain('Soft delete');
    expect(dataModelsDoc).toContain('habits.active');
    expect(dataModelsDoc).toContain('polymorphic bridge');
    expect(dataModelsDoc).toContain('sourceType');
    expect(dataModelsDoc).toContain('sourceId');
    expect(dataModelsDoc).toContain('targetType');
    expect(dataModelsDoc).toContain('targetId');
    expect(dataModelsDoc).toContain('targetName');
    expect(dataModelsDoc).toContain('scope through the owning source entity');
    expect(dataModelsDoc).toContain('query, filter, sort, or paginate');
    expect(dataModelsDoc).toContain('read and written as a whole');
    expect(dataModelsDoc).toContain('preferences');
    expect(dataModelsDoc).toContain('feedback');
    expect(dataModelsDoc).toContain('habitChainIds');
    expect(dataModelsDoc).toContain('trendMetrics');
    expect(dataModelsDoc).toContain('muscleGroups');
    expect(dataModelsDoc).toContain('formCues');
    expect(dataModelsDoc).toContain('badges');
    expect(dataModelsDoc).toContain('reversePyramid');
    expect(dataModelsDoc).toContain('injuryCues');
    expect(dataModelsDoc).toContain('customFeedback');
    expect(dataModelsDoc).toContain('supplemental');
    expect(dataModelsDoc).toContain('principles');

    [
      'users',
      'agent_tokens',
      'habits',
      'habit_entries',
      'exercises',
      'workout_templates',
      'template_exercises',
      'workout_sessions',
      'session_sets',
      'foods',
      'nutrition_logs',
      'meals',
      'meal_items',
      'body_weight',
      'nutrition_targets',
      'dashboard_config',
      'scheduled_workouts',
      'health_conditions',
      'condition_timeline_events',
      'condition_protocols',
      'condition_severity_points',
      'journal_entries',
      'activities',
      'resources',
      'equipment_locations',
      'equipment_items',
      'entity_links',
    ].forEach((tableName) => {
      expect(dataModelsDoc).toContain(`\`${tableName}\``);
    });
  });

  it('documents all api convention requirements', async () => {
    const apiConventionsDoc = await readFile(apiConventionsPath, 'utf8');

    expect(apiConventionsDoc).toContain('# API Conventions');
    expect(apiConventionsDoc).toContain('## Route Structure');
    expect(apiConventionsDoc).toContain('## Request Validation');
    expect(apiConventionsDoc).toContain('## Authentication');
    expect(apiConventionsDoc).toContain('## Response Envelope');
    expect(apiConventionsDoc).toContain('## Standard Error Codes');
    expect(apiConventionsDoc).toContain('## Pagination Pattern');
    expect(apiConventionsDoc).toContain('## Date Range Queries');
    expect(apiConventionsDoc).toContain('/api/v1/');
    expect(apiConventionsDoc).not.toContain('/api/agent/');
    expect(apiConventionsDoc).toContain('/api/v1/auth/register');
    expect(apiConventionsDoc).toContain('/api/v1/agent-tokens');
    expect(apiConventionsDoc).toContain('/api/v1/context');
    expect(apiConventionsDoc).toContain('Single API surface with auth-aware behavior');
    expect(apiConventionsDoc).toContain('Zod');
    expect(apiConventionsDoc).toContain('safeParse');
    expect(apiConventionsDoc).toContain('requireAuth');
    expect(apiConventionsDoc).toContain('requireUserAuth');
    expect(apiConventionsDoc).toContain('requireAgentOnly');
    expect(apiConventionsDoc).toContain('Authorization: Bearer <jwt>');
    expect(apiConventionsDoc).toContain('Authorization: AgentToken <token>');
    expect(apiConventionsDoc).toContain('type: "session"');
    expect(apiConventionsDoc).toContain('iss: "pulse-api"');
    expect(apiConventionsDoc).toContain('request.userId');
    expect(apiConventionsDoc).toContain('{ data: T }');
    expect(apiConventionsDoc).toContain('{ data: T, agent?: AgentEnrichment }');
    expect(apiConventionsDoc).toContain('{ data: T[], meta: { page, limit, total } }');
    expect(apiConventionsDoc).toContain('{ error: { code, message } }');
    expect(apiConventionsDoc).toContain('suggestedActions');
    expect(apiConventionsDoc).toContain('UNAUTHORIZED');
    expect(apiConventionsDoc).toContain('FORBIDDEN');
    expect(apiConventionsDoc).toContain('NOT_FOUND');
    expect(apiConventionsDoc).toContain('VALIDATION_ERROR');
    expect(apiConventionsDoc).toContain('CONFLICT');
    expect(apiConventionsDoc).toContain('INTERNAL_ERROR');
    expect(apiConventionsDoc).toContain('page');
    expect(apiConventionsDoc).toContain('default `1`');
    expect(apiConventionsDoc).toContain('limit');
    expect(apiConventionsDoc).toContain('default `50`');
    expect(apiConventionsDoc).toContain('max `100`');
    expect(apiConventionsDoc).toContain('meta');
    expect(apiConventionsDoc).toContain('total');
    expect(apiConventionsDoc).toContain('from');
    expect(apiConventionsDoc).toContain('to');
    expect(apiConventionsDoc).toContain('YYYY-MM-DD');
  });
});
