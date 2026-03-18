import { type Habit, type HabitEntry } from '@pulse/shared';
import { Pencil } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ProgressRing } from '@/components/ui/progress-ring';
import {
  useHabitEntries,
  useHabits,
  useToggleHabit,
} from '@/features/habits/api/habits';
import { getToday, toDateKey } from '@/lib/date';
import { formatPercent, formatServing } from '@/lib/format-utils';
import { HABIT_ENTRIES_POLL_INTERVAL_MS, getForegroundPollingInterval } from '@/lib/query-polling';

type ResolvedTodayEntry = {
  completed: boolean;
  isOverride: boolean;
  value: number | null;
};

type HabitWithTodayEntry = Habit & {
  todayEntry?: ResolvedTodayEntry | null;
};

type HabitDailyStatusCardProps = {
  habitId: string;
  compact?: boolean;
};

function formatHabitValue(value: number, unit: string | null) {
  const formattedValue = formatServing(value);
  const normalizedUnit = unit?.trim();

  if (!normalizedUnit) {
    return formattedValue;
  }

  return `${formattedValue} ${normalizedUnit}`;
}

function getNumericCompletion(target: number | null, value: number | null) {
  if (target == null || target <= 0 || value == null) {
    return false;
  }

  return value >= target;
}

function getProgressPercent(target: number | null, value: number | null) {
  if (target == null || target <= 0 || value == null) {
    return 0;
  }

  return Math.min((value / target) * 100, 100);
}

function getEffectiveEntry(habit: HabitWithTodayEntry, entry: HabitEntry | undefined) {
  const isReferential = habit.referenceSource != null;
  // For referential habits, use the aggregated `todayEntry` unless there is an explicit manual override.
  const useTodayEntry = isReferential && habit.todayEntry != null && !entry?.isOverride;

  return {
    completed: (useTodayEntry ? habit.todayEntry?.completed : entry?.completed) ?? false,
    isReferential,
    value: (useTodayEntry ? habit.todayEntry?.value : entry?.value) ?? null,
  };
}

