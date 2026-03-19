import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, UtensilsCrossed } from 'lucide-react';

import { MealCardSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { HelpIcon } from '@/components/ui/help-icon';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { MealCard, NutritionMacroRings, NutritionWeekStrip } from '@/features/nutrition';
import {
  prefetchNutritionDay,
  useDailyNutrition,
  useDeleteMeal,
  useRenameMeal,
  useNutritionSummary,
  useNutritionWeekSummary,
} from '@/features/nutrition/api/nutrition';
import {
  NUTRITION_POLL_INTERVAL_MS,
  NUTRITION_WEEK_SUMMARY_POLL_INTERVAL_MS,
  getForegroundPollingInterval,
} from '@/lib/query-polling';
import {
  formatDateKey,
  formatDayLabel,
  isSameDay,
  addDays,
  sortMeals,
  toMealLoggedAtTimestamp,
  startOfDay,
  type MealSortDirection,
} from '@/features/nutrition/lib/nutrition-utils';

export function NutritionPage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [mealSortDirection, setMealSortDirection] = useState<MealSortDirection>('desc');
  const { confirm, dialog } = useConfirmation();
  const dateKey = formatDateKey(selectedDate);

  const dailyNutritionQuery = useDailyNutrition(dateKey, {
    refetchIntervalMs: getForegroundPollingInterval(NUTRITION_POLL_INTERVAL_MS),
  });
  const dailySummaryQuery = useNutritionSummary(dateKey, {
    refetchIntervalMs: getForegroundPollingInterval(NUTRITION_POLL_INTERVAL_MS),
  });
  const weekSummaryQuery = useNutritionWeekSummary(dateKey, {
    refetchIntervalMs: getForegroundPollingInterval(NUTRITION_WEEK_SUMMARY_POLL_INTERVAL_MS),
  });
  const deleteMealMutation = useDeleteMeal();
  const renameMealMutation = useRenameMeal();

  const selectedMeals = sortMeals(
    (dailyNutritionQuery.data?.meals ?? []).map(({ meal, items }) => ({
      id: meal.id,
      name: meal.name,
      summary: meal.summary,
      time: meal.time,
      loggedAt: toMealLoggedAtTimestamp(dateKey, meal.time, meal.createdAt),
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        displayQuantity: item.displayQuantity,
        displayUnit: item.displayUnit,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
      })),
    })),
    mealSortDirection,
    (meal) => meal.name,
  );

  const dailyTotals = dailySummaryQuery.data?.actual;
  const dailyTargets = dailySummaryQuery.data?.target ?? null;
  const isLoadingDay = dailyNutritionQuery.isLoading || dailySummaryQuery.isLoading;
  const isSelectedDateToday = isSameDay(selectedDate, new Date());
  const isViewingCurrentWeek = isSameWeek(selectedDate, new Date());
  const nutritionError =
    (dailyNutritionQuery.isError && dailyNutritionQuery.error) ||
    (dailySummaryQuery.isError && dailySummaryQuery.error) ||
    null;
  const deleteErrorMessage =
    deleteMealMutation.isError && deleteMealMutation.error instanceof Error
      ? deleteMealMutation.error.message
      : null;
  const renameErrorMessage =
    renameMealMutation.isError && renameMealMutation.error instanceof Error
      ? renameMealMutation.error.message
      : null;

  useEffect(() => {
    const previousDateKey = formatDateKey(addDays(selectedDate, -1));
    const nextDateKey = formatDateKey(addDays(selectedDate, 1));

    void prefetchNutritionDay(queryClient, previousDateKey);
    void prefetchNutritionDay(queryClient, nextDateKey);
  }, [queryClient, selectedDate]);

  function handleDeleteMeal(mealId: string) {
    const mealName = selectedMeals.find((meal) => meal.id === mealId)?.name;
    const dayLabel = formatDayLabel(dateKey);
    const description = mealName
      ? `This will permanently remove the ${mealName} meal logged on ${dayLabel}.`
      : `This will permanently remove the meal logged on ${dayLabel}.`;

    confirm({
      title: 'Delete meal?',
      description,
      confirmLabel: 'Delete meal',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await deleteMealMutation.mutateAsync({
            date: dateKey,
            mealId,
          });
        } catch {
          return;
        }
      },
    });
  }

  function handleRenameMeal(mealId: string, name: string) {
    renameMealMutation.mutate({
      date: dateKey,
      mealId,
      name,
    });
  }

  return (
    <section className="space-y-4 sm:space-y-5">
      <header className="space-y-1.5">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-semibold text-primary">Nutrition</h1>
          <HelpIcon title="Nutrition help">
            <p>
              Nutrition is read-only for meal data. Your AI agent logs meals and updates your daily
              totals.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Ask the agent to log, correct, or delete meals when something is off.</li>
              <li>Daily summary and macro rings show actual intake compared with your targets.</li>
              <li>Meal items snapshot calories/macros at log time for historical consistency.</li>
              <li>Food definition edits later will not retroactively change past meal macros.</li>
            </ul>
          </HelpIcon>
        </div>
        <p className="max-w-2xl text-sm text-muted">
          Agent-logged meals for {formatDayLabel(dateKey)}.
          <Button
            className={cn(
              'ml-2 h-auto min-h-0 p-0 align-baseline text-sm',
              isSelectedDateToday && 'invisible',
            )}
            size="sm"
            type="button"
            variant="link"
            onClick={() => setSelectedDate(startOfDay(new Date()))}
          >
            Today
          </Button>
        </p>
      </header>

      {weekSummaryQuery.isLoading ? (
        <NutritionWeekStripSkeleton />
      ) : weekSummaryQuery.data ? (
        <NutritionWeekStrip
          days={weekSummaryQuery.data}
          disableNextWeek={isViewingCurrentWeek}
          selectedDate={selectedDate}
          onNextWeek={() => setSelectedDate((currentDate) => addDays(currentDate, 7))}
          onPreviousWeek={() => setSelectedDate((currentDate) => addDays(currentDate, -7))}
          onSelectDate={setSelectedDate}
        />
      ) : weekSummaryQuery.isError ? (
        <p className="text-sm text-muted">Unable to load week summary.</p>
      ) : null}

      {nutritionError ? (
        <section className="rounded-2xl border border-destructive/30 px-5 py-6">
          <h2 className="text-lg font-semibold text-foreground">Unable to load nutrition</h2>
          <p className="mt-2 text-sm text-muted">
            {nutritionError instanceof Error
              ? nutritionError.message
              : 'Could not load nutrition data.'}
          </p>
        </section>
      ) : (
        <>
          {isLoadingDay ? (
            <NutritionRingsSkeleton />
          ) : dailyTargets && dailyTotals ? (
            <NutritionMacroRings actuals={dailyTotals} targets={dailyTargets} />
          ) : (
            <NutritionTargetsPlaceholder />
          )}

          {deleteErrorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {deleteErrorMessage}
            </p>
          ) : null}
          {renameErrorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {renameErrorMessage}
            </p>
          ) : null}

          <div className="space-y-2" aria-label="Meals logged section">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">Meals logged</h2>
              <Button
                aria-label="Toggle meal sort direction"
                aria-pressed={mealSortDirection === 'desc'}
                size="sm"
                type="button"
                variant="outline"
                onClick={() =>
                  setMealSortDirection((currentDirection) =>
                    currentDirection === 'asc' ? 'desc' : 'asc',
                  )
                }
              >
                {mealSortDirection === 'asc' ? (
                  <ArrowUp aria-hidden="true" className="size-4" />
                ) : (
                  <ArrowDown aria-hidden="true" className="size-4" />
                )}
                <span>{mealSortDirection === 'asc' ? 'Oldest first' : 'Newest first'}</span>
              </Button>
            </div>

            {isLoadingDay ? (
              <div aria-label="Loading nutrition meals" className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <MealCardSkeleton key={index} />
                ))}
              </div>
            ) : selectedMeals.length > 0 ? (
              selectedMeals.map((meal) => (
                <MealCard
                  key={meal.id}
                  isDeleting={
                    deleteMealMutation.isPending && deleteMealMutation.variables?.mealId === meal.id
                  }
                  isRenaming={
                    renameMealMutation.isPending && renameMealMutation.variables?.mealId === meal.id
                  }
                  meal={meal}
                  onDelete={handleDeleteMeal}
                  onRename={handleRenameMeal}
                />
              ))
            ) : (
              <EmptyState
                action={
                  isSelectedDateToday
                    ? undefined
                    : {
                        label: 'Go to today',
                        onClick: () => setSelectedDate(startOfDay(new Date())),
                      }
                }
                description="Ask your agent to log a meal."
                icon={UtensilsCrossed}
                title={
                  isSelectedDateToday ? 'No meals logged today' : 'No meals logged for this day'
                }
              />
            )}
          </div>
        </>
      )}
      {dialog}
    </section>
  );
}

