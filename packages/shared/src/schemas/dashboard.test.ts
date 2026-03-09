import { describe, expect, it } from 'vitest';

import {
  type DashboardSnapshot,
  type DashboardSnapshotQuery,
  dashboardSnapshotQuerySchema,
  dashboardSnapshotSchema,
} from './dashboard';

describe('dashboardSnapshotQuerySchema', () => {
  it('accepts an empty query for default date handling', () => {
    expect(dashboardSnapshotQuerySchema.parse({})).toEqual({});
  });

  it('accepts an optional date query', () => {
    expect(dashboardSnapshotQuerySchema.parse({ date: '2026-03-09' })).toEqual({
      date: '2026-03-09',
    });
  });

  it('infers DashboardSnapshotQuery from the schema', () => {
    const query: DashboardSnapshotQuery = {
      date: '2026-03-09',
    };

    expect(query.date).toBe('2026-03-09');
  });
});

describe('dashboardSnapshotSchema', () => {
  it('parses a complete dashboard snapshot payload', () => {
    const snapshot = dashboardSnapshotSchema.parse({
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

    expect(snapshot.habits.percentage).toBe(66.7);
    expect(snapshot.weight?.unit).toBe('lb');
  });

  it('accepts null weight and workout values', () => {
    expect(
      dashboardSnapshotSchema.parse({
        date: '2026-03-09',
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
      }),
    ).toBeTruthy();
  });

  it('infers DashboardSnapshot from the schema', () => {
    const snapshot: DashboardSnapshot = {
      date: '2026-03-09',
      weight: null,
      macros: {
        actual: {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
        target: {
          calories: 2200,
          protein: 180,
          carbs: 250,
          fat: 70,
        },
      },
      workout: null,
      habits: {
        total: 2,
        completed: 1,
        percentage: 50,
      },
    };

    expect(snapshot.habits.completed).toBe(1);
  });
});
