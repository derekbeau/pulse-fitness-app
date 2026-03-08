import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import {
  createHabit,
  findHabitById,
  getNextHabitSortOrder,
  listActiveHabits,
  reorderHabits,
  softDeleteHabit,
  updateHabit,
} from './store.js';

vi.mock('./store.js', () => ({
  createHabit: vi.fn(),
  findHabitById: vi.fn(),
  getNextHabitSortOrder: vi.fn(),
  listActiveHabits: vi.fn(),
  reorderHabits: vi.fn(),
  softDeleteHabit: vi.fn(),
  updateHabit: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

describe('habit routes', () => {
  beforeEach(() => {
    vi.mocked(createHabit).mockReset();
    vi.mocked(findHabitById).mockReset();
    vi.mocked(getNextHabitSortOrder).mockReset();
    vi.mocked(listActiveHabits).mockReset();
    vi.mocked(reorderHabits).mockReset();
    vi.mocked(softDeleteHabit).mockReset();
    vi.mocked(updateHabit).mockReset();
    process.env.JWT_SECRET = 'test-habit-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('creates a habit for the authenticated user with the next sort order', async () => {
    vi.mocked(getNextHabitSortOrder).mockResolvedValue(3);
    vi.mocked(createHabit).mockImplementation(async (input) => ({
      ...input,
      emoji: input.emoji ?? null,
      target: input.target ?? null,
      unit: input.unit ?? null,
      active: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    }));

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/habits',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: ' Water ',
          emoji: ' 💧 ',
          trackingType: 'numeric',
          target: 8,
          unit: ' glasses ',
        },
      });

      expect(response.statusCode).toBe(201);

      const payload = response.json() as {
        data: {
          id: string;
          userId: string;
          name: string;
          emoji: string | null;
          trackingType: string;
          target: number | null;
          unit: string | null;
          sortOrder: number;
          active: boolean;
        };
      };

      expect(payload.data).toMatchObject({
        userId: 'user-1',
        name: 'Water',
        emoji: '💧',
        trackingType: 'numeric',
        target: 8,
        unit: 'glasses',
        sortOrder: 3,
        active: true,
      });
      expect(payload.data.id).toBeTruthy();
      expect(vi.mocked(getNextHabitSortOrder)).toHaveBeenCalledWith('user-1');
      expect(vi.mocked(createHabit)).toHaveBeenCalledWith({
        id: payload.data.id,
        userId: 'user-1',
        name: 'Water',
        emoji: '💧',
        trackingType: 'numeric',
        target: 8,
        unit: 'glasses',
        sortOrder: 3,
      });
    } finally {
      await app.close();
    }
  });

  it('lists the authenticated users active habits sorted by sort order', async () => {
    vi.mocked(listActiveHabits).mockResolvedValue([
      {
        id: 'habit-2',
        userId: 'user-1',
        name: 'Water',
        emoji: '💧',
        trackingType: 'numeric',
        target: 8,
        unit: 'glasses',
        sortOrder: 0,
        active: true,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
      {
        id: 'habit-1',
        userId: 'user-1',
        name: 'Sleep',
        emoji: '😴',
        trackingType: 'time',
        target: 8,
        unit: 'hours',
        sortOrder: 1,
        active: true,
        createdAt: 1_700_000_100_000,
        updatedAt: 1_700_000_100_000,
      },
    ]);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/habits',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: [
          {
            id: 'habit-2',
            userId: 'user-1',
            name: 'Water',
            emoji: '💧',
            trackingType: 'numeric',
            target: 8,
            unit: 'glasses',
            sortOrder: 0,
            active: true,
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_000,
          },
          {
            id: 'habit-1',
            userId: 'user-1',
            name: 'Sleep',
            emoji: '😴',
            trackingType: 'time',
            target: 8,
            unit: 'hours',
            sortOrder: 1,
            active: true,
            createdAt: 1_700_000_100_000,
            updatedAt: 1_700_000_100_000,
          },
        ],
      });
      expect(vi.mocked(listActiveHabits)).toHaveBeenCalledWith('user-1');
    } finally {
      await app.close();
    }
  });

  it('updates a habit only when it belongs to the authenticated user', async () => {
    vi.mocked(findHabitById).mockResolvedValue({
      id: 'habit-1',
      userId: 'user-1',
      name: 'Sleep',
      emoji: '😴',
      trackingType: 'time',
      target: 8,
      unit: 'hours',
      sortOrder: 1,
      active: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    vi.mocked(updateHabit).mockResolvedValue({
      id: 'habit-1',
      userId: 'user-1',
      name: 'Evening sleep',
      emoji: '😴',
      trackingType: 'time',
      target: 8.5,
      unit: 'hours',
      sortOrder: 1,
      active: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/habits/habit-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: ' Evening sleep ',
          target: 8.5,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          id: 'habit-1',
          userId: 'user-1',
          name: 'Evening sleep',
          emoji: '😴',
          trackingType: 'time',
          target: 8.5,
          unit: 'hours',
          sortOrder: 1,
          active: true,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_100_000,
        },
      });
      expect(vi.mocked(findHabitById)).toHaveBeenCalledWith('habit-1', 'user-1');
      expect(vi.mocked(updateHabit)).toHaveBeenCalledWith('habit-1', 'user-1', {
        name: 'Evening sleep',
        emoji: '😴',
        trackingType: 'time',
        target: 8.5,
        unit: 'hours',
      });
    } finally {
      await app.close();
    }
  });

  it('returns not found when updating a habit outside the user scope', async () => {
    vi.mocked(findHabitById).mockResolvedValue(undefined);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/habits/habit-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: 'Water',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'HABIT_NOT_FOUND',
          message: 'Habit not found',
        },
      });
      expect(vi.mocked(updateHabit)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('soft deletes a habit within the authenticated user scope', async () => {
    vi.mocked(softDeleteHabit).mockResolvedValue(true);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/habits/habit-1',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          success: true,
        },
      });
      expect(vi.mocked(softDeleteHabit)).toHaveBeenCalledWith('habit-1', 'user-1');
    } finally {
      await app.close();
    }
  });

  it('reorders habits when every id belongs to the authenticated user', async () => {
    vi.mocked(reorderHabits).mockResolvedValue(true);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/habits/reorder',
        headers: createAuthorizationHeader(authToken),
        payload: {
          items: [
            { id: 'habit-1', sortOrder: 1 },
            { id: 'habit-2', sortOrder: 0 },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          success: true,
        },
      });
      expect(vi.mocked(reorderHabits)).toHaveBeenCalledWith('user-1', [
        { id: 'habit-1', sortOrder: 1 },
        { id: 'habit-2', sortOrder: 0 },
      ]);
    } finally {
      await app.close();
    }
  });

  it('requires authentication for every habits endpoint', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const responses = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/habits',
          payload: {
            name: 'Water',
            trackingType: 'boolean',
          },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/habits',
        }),
        app.inject({
          method: 'PUT',
          url: '/api/v1/habits/habit-1',
          payload: {
            name: 'Water',
          },
        }),
        app.inject({
          method: 'DELETE',
          url: '/api/v1/habits/habit-1',
        }),
        app.inject({
          method: 'PATCH',
          url: '/api/v1/habits/reorder',
          payload: {
            items: [{ id: 'habit-1', sortOrder: 0 }],
          },
        }),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }
    } finally {
      await app.close();
    }
  });

  it('rejects invalid create and reorder payloads', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const [createResponse, reorderResponse] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/habits',
          headers: createAuthorizationHeader(authToken),
          payload: {
            name: 'Water',
            trackingType: 'numeric',
          },
        }),
        app.inject({
          method: 'PATCH',
          url: '/api/v1/habits/reorder',
          headers: createAuthorizationHeader(authToken),
          payload: {
            items: [
              { id: 'habit-1', sortOrder: 0 },
              { id: 'habit-1', sortOrder: 1 },
            ],
          },
        }),
      ]);

      expect(createResponse.statusCode).toBe(400);
      expect(createResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid habit payload',
        },
      });
      expect(reorderResponse.statusCode).toBe(400);
      expect(reorderResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid reorder payload',
        },
      });
    } finally {
      await app.close();
    }
  });
});
