import { DASHBOARD_WIDGET_IDS } from '@pulse/shared';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DEFAULT_VISIBLE_WIDGETS = Object.keys(DASHBOARD_WIDGET_IDS);

const testState = vi.hoisted(() => {
  const selectGetResults: unknown[] = [];
  const selectAllResults: unknown[] = [];
  const insertRunResults: unknown[] = [];
  const whereCalls: unknown[] = [];

  const select = vi.fn(() => {
    const chain = {
      from: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      where: vi.fn((condition: unknown) => {
        whereCalls.push(condition);
        return chain;
      }),
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
    whereCalls,
    reset() {
      selectGetResults.length = 0;
      selectAllResults.length = 0;
      insertRunResults.length = 0;
      whereCalls.length = 0;
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
        total: 6,
        completed: 4,
      },
    );
    testState.selectAllResults.push(
      [{ date: '2026-03-08', weight: 178.4 }],
      [
        {
          scheduledWorkoutId: 'scheduled-upper-push-a',
          scheduledTemplateId: 'template-upper-push-a',
          linkedSessionId: 'session-upper-push-a',
          scheduledTemplateName: 'Upper Push A',
          scheduledCreatedAt: 100,
          linkedSessionName: 'Upper Push A',
          linkedSessionStatus: 'completed',
          linkedSessionDuration: 64,
          linkedSessionTemplateId: 'template-upper-push-a',
          linkedSessionStartedAt: 200,
          linkedSessionCompletedAt: 260,
        },
      ],
      [],
    );

    const { getDashboardSnapshot } = await import('./dashboard-store.js');
    const snapshot = await getDashboardSnapshot('user-1', '2026-03-09');

    expect(snapshot).toEqual({
      date: '2026-03-09',
      weight: {
        value: 178.4,
        trendValue: 178.4,
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
        templateId: 'template-upper-push-a',
        sessionId: 'session-upper-push-a',
        duration: 64,
      },
      habits: {
        total: 6,
        completed: 4,
        percentage: 66.7,
      },
    });
    expect(testState.select).toHaveBeenCalledTimes(7);
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
    expect(testState.select).toHaveBeenCalledTimes(6);
  });

  it('rounds habit completion percentage to one decimal place', async () => {
    testState.selectGetResults.push(undefined, undefined, undefined, {
      total: 3,
      completed: 2,
    });
    testState.selectAllResults.push([], []);

    const { getDashboardSnapshot } = await import('./dashboard-store.js');
    const snapshot = await getDashboardSnapshot('user-1', '2026-03-11');

    expect(snapshot.habits).toEqual({
      total: 3,
      completed: 2,
      percentage: 66.7,
    });
  });

  it('scopes dashboard workout snapshot lookup by local workout date', async () => {
    testState.selectGetResults.push(undefined, undefined, undefined, undefined);
    testState.selectAllResults.push([], []);

    const { getDashboardSnapshot } = await import('./dashboard-store.js');
    await getDashboardSnapshot('user-1', '2026-03-11');

    const workoutWhereClause = testState.whereCalls[4];
    const dialect = new SQLiteSyncDialect();
    const workoutWhereSql = dialect.sqlToQuery(workoutWhereClause as never).sql;

    expect(workoutWhereSql).toContain('"workout_sessions"."date"');
    expect(workoutWhereSql).not.toContain('"workout_sessions"."started_at"');
  });

  it('selects in_progress over scheduled and completed when multiple workouts exist', async () => {
    testState.selectGetResults.push(undefined, undefined, undefined, {
      total: 0,
      completed: 0,
    });
    testState.selectAllResults.push(
      [
        {
          scheduledWorkoutId: 'scheduled-1',
          scheduledTemplateId: 'template-scheduled',
          linkedSessionId: null,
          scheduledTemplateName: 'Scheduled Session',
          scheduledCreatedAt: 20,
          linkedSessionName: null,
          linkedSessionStatus: null,
          linkedSessionDuration: null,
          linkedSessionTemplateId: null,
          linkedSessionStartedAt: null,
          linkedSessionCompletedAt: null,
        },
        {
          scheduledWorkoutId: 'scheduled-2',
          scheduledTemplateId: 'template-completed',
          linkedSessionId: 'session-completed',
          scheduledTemplateName: 'Completed Session',
          scheduledCreatedAt: 10,
          linkedSessionName: 'Completed Session',
          linkedSessionStatus: 'completed',
          linkedSessionDuration: 55,
          linkedSessionTemplateId: 'template-completed',
          linkedSessionStartedAt: 100,
          linkedSessionCompletedAt: 200,
        },
      ],
      [
        {
          sessionId: 'session-in-progress',
          sessionName: 'In Progress Session',
          sessionStatus: 'in-progress',
          sessionDuration: 22,
          sessionTemplateId: 'template-in-progress',
          sessionStartedAt: 300,
          sessionCompletedAt: null,
        },
      ],
    );

    const { getDashboardSnapshot } = await import('./dashboard-store.js');
    const snapshot = await getDashboardSnapshot('user-1', '2026-03-11');

    expect(snapshot.workout).toEqual({
      name: 'In Progress Session',
      status: 'in_progress',
      templateId: 'template-in-progress',
      sessionId: 'session-in-progress',
      duration: 22,
    });
  });

  it('falls back to scheduled workout when linked session is cancelled', async () => {
    testState.selectGetResults.push(undefined, undefined, undefined, {
      total: 0,
      completed: 0,
    });
    testState.selectAllResults.push(
      [
        {
          scheduledWorkoutId: 'scheduled-1',
          scheduledTemplateId: 'template-scheduled',
          linkedSessionId: 'session-cancelled',
          scheduledTemplateName: 'Scheduled Session',
          scheduledCreatedAt: 20,
          linkedSessionName: 'Cancelled Session',
          linkedSessionStatus: 'cancelled',
          linkedSessionDuration: null,
          linkedSessionTemplateId: 'template-scheduled',
          linkedSessionStartedAt: null,
          linkedSessionCompletedAt: null,
        },
      ],
      [],
    );

    const { getDashboardSnapshot } = await import('./dashboard-store.js');
    const snapshot = await getDashboardSnapshot('user-1', '2026-03-11');

    expect(snapshot.workout).toEqual({
      name: 'Scheduled Session',
      status: 'scheduled',
      templateId: 'template-scheduled',
      sessionId: null,
      duration: null,
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
