import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  const selectResults: unknown[] = [];

  const select = vi.fn(() => {
    const get = vi.fn(() => selectResults.shift());
    const limit = vi.fn(() => ({ get }));
    const orderBy = vi.fn(() => ({ limit, get }));
    const where = vi.fn(() => ({ orderBy, limit, get }));
    const leftJoin = vi.fn(() => ({ leftJoin, where, orderBy, limit, get }));
    const from = vi.fn(() => ({ leftJoin, where, orderBy, limit, get }));

    return {
      from,
    };
  });

  const db = {
    select,
  };

  return {
    db,
    select,
    selectResults,
    reset() {
      selectResults.length = 0;
      select.mockClear();
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
    testState.selectResults.push(
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
    testState.selectResults.push(undefined, undefined, undefined, undefined, {
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
});
