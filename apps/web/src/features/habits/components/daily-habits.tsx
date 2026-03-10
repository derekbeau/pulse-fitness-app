import { useMemo, useState } from 'react';
import { CheckCheck, CircleDashed, Plus } from 'lucide-react';
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
import { getToday, isSameDay, normalizeDate, toDateKey } from '@/lib/date';
import { cn } from '@/lib/utils';

import { HabitCardMenu } from './habit-card-menu';
import { HabitFormDialog } from './habit-form-dialog';

type HabitValue = boolean | number | null;
type DailyHabitsProps = {
  selectedDate?: Date;
};

export type DailyHabit = HabitConfig & {
  sourceHabit: Habit;
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

function getDisplayUnit(habit: DailyHabit) {
  if (!habit.unit) {
    return '';
  }

  if (habit.trackingType === 'time') {
    const normalizedUnit = habit.unit.trim().toLowerCase();
    if (normalizedUnit === 'hour' || normalizedUnit === 'hours' || normalizedUnit === 'h') {
      return 'h';
    }
  }

  return habit.unit.trim();
}

function formatValueWithUnit(habit: DailyHabit, value: number) {
  const unit = getDisplayUnit(habit);
  if (!unit) {
    return formatNumber(value);
  }

  if (unit === 'h') {
    return `${formatNumber(value)}${unit}`;
  }

  return `${formatNumber(value)} ${unit}`;
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
  if (habit.target === null || habit.target <= 0) {
    return `${formatValueWithUnit(habit, currentValue)} logged`;
  }

  const formattedCurrent = formatValueWithUnit(habit, currentValue);
  const formattedTarget = formatValueWithUnit(habit, habit.target);

  return `${formattedCurrent} / ${formattedTarget}`;
}

function getProgressPercent(habit: DailyHabit, value: HabitValue) {
  if (habit.trackingType === 'boolean' || habit.target === null || habit.target <= 0) {
    return value === true ? 100 : 0;
  }

  const currentValue = typeof value === 'number' ? value : 0;

  return (currentValue / habit.target) * 100;
}

function getPercentTone(percent: number) {
  if (percent >= 100) {
    return 'text-emerald-700 dark:text-emerald-300';
  }

  if (percent >= 70) {
    return 'text-amber-700 dark:text-amber-300';
  }

  return 'text-rose-700 dark:text-rose-300';
}

function getProgressBarTone(percent: number) {
  if (percent >= 100) {
    return 'bg-emerald-500';
  }

  if (percent >= 70) {
    return 'bg-amber-500';
  }

  return 'bg-rose-500';
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
      sourceHabit: habit,
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

      <p className="sr-only">Loading habits for the selected day.</p>
    </div>
  );
}

type DailyHabitsErrorStateProps = {
  titleDate: Date;
  message: string;
  onRetry: () => void;
};

