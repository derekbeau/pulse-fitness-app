import { describe, expect, it } from 'vitest';

import {
  type DashboardConsistencyTrendPoint,
  type DashboardMacrosTrendPoint,
  type DashboardSnapshot,
  type DashboardSnapshotQuery,
  type DashboardTrendQuery,
  type DashboardWeightTrendPoint,
  dashboardConsistencyTrendSchema,
  dashboardMacrosTrendSchema,
  dashboardSnapshotQuerySchema,
  dashboardSnapshotSchema,
  dashboardTrendQuerySchema,
  dashboardWeightTrendSchema,
  dashboardWorkoutSnapshotSchema,
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

describe('dashboardTrendQuerySchema', () => {
  it('accepts empty query params for default trend range handling', () => {
    expect(dashboardTrendQuerySchema.parse({})).toEqual({});
  });

  it('accepts a valid bounded range and infers DashboardTrendQuery', () => {
    const parsed = dashboardTrendQuerySchema.parse({
      from: '2026-02-01',
      to: '2026-03-01',
    });

    const query: DashboardTrendQuery = parsed;
    expect(query).toEqual({
      from: '2026-02-01',
      to: '2026-03-01',
    });
  });

  it('rejects inverted and overly-long ranges', () => {
    expect(() =>
      dashboardTrendQuerySchema.parse({
        from: '2026-03-09',
        to: '2026-03-08',
      }),
    ).toThrow();
    expect(() =>
      dashboardTrendQuerySchema.parse({
        from: '2025-01-01',
        to: '2026-01-01',
      }),
    ).toThrow();
  });
});

describe('dashboardSnapshotSchema', () => {
  it('parses a complete dashboard snapshot payload', () => {
    const snapshot = dashboardSnapshotSchema.parse({
      date: '2026-03-09',
      weight: {
        value: 178.4,
        trendValue: 178.4,
        date: '2026-03-08',
        unit: 'lbs',
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
        proteinFloor: {
          actualProteinGrams: 150,
          proteinFloorGrams: 180,
          remainingToFloorGrams: 30,
          amountAboveFloorGrams: 0,
          state: 'below_floor',
          isFinal: true,
        },
      },
      workout: {
        name: 'Upper Push A',
        status: 'completed',
        scheduledWorkoutId: 'scheduled-upper-push-a',
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

    expect(snapshot.habits.percentage).toBe(66.7);
    expect(snapshot.weight?.unit).toBe('lbs');
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
          proteinFloor: {
            actualProteinGrams: null,
            proteinFloorGrams: null,
            remainingToFloorGrams: null,
            amountAboveFloorGrams: null,
            state: 'unavailable',
            isFinal: false,
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

  it('rejects protein macro totals that disagree with the structured floor fact', () => {
    const snapshot = {
      date: '2026-03-09',
      weight: null,
      macros: {
        actual: { calories: 1_800, protein: 150, carbs: 180, fat: 60 },
        target: { calories: 2_200, protein: 180, carbs: 250, fat: 70 },
        proteinFloor: {
          actualProteinGrams: 150,
          proteinFloorGrams: 180,
          remainingToFloorGrams: 30,
          amountAboveFloorGrams: 0,
          state: 'below_floor',
          isFinal: true,
        },
      },
      workout: null,
      habits: { total: 0, completed: 0, percentage: 0 },
    };

    expect(dashboardSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      dashboardSnapshotSchema.safeParse({
        ...snapshot,
        macros: {
          ...snapshot.macros,
          actual: { ...snapshot.macros.actual, protein: 151 },
        },
      }).success,
    ).toBe(false);
    expect(
      dashboardSnapshotSchema.safeParse({
        ...snapshot,
        macros: {
          ...snapshot.macros,
          target: { ...snapshot.macros.target, protein: 181 },
        },
      }).success,
    ).toBe(false);
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
        proteinFloor: {
          actualProteinGrams: 0,
          proteinFloorGrams: 180,
          remainingToFloorGrams: 180,
          amountAboveFloorGrams: 0,
          state: 'below_floor',
          isFinal: false,
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

  it('accepts scheduled and in_progress workout states', () => {
    const scheduledSnapshot = dashboardSnapshotSchema.parse({
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
        proteinFloor: {
          actualProteinGrams: null,
          proteinFloorGrams: null,
          remainingToFloorGrams: null,
          amountAboveFloorGrams: null,
          state: 'unavailable',
          isFinal: false,
        },
      },
      workout: {
        name: 'Lower Strength',
        status: 'scheduled',
        scheduledWorkoutId: 'scheduled-lower-strength',
        templateId: 'template-lower-strength',
        sessionId: null,
        duration: null,
      },
      habits: {
        total: 0,
        completed: 0,
        percentage: 0,
      },
    });

    expect(scheduledSnapshot.workout?.scheduledWorkoutId).toBe('scheduled-lower-strength');

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
          proteinFloor: {
            actualProteinGrams: null,
            proteinFloorGrams: null,
            remainingToFloorGrams: null,
            amountAboveFloorGrams: null,
            state: 'unavailable',
            isFinal: false,
          },
        },
        workout: {
          name: 'Upper Push A',
          status: 'in_progress',
          scheduledWorkoutId: null,
          templateId: 'template-upper-push',
          sessionId: 'session-upper-push',
          duration: 25,
        },
        habits: {
          total: 0,
          completed: 0,
          percentage: 0,
        },
      }),
    ).toBeTruthy();
  });

  it('requires an explicit nullable scheduled workout identity', () => {
    const workout = {
      name: 'Lower Strength',
      status: 'scheduled',
      templateId: 'template-lower-strength',
      sessionId: null,
      duration: null,
    };

    expect(() => dashboardWorkoutSnapshotSchema.parse(workout)).toThrow();
    expect(dashboardWorkoutSnapshotSchema.parse({ ...workout, scheduledWorkoutId: null })).toEqual({
      ...workout,
      scheduledWorkoutId: null,
    });
  });
});

describe('dashboard trend schemas', () => {
  it('parses weight trend points', () => {
    const points = dashboardWeightTrendSchema.parse([
      {
        date: '2026-03-07',
        value: 181.2,
        unit: 'lbs',
      },
    ]);

    const point: DashboardWeightTrendPoint = points[0] as DashboardWeightTrendPoint;
    expect(point.value).toBe(181.2);
  });

  it('parses macro trend points', () => {
    const points = dashboardMacrosTrendSchema.parse([
      {
        date: '2026-03-07',
        calories: 2100,
        protein: 180,
        carbs: 220,
        fat: 70,
      },
    ]);

    const point: DashboardMacrosTrendPoint = points[0] as DashboardMacrosTrendPoint;
    expect(point.calories).toBe(2100);
  });

  it('parses consistency trend points', () => {
    const points = dashboardConsistencyTrendSchema.parse([
      {
        date: '2026-03-07',
        completed: true,
      },
    ]);

    const point: DashboardConsistencyTrendPoint = points[0] as DashboardConsistencyTrendPoint;
    expect(point.completed).toBe(true);
  });
});
