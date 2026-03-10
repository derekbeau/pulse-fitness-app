import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import {
  findAgentContextUser,
  getAgentContextTodayNutrition,
  getAgentContextWeight,
  listAgentContextHabits,
  listAgentContextRecentWorkouts,
  listAgentContextScheduledWorkouts,
} from './context-store.js';

vi.mock('./context-store.js', () => ({
  findAgentContextUser: vi.fn(),
  listAgentContextRecentWorkouts: vi.fn(),
  getAgentContextTodayNutrition: vi.fn(),
  getAgentContextWeight: vi.fn(),
  listAgentContextHabits: vi.fn(),
  listAgentContextScheduledWorkouts: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

describe('agent context route', () => {
  beforeEach(() => {
    vi.mocked(findAgentContextUser).mockReset();
    vi.mocked(listAgentContextRecentWorkouts).mockReset();
    vi.mocked(getAgentContextTodayNutrition).mockReset();
    vi.mocked(getAgentContextWeight).mockReset();
    vi.mocked(listAgentContextHabits).mockReset();
    vi.mocked(listAgentContextScheduledWorkouts).mockReset();
    process.env.JWT_SECRET = 'test-agent-context-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    vi.useRealTimers();
  });

  it('returns 401 without auth', async () => {
    const app = buildServer();

    try {
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/api/agent/context',
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('returns a comprehensive context snapshot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T13:00:00'));

    vi.mocked(findAgentContextUser).mockResolvedValue({
      name: 'Derek',
    });
    vi.mocked(listAgentContextRecentWorkouts).mockResolvedValue([
      {
        id: 'session-1',
        name: 'Upper A',
        date: '2026-03-08',
        completedAt: 1_700_000_000_000,
        exercises: [
          {
            name: 'Bench Press',
            sets: {
              total: 4,
              completed: 4,
              skipped: 0,
            },
          },
        ],
      },
    ]);
    vi.mocked(getAgentContextTodayNutrition).mockResolvedValue({
      actual: {
        calories: 2100,
        protein: 180,
        carbs: 210,
        fat: 70,
      },
      target: {
        calories: 2400,
        protein: 200,
        carbs: 250,
        fat: 80,
      },
      meals: [
        {
          name: 'Lunch',
          items: [
            {
              name: 'Chicken Breast',
              amount: 1.5,
              unit: 'serving',
              calories: 248,
              protein: 46.5,
              carbs: 0,
              fat: 5.4,
            },
          ],
        },
      ],
    });
    vi.mocked(getAgentContextWeight).mockResolvedValue({
      current: 182.4,
      trend7d: -0.8,
    });
    vi.mocked(listAgentContextHabits).mockResolvedValue([
      {
        name: 'Hydrate',
        trackingType: 'numeric',
        streak: 5,
        todayCompleted: true,
      },
    ]);
    vi.mocked(listAgentContextScheduledWorkouts).mockResolvedValue([
      {
        date: '2026-03-10',
        templateName: 'Lower A',
      },
    ]);

    const app = buildServer();

    try {
      await app.ready();

      const token = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/agent/context',
        headers: createAuthorizationHeader(token),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          user: {
            name: 'Derek',
          },
          recentWorkouts: [
            {
              id: 'session-1',
              name: 'Upper A',
              date: '2026-03-08',
              completedAt: 1_700_000_000_000,
              exercises: [
                {
                  name: 'Bench Press',
                  sets: {
                    total: 4,
                    completed: 4,
                    skipped: 0,
                  },
                },
              ],
            },
          ],
          todayNutrition: {
            actual: {
              calories: 2100,
              protein: 180,
              carbs: 210,
              fat: 70,
            },
            target: {
              calories: 2400,
              protein: 200,
              carbs: 250,
              fat: 80,
            },
            meals: [
              {
                name: 'Lunch',
                items: [
                  {
                    name: 'Chicken Breast',
                    amount: 1.5,
                    unit: 'serving',
                    calories: 248,
                    protein: 46.5,
                    carbs: 0,
                    fat: 5.4,
                  },
                ],
              },
            ],
          },
          weight: {
            current: 182.4,
            trend7d: -0.8,
          },
          habits: [
            {
              name: 'Hydrate',
              trackingType: 'numeric',
              streak: 5,
              todayCompleted: true,
            },
          ],
          scheduledWorkouts: [
            {
              date: '2026-03-10',
              templateName: 'Lower A',
            },
          ],
        },
      });

      expect(vi.mocked(findAgentContextUser)).toHaveBeenCalledWith('user-1');
      expect(vi.mocked(listAgentContextRecentWorkouts)).toHaveBeenCalledWith('user-1', 5);
      expect(vi.mocked(getAgentContextTodayNutrition)).toHaveBeenCalledWith('user-1', '2026-03-09');
      expect(vi.mocked(getAgentContextWeight)).toHaveBeenCalledWith('user-1');
      expect(vi.mocked(listAgentContextHabits)).toHaveBeenCalledWith('user-1', '2026-03-09');
      expect(vi.mocked(listAgentContextScheduledWorkouts)).toHaveBeenCalledWith({
        userId: 'user-1',
        from: '2026-03-09',
        to: '2026-03-15',
      });
    } finally {
      await app.close();
    }
  });

  it('returns null user name and empty arrays when no context data exists', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T09:30:00'));

    vi.mocked(findAgentContextUser).mockResolvedValue({
      name: null,
    });
    vi.mocked(listAgentContextRecentWorkouts).mockResolvedValue([]);
    vi.mocked(getAgentContextTodayNutrition).mockResolvedValue({
      actual: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      target: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      meals: [],
    });
    vi.mocked(getAgentContextWeight).mockResolvedValue({
      current: 0,
      trend7d: 0,
    });
    vi.mocked(listAgentContextHabits).mockResolvedValue([]);
    vi.mocked(listAgentContextScheduledWorkouts).mockResolvedValue([]);

    const app = buildServer();

    try {
      await app.ready();

      const token = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/agent/context',
        headers: createAuthorizationHeader(token),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          user: { name: null },
          recentWorkouts: [],
          todayNutrition: {
            actual: { calories: 0, protein: 0, carbs: 0, fat: 0 },
            target: { calories: 0, protein: 0, carbs: 0, fat: 0 },
            meals: [],
          },
          weight: { current: 0, trend7d: 0 },
          habits: [],
          scheduledWorkouts: [],
        },
      });
    } finally {
      await app.close();
    }
  });

  it('returns 500 when context payload fails schema validation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T09:30:00'));

    vi.mocked(findAgentContextUser).mockResolvedValue({
      name: 'Derek',
    });
    vi.mocked(listAgentContextRecentWorkouts).mockResolvedValue([]);
    vi.mocked(getAgentContextTodayNutrition).mockResolvedValue({
      actual: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      target: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      meals: [],
    });
    vi.mocked(getAgentContextWeight).mockResolvedValue({
      current: 0,
      trend7d: 0,
    });
    vi.mocked(listAgentContextHabits).mockResolvedValue([]);
    vi.mocked(listAgentContextScheduledWorkouts).mockResolvedValue([
      {
        date: 'invalid-date',
        templateName: 'Lower A',
      },
    ]);

    const app = buildServer();

    try {
      await app.ready();

      const token = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/agent/context',
        headers: createAuthorizationHeader(token),
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to build agent context payload',
        },
      });
    } finally {
      await app.close();
    }
  });
});
