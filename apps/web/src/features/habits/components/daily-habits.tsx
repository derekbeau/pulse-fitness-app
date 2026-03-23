import { useMemo, useState } from 'react';
import { CheckCheck, Link2, Plus } from 'lucide-react';
import type { Habit, HabitEntry, ReferenceConfig, ReferenceSource } from '@pulse/shared';
import { toast } from 'sonner';

import { HabitRowSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useHabitEntries,
  useHabits,
  useToggleHabit,
  useUpdateHabitEntry,
} from '@/features/habits/api/habits';
import {
  INDEFINITE_PAUSE_DATE,
  trackingSurfaceClasses,
  weekdayLabels,
} from '@/features/habits/lib/habit-constants';
import { MarkdownNote } from '@/features/workouts/components/markdown-note';
import type { HabitConfig } from '@/features/habits/types';
import { accentCardStyles } from '@/lib/accent-card-styles';
import { getToday, isSameDay, normalizeDate, toDateKey } from '@/lib/date';
import { formatPercent, formatServing } from '@/lib/format-utils';
import { HABIT_ENTRIES_POLL_INTERVAL_MS, getForegroundPollingInterval } from '@/lib/query-polling';
import { cn } from '@/lib/utils';

import { HabitCardMenu } from './habit-card-menu';
import { HabitFormDialog } from './habit-form-dialog';

type HabitValue = boolean | number | null;
type ResolvedTodayEntry = {
  completed: boolean;
  isOverride: boolean;
  value: number | null;
};

type HabitWithTodayEntry = Habit & {
  todayEntry?: ResolvedTodayEntry | null;
};

type DailyHabitsProps = {
  selectedDate?: Date;
};

export type DailyHabit = HabitConfig & {
  sourceHabit: Habit;
  entryId: string | null;
  isOverride: boolean;
  isReferential: boolean;
  todayValue: HabitValue;
  autoText: string | null;
};

const todayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

