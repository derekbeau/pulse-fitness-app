import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { isHabitScheduledForDate, type Habit, type HabitEntry } from '@pulse/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useHabitEntries, useHabits } from '@/features/habits/api/habits';
import { addDays, getToday, toDateKey } from '@/lib/date';
import { cn } from '@/lib/utils';

const HISTORY_DAYS = 90;

const tooltipDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
});

const rangeDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

type HabitHistoryEntry = {
  completionPercent: number;
  date: Date;
  dateKey: string;
  isComplete: boolean;
  isScheduled: boolean;
  tooltipLabel: string;
};

type HabitHistoryRow = Habit & {
  completionRate: number;
  hasEntries: boolean;
  history: HabitHistoryEntry[];
  streakCount: number;
};

function clampPercent(percent: number) {
  return Math.max(0, Math.min(percent, 100));
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function getCompletionPercent(habit: Habit, entry: HabitEntry | undefined, isScheduled: boolean) {
  if (!isScheduled) {
    return 0;
  }

  if (habit.trackingType === 'boolean') {
    return entry?.completed === true ? 100 : 0;
  }

  if (habit.target === null || habit.target <= 0) {
    return 0;
  }

  if (typeof entry?.value !== 'number') {
    return 0;
  }

  return clampPercent((entry.value / habit.target) * 100);
}

function getTooltipLabel(
  habit: Habit,
  date: Date,
  entry: HabitEntry | undefined,
  isScheduled: boolean,
) {
  const formattedDate = tooltipDateFormatter.format(date);

  if (!isScheduled) {
    return `${formattedDate} - Not scheduled`;
  }

  if (habit.trackingType === 'boolean') {
    return `${formattedDate} - ${entry?.completed === true ? 'Completed' : 'Not completed'}`;
  }

  if (typeof entry?.value !== 'number') {
    return `${formattedDate} - No entry`;
  }

  return `${formattedDate} - ${formatNumber(entry.value)}/${formatNumber(habit.target ?? 0)} ${habit.unit}`;
}

function getCurrentStreakCount(history: HabitHistoryEntry[]) {
  let streakCount = 0;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];

    if (!entry || !entry.isScheduled) {
      continue;
    }

    if (!entry.isComplete) {
      break;
    }

    streakCount += 1;
  }

  return streakCount;
}

function toCreatedDateKey(createdAt: number) {
  return toDateKey(new Date(createdAt));
}

function buildHabitHistoryRows(habits: Habit[], entries: HabitEntry[], dates: Date[]) {
  const entriesByHabit = new Map<string, HabitEntry[]>();
  const entriesByHabitByDate = new Map<string, Map<string, HabitEntry>>();

  entries.forEach((entry) => {
    const habitEntries = entriesByHabit.get(entry.habitId) ?? [];
    habitEntries.push(entry);
    entriesByHabit.set(entry.habitId, habitEntries);

    const entriesByDate = entriesByHabitByDate.get(entry.habitId) ?? new Map<string, HabitEntry>();
    entriesByDate.set(entry.date, entry);
    entriesByHabitByDate.set(entry.habitId, entriesByDate);
  });

  return habits.map<HabitHistoryRow>((habit) => {
    const habitEntries = entriesByHabit.get(habit.id) ?? [];
    const entriesByDate = entriesByHabitByDate.get(habit.id) ?? new Map<string, HabitEntry>();
    const createdDateKey = toCreatedDateKey(habit.createdAt);
    const hasEntries = habitEntries.length > 0;

    const history = dates.map((date) => {
      const dateKey = toDateKey(date);
      const isDateAfterCreation = dateKey >= createdDateKey;
      const isScheduled =
        isDateAfterCreation && isHabitScheduledForDate(habit, dateKey, habitEntries);
      const matchingEntry = entriesByDate.get(dateKey);
      const completionPercent = getCompletionPercent(habit, matchingEntry, isScheduled);

      return {
        completionPercent,
        date,
        dateKey,
        isComplete: isScheduled && matchingEntry?.completed === true,
        isScheduled,
        tooltipLabel: getTooltipLabel(habit, date, matchingEntry, isScheduled),
      };
    });

    const scheduledDays = history.filter((entry) => entry.isScheduled).length;
    const completedDays = history.filter((entry) => entry.isScheduled && entry.isComplete).length;
    const completionRate =
      scheduledDays === 0 ? 0 : Math.round(clampPercent((completedDays / scheduledDays) * 100));

    return {
      ...habit,
      completionRate,
      hasEntries,
      history,
      streakCount: getCurrentStreakCount(history),
    };
  });
}

function getProgressCellColor(percent: number) {
  return `color-mix(in srgb, #10b981 ${Math.round(clampPercent(percent))}%, var(--color-border))`;
}

function getCellPresentation(habit: Habit, entry: HabitHistoryEntry) {
  if (!entry.isScheduled) {
    return {
      className: 'border-slate-300/50 bg-slate-200/45 dark:border-slate-700/60 dark:bg-slate-700/35',
      style: undefined,
    };
  }

  if (habit.trackingType === 'boolean') {
    return {
      className: entry.isComplete
        ? 'border-emerald-700/20 bg-emerald-500'
        : 'border-slate-400/50 bg-slate-300/70 dark:border-slate-600/60 dark:bg-slate-600/45',
      style: undefined,
    };
  }

  return {
    className: 'border-black/5 dark:border-white/10',
    style: {
      backgroundColor: getProgressCellColor(entry.completionPercent),
    } satisfies CSSProperties,
  };
}

