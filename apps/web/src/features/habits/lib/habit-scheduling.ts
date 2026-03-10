import type { Habit, HabitFrequency } from '@pulse/shared';

import { INDEFINITE_PAUSE_DATE, WEEKDAY_LABELS } from './habit-constants';

export function isPaused(pausedUntil: string | null, dateKey: string) {
  return pausedUntil !== null && pausedUntil >= dateKey;
}

export function formatFrequencyLabel(
  frequency: HabitFrequency,
  frequencyTarget: number | null,
  scheduledDays: number[] | null,
) {
  if (frequency === 'weekly') {
    return `${frequencyTarget ?? 1}x per week`;
  }

  if (frequency === 'specific_days') {
    const labels = (scheduledDays ?? []).map((day) => WEEKDAY_LABELS[day]).filter(Boolean);
    return labels.length > 0 ? labels.join(', ') : 'Specific days';
  }

  return 'Daily';
}

export function formatPausedLabel(pausedUntil: string | null) {
  if (!pausedUntil) {
    return null;
  }

  if (pausedUntil === INDEFINITE_PAUSE_DATE) {
    return 'Paused indefinitely';
  }

  return `Paused until ${new Date(`${pausedUntil}T00:00:00`).toLocaleDateString()}`;
}

export function mapHabitFrequency(habit: Habit) {
  return {
    frequency: habit.frequency ?? 'daily',
    frequencyTarget: habit.frequencyTarget ?? null,
    pausedUntil: habit.pausedUntil ?? null,
    scheduledDays: habit.scheduledDays ?? null,
  };
}
