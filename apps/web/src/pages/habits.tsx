import { useMemo, useState } from 'react';
import type { Habit, HabitEntry } from '@pulse/shared';

import { useHabitEntries, useHabits } from '@/features/habits/api/habits';
import { DailyHabits, HabitHistory } from '@/features/habits';
import { WeeklyHabitDatePicker, type DayCompletion } from '@/features/habits/components/weekly-habit-date-picker';
import { addDays, formatDateKey, getToday, getWeekStart, normalizeDate, toDateKey } from '@/lib/date';

function getHabitEntryCompleted(habit: Habit, entry: HabitEntry | undefined) {
  if (!entry) {
    return false;
  }

  if (habit.trackingType === 'boolean') {
    return entry.completed;
  }

  return typeof entry.value === 'number' && habit.target !== null && entry.value >= habit.target;
}

function buildWeekCompletionByDate(habits: Habit[], entries: HabitEntry[], weekStart: Date) {
  const completionByDate: Record<string, DayCompletion> = {};
  const entriesByDate = new Map<string, Map<string, HabitEntry>>();

  for (const entry of entries) {
    const dateEntries = entriesByDate.get(entry.date) ?? new Map<string, HabitEntry>();
    dateEntries.set(entry.habitId, entry);
    entriesByDate.set(entry.date, dateEntries);
  }

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const day = addDays(weekStart, dayOffset);
    const dayKey = formatDateKey(day);
    const dayEntries = entriesByDate.get(dayKey);
    const completedCount = habits.filter((habit) => getHabitEntryCompleted(habit, dayEntries?.get(habit.id))).length;

    completionByDate[dayKey] = {
      completedCount,
      totalCount: habits.length,
    };
  }

  return completionByDate;
}

export function HabitsPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => getToday());
  const normalizedSelectedDate = useMemo(() => normalizeDate(selectedDate), [selectedDate]);
  const weekStart = useMemo(() => getWeekStart(normalizedSelectedDate), [normalizedSelectedDate]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const habitsQuery = useHabits();
  const weekEntriesQuery = useHabitEntries(toDateKey(weekStart), toDateKey(weekEnd));

  const weekCompletionByDate = useMemo(
    () => buildWeekCompletionByDate(habitsQuery.data ?? [], weekEntriesQuery.data ?? [], weekStart),
    [habitsQuery.data, weekEntriesQuery.data, weekStart],
  );

  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold text-primary">Habits</h1>
      <p className="max-w-2xl text-sm text-muted">
        Keep today&apos;s routine visible, log progress quickly, and review how each habit has
        trended over the last 90 days.
      </p>
      <WeeklyHabitDatePicker
        completionByDate={weekCompletionByDate}
        onDateSelect={setSelectedDate}
        selectedDate={normalizedSelectedDate}
      />
      <DailyHabits selectedDate={normalizedSelectedDate} />
      <HabitHistory />
    </section>
  );
}
