import { useMemo, useState } from 'react';
import type { Habit, HabitEntry } from '@pulse/shared';

import { HelpIcon } from '@/components/ui/help-icon';
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
  const [visibleWeekStart, setVisibleWeekStart] = useState<Date>(() => getWeekStart(getToday()));
  const normalizedSelectedDate = useMemo(() => normalizeDate(selectedDate), [selectedDate]);
  const weekEnd = useMemo(() => addDays(visibleWeekStart, 6), [visibleWeekStart]);

  const habitsQuery = useHabits();
  const weekEntriesQuery = useHabitEntries(toDateKey(visibleWeekStart), toDateKey(weekEnd));

  const weekCompletionByDate = useMemo(
    () =>
      buildWeekCompletionByDate(
        habitsQuery.data ?? [],
        weekEntriesQuery.data ?? [],
        visibleWeekStart,
      ),
    [habitsQuery.data, weekEntriesQuery.data, visibleWeekStart],
  );

  function handleDateSelect(date: Date) {
    const nextSelectedDate = normalizeDate(date);
    setSelectedDate(nextSelectedDate);
    setVisibleWeekStart(getWeekStart(nextSelectedDate));
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold text-primary">Habits</h1>
        <HelpIcon title="Habits help">
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Habits support three tracking types so each routine can match how you measure progress.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Boolean: mark done or not done for the day.</li>
              <li>Numeric: log a value and compare it against your target.</li>
              <li>Time-based: track duration-style habits over time.</li>
              <li>Streaks power the dashboard&apos;s don&apos;t break the chain view for consistency.</li>
              <li>Create, edit, reorder, or archive/delete habits from the habits controls and menus.</li>
              <li>Your AI agent can also log or update habit entries for you.</li>
            </ul>
          </div>
        </HelpIcon>
      </div>
      <p className="max-w-2xl text-sm text-muted">
        Keep today&apos;s routine visible, log progress quickly, and review how each habit has
        trended over the last 90 days.
      </p>
      <WeeklyHabitDatePicker
        completionByDate={weekCompletionByDate}
        onDateSelect={handleDateSelect}
        onWeekChange={setVisibleWeekStart}
        selectedDate={normalizedSelectedDate}
        visibleWeekStart={visibleWeekStart}
      />
      <DailyHabits selectedDate={normalizedSelectedDate} />
      <HabitHistory />
    </section>
  );
}
