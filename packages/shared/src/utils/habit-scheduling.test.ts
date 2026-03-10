import { describe, expect, it } from 'vitest';

import { isHabitScheduledForDate } from './habit-scheduling.js';

describe('isHabitScheduledForDate', () => {
  it('schedules daily habits every day', () => {
    const habit = {
      id: 'habit-1',
      frequency: 'daily' as const,
      frequencyTarget: null,
      scheduledDays: null,
      pausedUntil: null,
    };

    expect(isHabitScheduledForDate(habit, '2026-03-09')).toBe(true);
    expect(isHabitScheduledForDate(habit, '2026-03-10')).toBe(true);
    expect(isHabitScheduledForDate(habit, '2026-03-11')).toBe(true);
  });

  it('schedules specific-day habits only on selected weekdays', () => {
    const habit = {
      id: 'habit-2',
      frequency: 'specific_days' as const,
      frequencyTarget: null,
      scheduledDays: [0],
      pausedUntil: null,
    };

    expect(isHabitScheduledForDate(habit, '2026-03-09')).toBe(true);
    expect(isHabitScheduledForDate(habit, '2026-03-10')).toBe(false);
    expect(isHabitScheduledForDate(habit, '2026-03-08')).toBe(false);
  });

  it('does not schedule paused habits when pausedUntil is in the future', () => {
    const habit = {
      id: 'habit-3',
      frequency: 'daily' as const,
      frequencyTarget: null,
      scheduledDays: null,
      pausedUntil: '2026-03-20',
    };

    expect(isHabitScheduledForDate(habit, '2026-03-10')).toBe(false);
    expect(isHabitScheduledForDate(habit, '2026-03-20')).toBe(false);
  });

  it('schedules habits after pause expires', () => {
    const habit = {
      id: 'habit-4',
      frequency: 'daily' as const,
      frequencyTarget: null,
      scheduledDays: null,
      pausedUntil: '2026-03-01',
    };

    expect(isHabitScheduledForDate(habit, '2026-03-02')).toBe(true);
  });

  it('keeps weekly habits scheduled on the completing day and stops after target is met', () => {
    const habit = {
      id: 'habit-5',
      frequency: 'weekly' as const,
      frequencyTarget: 2,
      scheduledDays: null,
      pausedUntil: null,
    };

    const entries = [
      { habitId: 'habit-5', date: '2026-03-09', completed: true },
      { habitId: 'habit-5', date: '2026-03-10', completed: true },
      { habitId: 'habit-5', date: '2026-03-11', completed: true },
      { habitId: 'habit-6', date: '2026-03-10', completed: true },
    ];

    expect(isHabitScheduledForDate(habit, '2026-03-10', entries)).toBe(true);
    expect(isHabitScheduledForDate(habit, '2026-03-11', entries)).toBe(false);
  });
});
