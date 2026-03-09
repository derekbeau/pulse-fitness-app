import { describe, expect, it } from 'vitest';

import {
  getMockDayActivity,
  getMockSnapshotForDate,
  mockDailySnapshot,
  mockHabits,
  mockMacroTrend,
  mockRecentWorkouts,
  mockWeightTrend,
} from './dashboard';

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDayTimestamp = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
};

const getStreakFromEntries = (entries: { completed: boolean }[]): number => {
  let streak = 0;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (!entries[index]?.completed) {
      break;
    }

    streak += 1;
  }

  return streak;
};

describe('dashboard mock data', () => {
  it('exposes a fully populated daily snapshot', () => {
    expect(mockDailySnapshot.weight).toBeTypeOf('number');
    expect(mockDailySnapshot.weightYesterday).toBeTypeOf('number');
    expect(mockDailySnapshot.weight).toBeLessThanOrEqual(mockDailySnapshot.weightYesterday);

    expect(mockDailySnapshot.macros.calories).toEqual({ actual: 1850, target: 2200 });
    expect(mockDailySnapshot.macros.protein).toEqual({ actual: 145, target: 180 });
    expect(mockDailySnapshot.macros.carbs).toEqual({ actual: 200, target: 250 });
    expect(mockDailySnapshot.macros.fat).toEqual({ actual: 65, target: 73 });

    expect(mockDailySnapshot.workoutName).toBeTypeOf('string');
    expect(mockDailySnapshot.habitsTotal).toBe(mockHabits.length);
    expect(mockDailySnapshot.habitsCompleted).toBeGreaterThanOrEqual(0);
    expect(mockDailySnapshot.habitsCompleted).toBeLessThanOrEqual(mockDailySnapshot.habitsTotal);
  });

  it('provides 6 habits with 30 days of entries and valid streak values', () => {
    expect(mockHabits).toHaveLength(6);

    for (const habit of mockHabits) {
      expect(habit.entries).toHaveLength(30);
      expect(habit.currentStreak).toBe(getStreakFromEntries(habit.entries));

      for (let index = 1; index < habit.entries.length; index += 1) {
        const previousDate = habit.entries[index - 1]?.date;
        const currentDate = habit.entries[index]?.date;

        expect(previousDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(currentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect((toDayTimestamp(currentDate) - toDayTimestamp(previousDate)) / 86_400_000).toBe(1);
      }
    }
  });

  it('provides 30 days of downward-trending weight data ending today', () => {
    expect(mockWeightTrend).toHaveLength(30);
    expect(mockWeightTrend[0]?.value).toBeGreaterThan(mockWeightTrend.at(-1)?.value ?? 0);

    const firstDate = mockWeightTrend[0]?.date;
    const lastDate = mockWeightTrend.at(-1)?.date;

    expect(firstDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(lastDate).toBe(formatDate(new Date()));
    expect((toDayTimestamp(lastDate ?? '') - toDayTimestamp(firstDate ?? '')) / 86_400_000).toBe(
      29,
    );

    for (let index = 1; index < mockWeightTrend.length; index += 1) {
      const diff = Math.abs(
        (mockWeightTrend[index]?.value ?? 0) - (mockWeightTrend[index - 1]?.value ?? 0),
      );
      expect(diff).toBeLessThan(0.7);
    }
  });

  it('provides 30 days of calorie and protein values with day-to-day variance', () => {
    expect(mockMacroTrend).toHaveLength(30);
    expect(mockMacroTrend.at(-1)?.date).toBe(formatDate(new Date()));

    const calorieValues = new Set(mockMacroTrend.map((entry) => entry.calories));
    const proteinValues = new Set(mockMacroTrend.map((entry) => entry.protein));

    expect(calorieValues.size).toBeGreaterThan(10);
    expect(proteinValues.size).toBeGreaterThan(10);

    for (const entry of mockMacroTrend) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.calories).toBeGreaterThan(1500);
      expect(entry.calories).toBeLessThan(2600);
      expect(entry.protein).toBeGreaterThan(120);
      expect(entry.protein).toBeLessThan(220);
    }
  });

  it('provides 5 recent workout sessions with realistic stats and ISO timestamps', () => {
    expect(mockRecentWorkouts).toHaveLength(5);

    let previousTimestamp = Number.POSITIVE_INFINITY;
    const now = Date.now();

    for (const session of mockRecentWorkouts) {
      const timestamp = Date.parse(session.date);

      expect(session.date).toContain('T');
      expect(Number.isNaN(timestamp)).toBe(false);
      expect(timestamp).toBeLessThanOrEqual(now);
      expect(timestamp).toBeLessThan(previousTimestamp);

      expect(session.totalSets).toBeGreaterThan(0);
      expect(session.totalReps).toBeGreaterThan(0);
      expect(session.duration).toBeGreaterThan(20);
      expect(session.duration).toBeLessThan(120);

      previousTimestamp = timestamp;
    }
  });

  it('derives day activity flags from existing workout and macro mock data', () => {
    const workoutDay = new Date(mockRecentWorkouts[0]?.date ?? Date.now());
    workoutDay.setHours(0, 0, 0, 0);
    const workoutDayActivity = getMockDayActivity(workoutDay);

    expect(workoutDayActivity.hasWorkout).toBe(true);
    expect(workoutDayActivity.hasMeals).toBe(true);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 45);
    futureDate.setHours(0, 0, 0, 0);
    const futureActivity = getMockDayActivity(futureDate);

    expect(futureActivity).toEqual({ hasWorkout: false, hasMeals: false });
  });

  it('returns date-specific snapshots while preserving today as the default snapshot object', () => {
    const historicalDateKey = mockWeightTrend.at(-3)?.date;

    if (!historicalDateKey) {
      throw new Error('Expected historical weight trend entry.');
    }

    const historicalDate = new Date(`${historicalDateKey}T00:00:00`);
    const historicalSnapshot = getMockSnapshotForDate(historicalDate);

    expect(historicalSnapshot.weight).toBe(mockWeightTrend.at(-3)?.value);
    expect(historicalSnapshot.macros.calories.actual).toBe(mockMacroTrend.at(-3)?.calories);
    expect(historicalSnapshot.habitsTotal).toBe(mockHabits.length);

    const todaySnapshot = getMockSnapshotForDate(new Date());
    expect(todaySnapshot).toBe(mockDailySnapshot);
  });
});
