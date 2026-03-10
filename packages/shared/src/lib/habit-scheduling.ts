import type { Habit } from '../schemas/habits.js';
import type { HabitEntry } from '../schemas/habit-entries.js';

type SchedulingContext = {
  entries?: HabitEntry[];
};

function toUtcDay(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getWeekBounds(date: string) {
  const current = toUtcDay(date);
  const day = current.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const weekStart = new Date(current);
  weekStart.setUTCDate(current.getUTCDate() - diffToMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  return {
    start: toDateKey(weekStart),
    end: toDateKey(weekEnd),
  };
}

export function isHabitScheduledForDate(
  habit: Habit,
  date: string,
  context: SchedulingContext = {},
) {
  if (habit.pausedUntil && habit.pausedUntil >= date) {
    return false;
  }

  const frequency = habit.frequency ?? 'daily';
  if (frequency === 'daily') {
    return true;
  }

  if (frequency === 'specific_days') {
    if (!habit.scheduledDays || habit.scheduledDays.length === 0) {
      return false;
    }

    return habit.scheduledDays.includes(toUtcDay(date).getUTCDay());
  }

  const frequencyTarget = habit.frequencyTarget ?? 0;
  if (frequencyTarget <= 0) {
    return false;
  }

  const entries = context.entries ?? [];
  const week = getWeekBounds(date);
  const completions = entries.filter(
    (entry) =>
      entry.habitId === habit.id &&
      entry.completed === true &&
      entry.date >= week.start &&
      entry.date <= date,
  ).length;

  return completions < frequencyTarget;
}
