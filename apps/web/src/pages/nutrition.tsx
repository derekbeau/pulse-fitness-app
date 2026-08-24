import { useQueryClient } from '@tanstack/react-query';
import { type KeyboardEvent, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, UtensilsCrossed } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { addCalendarDays, chartDateKeyInTimeZone } from '@pulse/shared';

import { MealCardSkeleton } from '@/components/skeletons';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { HelpIcon } from '@/components/ui/help-icon';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { FoodList } from '@/features/foods';
import {
  AdaptiveCoach,
  NutritionDayStatusControl,
  useAdaptiveNutritionState,
} from '@/features/adaptive-nutrition';
import { nutritionTrendReferenceDate } from '@/features/nutrition/components/nutrition-trend-reference';
import { NutritionTrends } from '@/features/nutrition/components/nutrition-trends';
import {
  DailyEnergyAdherenceCard,
  MealCard,
  NutritionMacroRings,
  NutritionWeekStrip,
} from '@/features/nutrition';
import {
  prefetchNutritionDay,
  useDailyEnergyAdherence,
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
  formatDayLabel,
  sortMeals,
  toMealLoggedAtTimestamp,
  type MealSortDirection,
} from '@/features/nutrition/lib/nutrition-utils';

const NUTRITION_VIEWS = ['log', 'coach', 'foods', 'trends'] as const;

type NutritionView = (typeof NUTRITION_VIEWS)[number];

function isNutritionView(value: string | null): value is NutritionView {
  return value != null && NUTRITION_VIEWS.includes(value as NutritionView);
}

function handleViewTabKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  setActiveView: (view: NutritionView) => void,
) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
  const currentIndex = tabs.indexOf(document.activeElement as HTMLElement);
  if (currentIndex < 0) return;
  event.preventDefault();
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[nextIndex]?.focus();
  setActiveView(NUTRITION_VIEWS[nextIndex]);
}

