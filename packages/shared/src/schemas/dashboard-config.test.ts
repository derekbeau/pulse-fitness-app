import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_WIDGET_IDS,
  DEFAULT_VISIBLE_WIDGETS,
  type DashboardConfig,
  dashboardConfigSchema,
} from './dashboard-config';

describe('dashboardConfigSchema', () => {
  it('parses a complete dashboard config payload', () => {
    const config = dashboardConfigSchema.parse({
      habitChainIds: ['habit-1', 'habit-2'],
      trendMetrics: ['weight', 'calories', 'protein'],
      visibleWidgets: ['snapshot-cards', 'macro-rings', 'weight-trend'],
      widgetOrder: ['snapshot', 'habits', 'trends'],
    });

    expect(config).toEqual({
      habitChainIds: ['habit-1', 'habit-2'],
      trendMetrics: ['weight', 'calories', 'protein'],
      visibleWidgets: ['snapshot-cards', 'macro-rings', 'weight-trend'],
      widgetOrder: ['snapshot', 'habits', 'trends'],
    });
  });

  it('defaults visible widgets when omitted', () => {
    expect(
      dashboardConfigSchema.parse({
        habitChainIds: ['habit-1'],
        trendMetrics: ['weight'],
      }),
    ).toEqual({
      habitChainIds: ['habit-1'],
      trendMetrics: ['weight'],
      visibleWidgets: DEFAULT_VISIBLE_WIDGETS,
    });
  });

  it('preserves custom visible widget ids', () => {
    expect(
      dashboardConfigSchema.parse({
        habitChainIds: ['habit-1'],
        trendMetrics: ['weight'],
        visibleWidgets: ['recent-workouts', 'weight-trend'],
      }),
    ).toEqual({
      habitChainIds: ['habit-1'],
      trendMetrics: ['weight'],
      visibleWidgets: ['recent-workouts', 'weight-trend'],
    });
  });

  it('accepts an empty visible widget list', () => {
    expect(
      dashboardConfigSchema.parse({
        habitChainIds: ['habit-1'],
        trendMetrics: ['weight'],
        visibleWidgets: [],
      }),
    ).toEqual({
      habitChainIds: ['habit-1'],
      trendMetrics: ['weight'],
      visibleWidgets: [],
    });
  });

  it('rejects empty visible widget ids', () => {
    expect(() =>
      dashboardConfigSchema.parse({
        habitChainIds: ['habit-1'],
        trendMetrics: ['weight'],
        visibleWidgets: [''],
      }),
    ).toThrow();
  });

  it('rejects unsupported trend metrics', () => {
    expect(() =>
      dashboardConfigSchema.parse({
        habitChainIds: ['habit-1'],
        trendMetrics: ['steps'],
      }),
    ).toThrow();
  });

  it('exports dashboard widget labels by id', () => {
    expect(DASHBOARD_WIDGET_IDS['weight-trend']).toBe('Weight Trend');
    expect(Object.keys(DASHBOARD_WIDGET_IDS)).toEqual(DEFAULT_VISIBLE_WIDGETS);
  });

  it('infers DashboardConfig from the schema', () => {
    const config: DashboardConfig = {
      habitChainIds: ['habit-1'],
      trendMetrics: ['protein'],
      visibleWidgets: ['weight-trend'],
    };

    expect(config.trendMetrics).toEqual(['protein']);
  });
});
