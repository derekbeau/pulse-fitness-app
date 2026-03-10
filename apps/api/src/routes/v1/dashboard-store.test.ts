import { DASHBOARD_WIDGET_IDS } from '@pulse/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DEFAULT_VISIBLE_WIDGETS = Object.keys(DASHBOARD_WIDGET_IDS);

const testState = vi.hoisted(() => {
  const selectGetResults: unknown[] = [];
  const selectAllResults: unknown[] = [];
  const insertRunResults: unknown[] = [];

  const select = vi.fn(() => {
    const chain = {
      from: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      groupBy: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      get: vi.fn(() => selectGetResults.shift()),
      all: vi.fn(() => (selectAllResults.shift() as unknown[] | undefined) ?? []),
    };

    return {
      from: chain.from,
    };
  });

  const db = {
    insert: vi.fn(() => {
      const chain = {
        values: vi.fn(() => chain),
        onConflictDoUpdate: vi.fn(() => chain),
        run: vi.fn(() => insertRunResults.shift()),
      };

      return chain;
    }),
    select,
  };

  return {
    db,
    select,
    selectGetResults,
    selectAllResults,
    insertRunResults,
    reset() {
      selectGetResults.length = 0;
      selectAllResults.length = 0;
      insertRunResults.length = 0;
      select.mockClear();
      db.insert.mockClear();
    },
  };
});

vi.mock('../../db/index.js', () => ({
  db: testState.db,
}));