export function NutritionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const activeView: NutritionView = isNutritionView(viewParam) ? viewParam : 'log';
  const adaptiveStateQuery = useAdaptiveNutritionState();
  const coachNeedsAttention = Boolean(
    adaptiveStateQuery.data?.checkInDue || adaptiveStateQuery.data?.pendingCheckIn,
  );
  const nutritionTimeZone = adaptiveStateQuery.isLoading
    ? null
    : (adaptiveStateQuery.data?.program?.timeZone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      'UTC');
  const trendsReferenceDate = nutritionTimeZone
    ? nutritionTrendReferenceDate(Date.now(), nutritionTimeZone)
    : null;

  useEffect(() => {
    if (isNutritionView(viewParam)) {
      return;
    }

    setSearchParams(
      (previousSearchParams) => {
        const nextSearchParams = new URLSearchParams(previousSearchParams);
        nextSearchParams.set('view', 'log');
        return nextSearchParams;
      },
      { replace: true },
    );
  }, [setSearchParams, viewParam]);

  function setActiveView(view: NutritionView) {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('view', view);
    setSearchParams(nextSearchParams);
  }

  return (
    <section className="space-y-4 sm:space-y-5">
      <PageHeader
        actions={
          <HelpIcon title="Nutrition help">
            <p>
              Nutrition is read-only for meal data. Your AI agent logs meals and updates your daily
              totals.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Ask the agent to log, correct, or delete meals when something is off.</li>
              <li>Daily summary and macro rings show actual intake compared with your targets.</li>
              <li>
                Daily energy compares complete past days with the accepted target and expenditure
                effective on that date. Partial, unknown, missing, and current days are never
                graded.
              </li>
              <li>Meal items snapshot calories/macros at log time for historical consistency.</li>
              <li>Food definition edits later will not retroactively change past meal macros.</li>
              <li>
                Mark days Complete only when every calorie-containing item is represented. Meal
                changes automatically return a Complete day to Partial.
              </li>
              <li>
                Nutrition Coach estimates personalized expenditure from complete days and weight
                trend; recommendations require your approval.
              </li>
              <li>
                Goal progress uses smoothed trend weight and labels the latest scale entry
                separately. Edits and new directions preserve your learned expenditure and history.
              </li>
              <li>
                Goal-driven targets remain proposals until accepted. Reaching a target still
                requires a separate completion review before maintenance begins.
              </li>
            </ul>
          </HelpIcon>
        }
        description={
          activeView === 'log'
            ? 'Review daily meal logs and macro progress.'
            : activeView === 'coach'
              ? 'Review your expenditure estimate, data readiness, and target recommendations.'
              : activeView === 'foods'
                ? 'Browse and manage your saved foods library.'
                : 'Track calories and macros across 7, 30, or 90 days.'
        }
        title="Nutrition"
      >
        <div
          aria-label="Nutrition views"
          className="flex w-full flex-wrap items-center gap-1 rounded-2xl border border-border bg-card p-1 sm:w-fit sm:rounded-full"
          onKeyDown={(event) => handleViewTabKeyDown(event, setActiveView)}
          role="tablist"
        >
          <Button
            aria-controls="nutrition-view-panel"
            aria-selected={activeView === 'log'}
            className="rounded-full"
            id="nutrition-view-log"
            onClick={() => setActiveView('log')}
            role="tab"
            size="sm"
            tabIndex={activeView === 'log' ? 0 : -1}
            type="button"
            variant={activeView === 'log' ? 'default' : 'ghost'}
          >
            Log
          </Button>
          <Button
            aria-controls="nutrition-view-panel"
            aria-selected={activeView === 'coach'}
            className="rounded-full"
            id="nutrition-view-coach"
            onClick={() => setActiveView('coach')}
            role="tab"
            size="sm"
            tabIndex={activeView === 'coach' ? 0 : -1}
            type="button"
            variant={activeView === 'coach' ? 'default' : 'ghost'}
          >
            Coach
            {coachNeedsAttention ? (
              <Badge
                aria-hidden="true"
                className="border-current bg-current/10 px-1.5 text-[0.65rem] text-inherit"
                variant="outline"
              >
                {adaptiveStateQuery.data?.pendingCheckIn ? 'Review' : 'Due'}
              </Badge>
            ) : null}
            {coachNeedsAttention ? <span className="sr-only"> needs attention</span> : null}
          </Button>
          <Button
            aria-controls="nutrition-view-panel"
            aria-selected={activeView === 'foods'}
            className="rounded-full"
            id="nutrition-view-foods"
            onClick={() => setActiveView('foods')}
            role="tab"
            size="sm"
            tabIndex={activeView === 'foods' ? 0 : -1}
            type="button"
            variant={activeView === 'foods' ? 'default' : 'ghost'}
          >
            Foods
          </Button>
          <Button
            aria-controls="nutrition-view-panel"
            aria-selected={activeView === 'trends'}
            className="rounded-full"
            id="nutrition-view-trends"
            onClick={() => setActiveView('trends')}
            role="tab"
            size="sm"
            tabIndex={activeView === 'trends' ? 0 : -1}
            type="button"
            variant={activeView === 'trends' ? 'default' : 'ghost'}
          >
            Trends
          </Button>
        </div>
      </PageHeader>

      <div
        aria-labelledby={`nutrition-view-${activeView}`}
        id="nutrition-view-panel"
        role="tabpanel"
      >
        {activeView === 'log' ? (
          nutritionTimeZone ? (
            <NutritionLogTab key={nutritionTimeZone} timeZone={nutritionTimeZone} />
          ) : (
            <NutritionLogTabSkeleton />
          )
        ) : activeView === 'coach' ? (
          <AdaptiveCoach />
        ) : activeView === 'foods' ? (
          <FoodList />
        ) : trendsReferenceDate ? (
          <NutritionTrends referenceDate={trendsReferenceDate} />
        ) : (
          <section
            aria-label="Loading nutrition trends"
            className="space-y-4 rounded-3xl border border-border/70 bg-card p-4 sm:p-5"
            role="status"
          >
            <Skeleton className="h-6 w-40 bg-muted/70" />
            <Skeleton className="h-64 w-full rounded-2xl bg-muted/70" />
          </section>
        )}
      </div>
    </section>
  );
}