export function HabitDailyStatusCard({ habitId, compact = false }: HabitDailyStatusCardProps) {
  const [isEditingNumericValue, setIsEditingNumericValue] = useState(false);
  const [numericDraftValue, setNumericDraftValue] = useState('');
  const isCancellingNumericEditRef = useRef(false);

  const todayKey = toDateKey(getToday());
  const habitsQuery = useHabits({
    refetchIntervalMs: getForegroundPollingInterval(HABIT_ENTRIES_POLL_INTERVAL_MS),
  });
  const habitEntriesQuery = useHabitEntries(todayKey, todayKey, {
    refetchIntervalMs: getForegroundPollingInterval(HABIT_ENTRIES_POLL_INTERVAL_MS),
  });
  const toggleHabitMutation = useToggleHabit();

  const habit = useMemo(
    () => (habitsQuery.data ?? []).find((item) => item.id === habitId),
    [habitId, habitsQuery.data],
  );
  const todayEntry = useMemo(
    () => (habitEntriesQuery.data ?? []).find((entry) => entry.habitId === habitId),
    [habitEntriesQuery.data, habitId],
  );

  if (habitsQuery.isLoading || habitEntriesQuery.isLoading) {
    return (
      <Card className="gap-2 py-3" data-testid={`habit-daily-status-card-loading-${habitId}`}>
        <CardHeader className="px-3 sm:px-4">
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent className="space-y-2 px-3 sm:px-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-3 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (habitsQuery.isError || habitEntriesQuery.isError) {
    return (
      <Card className="gap-2 border-dashed py-3">
        <CardHeader className="px-3 sm:px-4">
          <CardTitle className="text-sm">Habit status unavailable</CardTitle>
          <CardDescription className="text-xs">Unable to load today&apos;s habit data.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!habit) {
    return (
      <Card className="gap-2 border-dashed py-3">
        <CardHeader className="px-3 sm:px-4">
          <CardTitle className="text-sm">Habit not found</CardTitle>
          <CardDescription className="text-xs">This card references a missing habit.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { completed, isReferential, value } = getEffectiveEntry(habit, todayEntry);
  const isBooleanHabit = habit.trackingType === 'boolean';
  const numericValue = typeof value === 'number' ? value : null;
  const hasNumericTarget = habit.target != null && habit.target > 0;
  const progressPercent = getProgressPercent(habit.target, numericValue);
  const progressTarget = habit.target != null && habit.target > 0 ? habit.target : 1;
  const progressValue = hasNumericTarget ? (numericValue ?? 0) : 0;
  const isSaving = toggleHabitMutation.isPending && toggleHabitMutation.variables?.habitId === habit.id;

  const saveHabitValue = (nextCompleted: boolean, nextNumericValue: number | null) => {
    toggleHabitMutation.mutate({
      habitId: habit.id,
      entryId: todayEntry?.id,
      date: todayKey,
      completed: nextCompleted,
      ...(isReferential ? { isOverride: true } : {}),
      ...(nextNumericValue === null ? {} : { value: nextNumericValue }),
    });
  };

  const commitNumericValue = () => {
    if (isCancellingNumericEditRef.current) {
      isCancellingNumericEditRef.current = false;
      return;
    }

    const trimmedValue = numericDraftValue.trim();
    const parsedValue = trimmedValue.length === 0 ? null : Number(trimmedValue);

    setIsEditingNumericValue(false);

    if (parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue < 0)) {
      return;
    }

    if (parsedValue === numericValue) {
      return;
    }

    saveHabitValue(getNumericCompletion(habit.target, parsedValue), parsedValue);
  };

  return (
    <Card
      className="gap-2 py-3"
      data-slot="habit-daily-status-card"
      data-testid={`habit-daily-status-card-${habit.id}`}
    >
      <CardHeader className="gap-1 px-3 sm:px-4">
        <CardTitle className="text-base leading-tight">{habit.name}</CardTitle>
        <CardDescription className="text-xs">Daily status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-4">
        {isBooleanHabit ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/25 px-3 py-2.5">
            <p className="text-sm text-muted-foreground">Today</p>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <Checkbox
                aria-label={`${habit.name} completion`}
                checked={completed}
                disabled={isSaving}
                onCheckedChange={(checked) => {
                  const nextCompleted = checked === true;
                  saveHabitValue(nextCompleted, null);
                }}
              />
              <span>{completed ? 'Done' : 'Not done'}</span>
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <ProgressRing
                className="shrink-0"
                color="var(--color-accent)"
                label={formatPercent(progressPercent)}
                size={compact ? 58 : 74}
                strokeWidth={compact ? 6 : 7}
                value={progressPercent}
              />
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Today
                </p>
                {isEditingNumericValue ? (
                  <Input
                    aria-label={`${habit.name} value`}
                    autoFocus
                    className="h-8 w-28"
                    data-testid={`habit-daily-value-input-${habit.id}`}
                    inputMode="decimal"
                    onBlur={commitNumericValue}
                    onChange={(event) => {
                      setNumericDraftValue(event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }

                      if (event.key === 'Escape') {
                        isCancellingNumericEditRef.current = true;
                        setNumericDraftValue(numericValue == null ? '' : String(numericValue));
                        setIsEditingNumericValue(false);
                      }
                    }}
                    type="number"
                    value={numericDraftValue}
                  />
                ) : (
                  <Button
                    className="h-auto p-0 text-left text-base font-semibold"
                    data-testid={`habit-daily-value-button-${habit.id}`}
                    disabled={isSaving}
                    onClick={() => {
                      setNumericDraftValue(numericValue == null ? '' : String(numericValue));
                      setIsEditingNumericValue(true);
                    }}
                    type="button"
                    variant="ghost"
                  >
                    {numericValue == null
                      ? `0${habit.unit ? ` ${habit.unit}` : ''}`
                      : formatHabitValue(numericValue, habit.unit)}
                    <Pencil className="ml-1 size-3.5 text-muted-foreground" />
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Target:{' '}
                  {habit.target == null
                    ? 'Not set'
                    : formatHabitValue(habit.target, habit.unit)}
                </p>
              </div>
            </div>
            <ProgressBar
              aria-label={`${habit.name} daily progress`}
              color="var(--color-accent)"
              max={progressTarget}
              showValue={false}
              value={progressValue}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
