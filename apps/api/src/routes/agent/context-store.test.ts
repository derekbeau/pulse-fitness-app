import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  const getQueue: unknown[] = [];
  const allQueue: unknown[] = [];

  const db = {
    select: vi.fn(() => {
      const query = {
        from: vi.fn(() => query),
        leftJoin: vi.fn(() => query),
        innerJoin: vi.fn(() => query),
        where: vi.fn(() => query),
        orderBy: vi.fn(() => query),
        limit: vi.fn(() => query),
        get: vi.fn(() => getQueue.shift()),
        all: vi.fn(() => allQueue.shift() ?? []),
      };

      return query;
    }),
  };

  return {
    db,
    getQueue,
    allQueue,
    reset() {
      getQueue.length = 0;
      allQueue.length = 0;
      db.select.mockClear();
    },
  };
});

vi.mock('../../db/index.js', () => ({
  db: testState.db,
}));

describe('agent context store', () => {
  beforeEach(() => {
    testState.reset();
  });

  it('aggregates recent workouts by exercise with set summary counts', async () => {
    const { listAgentContextRecentWorkouts } = await import('./context-store.js');

    testState.allQueue.push(
      [
        {
          id: 'session-1',
          name: 'Push Day',
          date: '2026-03-08',
          completedAt: 1000,
          startedAt: 500,
          createdAt: 400,
        },
      ],
      [
        {
          sessionId: 'session-1',
          exerciseName: 'Bench Press',
          completed: true,
          skipped: false,
          createdAt: 600,
          setNumber: 1,
        },
        {
          sessionId: 'session-1',
          exerciseName: 'Bench Press',
          completed: true,
          skipped: false,
          createdAt: 700,
          setNumber: 2,
        },
        {
          sessionId: 'session-1',
          exerciseName: 'Cable Fly',
          completed: false,
          skipped: true,
          createdAt: 800,
          setNumber: 1,
        },
      ],
    );

    const workouts = await listAgentContextRecentWorkouts('user-1');

    expect(workouts).toEqual([
      {
        id: 'session-1',
        name: 'Push Day',
        date: '2026-03-08',
        completedAt: 1000,
        exercises: [
          {
            name: 'Bench Press',
            sets: {
              total: 2,
              completed: 2,
              skipped: 0,
            },
          },
          {
            name: 'Cable Fly',
            sets: {
              total: 1,
              completed: 0,
              skipped: 1,
            },
          },
        ],
      },
    ]);
  });

  it('calculates weight trend from the latest and reference entry', async () => {
    const { getAgentContextWeight } = await import('./context-store.js');

    testState.getQueue.push(
      {
        date: '2026-03-09',
        weight: 182.4,
      },
      {
        weight: 183.1,
      },
    );

    const weight = await getAgentContextWeight('user-1');

    expect(weight).toEqual({
      current: 182.4,
      trend7d: -0.7,
    });
  });

  it('returns zeroed weight values when no weight data exists', async () => {
    const { getAgentContextWeight } = await import('./context-store.js');

    testState.getQueue.push(undefined);

    await expect(getAgentContextWeight('user-1')).resolves.toEqual({
      current: 0,
      trend7d: 0,
    });
  });

  it('calculates habit streak ending at today or yesterday', async () => {
    const { listAgentContextHabits } = await import('./context-store.js');

    testState.allQueue.push(
      [
        {
          id: 'habit-1',
          name: 'Hydrate',
          trackingType: 'numeric',
          sortOrder: 0,
          createdAt: 1,
        },
        {
          id: 'habit-2',
          name: 'Walk',
          trackingType: 'boolean',
          sortOrder: 1,
          createdAt: 2,
        },
      ],
      [
        { habitId: 'habit-1', date: '2026-03-09' },
        { habitId: 'habit-1', date: '2026-03-08' },
        { habitId: 'habit-1', date: '2026-03-07' },
        { habitId: 'habit-2', date: '2026-03-08' },
        { habitId: 'habit-2', date: '2026-03-07' },
      ],
    );

    const habits = await listAgentContextHabits('user-1', '2026-03-09');

    expect(habits).toEqual([
      {
        name: 'Hydrate',
        trackingType: 'numeric',
        streak: 3,
        todayCompleted: true,
      },
      {
        name: 'Walk',
        trackingType: 'boolean',
        streak: 2,
        todayCompleted: false,
      },
    ]);
  });

  it('maps scheduled workouts and falls back template names when missing', async () => {
    const { listAgentContextScheduledWorkouts } = await import('./context-store.js');

    testState.allQueue.push([
      {
        date: '2026-03-10',
        templateName: 'Upper A',
        createdAt: 1,
      },
      {
        date: '2026-03-11',
        templateName: null,
        createdAt: 2,
      },
    ]);

    const workouts = await listAgentContextScheduledWorkouts({
      userId: 'user-1',
      from: '2026-03-09',
      to: '2026-03-15',
    });

    expect(workouts).toEqual([
      {
        date: '2026-03-10',
        templateName: 'Upper A',
      },
      {
        date: '2026-03-11',
        templateName: 'Unknown template',
      },
    ]);
  });
});