function formatNumber(value: number) {
  return formatServing(value);
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

function getFrequencySummary(habit: Habit): string | null {
  if (habit.frequency === 'weekly') {
    const target = habit.frequencyTarget ?? 1;
    return `${target}x per week`;
  }

  if (habit.frequency === 'specific_days') {
    if (!habit.scheduledDays || habit.scheduledDays.length === 0) {
      return null;
    }

    return habit.scheduledDays
      .filter((dayIndex) => dayIndex >= 0 && dayIndex <= 6)
      .map((dayIndex) => weekdayLabels[dayIndex])
      .join(', ');
  }

  return null;
}

function formatPausedUntilLabel(pausedUntil: string): string {
  if (pausedUntil === INDEFINITE_PAUSE_DATE) {
    return 'Paused indefinitely';
  }

  return `Paused until ${new Date(`${pausedUntil}T00:00:00`).toLocaleDateString()}`;
}

function parseInputValue(rawValue: string) {
  if (rawValue.trim() === '') {
    return null;
  }

  const numericValue = Number(rawValue);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function getHabitRationale(habit: Habit): string | null {
  const rationale = (habit as Habit & { rationale?: unknown }).rationale;

  return typeof rationale === 'string' ? rationale : null;
}

function getOperatorLabel(operator: string) {
  if (operator === 'gte') {
    return '>=';
  }
  if (operator === 'lte') {
    return '<=';
  }
  if (operator === 'eq') {
    return '=';
  }

  return operator;
}

function getReferentialAutoText(
  source: Exclude<ReferenceSource, null>,
  config: Exclude<ReferenceConfig, null>,
): string {
  if (source === 'weight') {
    return 'Auto: weight logged today';
  }

  if (source === 'workout') {
    return 'Auto: workout completed today';
  }

  if (
    source === 'nutrition_daily' &&
    config !== null &&
    'field' in config &&
    'op' in config &&
    'value' in config
  ) {
    const fieldLabel = config.field === 'calories' ? 'calories' : `${config.field}g`;
    return `Auto: ${fieldLabel} ${getOperatorLabel(config.op)} ${formatNumber(config.value)}`;
  }

  if (
    source === 'nutrition_meal' &&
    config !== null &&
    'mealType' in config &&
    'field' in config &&
    'op' in config &&
    'value' in config
  ) {
    return `Auto: ${config.mealType} ${config.field} ${getOperatorLabel(config.op)} ${formatNumber(config.value)}`;
  }

  return 'Auto: linked data source';
}

function buildDailyHabits(
  habits: HabitWithTodayEntry[],
  entries: HabitEntry[],
  isSelectedDateToday: boolean,
): DailyHabit[] {
  const entryByHabitId = new Map(entries.map((entry) => [entry.habitId, entry]));

  return habits.map((habit) => {
    const entry = entryByHabitId.get(habit.id);
    const isReferential = habit.referenceSource !== null && habit.referenceSource !== undefined;
    const useTodayEntry =
      isSelectedDateToday &&
      isReferential &&
      habit.todayEntry !== undefined &&
      habit.todayEntry !== null &&
      (entry?.isOverride ?? false) !== true;
    const effectiveBooleanValue = useTodayEntry
      ? habit.todayEntry?.completed
      : (entry?.completed ?? false);
    const effectiveNumericValue = useTodayEntry ? habit.todayEntry?.value : (entry?.value ?? null);
    const todayValue: HabitValue =
      habit.trackingType === 'boolean'
        ? (effectiveBooleanValue ?? false)
        : (effectiveNumericValue ?? null);

    return {
      id: habit.id,
      name: habit.name,
      emoji: habit.emoji ?? '•',
      trackingType: habit.trackingType,
      target: habit.target,
      unit: habit.unit,
      sourceHabit: habit,
      entryId: entry?.id ?? null,
      isOverride:
        entry?.isOverride === true || (useTodayEntry && habit.todayEntry?.isOverride === true),
      isReferential,
      todayValue,
      autoText:
        habit.referenceSource != null && habit.referenceConfig != null
          ? getReferentialAutoText(habit.referenceSource, habit.referenceConfig)
          : null,
    };
  });
}

function DailyHabitsLoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading daily habits" className="space-y-3">
      <Card className={accentCardStyles.pink}>
        <CardHeader className="gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] opacity-70 dark:text-muted dark:opacity-100">
            Daily habits
          </p>
          <div className="space-y-2.5">
            <Skeleton className="h-8 w-56 rounded-full bg-black/10 dark:bg-secondary" />
            <Skeleton className="h-4 w-full max-w-2xl rounded-full bg-black/10 dark:bg-secondary" />
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3">
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
    <div className="space-y-3">
      <Card className={accentCardStyles.pink}>
        <CardHeader className="gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] opacity-70 dark:text-muted dark:opacity-100">
            Daily habits
          </p>
          <div className="space-y-1.5">
            <CardTitle
              aria-level={2}
              className="text-2xl font-semibold tracking-tight sm:text-3xl"
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
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
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
  const todayKey = toDateKey(getToday());
  const isSelectedDateToday = isSameDay(activeDate, getToday());
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [descriptionModalHabitId, setDescriptionModalHabitId] = useState<string | null>(null);

  const habitsQuery = useHabits({
    refetchIntervalMs: getForegroundPollingInterval(HABIT_ENTRIES_POLL_INTERVAL_MS),
  });
  const habitEntriesQuery = useHabitEntries(activeDateKey, activeDateKey, {
    refetchIntervalMs: getForegroundPollingInterval(HABIT_ENTRIES_POLL_INTERVAL_MS),
  });
  const toggleHabitMutation = useToggleHabit();
  const updateHabitEntryMutation = useUpdateHabitEntry();

  const activeHabits = useMemo(() => habitsQuery.data ?? [], [habitsQuery.data]);
  const editingHabit = editingHabitId
    ? activeHabits.find((habit) => habit.id === editingHabitId)
    : undefined;

  const dailyHabits = buildDailyHabits(
    activeHabits,
    habitEntriesQuery.data ?? [],
    isSelectedDateToday,
  );
  const selectedDescriptionHabit = descriptionModalHabitId
    ? (dailyHabits.find((habit) => habit.id === descriptionModalHabitId) ?? null)
    : null;
  const selectedDescriptionHabitRationale = selectedDescriptionHabit
    ? getHabitRationale(selectedDescriptionHabit.sourceHabit)
    : null;

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
    const shouldCreateOverride = habit.isReferential && !habit.isOverride;

    if (shouldCreateOverride) {
      toast('Manual override - this will override auto-tracking for today');
    }

    if (habit.entryId && nextValue !== null) {
      updateHabitEntryMutation.mutate({
        id: habit.entryId,
        habitId: habit.id,
        date: activeDateKey,
        completed,
        value: nextValue,
        ...(habit.isReferential ? { isOverride: true } : {}),
      });
      return;
    }

    toggleHabitMutation.mutate({
      habitId: habit.id,
      entryId: habit.entryId,
      date: activeDateKey,
      completed,
      ...(habit.isReferential ? { isOverride: true } : {}),
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {todayFormatter.format(activeDate)}
          </h2>
          <p className="text-xs text-muted-foreground">
            {completedCount} of {activeHabits.length} complete
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {completedCount}/{activeHabits.length}
          </div>
        </div>
      </div>

      {activeHabits.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-5">
            <p className="text-base font-medium text-foreground">
              No active habits configured yet.
            </p>
            <p className="mt-2 text-sm text-muted">
              Add your first habit to start tracking progress.
            </p>
            <Button
              className="mt-3"
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
          <div className="grid gap-2.5">
            {dailyHabits.map((habit) => {
              const frequencySummary = getFrequencySummary(habit.sourceHabit);
              const isPaused =
                habit.sourceHabit.pausedUntil !== null && habit.sourceHabit.pausedUntil >= todayKey;
              const pausedLabel =
                isPaused && habit.sourceHabit.pausedUntil
                  ? formatPausedUntilLabel(habit.sourceHabit.pausedUntil)
                  : null;
              const value =
                habit.trackingType === 'boolean' || draftValues[habit.id] === undefined
                  ? habit.todayValue
                  : parseInputValue(draftValues[habit.id]);
              const isComplete = getHabitCompletion(habit, value);
              const progressText = getProgressText(habit, value);
              const progressPercent = getProgressPercent(habit, value);
              const hasTargetProgress =
                habit.trackingType !== 'boolean' && habit.target !== null && habit.target > 0;
              const percentageLabel = hasTargetProgress ? formatPercent(progressPercent) : null;
              const progressTone = hasTargetProgress ? getPercentTone(progressPercent) : null;
              const progressFillTone = hasTargetProgress
                ? getProgressBarTone(progressPercent)
                : 'bg-emerald-500';
              const isSavingValue =
                updateHabitEntryMutation.isPending &&
                updateHabitEntryMutation.variables?.habitId === habit.id;
              const isSavingToggle =
                toggleHabitMutation.isPending &&
                toggleHabitMutation.variables?.habitId === habit.id;
              const isAutoManaged = habit.isReferential && !habit.isOverride;
              const canResetToAuto =
                habit.isReferential && habit.isOverride && habit.entryId !== null;

              return (
                <Card
                  key={habit.id}
                  className={cn(
                    'gap-0 border-transparent py-0 shadow-sm transition-all duration-200',
                    trackingSurfaceClasses[habit.trackingType],
                    isComplete && 'ring-2 ring-emerald-500/40',
                    isPaused && 'border-dashed opacity-70',
                  )}
                >
                  {/* Top row: emoji + name + badges + menu */}
                  <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-1 sm:px-5">
                    <span
                      className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-xl text-2xl',
                        isComplete
                          ? 'bg-emerald-500/15 dark:bg-emerald-500/20'
                          : 'bg-black/5 dark:bg-white/5',
                      )}
                      aria-hidden="true"
                    >
                      {habit.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle
                          aria-level={3}
                          className={cn(
                            'truncate text-base font-semibold',
                            isComplete && 'line-through opacity-60',
                          )}
                          role="heading"
                        >
                          {habit.name}
                        </CardTitle>
                        {habit.isReferential ? (
                          <span
                            className="inline-flex items-center text-muted-foreground"
                            title="Auto-managed from linked data"
                          >
                            <Link2 className="size-3.5" />
                          </span>
                        ) : null}
                        {frequencySummary ? (
                          <span className="hidden shrink-0 text-[11px] font-medium uppercase tracking-wider opacity-50 sm:inline">
                            {frequencySummary}
                          </span>
                        ) : null}
                      </div>
                      {habit.sourceHabit.description ? (
                        <button
                          aria-label={`View full description for ${habit.name}`}
                          className="mt-0.5 block min-h-[44px] w-full cursor-pointer text-left"
                          onClick={() => setDescriptionModalHabitId(habit.sourceHabit.id)}
                          type="button"
                        >
                          <p className="truncate text-xs italic opacity-55 dark:text-muted-foreground">
                            {habit.sourceHabit.description}
                          </p>
                        </button>
                      ) : null}
                      {habit.autoText ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground/85">
                          {habit.autoText}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {isPaused ? (
                        <span className="rounded-full bg-black/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider dark:bg-secondary dark:text-foreground">
                          Paused
                        </span>
                      ) : null}
                      {isComplete ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                          <CheckCheck className="size-3" />
                          Done
                        </span>
                      ) : null}
                      <HabitCardMenu
                        habit={habit.sourceHabit}
                        habits={activeHabits}
                        onEdit={(selectedHabit) => {
                          setEditingHabitId(selectedHabit.id);
                          setIsFormDialogOpen(true);
                        }}
                      />
                    </div>
                  </div>

                  {/* Paused subtitle */}
                  {pausedLabel ? (
                    <p className="px-4 pl-[3.75rem] text-xs font-medium text-muted sm:pl-[4.25rem]">
                      {pausedLabel}
                    </p>
                  ) : null}

                  {/* Interaction area */}
                  <div className="px-4 pt-0.5 pb-3.5 sm:px-5">
                    {habit.trackingType === 'boolean' ? (
                      <label
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-0.5 py-1.5"
                        htmlFor={`habit-${habit.id}`}
                      >
                        <Checkbox
                          id={`habit-${habit.id}`}
                          aria-label={habit.name}
                          checked={value === true}
                          className={cn(
                            'size-5 border-border bg-white dark:bg-background',
                            isAutoManaged && 'opacity-45',
                          )}
                          disabled={isSavingToggle}
                          onCheckedChange={(checked) => {
                            const isManualOverride = habit.isReferential && !habit.isOverride;

                            if (isManualOverride) {
                              toast('Manual override - this will override auto-tracking for today');
                            }

                            toggleHabitMutation.mutate({
                              habitId: habit.id,
                              entryId: habit.entryId,
                              date: activeDateKey,
                              completed: checked === true,
                              ...(habit.isReferential ? { isOverride: true } : {}),
                            });
                          }}
                        />
                        <span className="text-sm text-foreground/70 dark:text-muted-foreground">
                          {isAutoManaged
                            ? 'Auto-tracked - tap to override'
                            : value === true
                              ? 'Completed'
                              : `Tap to complete${isSelectedDateToday ? '' : ' for this day'}`}
                        </span>
                      </label>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <Input
                            id={`habit-${habit.id}`}
                            aria-label={habit.name}
                            className={cn(
                              'h-9 w-24 shrink-0 border-border bg-white/75 text-center text-base font-semibold text-foreground placeholder:text-muted focus-visible:border-ring focus-visible:ring-ring/20 dark:bg-background',
                              isAutoManaged && 'opacity-55',
                            )}
                            disabled={isSavingValue || isSavingToggle}
                            inputMode="decimal"
                            min="0"
                            placeholder="0"
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
                          <div className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm">
                            <span className="font-medium opacity-70 dark:text-muted-foreground">
                              {progressText}
                            </span>
                            {percentageLabel ? (
                              <span className={cn('shrink-0 text-xs font-bold', progressTone)}>
                                {percentageLabel}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {hasTargetProgress ? (
                          <div
                            aria-hidden="true"
                            className="h-1.5 overflow-hidden rounded-full bg-black/8 dark:bg-white/10"
                          >
                            <div
                              className={cn(
                                'h-full rounded-full transition-[width] duration-300 ease-out',
                                progressFillTone,
                              )}
                              style={{
                                width: `${Math.min(Math.max(progressPercent, 0), 100)}%`,
                              }}
                            />
                          </div>
                        ) : null}

                        {isAutoManaged ? (
                          <p className="text-xs text-muted-foreground">
                            Auto-tracked from linked data. Enter a value to override.
                          </p>
                        ) : null}
                      </div>
                    )}

                    {canResetToAuto ? (
                      <div className="mt-1.5">
                        <Button
                          className="h-auto px-0 text-xs"
                          disabled={isSavingValue || isSavingToggle}
                          onClick={() => {
                            if (!habit.entryId) {
                              return;
                            }

                            updateHabitEntryMutation.mutate({
                              id: habit.entryId,
                              habitId: habit.id,
                              date: activeDateKey,
                              isOverride: false,
                            });
                          }}
                          type="button"
                          variant="link"
                        >
                          Reset to auto
                        </Button>
                      </div>
                    ) : null}
                  </div>
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
      <Dialog
        open={selectedDescriptionHabit !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDescriptionModalHabitId(null);
          }
        }}
      >
        <DialogContent className="max-h-[90dvh]">
          <DialogHeader>
            <DialogTitle>{selectedDescriptionHabit?.name ?? 'Habit details'}</DialogTitle>
            <DialogDescription>Full habit details for today.</DialogDescription>
          </DialogHeader>
          {selectedDescriptionHabit?.sourceHabit.description ? (
            <MarkdownNote
              className="text-sm text-foreground [&_p]:leading-6"
              content={selectedDescriptionHabit.sourceHabit.description}
            />
          ) : null}
          {selectedDescriptionHabitRationale ? (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Rationale
              </p>
              <MarkdownNote
                className="text-sm text-muted-foreground [&_p]:leading-6"
                content={selectedDescriptionHabitRationale}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
