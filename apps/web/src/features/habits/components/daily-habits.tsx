import { useMemo, useState } from 'react';
import { CheckCheck, CircleDashed } from 'lucide-react';
import type { Habit, HabitEntry } from '@pulse/shared';

import { HabitRowSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useHabitEntries,
  useHabits,
  useToggleHabit,
  useUpdateHabitEntry,
} from '@/features/habits/api/habits';
import { trackingSurfaceClasses } from '@/features/habits/lib/habit-constants';
import type { HabitConfig } from '@/features/habits/types';
import { accentCardStyles } from '@/lib/accent-card-styles';
import { toDateKey } from '@/lib/date';
import { cn } from '@/lib/utils';

type HabitValue = boolean | number | null;

export type DailyHabit = HabitConfig & {
  entryId: string | null;
  todayValue: HabitValue;
};

const todayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function getHabitCompletion(habit: DailyHabit, value: HabitValue) {
  if (habit.trackingType === 'boolean') {
    return value === true;
  }

  return typeof value === 'number' && habit.target !== null && value >= habit.target;
}

function getProgressText(habit: DailyHabit, value: HabitValue) {
  if (habit.trackingType === 'boolean') {
    return value === true ? 'Completed for today' : 'Ready to check off';
  }

  const currentValue = typeof value === 'number' ? value : 0;
  const formattedCurrent = formatNumber(currentValue);
  const formattedTarget = formatNumber(habit.target ?? 0);
  const unit = habit.unit ?? '';

  return `${formattedCurrent} / ${formattedTarget} ${unit}`.trim();
}

function getProgressPercent(habit: DailyHabit, value: HabitValue) {
  if (habit.trackingType === 'boolean' || habit.target === null || habit.target <= 0) {
    return value === true ? 100 : 0;
  }

  const currentValue = typeof value === 'number' ? value : 0;

  return Math.min((currentValue / habit.target) * 100, 100);
}

function parseInputValue(rawValue: string) {
  if (rawValue.trim() === '') {
    return null;
  }

  const numericValue = Number(rawValue);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function buildDailyHabits(habits: Habit[], entries: HabitEntry[]): DailyHabit[] {
  const entryByHabitId = new Map(entries.map((entry) => [entry.habitId, entry]));

  return habits.map((habit) => {
    const entry = entryByHabitId.get(habit.id);
    const todayValue: HabitValue =
      habit.trackingType === 'boolean' ? (entry?.completed ?? false) : (entry?.value ?? null);

    return {
      id: habit.id,
      name: habit.name,
      emoji: habit.emoji ?? '•',
      trackingType: habit.trackingType,
      target: habit.target,
      unit: habit.unit,
      entryId: entry?.id ?? null,
      todayValue,
    };
  });
}

function DailyHabitsLoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading daily habits" className="space-y-4">
      <Card className={accentCardStyles.pink}>
        <CardHeader className="gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] opacity-70 dark:text-muted dark:opacity-100">
            Daily habits
          </p>
          <div className="space-y-3">
            <Skeleton className="h-8 w-56 rounded-full bg-black/10 dark:bg-secondary" />
            <Skeleton className="h-4 w-full max-w-2xl rounded-full bg-black/10 dark:bg-secondary" />
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <HabitRowSkeleton key={index} />
        ))}
      </div>

      <p className="sr-only">Loading today&apos;s habits.</p>
    </div>
  );
}

type DailyHabitsErrorStateProps = {
  message: string;
  onRetry: () => void;
};