function useTodayKey() {
  const [todayKey, setTodayKey] = useState(() => toDateKey(getToday()));

  useEffect(() => {
    let timeoutId: number | undefined;

    const scheduleUpdate = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 50);

      timeoutId = window.setTimeout(() => {
        setTodayKey(toDateKey(getToday()));
        scheduleUpdate();
      }, nextMidnight.getTime() - now.getTime());
    };

    scheduleUpdate();

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return todayKey;
}

function getHistoryWindow(todayKey: string) {
  const endDate = new Date(`${todayKey}T00:00:00`);
  const startDate = addDays(endDate, -(HISTORY_DAYS - 1));
  const dates = Array.from({ length: HISTORY_DAYS }, (_, index) => addDays(startDate, index));

  return {
    dates,
    from: toDateKey(startDate),
    to: toDateKey(endDate),
  };
}

export function HabitHistory() {
  const todayKey = useTodayKey();
  const { dates, from, to } = useMemo(() => getHistoryWindow(todayKey), [todayKey]);
  const habitsQuery = useHabits();
  const habitEntriesQuery = useHabitEntries(from, to);

  const historyRows = useMemo(
    () => buildHabitHistoryRows(habitsQuery.data ?? [], habitEntriesQuery.data ?? [], dates),
    [dates, habitEntriesQuery.data, habitsQuery.data],
  );

  if (habitsQuery.isLoading || habitEntriesQuery.isLoading) {
    return (
      <Card className="gap-5 border-border/70 shadow-sm">
        <CardHeader className="gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Habit history
          </p>
          <CardTitle aria-level={2} className="text-2xl font-semibold text-foreground" role="heading">
            Last 90 days
          </CardTitle>
          <CardDescription>Loading habit history.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (habitsQuery.isError || habitEntriesQuery.isError) {
    const message =
      habitsQuery.error instanceof Error
        ? habitsQuery.error.message
        : habitEntriesQuery.error instanceof Error
          ? habitEntriesQuery.error.message
          : 'Unable to load habit history.';

    return (
      <Card className="gap-5 border-border/70 shadow-sm">
        <CardHeader className="gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Habit history
          </p>
          <CardTitle aria-level={2} className="text-2xl font-semibold text-foreground" role="heading">
            Last 90 days
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => {
              void Promise.all([habitsQuery.refetch(), habitEntriesQuery.refetch()]);
            }}
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (historyRows.length === 0) {
    return (
      <Card className="gap-5 border-border/70 shadow-sm">
        <CardHeader className="gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Habit history
          </p>
          <CardTitle aria-level={2} className="text-2xl font-semibold text-foreground" role="heading">
            Last 90 days
          </CardTitle>
          <CardDescription>No habits yet. Add a habit to start tracking history.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="gap-5 border-border/70 shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Habit history
            </p>
            <CardTitle aria-level={2} className="text-2xl font-semibold text-foreground" role="heading">
              Last 90 days
            </CardTitle>
            <CardDescription className="max-w-2xl">
              Range: {rangeDateFormatter.format(dates[0] ?? new Date())} to{' '}
              {rangeDateFormatter.format(dates[dates.length - 1] ?? new Date())}.
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex rounded-full bg-[var(--color-accent-pink)] px-3 py-1 text-xs font-semibold text-on-pink dark:bg-pink-500/20 dark:text-pink-400">
              Boolean habits: gray or green
            </span>
            <span className="inline-flex rounded-full bg-[var(--color-accent-cream)] px-3 py-1 text-xs font-semibold text-on-cream dark:bg-amber-500/20 dark:text-amber-400">
              Numeric/time habits: intensity by target %
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-3xl border border-border/70 bg-card/40 p-4">
          <TooltipProvider>
            <div className="space-y-4">
              {historyRows.map((habit) => (
                <div
                  className="grid gap-3 border-b border-border/70 pb-4 last:border-b-0 last:pb-0 md:grid-cols-[minmax(180px,220px)_1fr]"
                  key={habit.id}
                >
                  <div className="space-y-1 md:pt-1">
                    <p className="text-sm font-semibold text-foreground">
                      <span aria-hidden="true" className="mr-2 text-base">
                        {habit.emoji ?? '•'}
                      </span>
                      {habit.name}
                    </p>
                    <p className="text-xs font-medium text-muted-foreground" data-testid={`habit-streak-${habit.id}`}>
                      {habit.streakCount}-day streak
                    </p>
                    <p
                      className="text-xs font-medium text-muted-foreground"
                      data-testid={`habit-completion-rate-${habit.id}`}
                    >
                      {habit.completionRate}% completion rate (last 90 days)
                    </p>
                  </div>

                  {habit.hasEntries ? (
                    <div
                      aria-label={`${habit.name} history`}
                      className="flex flex-wrap gap-1"
                      data-testid={`habit-history-grid-${habit.id}`}
                    >
                      {habit.history.map((entry) => {
                        const presentation = getCellPresentation(habit, entry);

                        return (
                          <Tooltip key={`${habit.id}-${entry.dateKey}`}>
                            <TooltipTrigger asChild>
                              <button
                                aria-label={`${habit.name}: ${entry.tooltipLabel}`}
                                className={cn(
                                  'size-3.5 shrink-0 cursor-pointer rounded-[4px] border transition-transform duration-150 hover:scale-110 focus-visible:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                                  presentation.className,
                                )}
                                data-percent={Math.round(entry.completionPercent)}
                                data-testid="habit-history-cell"
                                style={presentation.style}
                                title={entry.tooltipLabel}
                                type="button"
                              />
                            </TooltipTrigger>
                            <TooltipContent side="top" sideOffset={8}>
                              {entry.tooltipLabel}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">No history yet.</p>
                  )}
                </div>
              ))}
            </div>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