describe('dashboard store', () => {
  beforeEach(() => {
    testState.reset();
  });

  it('aggregates all dashboard snapshot sections from scoped query results', async () => {
    testState.selectGetResults.push(
      { value: 178.4, date: '2026-03-08' },
      {
        calories: 1850,
        protein: 150,
        carbs: 190,
        fat: 65,
      },
      {
        calories: 2200,
        protein: 180,
        carbs: 250,
        fat: 70,
      },
      {
        name: 'Upper Push A',
        status: 'completed',
        duration: 64,
      },
      {
        total: 6,
        completed: 4,
      },
    );

    const { getDashboardSnapshot } = await import('./dashboard-store.js');
    const snapshot = await getDashboardSnapshot('user-1', '2026-03-09');

    expect(snapshot).toEqual({
      date: '2026-03-09',
      weight: {
        value: 178.4,
        date: '2026-03-08',
        unit: 'lb',
      },
      macros: {
        actual: {
          calories: 1850,
          protein: 150,
          carbs: 190,
          fat: 65,
        },
        target: {
          calories: 2200,
          protein: 180,
          carbs: 250,
          fat: 70,
        },
      },
      workout: {
        name: 'Upper Push A',
        status: 'completed',
        duration: 64,
      },
      habits: {
        total: 6,
        completed: 4,
        percentage: 66.7,
      },
    });
    expect(testState.select).toHaveBeenCalledTimes(5);
  });

  it('returns null sections and zeroed values when no data exists for the date', async () => {
    const { getDashboardSnapshot } = await import('./dashboard-store.js');
    const snapshot = await getDashboardSnapshot('user-1', '2026-03-10');

    expect(snapshot).toEqual({
      date: '2026-03-10',
      weight: null,
      macros: {
        actual: {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
        target: {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
      },
      workout: null,
      habits: {
        total: 0,
        completed: 0,
        percentage: 0,
      },
    });
    expect(testState.select).toHaveBeenCalledTimes(5);
  });

  it('rounds habit completion percentage to one decimal place', async () => {
    testState.selectGetResults.push(undefined, undefined, undefined, undefined, {
      total: 3,
      completed: 2,
    });

    const { getDashboardSnapshot } = await import('./dashboard-store.js');
    const snapshot = await getDashboardSnapshot('user-1', '2026-03-11');

    expect(snapshot.habits).toEqual({
      total: 3,
      completed: 2,
      percentage: 66.7,
    });
  });

  it('returns weight trend points in ascending date order', async () => {
    testState.selectAllResults.push([
      { date: '2026-03-07', value: 181.6 },
      { date: '2026-03-09', value: 181.1 },
    ]);

    const { getDashboardWeightTrend } = await import('./dashboard-store.js');
    const trend = await getDashboardWeightTrend('user-1', '2026-03-07', '2026-03-09');

    expect(trend).toEqual([
      { date: '2026-03-07', value: 181.6 },
      { date: '2026-03-09', value: 181.1 },
    ]);
    expect(testState.select).toHaveBeenCalledTimes(1);
  });

  it('fills missing macro trend days with zero totals', async () => {
    testState.selectAllResults.push([
      {
        date: '2026-03-07',
        calories: 2100,
        protein: 170,
        carbs: 230,
        fat: 68,
      },
      {
        date: '2026-03-09',
        calories: 2200,
        protein: 180,
        carbs: 240,
        fat: 70,
      },
    ]);

    const { getDashboardMacrosTrend } = await import('./dashboard-store.js');
    const trend = await getDashboardMacrosTrend('user-1', '2026-03-07', '2026-03-09');

    expect(trend).toEqual([
      {
        date: '2026-03-07',
        calories: 2100,
        protein: 170,
        carbs: 230,
        fat: 68,
      },
      {
        date: '2026-03-08',
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
      {
        date: '2026-03-09',
        calories: 2200,
        protein: 180,
        carbs: 240,
        fat: 70,
      },
    ]);
    expect(testState.select).toHaveBeenCalledTimes(1);
  });

  it('returns consistency completion booleans for every day in range', async () => {
    testState.selectAllResults.push([{ date: '2026-03-08' }]);

    const { getDashboardConsistencyTrend } = await import('./dashboard-store.js');
    const trend = await getDashboardConsistencyTrend('user-1', '2026-03-07', '2026-03-09');

    expect(trend).toEqual([
      { date: '2026-03-07', completed: false },
      { date: '2026-03-08', completed: true },
      { date: '2026-03-09', completed: false },
    ]);
    expect(testState.select).toHaveBeenCalledTimes(1);
  });

  it('returns the stored dashboard config when one exists', async () => {
    testState.selectGetResults.push({
      habitChainIds: ['habit-1', 'habit-2'],
      trendMetrics: ['weight', 'protein'],
      visibleWidgets: ['weight-trend'],
      widgetOrder: ['snapshot', 'trends', 'habits'],
    });

    const { getDashboardConfig } = await import('./dashboard-store.js');
    const config = await getDashboardConfig('user-1');

    expect(config).toEqual({
      habitChainIds: ['habit-1', 'habit-2'],
      trendMetrics: ['weight', 'protein'],
      visibleWidgets: ['weight-trend'],
      widgetOrder: ['snapshot', 'trends', 'habits'],
    });
    expect(testState.select).toHaveBeenCalledTimes(1);
  });

  it('preserves an explicitly empty stored trend-metric selection', async () => {
    testState.selectGetResults.push({
      habitChainIds: ['habit-1'],
      trendMetrics: [],
      visibleWidgets: null,
      widgetOrder: null,
    });

    const { getDashboardConfig } = await import('./dashboard-store.js');
    const config = await getDashboardConfig('user-1');

    expect(config).toEqual({
      habitChainIds: ['habit-1'],
      trendMetrics: [],
      visibleWidgets: DEFAULT_VISIBLE_WIDGETS,
    });
    expect(testState.select).toHaveBeenCalledTimes(1);
  });

  it('treats all-invalid stored trend metrics as an empty selection', async () => {
    testState.selectGetResults.push({
      habitChainIds: ['habit-1'],
      trendMetrics: ['unknown-metric'],
      visibleWidgets: null,
      widgetOrder: null,
    });

    const { getDashboardConfig } = await import('./dashboard-store.js');
    const config = await getDashboardConfig('user-1');

    expect(config).toEqual({
      habitChainIds: ['habit-1'],
      trendMetrics: [],
      visibleWidgets: DEFAULT_VISIBLE_WIDGETS,
    });
    expect(testState.select).toHaveBeenCalledTimes(1);
  });

  it('returns default dashboard config with active habits when none is stored', async () => {
    testState.selectGetResults.push(undefined);
    testState.selectAllResults.push([{ id: 'habit-1' }, { id: 'habit-3' }]);

    const { getDashboardConfig } = await import('./dashboard-store.js');
    const config = await getDashboardConfig('user-1');

    expect(config).toEqual({
      habitChainIds: ['habit-1', 'habit-3'],
      trendMetrics: ['weight', 'calories', 'protein'],
      visibleWidgets: DEFAULT_VISIBLE_WIDGETS,
    });
    expect(testState.select).toHaveBeenCalledTimes(2);
  });

  it('upserts dashboard config by userId', async () => {
    testState.selectGetResults.push({
      habitChainIds: ['habit-1'],
      trendMetrics: ['calories'],
      visibleWidgets: ['weight-trend'],
      widgetOrder: ['trends', 'snapshot'],
    });

    const { upsertDashboardConfig } = await import('./dashboard-store.js');
    const config = await upsertDashboardConfig('user-1', {
      habitChainIds: ['habit-1'],
      trendMetrics: ['calories'],
      visibleWidgets: ['weight-trend'],
      widgetOrder: ['trends', 'snapshot'],
    });

    expect(config).toEqual({
      habitChainIds: ['habit-1'],
      trendMetrics: ['calories'],
      visibleWidgets: ['weight-trend'],
      widgetOrder: ['trends', 'snapshot'],
    });
    expect(testState.db.insert).toHaveBeenCalledTimes(1);
    expect(testState.select).toHaveBeenCalledTimes(1);
  });
});
