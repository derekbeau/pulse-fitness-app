import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { findHabitEntryByHabitAndDate, listHabitEntriesByDateRange, upsertHabitEntry } from '../habit-entries/store.js';
import { findHabitById, listActiveHabits } from '../habits/store.js';
import { getDailyNutritionForDate, getDailyNutritionSummaryForDate } from '../nutrition/store.js';
import { findBodyWeightEntryByDate, upsertBodyWeightEntry } from '../weight/store.js';

vi.mock('../weight/store.js', () => ({
  findBodyWeightEntryByDate: vi.fn(),
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

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

describe('agent daily routes', () => {
  beforeEach(() => {
    vi.mocked(findBodyWeightEntryByDate).mockReset();
    vi.mocked(upsertBodyWeightEntry).mockReset();
    vi.mocked(listActiveHabits).mockReset();
    vi.mocked(findHabitById).mockReset();
    vi.mocked(findHabitEntryByHabitAndDate).mockReset();
    vi.mocked(upsertHabitEntry).mockReset();
    vi.mocked(listHabitEntriesByDateRange).mockReset();
    vi.mocked(getDailyNutritionSummaryForDate).mockReset();
    vi.mocked(getDailyNutritionForDate).mockReset();
    process.env.JWT_SECRET = 'test-agent-daily-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    vi.useRealTimers();
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
  });

  describe('GET /api/agent/habits', () => {
    it("returns active habits with today's entry status", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-09T12:00:00Z'));

      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(listActiveHabits).mockResolvedValue([
          {
            id: 'habit-1',
            userId: 'user-1',
            name: 'Supplements',
            emoji: null,
            trackingType: 'boolean',
            target: null,
            unit: null,
            sortOrder: 0,
            active: true,
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'habit-2',
            userId: 'user-1',
            name: 'Sleep',
            emoji: null,
            trackingType: 'time',
            target: 8,
            unit: 'hours',
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
              },
            },
          ],
        });
        expect(vi.mocked(listHabitEntriesByDateRange)).toHaveBeenCalledWith(
          'user-1',
          '2026-03-09',
          '2026-03-09',
        );
      } finally {
        await app.close();
      }
    });
  });

  describe('PATCH /api/agent/habits/:id/entries', () => {
    it('upserts a habit entry while preserving existing completed state if omitted', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findHabitById).mockResolvedValue({
          id: 'habit-1',
          userId: 'user-1',
          name: 'Sleep',
          emoji: null,
          trackingType: 'time',
          target: 8,
          unit: 'hours',
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
          createdAt: 1,
        });
        vi.mocked(upsertHabitEntry).mockResolvedValue({
          id: 'entry-1',
          habitId: 'habit-1',
          userId: 'user-1',
          date: '2026-03-09',
          completed: true,
          value: 8,
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
  });

  describe('GET /api/agent/nutrition/:date/summary', () => {
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
