import type { HabitEntry } from '../schemas/habit-entries.js';
import type { Habit } from '../schemas/habits.js';

type SchedulableHabit = Pick<
  Habit,
  'id' | 'frequency' | 'frequencyTarget' | 'scheduledDays' | 'pausedUntil'
>;
type HabitEntryContext = Pick<HabitEntry, 'habitId' | 'date' | 'completed'>;

const MS_PER_DAY = 86_400_000;

const parseUtcDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
};

const getWeekStartUtc = (value: string) => {
  const date = parseUtcDate(value);
  const mondayIndex = (date.getUTCDay() + 6) % 7;

  return new Date(date.getTime() - mondayIndex * MS_PER_DAY);
};

const toDateKey = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getWeekEndKey = (weekStart: Date) => toDateKey(new Date(weekStart.getTime() + 6 * MS_PER_DAY));

export function isHabitScheduledForDate(
  habit: SchedulableHabit,
  date: string,
  entries: HabitEntryContext[] = [],
): boolean {
  if (habit.pausedUntil !== null && habit.pausedUntil >= date) {
    return false;
  }

  if (habit.frequency === 'daily') {
    return true;
  }

  if (habit.frequency === 'specific_days') {
    const dayOfWeek = parseUtcDate(date).getUTCDay();
    return habit.scheduledDays?.includes(dayOfWeek) ?? false;
  }

  const weeklyTarget = habit.frequencyTarget ?? 1;
  const weekStartKey = toDateKey(getWeekStartUtc(date));
  const weekEndKey = getWeekEndKey(getWeekStartUtc(date));
  const completionsThisWeek = entries.filter(
    (entry) =>
      entry.habitId === habit.id &&
      entry.completed &&
      entry.date >= weekStartKey &&
      entry.date <= weekEndKey &&
      entry.date <= date,
  ).length;

  return completionsThisWeek < weeklyTarget;
}
