import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { resolveHabitCompletion } from '../../lib/habit-resolvers.js';
import { findUserAuthById } from '../../middleware/store.js';
import { listHabitEntriesByDateRange } from '../habit-entries/store.js';
import {
  createHabit,
  findHabitById,
  getNextHabitSortOrder,
  listActiveHabits,
  reorderHabits,
  softDeleteHabit,
  updateHabit,
} from './store.js';
import { ensureStarterHabitsForUser } from '../auth/store.js';

vi.mock('./store.js', () => ({
  createHabit: vi.fn(),
  findHabitById: vi.fn(),
  getNextHabitSortOrder: vi.fn(),
  listActiveHabits: vi.fn(),
  reorderHabits: vi.fn(),
  softDeleteHabit: vi.fn(),
  updateHabit: vi.fn(),
}));
vi.mock('../../middleware/store.js', () => ({
  findUserAuthById: vi.fn(),
}));
vi.mock('../auth/store.js', () => ({
  ensureStarterHabitsForUser: vi.fn(),
}));
vi.mock('../habit-entries/store.js', () => ({
  findHabitEntryById: vi.fn(),
  findHabitEntryByHabitAndDate: vi.fn(),
  upsertHabitEntry: vi.fn(),
  listHabitEntriesByDateRange: vi.fn(),
  listHabitEntriesForHabitByDateRange: vi.fn(),
  updateHabitEntry: vi.fn(),
}));
vi.mock('../../lib/habit-resolvers.js', () => ({
  resolveHabitCompletion: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

const expectRequestValidationError = (
  response: { json(): unknown },
  method: string,
  url: string,
) => {
  expect(response.json()).toMatchObject({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: {
        method,
        url,
      },
    },
  });
};

describe('habit routes', () => {
  beforeEach(() => {
    vi.mocked(createHabit).mockReset();
    vi.mocked(findHabitById).mockReset();
    vi.mocked(getNextHabitSortOrder).mockReset();
    vi.mocked(listActiveHabits).mockReset();
    vi.mocked(reorderHabits).mockReset();
    vi.mocked(softDeleteHabit).mockReset();
    vi.mocked(updateHabit).mockReset();
    vi.mocked(findUserAuthById).mockReset();
    vi.mocked(listHabitEntriesByDateRange).mockReset();
    vi.mocked(resolveHabitCompletion).mockReset();
    vi.mocked(findUserAuthById).mockResolvedValue({ id: 'user-1' });
    vi.mocked(ensureStarterHabitsForUser).mockReset();
    vi.mocked(ensureStarterHabitsForUser).mockResolvedValue(undefined);
    process.env.JWT_SECRET = 'test-habit-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('creates a habit for the authenticated user with the next sort order', async () => {
    vi.mocked(getNextHabitSortOrder).mockResolvedValue(3);
    vi.mocked(createHabit).mockImplementation(async (input) => ({
      ...input,
      description: input.description ?? null,
      emoji: input.emoji ?? null,
      target: input.target ?? null,
      unit: input.unit ?? null,
      frequency: input.frequency ?? 'daily',
      frequencyTarget: input.frequencyTarget ?? null,
      scheduledDays: input.scheduledDays ?? null,
      pausedUntil: input.pausedUntil ?? null,
      active: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    }));

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
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
    vi.mocked(listHabitEntriesByDateRange).mockResolvedValue([]);
    vi.mocked(listActiveHabits).mockResolvedValue([
      {
        id: 'habit-2',
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
      },
      {
        id: 'habit-1',
        userId: 'user-1',
        name: 'Sleep',
        description: null,
        emoji: '😴',
        trackingType: 'time',
        target: 8,
        unit: 'hours',
        frequency: 'daily',
        frequencyTarget: null,
        scheduledDays: null,
        pausedUntil: null,
        sortOrder: 1,
        active: true,
        createdAt: 1_700_000_100_000,
        updatedAt: 1_700_000_100_000,
      },
    ]);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
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
            todayEntry: null,
          },
          {
            id: 'habit-1',
            userId: 'user-1',
            name: 'Sleep',
            description: null,
            emoji: '😴',
            trackingType: 'time',
            target: 8,
            unit: 'hours',
            frequency: 'daily',
            frequencyTarget: null,
            scheduledDays: null,
            pausedUntil: null,
            sortOrder: 1,
            active: true,
            createdAt: 1_700_000_100_000,
            updatedAt: 1_700_000_100_000,
            todayEntry: null,
          },
        ],
      });
      expect(vi.mocked(listActiveHabits)).toHaveBeenCalledWith('user-1');
      expect(vi.mocked(resolveHabitCompletion)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('uses manual override entries before referential resolver results', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    vi.mocked(listActiveHabits).mockResolvedValue([
      {
        id: 'habit-1',
        userId: 'user-1',
        name: 'Protein',
        description: null,
        emoji: null,
        trackingType: 'boolean',
        target: null,
        unit: null,
        frequency: 'daily',
        frequencyTarget: null,
        scheduledDays: null,
        pausedUntil: null,
        referenceSource: 'nutrition_daily',
        referenceConfig: { field: 'protein', op: 'gte', value: 150 },
        sortOrder: 0,
        active: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    vi.mocked(listHabitEntriesByDateRange).mockResolvedValue([
      {
        id: 'entry-1',
        habitId: 'habit-1',
        userId: 'user-1',
        date: '2026-03-09',
        completed: false,
        value: 120,
        isOverride: true,
        createdAt: 2,
      },
    ]);
    vi.mocked(resolveHabitCompletion).mockResolvedValue({ completed: true, value: 160 });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/habits',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: [
          expect.objectContaining({
            id: 'habit-1',
            todayEntry: {
              completed: false,
              value: 120,
              isOverride: true,
            },
          }),
        ],
      });
      expect(vi.mocked(resolveHabitCompletion)).not.toHaveBeenCalled();
    } finally {
      await app.close();
      vi.useRealTimers();
    }
  });

  it('resolves referential habits when no override entry exists', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    vi.mocked(listActiveHabits).mockResolvedValue([
      {
        id: 'habit-1',
        userId: 'user-1',
        name: 'Weigh in',
        description: null,
        emoji: null,
        trackingType: 'boolean',
        target: null,
        unit: null,
        frequency: 'daily',
        frequencyTarget: null,
        scheduledDays: null,
        pausedUntil: null,
        referenceSource: 'weight',
        referenceConfig: { condition: 'exists_today' },
        sortOrder: 0,
        active: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    vi.mocked(listHabitEntriesByDateRange).mockResolvedValue([]);
    vi.mocked(resolveHabitCompletion).mockResolvedValue({ completed: true });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/habits',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: [
          expect.objectContaining({
            id: 'habit-1',
            todayEntry: {
              completed: true,
              value: null,
              isOverride: false,
            },
          }),
        ],
      });
      expect(vi.mocked(resolveHabitCompletion)).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'habit-1' }),
        'user-1',
        '2026-03-09',
      );
    } finally {
      await app.close();
      vi.useRealTimers();
    }
  });

  it('keeps non-referential habits driven by manual entries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    vi.mocked(listActiveHabits).mockResolvedValue([
      {
        id: 'habit-1',
        userId: 'user-1',
        name: 'Supplements',
        description: null,
        emoji: null,
        trackingType: 'boolean',
        target: null,
        unit: null,
        frequency: 'daily',
        frequencyTarget: null,
        scheduledDays: null,
        pausedUntil: null,
        referenceSource: null,
        referenceConfig: null,
        sortOrder: 0,
        active: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    vi.mocked(listHabitEntriesByDateRange).mockResolvedValue([
      {
        id: 'entry-1',
        habitId: 'habit-1',
        userId: 'user-1',
        date: '2026-03-09',
        completed: true,
        value: null,
        isOverride: false,
        createdAt: 2,
      },
    ]);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/habits',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: [
          expect.objectContaining({
            id: 'habit-1',
            todayEntry: {
              completed: true,
              value: null,
              isOverride: false,
            },
          }),
        ],
      });
      expect(vi.mocked(resolveHabitCompletion)).not.toHaveBeenCalled();
    } finally {
      await app.close();
      vi.useRealTimers();
    }
  });

  it('rejects stale authenticated users when creating habits outside test mode', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    vi.mocked(findUserAuthById).mockResolvedValue(undefined);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'deleted-user', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/habits',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: 'Drink Water',
          emoji: '💧',
          trackingType: 'boolean',
          target: null,
          unit: null,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(vi.mocked(createHabit)).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      await app.close();
    }
  });

  it('backfills starter habits before listing when the authenticated user has none', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    vi.mocked(listActiveHabits).mockResolvedValue([]);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/habits',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ data: [] });
      expect(vi.mocked(findUserAuthById)).toHaveBeenCalledWith('user-1');
      expect(vi.mocked(ensureStarterHabitsForUser)).toHaveBeenCalledWith('user-1');
      expect(vi.mocked(listActiveHabits)).toHaveBeenCalledWith('user-1');
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      await app.close();
    }
  });

  it('updates a habit only when it belongs to the authenticated user', async () => {
    vi.mocked(findHabitById).mockResolvedValue({
      id: 'habit-1',
      userId: 'user-1',
      name: 'Sleep',
      description: null,
      emoji: '😴',
      trackingType: 'time',
      target: 8,
      unit: 'hours',
      frequency: 'daily',
      frequencyTarget: null,
      scheduledDays: null,
      pausedUntil: null,
      sortOrder: 1,
      active: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    vi.mocked(updateHabit).mockResolvedValue({
      id: 'habit-1',
      userId: 'user-1',
      name: 'Evening sleep',
      description: null,
      emoji: '😴',
      trackingType: 'time',
      target: 8.5,
      unit: 'hours',
      frequency: 'daily',
      frequencyTarget: null,
      scheduledDays: null,
      pausedUntil: null,
      sortOrder: 1,
      active: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
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
          description: null,
          emoji: '😴',
          trackingType: 'time',
          target: 8.5,
          unit: 'hours',
          frequency: 'daily',
          frequencyTarget: null,
          scheduledDays: null,
          pausedUntil: null,
          sortOrder: 1,
          active: true,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_100_000,
        },
      });
      expect(vi.mocked(findHabitById)).toHaveBeenCalledWith('habit-1', 'user-1');
      expect(vi.mocked(updateHabit)).toHaveBeenCalledWith('habit-1', 'user-1', {
        name: 'Evening sleep',
        description: null,
        emoji: '😴',
        trackingType: 'time',
        target: 8.5,
        unit: 'hours',
        frequency: 'daily',
        frequencyTarget: null,
        scheduledDays: null,
        pausedUntil: null,
      });
    } finally {
      await app.close();
    }
  });

  it('updates habit scheduling fields via put', async () => {
    vi.mocked(findHabitById).mockResolvedValue({
      id: 'habit-2',
      userId: 'user-1',
      name: 'Run',
      description: null,
      emoji: '🏃',
      trackingType: 'boolean',
      target: null,
      unit: null,
      frequency: 'daily',
      frequencyTarget: null,
      scheduledDays: null,
      pausedUntil: null,
      sortOrder: 2,
      active: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    vi.mocked(updateHabit).mockResolvedValue({
      id: 'habit-2',
      userId: 'user-1',
      name: 'Run',
      description: null,
      emoji: '🏃',
      trackingType: 'boolean',
      target: null,
      unit: null,
      frequency: 'specific_days',
      frequencyTarget: null,
      scheduledDays: [1, 3, 5],
      pausedUntil: '2026-03-20',
      sortOrder: 2,
      active: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/habits/habit-2',
        headers: createAuthorizationHeader(authToken),
        payload: {
          frequency: 'specific_days',
          scheduledDays: [1, 3, 5],
          pausedUntil: '2026-03-20',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          id: 'habit-2',
          userId: 'user-1',
          name: 'Run',
          description: null,
          emoji: '🏃',
          trackingType: 'boolean',
          target: null,
          unit: null,
          frequency: 'specific_days',
          frequencyTarget: null,
          scheduledDays: [1, 3, 5],
          pausedUntil: '2026-03-20',
          sortOrder: 2,
          active: true,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_100_000,
        },
      });
      expect(vi.mocked(updateHabit)).toHaveBeenCalledWith('habit-2', 'user-1', {
        name: 'Run',
        description: null,
        emoji: '🏃',
        trackingType: 'boolean',
        target: null,
        unit: null,
        frequency: 'specific_days',
        frequencyTarget: null,
        scheduledDays: [1, 3, 5],
        pausedUntil: '2026-03-20',
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
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
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
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
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
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
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
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
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
      expectRequestValidationError(createResponse, 'POST', '/api/v1/habits');
      expect(reorderResponse.statusCode).toBe(400);
      expectRequestValidationError(reorderResponse, 'PATCH', '/api/v1/habits/reorder');
    } finally {
      await app.close();
    }
  });
});
