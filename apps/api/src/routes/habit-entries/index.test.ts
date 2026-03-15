import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { findHabitById } from '../habits/store.js';

import {
  findHabitEntryByHabitAndDate,
  listHabitEntriesByDateRange,
  listHabitEntriesForHabitByDateRange,
  updateHabitEntry,
  upsertHabitEntry,
} from './store.js';

vi.mock('../habits/store.js', () => ({
  findHabitById: vi.fn(),
}));

vi.mock('./store.js', () => ({
  findHabitEntryByHabitAndDate: vi.fn(),
  listHabitEntriesByDateRange: vi.fn(),
  listHabitEntriesForHabitByDateRange: vi.fn(),
  updateHabitEntry: vi.fn(),
  upsertHabitEntry: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

describe('habit entry routes', () => {
  beforeEach(() => {
    vi.mocked(findHabitById).mockReset();
    vi.mocked(findHabitEntryByHabitAndDate).mockReset();
    vi.mocked(listHabitEntriesByDateRange).mockReset();
    vi.mocked(listHabitEntriesForHabitByDateRange).mockReset();
    vi.mocked(updateHabitEntry).mockReset();
    vi.mocked(upsertHabitEntry).mockReset();
    process.env.JWT_SECRET = 'test-habit-entry-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('upserts a habit entry for a habit within the authenticated user scope', async () => {
    vi.mocked(findHabitById).mockResolvedValue({
      id: 'habit-1',
      userId: 'user-1',
      name: 'Water',
      description: null,
      emoji: '💧',
      trackingType: 'numeric',
      target: 8,
      unit: 'glasses',
      frequency: 'daily',
      frequencyTarget: null,
      scheduledDays: null,
      pausedUntil: null,
      sortOrder: 0,
      active: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    vi.mocked(upsertHabitEntry).mockImplementation(async ({ id, habitId, userId, date }) => ({
      id,
      habitId,
      userId,
      date,
      completed: true,
      value: 8,
      isOverride: false,
      createdAt: 1_700_000_100_000,
    }));

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/habits/habit-1/entries',
        headers: createAuthorizationHeader(authToken),
        payload: {
          date: '2026-03-07',
          completed: true,
          value: 8,
        },
      });

      expect(response.statusCode).toBe(201);

      const payload = response.json() as {
        data: {
          id: string;
          habitId: string;
          userId: string;
          date: string;
          completed: boolean;
          value: number | null;
          isOverride: boolean;
          createdAt: number;
        };
      };

      expect(payload.data).toMatchObject({
        habitId: 'habit-1',
        userId: 'user-1',
        date: '2026-03-07',
        completed: true,
        value: 8,
        isOverride: false,
        createdAt: 1_700_000_100_000,
      });
      expect(payload.data.id).toBeTruthy();
      expect(vi.mocked(findHabitById)).toHaveBeenCalledWith('habit-1', 'user-1');
      expect(vi.mocked(upsertHabitEntry)).toHaveBeenCalledWith({
        id: payload.data.id,
        habitId: 'habit-1',
        userId: 'user-1',
        date: '2026-03-07',
        completed: true,
        value: 8,
      });
    } finally {
      await app.close();
    }
  });

  it('lists all habit entries for the authenticated user within a date range', async () => {
    vi.mocked(listHabitEntriesByDateRange).mockResolvedValue([
      {
        id: 'entry-1',
        habitId: 'habit-1',
        userId: 'user-1',
        date: '2026-03-06',
        completed: true,
        value: null,
        isOverride: false,
        createdAt: 1_700_000_000_000,
      },
      {
        id: 'entry-2',
        habitId: 'habit-2',
        userId: 'user-1',
        date: '2026-03-07',
        completed: true,
        value: 8,
        isOverride: false,
        createdAt: 1_700_000_100_000,
      },
    ]);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/habit-entries?from=2026-03-01&to=2026-03-07',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: [
          {
            id: 'entry-1',
            habitId: 'habit-1',
            userId: 'user-1',
            date: '2026-03-06',
            completed: true,
            value: null,
            isOverride: false,
            createdAt: 1_700_000_000_000,
          },
          {
            id: 'entry-2',
            habitId: 'habit-2',
            userId: 'user-1',
            date: '2026-03-07',
            completed: true,
            value: 8,
            isOverride: false,
            createdAt: 1_700_000_100_000,
          },
        ],
      });
      expect(vi.mocked(listHabitEntriesByDateRange)).toHaveBeenCalledWith(
        'user-1',
        '2026-03-01',
        '2026-03-07',
      );
    } finally {
      await app.close();
    }
  });

  it('patch-upserts habit entries by date for unified agent flows', async () => {
    vi.mocked(findHabitById).mockResolvedValue({
      id: 'habit-1',
      userId: 'user-1',
      name: 'Water',
      description: null,
      emoji: '💧',
      trackingType: 'numeric',
      target: 8,
      unit: 'glasses',
      frequency: 'daily',
      frequencyTarget: null,
      scheduledDays: null,
      pausedUntil: null,
      sortOrder: 0,
      active: true,
      referenceSource: 'weight',
      referenceConfig: { condition: 'exists_today' },
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(findHabitEntryByHabitAndDate).mockResolvedValue(undefined);
    vi.mocked(upsertHabitEntry).mockResolvedValue({
      id: 'entry-1',
      habitId: 'habit-1',
      userId: 'user-1',
      date: '2026-03-07',
      completed: true,
      value: 8,
      isOverride: true,
      createdAt: 1,
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/habits/habit-1/entries',
        headers: createAuthorizationHeader(authToken),
        payload: {
          date: '2026-03-07',
          completed: true,
          value: 8,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        data: {
          id: 'entry-1',
          habitId: 'habit-1',
          userId: 'user-1',
          date: '2026-03-07',
          completed: true,
          value: 8,
          isOverride: true,
          createdAt: 1,
        },
      });
      expect(vi.mocked(findHabitEntryByHabitAndDate)).toHaveBeenCalledWith(
        'habit-1',
        'user-1',
        '2026-03-07',
      );
    } finally {
      await app.close();
    }
  });

  it('lists entries for a specific habit only when that habit belongs to the user', async () => {
    vi.mocked(findHabitById).mockResolvedValue({
      id: 'habit-1',
      userId: 'user-1',
      name: 'Meditate',
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
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    vi.mocked(listHabitEntriesForHabitByDateRange).mockResolvedValue([
      {
        id: 'entry-1',
        habitId: 'habit-1',
        userId: 'user-1',
        date: '2026-03-05',
        completed: true,
        value: null,
        isOverride: false,
        createdAt: 1_700_000_000_000,
      },
    ]);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/habits/habit-1/entries?from=2026-03-01&to=2026-03-07',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: [
          {
            id: 'entry-1',
            habitId: 'habit-1',
            userId: 'user-1',
            date: '2026-03-05',
            completed: true,
            value: null,
            isOverride: false,
            createdAt: 1_700_000_000_000,
          },
        ],
      });
      expect(vi.mocked(listHabitEntriesForHabitByDateRange)).toHaveBeenCalledWith(
        'habit-1',
        'user-1',
        '2026-03-01',
        '2026-03-07',
      );
    } finally {
      await app.close();
    }
  });

  it('patches an existing habit entry within the authenticated user scope', async () => {
    vi.mocked(updateHabitEntry).mockResolvedValue({
      id: 'entry-1',
      habitId: 'habit-1',
      userId: 'user-1',
      date: '2026-03-07',
      completed: false,
      value: 6,
      isOverride: false,
      createdAt: 1_700_000_000_000,
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/habit-entries/entry-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          completed: false,
          value: 6,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          id: 'entry-1',
          habitId: 'habit-1',
          userId: 'user-1',
          date: '2026-03-07',
          completed: false,
          value: 6,
          isOverride: false,
          createdAt: 1_700_000_000_000,
        },
      });
      expect(vi.mocked(updateHabitEntry)).toHaveBeenCalledWith('entry-1', 'user-1', {
        completed: false,
        value: 6,
      });
    } finally {
      await app.close();
    }
  });

  it('returns not found when posting or querying entries for a habit outside the user scope', async () => {
    vi.mocked(findHabitById).mockResolvedValue(undefined);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const [createResponse, listResponse] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/habits/habit-1/entries',
          headers: createAuthorizationHeader(authToken),
          payload: {
            date: '2026-03-07',
            completed: true,
          },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/habits/habit-1/entries?from=2026-03-01&to=2026-03-07',
          headers: createAuthorizationHeader(authToken),
        }),
      ]);

      expect(createResponse.statusCode).toBe(404);
      expect(createResponse.json()).toEqual({
        error: {
          code: 'HABIT_NOT_FOUND',
          message: 'Habit not found',
        },
      });
      expect(listResponse.statusCode).toBe(404);
      expect(listResponse.json()).toEqual({
        error: {
          code: 'HABIT_NOT_FOUND',
          message: 'Habit not found',
        },
      });
      expect(vi.mocked(upsertHabitEntry)).not.toHaveBeenCalled();
      expect(vi.mocked(listHabitEntriesForHabitByDateRange)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns not found when patching an entry outside the user scope', async () => {
    vi.mocked(updateHabitEntry).mockResolvedValue(undefined);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/habit-entries/entry-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          completed: true,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'HABIT_ENTRY_NOT_FOUND',
          message: 'Habit entry not found',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('requires authentication for every habit entry endpoint', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const responses = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/habits/habit-1/entries',
          payload: {
            date: '2026-03-07',
            completed: true,
          },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/habit-entries?from=2026-03-01&to=2026-03-07',
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/habits/habit-1/entries?from=2026-03-01&to=2026-03-07',
        }),
        app.inject({
          method: 'PATCH',
          url: '/api/v1/habit-entries/entry-1',
          payload: {
            completed: true,
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

  it('rejects invalid payloads and query params', async () => {
    vi.mocked(findHabitById).mockResolvedValue({
      id: 'habit-1',
      userId: 'user-1',
      name: 'Water',
      description: null,
      emoji: '💧',
      trackingType: 'numeric',
      target: 8,
      unit: 'glasses',
      frequency: 'daily',
      frequencyTarget: null,
      scheduledDays: null,
      pausedUntil: null,
      sortOrder: 0,
      active: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const [createResponse, listResponse, patchResponse] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/habits/habit-1/entries',
          headers: createAuthorizationHeader(authToken),
          payload: {
            date: '03/07/2026',
            completed: true,
          },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/habit-entries?from=2026-03-08&to=2026-03-07',
          headers: createAuthorizationHeader(authToken),
        }),
        app.inject({
          method: 'PATCH',
          url: '/api/v1/habit-entries/entry-1',
          headers: createAuthorizationHeader(authToken),
          payload: {},
        }),
      ]);

      expect(createResponse.statusCode).toBe(400);
      expect(createResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid habit entry payload',
        },
      });
      expect(listResponse.statusCode).toBe(400);
      expect(listResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid habit entry query params',
        },
      });
      expect(patchResponse.statusCode).toBe(400);
      expect(patchResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid habit entry payload',
        },
      });
      expect(vi.mocked(upsertHabitEntry)).not.toHaveBeenCalled();
      expect(vi.mocked(updateHabitEntry)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
