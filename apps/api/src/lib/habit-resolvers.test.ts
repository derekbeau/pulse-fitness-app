import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Habit } from '@pulse/shared';

const testState = vi.hoisted(() => {
  const getQueue: unknown[] = [];

  const db = {
    select: vi.fn(() => {
      const query = {
        from: vi.fn(() => query),
        leftJoin: vi.fn(() => query),
        innerJoin: vi.fn(() => query),
        where: vi.fn(() => query),
        limit: vi.fn(() => query),
        get: vi.fn(() => getQueue.shift()),
      };

      return query;
    }),
  };

  return {
    db,
    getQueue,
    reset() {
      getQueue.length = 0;
      db.select.mockClear();
    },
  };
});

vi.mock('../db/index.js', () => ({
  db: testState.db,
}));

const createHabit = (overrides: Partial<Habit> = {}): Habit => ({
  id: 'habit-1',
  userId: 'user-1',
  name: 'Habit',
  description: null,
  emoji: null,
  trackingType: 'boolean',
  target: null,
  unit: null,
  frequency: 'daily',
  frequencyTarget: null,
  scheduledDays: null,
  pausedUntil: null,
  sortOrder: 0,
  active: true,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe('habit resolvers', () => {
  beforeEach(() => {
    testState.reset();
  });

  it('returns completed for weight resolver when a body weight row exists for the date', async () => {
    const { resolveHabitCompletion } = await import('./habit-resolvers.js');

    testState.getQueue.push({ id: 'weight-1' });

    const result = await resolveHabitCompletion(
      createHabit({
        referenceSource: 'weight',
        referenceConfig: { condition: 'exists_today' },
      }),
      'user-1',
      '2026-03-09',
    );

    expect(result).toEqual({ completed: true });
  });

  it('evaluates nutrition_daily protein >= 150 correctly', async () => {
    const { resolveHabitCompletion } = await import('./habit-resolvers.js');

    testState.getQueue.push({
      calories: 2_100,
      protein: 160,
      carbs: 200,
      fat: 70,
    });

    const result = await resolveHabitCompletion(
      createHabit({
        referenceSource: 'nutrition_daily',
        referenceConfig: {
          field: 'protein',
          op: 'gte',
          value: 150,
        },
      }),
      'user-1',
      '2026-03-09',
    );

    expect(result).toEqual({ completed: true, value: 160 });
  });

  it('returns completed for workout resolver when a completed session exists for the date', async () => {
    const { resolveHabitCompletion } = await import('./habit-resolvers.js');

    testState.getQueue.push({ id: 'session-1' });

    const result = await resolveHabitCompletion(
      createHabit({
        referenceSource: 'workout',
        referenceConfig: { condition: 'session_completed_today' },
      }),
      'user-1',
      '2026-03-09',
    );

    expect(result).toEqual({ completed: true });
  });

  it('handles missing source rows gracefully by resolving as not completed', async () => {
    const { resolveHabitCompletion } = await import('./habit-resolvers.js');

    testState.getQueue.push(undefined);

    const result = await resolveHabitCompletion(
      createHabit({
        referenceSource: 'weight',
        referenceConfig: { condition: 'exists_today' },
      }),
      'user-1',
      '2026-03-09',
    );

    expect(result).toEqual({ completed: false });
  });
});
