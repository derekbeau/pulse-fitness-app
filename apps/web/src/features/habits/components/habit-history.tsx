import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { isHabitScheduledForDate, type Habit, type HabitEntry } from '@pulse/shared';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHabitEntries, useHabits } from '@/features/habits/api/habits';
import { formatFrequencyLabel, mapHabitFrequency } from '@/features/habits/lib/habit-scheduling';
import { toDateKey } from '@/lib/date';
import { cn } from '@/lib/utils';

const HISTORY_DAYS = 90;

type HistoryStatus = 'completed' | 'missed' | 'not_scheduled';

type HistoryCell = {
  completionPercent: number;
  date: string;
  hasLoggedValue: boolean;
  label: string;
  status: HistoryStatus;
};

type HistoryRow = {
  hasEntries: boolean;
  completionRate: number;
  habit: Habit;
  cells: HistoryCell[];
};

function getDateRange(dayCount: number, endDate: Date) {
  const end = new Date(endDate);
  end.setHours(12, 0, 0, 0);

  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (dayCount - index - 1));
    return toDateKey(date);
  });

  const from = days[0] ?? toDateKey(end);
  const to = days[days.length - 1] ?? toDateKey(end);

  return {
    days,
    from,
    to,
  };
}

function getCreatedDateKey(habit: Habit) {
  return toDateKey(new Date(habit.createdAt));
}

function clampPercent(percent: number) {
  return Math.max(0, Math.min(percent, 100));
}

function formatValue(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function getCompletionPercent(habit: Habit, entry: HabitEntry | undefined, completed: boolean) {
  if (habit.trackingType === 'boolean') {
    return completed ? 100 : 0;
  }

  if (typeof entry?.value !== 'number' || habit.target === null || habit.target <= 0) {
    return 0;
  }

  return clampPercent((entry.value / habit.target) * 100);
}

function getCellLabel(habit: Habit, status: HistoryStatus, entry: HabitEntry | undefined) {
  if (habit.trackingType === 'boolean') {
    if (status === 'completed') {
      return 'Completed';
    }

    if (status === 'missed') {
      return 'Not completed';
    }

    return 'Not scheduled';
  }

  if (status === 'not_scheduled') {
    return 'Not scheduled';
  }

  if (typeof entry?.value === 'number' && habit.target !== null && habit.target > 0 && habit.unit) {
    return `Logged ${formatValue(entry.value)}/${formatValue(habit.target)} ${habit.unit}`;
  }

  if (typeof entry?.value === 'number') {
    return `Logged ${formatValue(entry.value)}`;
  }

  return 'No entry';
}

function buildHistoryRows(habits: Habit[], entries: HabitEntry[], dates: string[], today: string) {
  const entriesByHabitId = entries.reduce<Map<string, HabitEntry[]>>((map, entry) => {
    const current = map.get(entry.habitId) ?? [];
    current.push(entry);
    map.set(entry.habitId, current);
    return map;
  }, new Map());

  return habits
    .map<HistoryRow>((habit) => {
      const habitEntries = entriesByHabitId.get(habit.id) ?? [];
      const entryByDate = new Map(habitEntries.map((entry) => [entry.date, entry]));
      const createdDate = getCreatedDateKey(habit);

      let scheduledDays = 0;
      let completedDays = 0;

      const cells = dates.map<HistoryCell>((date) => {
        const entry = entryByDate.get(date);
        const completed = entry?.completed === true;
        const shouldSchedule =
          date >= createdDate &&
          date <= today &&
          isHabitScheduledForDate(habit, date, { entries: habitEntries });

        if (completed) {
          completedDays += 1;
        }

        if (shouldSchedule) {
          scheduledDays += 1;
        }

        const status: HistoryStatus = completed
          ? 'completed'
          : shouldSchedule
            ? 'missed'
            : 'not_scheduled';

        const completionPercent = getCompletionPercent(habit, entry, completed);

        return {
          completionPercent,
          date,
          hasLoggedValue: typeof entry?.value === 'number',
          label: getCellLabel(habit, status, entry),
          status,
        };
      });

      return {
        hasEntries: habitEntries.length > 0,
        habit,
        cells,
        completionRate: scheduledDays > 0 ? Math.round((completedDays / scheduledDays) * 100) : 0,
      };
    })
    .filter((row) => row.cells.some((cell) => cell.status !== 'not_scheduled'));
}

function getProgressCellColor(percent: number) {
  return `color-mix(in srgb, #10b981 ${Math.round(clampPercent(percent))}%, var(--color-border))`;
}

function getCellPresentation(habit: Habit, cell: HistoryCell) {
  if (habit.trackingType !== 'boolean' && cell.hasLoggedValue) {
    return {
      className: 'border-black/5 dark:border-white/10',
      style: {
        backgroundColor: getProgressCellColor(cell.completionPercent),
      } satisfies CSSProperties,
    };
  }

  if (cell.status === 'completed') {
    return {
      className: 'border-emerald-700/20 bg-emerald-500',
      style: undefined,
    };
  }

  if (cell.status === 'missed') {
    return {
      className:
        'border-slate-400/50 bg-slate-300/70 dark:border-slate-600/60 dark:bg-slate-600/45',
      style: undefined,
    };
  }

  return {
    className: 'border-border/60 bg-muted/60',
    style: undefined,
  };
}

function useTodayKey() {
  const [today, setToday] = useState(() => toDateKey(new Date()));

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);

    nextMidnight.setHours(24, 0, 5, 0);

    const timeoutId = window.setTimeout(() => {
      setToday(toDateKey(new Date()));
    }, nextMidnight.getTime() - now.getTime());

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [today]);

  return today;
}

