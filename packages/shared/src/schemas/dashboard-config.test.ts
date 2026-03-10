import { describe, expect, it } from 'vitest';

import { type DashboardConfig, dashboardConfigSchema } from './dashboard-config';

describe('dashboardConfigSchema', () => {
  it('parses a complete dashboard config payload', () => {
    const config = dashboardConfigSchema.parse({
      habitChainIds: ['habit-1', 'habit-2'],
      trendMetrics: ['weight', 'calories', 'protein'],
      visibleWidgets: ['snapshot', 'macro-rings', 'weight-trend'],
      widgetOrder: ['snapshot', 'habits', 'trends'],
    });

    expect(config).toEqual({
      habitChainIds: ['habit-1', 'habit-2'],
      trendMetrics: ['weight', 'calories', 'protein'],
      visibleWidgets: ['snapshot', 'macro-rings', 'weight-trend'],
      widgetOrder: ['snapshot', 'habits', 'trends'],
    });
  });

  it('accepts config without widget order', () => {
    expect(
      dashboardConfigSchema.parse({
        habitChainIds: ['habit-1'],
        trendMetrics: ['weight'],
      }),
    ).toEqual({
      habitChainIds: ['habit-1'],
      trendMetrics: ['weight'],
    });
  });

  it('rejects unsupported trend metrics', () => {
    expect(() =>
      dashboardConfigSchema.parse({
        habitChainIds: ['habit-1'],
        trendMetrics: ['steps'],
      }),
    ).toThrow();
  });

  it('infers DashboardConfig from the schema', () => {
    const config: DashboardConfig = {
      habitChainIds: ['habit-1'],
      trendMetrics: ['protein'],
    };

    expect(config.trendMetrics).toEqual(['protein']);
  });
});
