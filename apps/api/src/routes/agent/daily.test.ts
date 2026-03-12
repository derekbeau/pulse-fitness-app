import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { resolveHabitCompletion } from '../../lib/habit-resolvers.js';
import {
  findHabitEntryByHabitAndDate,
  listHabitEntriesByDateRange,
  upsertHabitEntry,
} from '../habit-entries/store.js';
import {
  createHabit,
  findHabitById,
  getNextHabitSortOrder,
  listActiveHabits,
} from '../habits/store.js';
import { getDailyNutritionForDate, getDailyNutritionSummaryForDate } from '../nutrition/store.js';
import {
  findBodyWeightEntryByDate,
  findBodyWeightEntryById,
  patchBodyWeightEntryById,
  upsertBodyWeightEntry,
} from '../weight/store.js';

vi.mock('../weight/store.js', () => ({
  findBodyWeightEntryById: vi.fn(),
  findBodyWeightEntryByDate: vi.fn(),
  patchBodyWeightEntryById: vi.fn(),
  upsertBodyWeightEntry: vi.fn(),
  listBodyWeightEntries: vi.fn(),
  getLatestBodyWeightEntry: vi.fn(),
}));

vi.mock('../habits/store.js', () => ({
  getNextHabitSortOrder: vi.fn(),
  createHabit: vi.fn(),
  listActiveHabits: vi.fn(),
  findHabitById: vi.fn(),
  updateHabit: vi.fn(),
  softDeleteHabit: vi.fn(),
  reorderHabits: vi.fn(),
}));

vi.mock('../habit-entries/store.js', () => ({
  findHabitEntryById: vi.fn(),
  findHabitEntryByHabitAndDate: vi.fn(),
  upsertHabitEntry: vi.fn(),
  listHabitEntriesByDateRange: vi.fn(),
  listHabitEntriesForHabitByDateRange: vi.fn(),
  updateHabitEntry: vi.fn(),
}));