function DailyHabitsErrorState({ message, onRetry }: DailyHabitsErrorStateProps) {
  return (
    <div className="space-y-4">
      <Card className={accentCardStyles.pink}>
        <CardHeader className="gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] opacity-70 dark:text-muted dark:opacity-100">
            Daily habits
          </p>
          <div className="space-y-2">
            <CardTitle
              aria-level={2}
              className="text-3xl font-semibold tracking-tight"
              role="heading"
            >
              {todayFormatter.format(new Date())}
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm opacity-70 dark:text-muted dark:opacity-100">
              Habit progress could not be loaded right now.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">{message}</p>
          <Button onClick={onRetry} type="button">
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function DailyHabits() {
  const today = toDateKey(new Date());
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  const habitsQuery = useHabits();
  const habitEntriesQuery = useHabitEntries(today, today);
  const toggleHabitMutation = useToggleHabit();
  const updateHabitEntryMutation = useUpdateHabitEntry();

  const dailyHabits = useMemo(
    () => buildDailyHabits(habitsQuery.data ?? [], habitEntriesQuery.data ?? []),
    [habitEntriesQuery.data, habitsQuery.data],
  );

  const completedCount = dailyHabits.filter((habit) =>
    getHabitCompletion(habit, habit.todayValue),
  ).length;

  const clearDraftValue = (habitId: string) => {
    setDraftValues((currentValues) => {
      if (!(habitId in currentValues)) {
        return currentValues;
      }

      return Object.fromEntries(Object.entries(currentValues).filter(([key]) => key !== habitId));
    });
  };

  const commitTrackedValue = (habit: DailyHabit) => {
    const draftValue = draftValues[habit.id];
    if (draftValue === undefined) {
      return;
    }

    clearDraftValue(habit.id);

    const nextValue = parseInputValue(draftValue);
    const currentValue = typeof habit.todayValue === 'number' ? habit.todayValue : null;
    if (nextValue === currentValue) {
      return;
    }

    const completed = getHabitCompletion(habit, nextValue);

    if (habit.entryId && nextValue !== null) {
      updateHabitEntryMutation.mutate({
        id: habit.entryId,
        habitId: habit.id,
        date: today,
        completed,
        value: nextValue,
      });
      return;
    }

    toggleHabitMutation.mutate({
      habitId: habit.id,
      entryId: habit.entryId,
      date: today,
      completed,
      ...(nextValue === null ? {} : { value: nextValue }),
    });
  };

  if (habitsQuery.isLoading || habitEntriesQuery.isLoading) {
    return <DailyHabitsLoadingState />;
  }

  if (habitsQuery.isError || habitEntriesQuery.isError) {
    const error = habitsQuery.error ?? habitEntriesQuery.error;

    return (
      <DailyHabitsErrorState
        message={error instanceof Error ? error.message : 'Unable to load daily habits.'}
        onRetry={() => {
          void Promise.all([habitsQuery.refetch(), habitEntriesQuery.refetch()]);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className={accentCardStyles.pink}>
        <CardHeader className="gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] opacity-70 dark:text-muted dark:opacity-100">
            Daily habits
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <CardTitle
                aria-level={2}
                className="text-3xl font-semibold tracking-tight"
                role="heading"
              >
                {todayFormatter.format(new Date())}
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm opacity-70 dark:text-muted dark:opacity-100">
                Log today&apos;s routines, keep your streak alive, and spot what still needs
                attention before the day ends.
              </CardDescription>
            </div>
            <div className="inline-flex self-start rounded-full bg-black/10 px-4 py-2 text-sm font-semibold dark:bg-secondary dark:text-foreground">
              {completedCount} of {dailyHabits.length} habits complete
            </div>
          </div>
        </CardHeader>
      </Card>

      {dailyHabits.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-6">
            <p className="text-base font-medium text-foreground">
              No active habits configured yet.
            </p>
            <p className="mt-2 text-sm text-muted">
              Add or reactivate habits in settings before logging today&apos;s progress.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {dailyHabits.map((habit) => {
            const value =
              habit.trackingType === 'boolean' || draftValues[habit.id] === undefined
                ? habit.todayValue
                : parseInputValue(draftValues[habit.id]);
            const isComplete = getHabitCompletion(habit, value);
            const progressText = getProgressText(habit, value);
            const progressPercent = getProgressPercent(habit, value);
            const isSavingValue =
              updateHabitEntryMutation.isPending &&
              updateHabitEntryMutation.variables?.habitId === habit.id;
            const isSavingToggle =
              toggleHabitMutation.isPending && toggleHabitMutation.variables?.habitId === habit.id;

            return (
              <Card
                key={habit.id}
                className={cn(
                  'gap-4 border-transparent py-5 shadow-sm transition-transform duration-200',
                  trackingSurfaceClasses[habit.trackingType],
                  isComplete && 'ring-2 ring-emerald-500/40',
                )}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-4 pb-0">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl leading-none" aria-hidden="true">
                        {habit.emoji}
                      </span>
                      <CardTitle aria-level={3} className="text-xl font-semibold" role="heading">
                        {habit.name}
                      </CardTitle>
                    </div>
                    <CardDescription className="pl-12 text-sm opacity-70 dark:text-muted dark:opacity-100">
                      {progressText}
                    </CardDescription>
                  </div>
                  <div
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]',
                      isComplete
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-black/10 opacity-70 dark:bg-secondary dark:text-foreground dark:opacity-100',
                    )}
                  >
                    {isComplete ? (
                      <CheckCheck className="size-3.5" />
                    ) : (
                      <CircleDashed className="size-3.5" />
                    )}
                    <span>{isComplete ? 'Done' : 'In progress'}</span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {habit.trackingType === 'boolean' ? (
                    <label
                      className="flex cursor-pointer items-center gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm dark:bg-secondary/60 dark:shadow-none"
                      htmlFor={`habit-${habit.id}`}
                    >
                      <Checkbox
                        id={`habit-${habit.id}`}
                        aria-label={habit.name}
                        checked={value === true}
                        className="border-border bg-white dark:bg-background"
                        disabled={isSavingToggle}
                        onCheckedChange={(checked) => {
                          toggleHabitMutation.mutate({
                            habitId: habit.id,
                            entryId: habit.entryId,
                            date: today,
                            completed: checked === true,
                          });
                        }}
                      />
                      <span className="text-sm font-medium text-foreground">
                        Mark this habit complete for today
                      </span>
                    </label>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,9rem)_1fr] sm:items-end">
                      <div className="space-y-2">
                        <label
                          className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70 dark:text-muted dark:opacity-100"
                          htmlFor={`habit-${habit.id}`}
                        >
                          {habit.trackingType === 'time' ? 'Hours today' : 'Logged today'}
                        </label>
                        <Input
                          id={`habit-${habit.id}`}
                          aria-label={habit.name}
                          className="h-11 border-border bg-white/75 text-lg font-semibold text-foreground placeholder:text-muted focus-visible:border-ring focus-visible:ring-ring/20 dark:bg-background"
                          disabled={isSavingValue || isSavingToggle}
                          inputMode="decimal"
                          min="0"
                          step={habit.trackingType === 'time' ? '0.25' : '1'}
                          type="number"
                          value={
                            draftValues[habit.id] ??
                            (typeof value === 'number' ? formatNumber(value) : '')
                          }
                          onBlur={() => commitTrackedValue(habit)}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;

                            setDraftValues((currentValues) => ({
                              ...currentValues,
                              [habit.id]: nextValue,
                            }));
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-semibold dark:text-foreground">{progressText}</span>
                          <span className="opacity-70 dark:text-muted dark:opacity-100">
                            {Math.round(progressPercent)}%
                          </span>
                        </div>
                        <div
                          aria-hidden="true"
                          className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-secondary"
                        >
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-[width] duration-200"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <p className="text-xs font-medium tracking-wide uppercase opacity-70 dark:text-muted dark:opacity-100">
                          Target: {formatNumber(habit.target ?? 0)} {habit.unit}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