export function HabitHistory() {
  const today = useTodayKey();
  const { days, from, to } = useMemo(
    () => getDateRange(HISTORY_DAYS, new Date(`${today}T12:00:00`)),
    [today],
  );
  const habitsQuery = useHabits();
  const entriesQuery = useHabitEntries(from, to);

  if (habitsQuery.isLoading || entriesQuery.isLoading) {
    return (
      <Card className="gap-5 border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle
            aria-level={2}
            className="text-2xl font-semibold text-foreground"
            role="heading"
          >
            Last 90 days
          </CardTitle>
          <CardDescription>Loading habit history...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const habits = habitsQuery.data ?? [];
  const entries = entriesQuery.data ?? [];
  const rows = buildHistoryRows(habits, entries, days, today);

  return (
    <Card className="gap-5 border-border/70 shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Habit history
            </p>
            <CardTitle
              aria-level={2}
              className="text-2xl font-semibold text-foreground"
              role="heading"
            >
              Last 90 days
            </CardTitle>
            <CardDescription className="max-w-2xl">
              Wrapped daily cells for each habit. Green means completed; gray means not completed or
              not scheduled.
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              Completed
            </span>
            <span className="inline-flex rounded-full bg-slate-300/70 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Not completed
            </span>
            <span className="inline-flex rounded-full bg-[var(--color-accent-cream)] px-3 py-1 text-xs font-semibold text-on-cream dark:bg-amber-500/20 dark:text-amber-400">
              Numeric/time intensity by target %
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No history yet.</p>
        ) : (
          rows.map((row) => {
            const schedule = mapHabitFrequency(row.habit);
            return (
              <article key={row.habit.id} className="rounded-2xl border border-border/70 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{row.habit.name}</h3>
                    <p className="text-xs text-muted">
                      {formatFrequencyLabel(
                        schedule.frequency,
                        schedule.frequencyTarget,
                        schedule.scheduledDays,
                      )}
                    </p>
                  </div>
                  <p
                    className="text-xs font-semibold uppercase tracking-[0.08em] text-muted"
                    data-testid={`habit-completion-rate-${row.habit.id}`}
                  >
                    {row.completionRate}% completion rate (last 90 days)
                  </p>
                </div>

                {!row.hasEntries ? (
                  <p className="text-sm text-muted">No history yet.</p>
                ) : (
                  <div
                    className="flex flex-wrap gap-1"
                    data-testid={`habit-history-grid-${row.habit.id}`}
                  >
                    {row.cells.map((cell) => {
                      const presentation = getCellPresentation(row.habit, cell);
                      return (
                        <button
                          key={`${row.habit.id}-${cell.date}`}
                          aria-label={`${row.habit.name}: ${cell.date} - ${cell.label}`}
                          className={cn(
                            'h-3.5 w-3.5 rounded-sm border transition-opacity hover:opacity-90',
                            presentation.className,
                          )}
                          data-status={cell.status}
                          style={presentation.style}
                          title={`${cell.date} - ${cell.label}`}
                          type="button"
                        />
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
