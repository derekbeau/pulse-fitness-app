import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, UtensilsCrossed } from 'lucide-react';

import { MealCardSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { HelpIcon } from '@/components/ui/help-icon';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { DateNavBar, MealCard, NutritionMacroRings } from '@/features/nutrition';
import {
  prefetchNutritionDay,
  useDailyNutrition,
  useDeleteMeal,
  useNutritionSummary,
} from '@/features/nutrition/api/nutrition';
import {
  formatDateKey,
  formatCalories,
  formatDayLabel,
  formatGrams,
  isSameDay,
  addDays,
  sortMeals,
  toMealLoggedAtTimestamp,
  startOfDay,
  type MealSortDirection,
  type MacroTotals,
  type MacroKey,
} from '@/features/nutrition/lib/nutrition-utils';
import { accentCardStyles } from '@/lib/accent-card-styles';
import { cn } from '@/lib/utils';

const MACRO_CONFIG: Array<{
  key: MacroKey;
  label: string;
  formatValue: (value: number) => string;
}> = [
  { key: 'calories', label: 'Calories', formatValue: formatCalories },
  { key: 'protein', label: 'Protein', formatValue: formatGrams },
  { key: 'carbs', label: 'Carbs', formatValue: formatGrams },
  { key: 'fat', label: 'Fat', formatValue: formatGrams },
];

const EMPTY_TOTALS: MacroTotals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
};

export function NutritionPage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [mealSortDirection, setMealSortDirection] = useState<MealSortDirection>('asc');
  const { confirm, dialog } = useConfirmation();
  const dateKey = formatDateKey(selectedDate);

  const dailyNutritionQuery = useDailyNutrition(dateKey);
  const dailySummaryQuery = useNutritionSummary(dateKey);
  const deleteMealMutation = useDeleteMeal();

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

  const dailyTotals = dailySummaryQuery.data?.actual ?? EMPTY_TOTALS;
  const dailyTargets = dailySummaryQuery.data?.target ?? null;
  const isLoadingDay = dailyNutritionQuery.isLoading || dailySummaryQuery.isLoading;
  const isSelectedDateToday = isSameDay(selectedDate, new Date());
  const nutritionError =
    (dailyNutritionQuery.isError && dailyNutritionQuery.error) ||
    (dailySummaryQuery.isError && dailySummaryQuery.error) ||
    null;
  const deleteErrorMessage =
    deleteMealMutation.isError && deleteMealMutation.error instanceof Error
      ? deleteMealMutation.error.message
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

  return (
    <section className="space-y-5">
      <header className="space-y-2">
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
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <DateNavBar className="flex-1" selectedDate={selectedDate} onDateChange={setSelectedDate} />
        <Button
          aria-label="Toggle meal sort direction"
          aria-pressed={mealSortDirection === 'desc'}
          className="w-full justify-center sm:w-auto sm:justify-start"
          size="sm"
          type="button"
          variant="outline"
          onClick={() =>
            setMealSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'))
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
          <section
            aria-label="Daily macro totals"
            className={cn('rounded-2xl border border-border/70 px-5 py-5', accentCardStyles.cream)}
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Daily totals</h2>
                <p className="text-sm opacity-70 dark:text-muted dark:opacity-100">
                  Actual intake against your daily macro targets.
                </p>
              </div>
              <p className="text-sm font-medium opacity-75 dark:text-muted dark:opacity-100">
                {formatDayLabel(dateKey)}
              </p>
            </div>

            {isLoadingDay ? (
              <NutritionTotalsSkeleton />
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {MACRO_CONFIG.map((macro) => {
                  const actual = dailyTotals[macro.key];
                  const target = dailyTargets?.[macro.key] ?? null;
                  const isOverTarget = target !== null && actual > target;

                  return (
                    <div
                      key={macro.key}
                      className="rounded-xl border border-black/8 bg-white/30 px-4 py-4 backdrop-blur-sm dark:border-border dark:bg-secondary/60"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-65 dark:text-muted dark:opacity-100">
                        {macro.label}
                      </p>
                      <p className="mt-2 text-sm font-semibold">
                        <span
                          className={cn(
                            target === null
                              ? 'text-foreground'
                              : isOverTarget
                              ? 'text-red-900 dark:text-red-400'
                              : 'text-emerald-950 dark:text-emerald-400',
                            'text-lg tracking-tight',
                          )}
                        >
                          {macro.formatValue(actual)}
                        </span>
                        {target === null ? (
                          <span className="opacity-70 dark:text-muted dark:opacity-100">
                            {' '}
                            / No target set
                          </span>
                        ) : (
                          <span className="opacity-70 dark:text-muted dark:opacity-100">
                            {' '}
                            / {macro.formatValue(target)}
                          </span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {isLoadingDay ? (
            <NutritionRingsSkeleton />
          ) : dailyTargets ? (
            <NutritionMacroRings actuals={dailyTotals} targets={dailyTargets} />
          ) : (
            <NutritionTargetsPlaceholder />
          )}

          {deleteErrorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {deleteErrorMessage}
            </p>
          ) : null}

          <div className="space-y-3">
            {isLoadingDay ? (
              <div aria-label="Loading nutrition meals" className="space-y-3">
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
                  meal={meal}
                  onDelete={handleDeleteMeal}
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
                title={isSelectedDateToday ? 'No meals logged today' : 'No meals logged for this day'}
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
    <section className="rounded-2xl border border-dashed border-border/70 bg-card/70 px-6 py-8 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Macro progress</h2>
      <p className="mt-2 text-sm text-muted">
        No daily macro target is set yet. Add one in settings to enable progress rings.
      </p>
    </section>
  );
}

function NutritionTotalsSkeleton() {
  return (
    <div
      aria-label="Loading nutrition"
      className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-20 rounded-xl border border-black/8 bg-white/30 dark:border-border dark:bg-secondary/60"
        />
      ))}
    </div>
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