function NutritionLogTab({ timeZone }: { timeZone: string }) {
  const queryClient = useQueryClient();
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const todayDateKey = chartDateKeyInTimeZone(currentTimeMs, timeZone);
  const [selectedDate, setSelectedDate] = useState(() => todayDateKey);
  const [mealSortDirection, setMealSortDirection] = useState<MealSortDirection>('desc');
  const { confirm, dialog } = useConfirmation();
  const dateKey = selectedDate;

  useEffect(() => {
    const refreshCurrentTime = () => setCurrentTimeMs(Date.now());
    const refreshVisibleTime = () => {
      if (document.visibilityState === 'visible') refreshCurrentTime();
    };

    window.addEventListener('focus', refreshCurrentTime);
    document.addEventListener('visibilitychange', refreshVisibleTime);
    return () => {
      window.removeEventListener('focus', refreshCurrentTime);
      document.removeEventListener('visibilitychange', refreshVisibleTime);
    };
  }, []);

  const dailyNutritionQuery = useDailyNutrition(dateKey, {
    refetchIntervalMs: getForegroundPollingInterval(NUTRITION_POLL_INTERVAL_MS),
  });
  const dailySummaryQuery = useNutritionSummary(dateKey, {
    refetchIntervalMs: getForegroundPollingInterval(NUTRITION_POLL_INTERVAL_MS),
  });
  const dailyEnergyQuery = useDailyEnergyAdherence(dateKey, {
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
  const isSelectedDateToday = selectedDate === todayDateKey;
  const isViewingCurrentWeek = getWeekStart(selectedDate) === getWeekStart(todayDateKey);
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
    const previousDateKey = addCalendarDays(selectedDate, -1);
    const nextDateKey = addCalendarDays(selectedDate, 1);

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
    <>
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
          onClick={() => setSelectedDate(todayDateKey)}
        >
          Today
        </Button>
      </p>

      {weekSummaryQuery.isLoading ? (
        <NutritionWeekStripSkeleton />
      ) : weekSummaryQuery.data ? (
        <NutritionWeekStrip
          days={weekSummaryQuery.data}
          disableNextWeek={isViewingCurrentWeek}
          selectedDate={selectedDate}
          onNextWeek={() =>
            setSelectedDate(
              (currentDate) =>
                [addCalendarDays(currentDate, 7), todayDateKey].sort()[0] ?? todayDateKey,
            )
          }
          onPreviousWeek={() => setSelectedDate((currentDate) => addCalendarDays(currentDate, -7))}
          onSelectDate={setSelectedDate}
        />
      ) : weekSummaryQuery.isError ? (
        <p className="text-sm text-muted">Unable to load week summary.</p>
      ) : null}

      <NutritionDayStatusControl
        date={dateKey}
        isToday={isSelectedDateToday}
        status={dailyNutritionQuery.data?.log.status ?? null}
      />

      <DailyEnergyAdherenceCard
        adherence={dailyEnergyQuery.data?.localDate === dateKey ? dailyEnergyQuery.data : undefined}
        error={dailyEnergyQuery.isError ? dailyEnergyQuery.error : null}
        isFetching={dailyEnergyQuery.isFetching}
        isLoading={
          dailyEnergyQuery.isPending ||
          (dailyEnergyQuery.data?.localDate !== dateKey && dailyEnergyQuery.isFetching)
        }
        isRefetchError={dailyEnergyQuery.isRefetchError}
        isStale={dailyEnergyQuery.isStale}
        onRetry={() => void dailyEnergyQuery.refetch()}
        requestedDate={dateKey}
      />

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
                        onClick: () => setSelectedDate(todayDateKey),
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
    </>
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

function getWeekStart(date: string) {
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addCalendarDays(date, offsetToMonday);
}

function NutritionLogTabSkeleton() {
  return (
    <section aria-label="Loading nutrition log calendar" className="space-y-4" role="status">
      <Skeleton className="h-5 w-64 max-w-full bg-muted/70" />
      <NutritionWeekStripSkeleton />
      <Skeleton className="h-56 w-full rounded-2xl bg-muted/70" />
      <NutritionRingsSkeleton />
      <div aria-label="Loading nutrition meals" className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <MealCardSkeleton key={index} />
        ))}
      </div>
    </section>
  );
}