vi.mock('../nutrition/store.js', () => ({
  createMealForDate: vi.fn(),
  getDailyNutritionForDate: vi.fn(),
  getDailyNutritionSummaryForDate: vi.fn(),
  deleteMealForDate: vi.fn(),
}));
vi.mock('../../lib/habit-resolvers.js', () => ({
  resolveHabitCompletion: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

describe('agent daily routes', () => {
  beforeEach(() => {
    vi.mocked(findBodyWeightEntryByDate).mockReset();
    vi.mocked(findBodyWeightEntryById).mockReset();
    vi.mocked(patchBodyWeightEntryById).mockReset();
    vi.mocked(upsertBodyWeightEntry).mockReset();
    vi.mocked(getNextHabitSortOrder).mockReset();
    vi.mocked(createHabit).mockReset();
    vi.mocked(listActiveHabits).mockReset();
    vi.mocked(findHabitById).mockReset();
    vi.mocked(findHabitEntryByHabitAndDate).mockReset();
    vi.mocked(upsertHabitEntry).mockReset();
    vi.mocked(listHabitEntriesByDateRange).mockReset();
    vi.mocked(getDailyNutritionSummaryForDate).mockReset();
    vi.mocked(getDailyNutritionForDate).mockReset();
    vi.mocked(resolveHabitCompletion).mockReset();
    process.env.JWT_SECRET = 'test-agent-daily-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    vi.useRealTimers();
  });

  describe('POST /api/agent/habits', () => {
    it('creates a referential habit and returns 201', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(getNextHabitSortOrder).mockResolvedValue(2);
        vi.mocked(createHabit).mockResolvedValue({
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
          referenceConfig: {
            field: 'protein',
            op: 'gte',
            value: 150,
          },
          sortOrder: 2,
          active: true,
          createdAt: 1,
          updatedAt: 1,
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/habits',
          headers: createAuthorizationHeader(token),
          body: {
            name: 'Protein',
            trackingType: 'boolean',
            referenceSource: 'nutrition_daily',
            referenceConfig: {
              field: 'protein',
              op: 'gte',
              value: 150,
            },
          },
        });

        expect(response.statusCode).toBe(201);
        expect(vi.mocked(getNextHabitSortOrder)).toHaveBeenCalledWith('user-1');
        expect(vi.mocked(createHabit)).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-1',
            sortOrder: 2,
            referenceSource: 'nutrition_daily',
            referenceConfig: {
              field: 'protein',
              op: 'gte',
              value: 150,
            },
          }),
        );
      } finally {
        await app.close();
      }
    });
  });

  describe('POST /api/agent/weight', () => {
    it('returns 401 without auth', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/weight',
          body: { date: '2026-03-09', weight: 182.4 },
        });

        expect(response.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    });

    it('creates a new weight entry and returns 201', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findBodyWeightEntryByDate).mockResolvedValue(null);
        vi.mocked(upsertBodyWeightEntry).mockResolvedValue({
          id: 'weight-1',
          date: '2026-03-09',
          weight: 182.4,
          notes: null,
          createdAt: 1,
          updatedAt: 1,
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/weight',
          headers: createAuthorizationHeader(token),
          body: { date: '2026-03-09', weight: 182.4 },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toEqual({
          data: {
            id: 'weight-1',
            date: '2026-03-09',
            weight: 182.4,
            notes: null,
            createdAt: 1,
            updatedAt: 1,
          },
        });
        expect(vi.mocked(findBodyWeightEntryByDate)).toHaveBeenCalledWith('user-1', '2026-03-09');
        expect(vi.mocked(upsertBodyWeightEntry)).toHaveBeenCalledWith('user-1', {
          date: '2026-03-09',
          weight: 182.4,
        });
      } finally {
        await app.close();
      }
    });

    it('updates an existing weight entry and returns 200', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findBodyWeightEntryByDate).mockResolvedValue({
          id: 'weight-1',
          date: '2026-03-09',
          weight: 183,
          notes: null,
          createdAt: 1,
          updatedAt: 1,
        });
        vi.mocked(upsertBodyWeightEntry).mockResolvedValue({
          id: 'weight-1',
          date: '2026-03-09',
          weight: 182.4,
          notes: 'fasted',
          createdAt: 1,
          updatedAt: 2,
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/weight',
          headers: createAuthorizationHeader(token),
          body: { date: '2026-03-09', weight: 182.4, notes: 'fasted' },
        });

        expect(response.statusCode).toBe(200);
        expect(vi.mocked(upsertBodyWeightEntry)).toHaveBeenCalledWith('user-1', {
          date: '2026-03-09',
          weight: 182.4,
          notes: 'fasted',
        });
      } finally {
        await app.close();
      }
    });

    it('returns 400 for an invalid calendar date', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/weight',
          headers: createAuthorizationHeader(token),
          body: { date: '2026-13-40', weight: 182.4 },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid weight payload',
          },
        });
        expect(vi.mocked(findBodyWeightEntryByDate)).not.toHaveBeenCalled();
        expect(vi.mocked(upsertBodyWeightEntry)).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });
  });

  describe('PATCH /api/agent/weight/:id', () => {
    it('returns 401 without auth', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/agent/weight/weight-1',
          body: { weight: 182.4 },
        });

        expect(response.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    });

    it('patches weight entries with partial payloads', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findBodyWeightEntryById).mockResolvedValue({
          id: 'weight-1',
          date: '2026-03-09',
          weight: 183,
          notes: null,
          createdAt: 1,
          updatedAt: 1,
        });
        vi.mocked(patchBodyWeightEntryById)
          .mockResolvedValueOnce({
            id: 'weight-1',
            date: '2026-03-09',
            weight: 182.4,
            notes: null,
            createdAt: 1,
            updatedAt: 2,
          })
          .mockResolvedValueOnce({
            id: 'weight-1',
            date: '2026-03-09',
            weight: 182.4,
            notes: 'Fasted',
            createdAt: 1,
            updatedAt: 3,
          })
          .mockResolvedValueOnce({
            id: 'weight-1',
            date: '2026-03-09',
            weight: 182.2,
            notes: 'Post-workout',
            createdAt: 1,
            updatedAt: 4,
          });

        const token = app.jwt.sign({ userId: 'user-1' });
        const weightOnlyResponse = await app.inject({
          method: 'PATCH',
          url: '/api/agent/weight/weight-1',
          headers: createAuthorizationHeader(token),
          body: { weight: 182.4 },
        });
        const notesOnlyResponse = await app.inject({
          method: 'PATCH',
          url: '/api/agent/weight/weight-1',
          headers: createAuthorizationHeader(token),
          body: { notes: '  Fasted  ' },
        });
        const bothResponse = await app.inject({
          method: 'PATCH',
          url: '/api/agent/weight/weight-1',
          headers: createAuthorizationHeader(token),
          body: { weight: 182.2, notes: 'Post-workout' },
        });

        expect(weightOnlyResponse.statusCode).toBe(200);
        expect(notesOnlyResponse.statusCode).toBe(200);
        expect(bothResponse.statusCode).toBe(200);
        expect(vi.mocked(findBodyWeightEntryById)).toHaveBeenCalledTimes(3);
        expect(vi.mocked(patchBodyWeightEntryById)).toHaveBeenNthCalledWith(
          1,
          'weight-1',
          'user-1',
          { weight: 182.4 },
        );
        expect(vi.mocked(patchBodyWeightEntryById)).toHaveBeenNthCalledWith(
          2,
          'weight-1',
          'user-1',
          { notes: 'Fasted' },
        );
        expect(vi.mocked(patchBodyWeightEntryById)).toHaveBeenNthCalledWith(
          3,
          'weight-1',
          'user-1',
          { weight: 182.2, notes: 'Post-workout' },
        );
      } finally {
        await app.close();
      }
    });

    it('returns 404 for a missing or unauthorized entry', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findBodyWeightEntryById).mockResolvedValue(null);

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/agent/weight/missing',
          headers: createAuthorizationHeader(token),
          body: { weight: 182.4 },
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
          error: {
            code: 'WEIGHT_NOT_FOUND',
            message: 'Weight entry not found',
          },
        });
        expect(vi.mocked(patchBodyWeightEntryById)).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it('rejects empty patch payloads', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/agent/weight/weight-1',
          headers: createAuthorizationHeader(token),
          body: {},
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid weight payload',
          },
        });
        expect(vi.mocked(findBodyWeightEntryById)).not.toHaveBeenCalled();
        expect(vi.mocked(patchBodyWeightEntryById)).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });
  });

  describe('GET /api/agent/habits', () => {
    it('returns 401 without auth', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/habits',
        });

        expect(response.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    });

    it("returns active habits with today's entry status", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-09T12:00:00'));

      const app = buildServer();

      try {
        await app.ready();

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
            referenceSource: null,
            referenceConfig: null,
            pausedUntil: null,
            sortOrder: 0,
            active: true,
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'habit-2',
            userId: 'user-1',
            name: 'Sleep',
            description: null,
            emoji: null,
            trackingType: 'time',
            target: 8,
            unit: 'hours',
            frequency: 'daily',
            frequencyTarget: null,
            scheduledDays: null,
            referenceSource: null,
            referenceConfig: null,
            pausedUntil: null,
            sortOrder: 1,
            active: true,
            createdAt: 1,
            updatedAt: 1,
          },
        ]);
        vi.mocked(listHabitEntriesByDateRange).mockResolvedValue([
          {
            id: 'entry-1',
            habitId: 'habit-2',
            userId: 'user-1',
            date: '2026-03-09',
            completed: true,
            value: 8,
            isOverride: false,
            createdAt: 2,
          },
        ]);

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/habits',
          headers: createAuthorizationHeader(token),
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          data: [
            {
              id: 'habit-1',
              name: 'Supplements',
              trackingType: 'boolean',
              todayEntry: null,
            },
            {
              id: 'habit-2',
              name: 'Sleep',
              trackingType: 'time',
              todayEntry: {
                value: 8,
                completed: true,
                isOverride: false,
              },
            },
          ],
        });
        expect(vi.mocked(listHabitEntriesByDateRange)).toHaveBeenCalledWith(
          'user-1',
          '2026-03-09',
          '2026-03-09',
        );
        expect(vi.mocked(resolveHabitCompletion)).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it('resolves referential habits when no override entry exists', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-09T12:00:00'));

      const app = buildServer();

      try {
        await app.ready();

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
            referenceSource: 'nutrition_daily',
            referenceConfig: { field: 'protein', op: 'gte', value: 150 },
            pausedUntil: null,
            sortOrder: 0,
            active: true,
            createdAt: 1,
            updatedAt: 1,
          },
        ]);
        vi.mocked(listHabitEntriesByDateRange).mockResolvedValue([]);
        vi.mocked(resolveHabitCompletion).mockResolvedValue({ completed: true, value: 160 });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/habits',
          headers: createAuthorizationHeader(token),
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          data: [
            {
              id: 'habit-1',
              name: 'Protein',
              trackingType: 'boolean',
              todayEntry: {
                value: 160,
                completed: true,
                isOverride: false,
              },
            },
          ],
        });
        expect(vi.mocked(resolveHabitCompletion)).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'habit-1' }),
          'user-1',
          '2026-03-09',
        );
      } finally {
        await app.close();
      }
    });
  });

  describe('PATCH /api/agent/habits/:id/entries', () => {
    it('returns 401 without auth', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/agent/habits/habit-1/entries',
          body: {
            date: '2026-03-09',
            completed: true,
          },
        });

        expect(response.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    });

    it('returns 201 when creating a new habit entry', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findHabitById).mockResolvedValue({
          id: 'habit-1',
          userId: 'user-1',
          name: 'Sleep',
          description: null,
          emoji: null,
          trackingType: 'time',
          target: 8,
          unit: 'hours',
          frequency: 'daily',
          frequencyTarget: null,
          scheduledDays: null,
          pausedUntil: null,
          sortOrder: 0,
          active: true,
          createdAt: 1,
          updatedAt: 1,
        });
        vi.mocked(findHabitEntryByHabitAndDate).mockResolvedValue(undefined);
        vi.mocked(upsertHabitEntry).mockResolvedValue({
          id: 'entry-1',
          habitId: 'habit-1',
          userId: 'user-1',
          date: '2026-03-09',
          completed: true,
          value: 8,
          isOverride: false,
          createdAt: 1,
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/agent/habits/habit-1/entries',
          headers: createAuthorizationHeader(token),
          body: {
            date: '2026-03-09',
            completed: true,
            value: 8,
          },
        });

        expect(response.statusCode).toBe(201);
        expect(vi.mocked(upsertHabitEntry)).toHaveBeenCalledWith(
          expect.objectContaining({
            habitId: 'habit-1',
            userId: 'user-1',
            date: '2026-03-09',
            completed: true,
            value: 8,
            isOverride: false,
          }),
        );
      } finally {
        await app.close();
      }
    });

    it('upserts a habit entry while preserving existing completed state if omitted', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findHabitById).mockResolvedValue({
          id: 'habit-1',
          userId: 'user-1',
          name: 'Sleep',
          description: null,
          emoji: null,
          trackingType: 'time',
          target: 8,
          unit: 'hours',
          frequency: 'daily',
          frequencyTarget: null,
          scheduledDays: null,
          pausedUntil: null,
          sortOrder: 0,
          active: true,
          createdAt: 1,
          updatedAt: 1,
        });
        vi.mocked(findHabitEntryByHabitAndDate).mockResolvedValue({
          id: 'entry-1',
          habitId: 'habit-1',
          userId: 'user-1',
          date: '2026-03-09',
          completed: true,
          value: 7,
          isOverride: false,
          createdAt: 1,
        });
        vi.mocked(upsertHabitEntry).mockResolvedValue({
          id: 'entry-1',
          habitId: 'habit-1',
          userId: 'user-1',
          date: '2026-03-09',
          completed: true,
          value: 8,
          isOverride: false,
          createdAt: 1,
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/agent/habits/habit-1/entries',
          headers: createAuthorizationHeader(token),
          body: {
            date: '2026-03-09',
            value: 8,
          },
        });

        expect(response.statusCode).toBe(200);
        expect(vi.mocked(upsertHabitEntry)).toHaveBeenCalledWith(
          expect.objectContaining({
            habitId: 'habit-1',
            userId: 'user-1',
            date: '2026-03-09',
            completed: true,
            value: 8,
            isOverride: false,
          }),
        );
      } finally {
        await app.close();
      }
    });

    it('marks manual entries as overrides for referential habits', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findHabitById).mockResolvedValue({
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
          referenceConfig: {
            field: 'protein',
            op: 'gte',
            value: 150,
          },
          sortOrder: 0,
          active: true,
          createdAt: 1,
          updatedAt: 1,
        });
        vi.mocked(findHabitEntryByHabitAndDate).mockResolvedValue(undefined);
        vi.mocked(upsertHabitEntry).mockResolvedValue({
          id: 'entry-1',
          habitId: 'habit-1',
          userId: 'user-1',
          date: '2026-03-09',
          completed: true,
          value: null,
          isOverride: true,
          createdAt: 1,
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/agent/habits/habit-1/entries',
          headers: createAuthorizationHeader(token),
          body: {
            date: '2026-03-09',
            completed: true,
          },
        });

        expect(response.statusCode).toBe(201);
        expect(vi.mocked(upsertHabitEntry)).toHaveBeenCalledWith(
          expect.objectContaining({
            habitId: 'habit-1',
            isOverride: true,
          }),
        );
      } finally {
        await app.close();
      }
    });

    it('returns 404 when the habit does not exist', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findHabitById).mockResolvedValue(undefined);

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/agent/habits/missing/entries',
          headers: createAuthorizationHeader(token),
          body: {
            date: '2026-03-09',
            completed: true,
          },
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
          error: {
            code: 'HABIT_NOT_FOUND',
            message: 'Habit not found',
          },
        });
      } finally {
        await app.close();
      }
    });

    it('returns 400 for an invalid calendar date', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/agent/habits/habit-1/entries',
          headers: createAuthorizationHeader(token),
          body: {
            date: '2026-13-40',
            completed: true,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid habit entry payload',
          },
        });
        expect(vi.mocked(findHabitById)).not.toHaveBeenCalled();
        expect(vi.mocked(upsertHabitEntry)).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });
  });

  describe('GET /api/agent/nutrition/:date/summary', () => {
    it('returns 401 without auth', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/nutrition/2026-03-09/summary',
        });

        expect(response.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    });

    it('returns nutrition macro totals and meals for the given date', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(getDailyNutritionSummaryForDate).mockResolvedValue({
          date: '2026-03-09',
          meals: 1,
          actual: {
            calories: 450,
            protein: 40,
            carbs: 30,
            fat: 15,
          },
          target: {
            calories: 2500,
            protein: 180,
            carbs: 260,
            fat: 80,
          },
        });
        vi.mocked(getDailyNutritionForDate).mockResolvedValue({
          log: {
            id: 'log-1',
            userId: 'user-1',
            date: '2026-03-09',
            notes: null,
            createdAt: 1,
            updatedAt: 1,
          },
          meals: [
            {
              meal: {
                id: 'meal-1',
                nutritionLogId: 'log-1',
                name: 'Lunch',
                time: '12:00',
                notes: null,
                createdAt: 1,
                updatedAt: 1,
              },
              items: [
                {
                  id: 'item-1',
                  mealId: 'meal-1',
                  foodId: 'food-1',
                  name: 'Chicken Breast',
                  amount: 1,
                  unit: 'serving',
                  calories: 165,
                  protein: 31,
                  carbs: 0,
                  fat: 3.6,
                  fiber: null,
                  sugar: null,
                  createdAt: 1,
                },
              ],
            },
          ],
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/nutrition/2026-03-09/summary',
          headers: createAuthorizationHeader(token),
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          data: {
            summary: {
              date: '2026-03-09',
              meals: 1,
              actual: {
                calories: 450,
                protein: 40,
                carbs: 30,
                fat: 15,
              },
              target: {
                calories: 2500,
                protein: 180,
                carbs: 260,
                fat: 80,
              },
            },
            meals: [
              {
                meal: {
                  id: 'meal-1',
                  nutritionLogId: 'log-1',
                  name: 'Lunch',
                  time: '12:00',
                  notes: null,
                  createdAt: 1,
                  updatedAt: 1,
                },
                items: [
                  {
                    id: 'item-1',
                    mealId: 'meal-1',
                    foodId: 'food-1',
                    name: 'Chicken Breast',
                    amount: 1,
                    unit: 'serving',
                    calories: 165,
                    protein: 31,
                    carbs: 0,
                    fat: 3.6,
                    fiber: null,
                    sugar: null,
                    createdAt: 1,
                  },
                ],
              },
            ],
          },
        });
      } finally {
        await app.close();
      }
    });

    it('returns 400 for an invalid nutrition date', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/nutrition/2026-99-99/summary',
          headers: createAuthorizationHeader(token),
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid nutrition date',
          },
        });
      } finally {
        await app.close();
      }
    });
  });
});