function DailyHabitsErrorState({ titleDate, message, onRetry }: DailyHabitsErrorStateProps) {
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
              {todayFormatter.format(titleDate)}
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

export function DailyHabits({ selectedDate }: DailyHabitsProps) {
  const activeDate = normalizeDate(selectedDate ?? getToday());
  const activeDateKey = toDateKey(activeDate);
  const isSelectedDateToday = isSameDay(activeDate, getToday());
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);

  const habitsQuery = useHabits();
  const habitEntriesQuery = useHabitEntries(activeDateKey, activeDateKey);
  const toggleHabitMutation = useToggleHabit();
  const updateHabitEntryMutation = useUpdateHabitEntry();

  const activeHabits = useMemo(() => habitsQuery.data ?? [], [habitsQuery.data]);
  const editingHabit = editingHabitId
    ? activeHabits.find((habit) => habit.id === editingHabitId)
    : undefined;

  const dailyHabits = useMemo(
    () => buildDailyHabits(activeHabits, habitEntriesQuery.data ?? []),
    [activeHabits, habitEntriesQuery.data],
  );

  const completedCount = dailyHabits.filter((habit) =>
    getHabitCompletion(habit, habit.todayValue),
  ).length;

  function handleFormDialogChange(open: boolean) {
    setIsFormDialogOpen(open);

    if (!open) {
      setEditingHabitId(null);
    }
  }

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
        date: activeDateKey,
        completed,
        value: nextValue,
      });
      return;
    }

    toggleHabitMutation.mutate({
      habitId: habit.id,
      entryId: habit.entryId,
      date: activeDateKey,
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
        titleDate={activeDate}
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
                {todayFormatter.format(activeDate)}
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm opacity-70 dark:text-muted dark:opacity-100">
                {isSelectedDateToday
                  ? "Log today's routines, keep your streak alive, and spot what still needs attention before the day ends."
                  : 'Review and log habits for this day to keep your history accurate.'}
              </CardDescription>
            </div>
            <div className="inline-flex min-h-14 self-start items-center justify-center rounded-full bg-black/10 px-4 py-2 dark:bg-secondary">
              <span className="text-center text-sm font-semibold leading-tight dark:text-foreground">
                {completedCount} of {activeHabits.length} habits complete
              </span>
            </div>
          </div>
        </CardHeader>
      </Card>

      {activeHabits.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-6">
            <p className="text-base font-medium text-foreground">
              No active habits configured yet.
            </p>
            <p className="mt-2 text-sm text-muted">
              Add your first habit to start tracking progress.
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                setEditingHabitId(null);
                setIsFormDialogOpen(true);
              }}
              type="button"
            >
              <Plus />
              Add Habit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4">
            {dailyHabits.map((habit) => {
              const value =
                habit.trackingType === 'boolean' || draftValues[habit.id] === undefined
                  ? habit.todayValue
                  : parseInputValue(draftValues[habit.id]);
              const isComplete = getHabitCompletion(habit, value);
              const progressText = getProgressText(habit, value);
              const progressPercent = getProgressPercent(habit, value);
              const hasTargetProgress =
                habit.trackingType !== 'boolean' && habit.target !== null && habit.target > 0;
              const percentageLabel = hasTargetProgress ? `${Math.round(progressPercent)}%` : null;
              const progressTone = hasTargetProgress ? getPercentTone(progressPercent) : null;
              const progressFillTone = hasTargetProgress
                ? getProgressBarTone(progressPercent)
                : 'bg-emerald-500';
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
                    <div className="flex items-start gap-2">
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
                      <HabitCardMenu
                        habit={habit.sourceHabit}
                        habits={activeHabits}
                        onEdit={(selectedHabit) => {
                          setEditingHabitId(selectedHabit.id);
                          setIsFormDialogOpen(true);
                        }}
                      />
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
                              date: activeDateKey,
                              completed: checked === true,
                            });
                          }}
                        />
                        <span className="text-sm font-medium text-foreground">
                          Mark this habit complete for {isSelectedDateToday ? 'today' : 'this day'}
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
                            {percentageLabel ? (
                              <span className={cn('font-semibold', progressTone)}>
                                — {percentageLabel}
                              </span>
                            ) : null}
                          </div>
                          <div
                            aria-hidden="true"
                            className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-secondary"
                          >
                            <div
                              className={cn(
                                'h-full rounded-full transition-[width] duration-200',
                                progressFillTone,
                              )}
                              style={{ width: `${Math.min(Math.max(progressPercent, 0), 100)}%` }}
                            />
                          </div>
                          <p className="text-xs font-medium tracking-wide uppercase opacity-70 dark:text-muted dark:opacity-100">
                            Target: {formatValueWithUnit(habit, habit.target ?? 0)}
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="flex justify-center">
            <Button
              onClick={() => {
                setEditingHabitId(null);
                setIsFormDialogOpen(true);
              }}
              type="button"
              variant="outline"
            >
              <Plus />
              Add Habit
            </Button>
          </div>
        </>
      )}

      <HabitFormDialog
        habit={editingHabit}
        onOpenChange={handleFormDialogChange}
        open={isFormDialogOpen}
      />
    </div>
  );
}
