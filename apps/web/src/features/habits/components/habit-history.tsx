import { useEffect, useMemo, useState } from 'react';
import { isHabitScheduledForDate, type Habit, type HabitEntry } from '@pulse/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useHabitEntries, useHabits } from '@/features/habits/api/habits';
import { HabitChainDot, type HabitDotEntry } from '@/features/habits/components/habit-chain-dot';
import { addDays, getToday, toDateKey } from '@/lib/date';
import { formatPercent } from '@/lib/format-utils';
import { HABIT_ENTRIES_POLL_INTERVAL_MS, getForegroundPollingInterval } from '@/lib/query-polling';

const HISTORY_DAYS = 90;

const rangeDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

type HabitHistoryRow = Habit & {
  completionRate: number;
  hasEntries: boolean;
  history: HabitDotEntry[];
  streakCount: number;
};

function clampPercent(percent: number) {
  return Math.max(0, Math.min(percent, 100));
}

function getCompletionPercent(habit: Habit, entry: HabitEntry | undefined, isScheduled: boolean) {
  if (!isScheduled) return 0;
  if (habit.trackingType === 'boolean') return entry?.completed === true ? 100 : 0;
  if (habit.target === null || habit.target <= 0) return 0;
  if (typeof entry?.value !== 'number') return 0;
  return clampPercent((entry.value / habit.target) * 100);
}

function getCurrentStreakCount(history: HabitDotEntry[]) {
  let streakCount = 0;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (!entry || !entry.isScheduled) continue;
    if (entry.status !== 'completed') break;
    streakCount += 1;
  }

  return streakCount;
}

function toCreatedDateKey(createdAt: number) {
  return toDateKey(new Date(createdAt));
}

function buildHabitHistoryRows(
  habits: Habit[],
  entries: HabitEntry[],
  dates: Date[],
  todayKey: string,
) {
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

    const history: HabitDotEntry[] = dates.map((date) => {
      const dateKey = toDateKey(date);
      const isDateAfterCreation = dateKey >= createdDateKey;
      const isScheduled =
        isDateAfterCreation && isHabitScheduledForDate(habit, dateKey, habitEntries);
      const matchingEntry = entriesByDate.get(dateKey) ?? null;
      const completionPercent = getCompletionPercent(
        habit,
        matchingEntry ?? undefined,
        isScheduled,
      );

      let status: 'completed' | 'missed' | 'not_scheduled';
      if (!isScheduled) {
        status = 'not_scheduled';
      } else if (matchingEntry?.completed === true) {
        status = 'completed';
      } else if (dateKey === todayKey) {
        // Don't penalize today before the day is over
        status = 'not_scheduled';
      } else {
        status = 'missed';
      }

      return {
        completionPercent,
        date: dateKey,
        entry: matchingEntry,
        isFutureDate: false,
        isScheduled,
        status,
      };
    });

    const scheduledDays = history.filter((entry) => entry.isScheduled).length;
    const completedDays = history.filter(
      (entry) => entry.isScheduled && entry.status === 'completed',
    ).length;
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

// ---------------------------------------------------------------------------
// HabitHistory
// ---------------------------------------------------------------------------

export function HabitHistory() {
  const todayKey = useTodayKey();
  const { dates, from, to } = useMemo(() => getHistoryWindow(todayKey), [todayKey]);
  const habitsQuery = useHabits({
    refetchIntervalMs: getForegroundPollingInterval(HABIT_ENTRIES_POLL_INTERVAL_MS),
  });
  const habitEntriesQuery = useHabitEntries(from, to, {
    refetchIntervalMs: getForegroundPollingInterval(HABIT_ENTRIES_POLL_INTERVAL_MS),
  });

  const historyRows = useMemo(
    () =>
      buildHabitHistoryRows(habitsQuery.data ?? [], habitEntriesQuery.data ?? [], dates, todayKey),
    [dates, habitEntriesQuery.data, habitsQuery.data, todayKey],
  );

  if (habitsQuery.isLoading || habitEntriesQuery.isLoading) {
    return (
      <Card className="gap-4 border-border/70 shadow-sm">
        <CardHeader className="gap-2">
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
      <Card className="gap-4 border-border/70 shadow-sm">
        <CardHeader className="gap-2">
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
      <Card className="gap-4 border-border/70 shadow-sm">
        <CardHeader className="gap-2">
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
          <CardDescription>No habits yet. Add a habit to start tracking history.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="gap-4 border-border/70 shadow-sm">
      <CardHeader className="gap-2">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-end lg:justify-between">
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
              Range: {rangeDateFormatter.format(dates[0] ?? new Date())} to{' '}
              {rangeDateFormatter.format(dates[dates.length - 1] ?? new Date())}.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="rounded-2xl border border-border/70 bg-card/40 p-3">
          <TooltipProvider>
            <div className="space-y-3">
              {historyRows.map((habit) => (
                <div
                  className="grid gap-2.5 border-b border-border/70 pb-3 last:border-b-0 last:pb-0 md:grid-cols-[minmax(160px,220px)_1fr]"
                  key={habit.id}
                >
                  <div className="space-y-1 md:pt-1">
                    <p className="text-sm font-semibold text-foreground">
                      <span aria-hidden="true" className="mr-2 text-base">
                        {habit.emoji ?? '•'}
                      </span>
                      {habit.name}
                    </p>
                    <p
                      className="text-xs font-medium text-muted-foreground"
                      data-testid={`habit-streak-${habit.id}`}
                    >
                      {habit.streakCount}-day streak
                    </p>
                    <p
                      className="text-xs font-medium text-muted-foreground"
                      data-testid={`habit-completion-rate-${habit.id}`}
                    >
                      {formatPercent(habit.completionRate)} completion rate (last 90 days)
                    </p>
                  </div>

                  {habit.hasEntries ? (
                    <div
                      aria-label={`${habit.name} history`}
                      className="flex flex-wrap gap-0.5"
                      data-testid={`habit-history-grid-${habit.id}`}
                    >
                      {habit.history.map((entry) => (
                        <HabitChainDot
                          entry={entry}
                          habit={habit}
                          includeYear
                          key={`${habit.id}-${entry.date}`}
                          size="sm"
                        />
                      ))}
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