function NutritionTargetsPlaceholder() {
  return (
    <section className="rounded-2xl border border-dashed border-border/70 bg-card/70 px-5 py-6 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Macro progress</h2>
      <p className="mt-2 text-sm text-muted">
        No daily macro target is set yet. Add one in settings to enable progress rings.
      </p>
    </section>
  );
}

function NutritionRingsSkeleton() {
  return (
    <section className="space-y-4" aria-label="Loading nutrition rings">
      <Skeleton className="h-5 w-40 bg-muted/70" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-44 rounded-2xl border border-border/70 bg-card/90" />
        ))}
      </div>
    </section>
  );
}

function NutritionWeekStripSkeleton() {
  const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

  return (
    <section
      aria-label="Loading nutrition week strip"
      className="rounded-2xl border border-border/70 p-2"
    >
      <div className="grid grid-cols-7 gap-1">
        {dayKeys.map((dayKey) => (
          <Skeleton key={dayKey} className="h-14 rounded-xl bg-muted/60" />
        ))}
      </div>
    </section>
  );
}

function isSameWeek(left: Date, right: Date) {
  return getWeekStart(left).getTime() === getWeekStart(right).getTime();
}

function getWeekStart(date: Date) {
  const normalizedDate = startOfDay(date);
  const dayOfWeek = normalizedDate.getDay();
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDays(normalizedDate, offsetToMonday);
}
