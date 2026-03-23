import { DASHBOARD_WIDGET_IDS } from '@pulse/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Calendar, LayoutDashboard, Pencil } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { StatCardSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { HelpIcon } from '@/components/ui/help-icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarPicker } from '@/features/dashboard/components/calendar-picker';
import { DashboardCardHeaderLink } from '@/features/dashboard/components/dashboard-drilldown-link';
import { HabitDailyStatusCard } from '@/features/dashboard/components/habit-daily-status-card';
import { HabitChain } from '@/features/dashboard/components/habit-chain';
import { MacroRings } from '@/features/dashboard/components/macro-rings';
import { RecentWorkouts } from '@/features/dashboard/components/recent-workouts';
import { SnapshotCards } from '@/features/dashboard/components/snapshot-cards';
import { getDashboardGreeting } from '@/features/dashboard/lib/greeting';
import { TrendSparklines } from '@/features/dashboard/components/trend-sparkline';
import { WeightTrendChart } from '@/features/dashboard/components/weight-trend-chart';
import { DashboardWidgetSidebar } from '@/features/dashboard/components/widget-sidebar';
import {
  getHabitIdFromDailyWidgetId,
  isDashboardStaticWidgetId,
  isHabitDailyWidgetId,
  toHabitDailyWidgetId,
  type DashboardStaticWidgetId,
  type HabitDailyWidgetId,
} from '@/features/dashboard/lib/widget-utils';
import { useHabits } from '@/features/habits/api/habits';
import { useRecentWorkouts } from '@/hooks/use-recent-workouts';
import { useLogWeight } from '@/features/weight/api/weight';
import { prefetchDashboardSnapshot, useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import { useDashboardConfig, useSaveDashboardConfig } from '@/hooks/use-dashboard-config';
import { useHabitChains } from '@/hooks/use-habit-chains';
import {
  DASHBOARD_SNAPSHOT_POLL_INTERVAL_MS,
  HABIT_ENTRIES_POLL_INTERVAL_MS,
  getForegroundPollingInterval,
} from '@/lib/query-polling';
import { addDays, getToday, isSameDay, toDateKey } from '@/lib/date';
import { cn } from '@/lib/utils';

const dashboardDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});
type DashboardWidgetId = DashboardStaticWidgetId | HabitDailyWidgetId;
const DEFAULT_VISIBLE_WIDGETS = Object.keys(DASHBOARD_WIDGET_IDS) as DashboardStaticWidgetId[];
const DEFAULT_DASHBOARD_CONFIG = {
  habitChainIds: [],
  trendMetrics: ['weight', 'calories', 'protein'] as const,
  visibleWidgets: DEFAULT_VISIBLE_WIDGETS,
};

function isDashboardWidgetId(value: string): value is DashboardWidgetId {
  return isDashboardStaticWidgetId(value) || isHabitDailyWidgetId(value);
}

function getUniqueWidgetIds<TWidgetId extends string>(widgetIds: TWidgetId[]) {
  return Array.from(new Set(widgetIds));
}

function areWidgetArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

type DashboardWeightStatus = {
  message: string;
  type: 'error' | 'success';
};

function DashboardWidgetFrame({
  children,
  className,
  dataSlot,
  widgetLabel,
}: {
  children: ReactNode;
  className?: string;
  dataSlot?: string;
  widgetLabel: string;
}) {
  return (
    <div className={cn('relative', className)} data-slot={dataSlot} data-widget-label={widgetLabel}>
      {children}
    </div>
  );
}

export function DashboardPage() {
  const isMountedRef = useRef(true);
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(() => getToday());
  const [weightInput, setWeightInput] = useState('');
  const [weightStatus, setWeightStatus] = useState<DashboardWeightStatus | null>(null);
  const [isWeightEditorOpen, setIsWeightEditorOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isWidgetSidebarOpen, setIsWidgetSidebarOpen] = useState(false);
  const [visibleWidgetsDraft, setVisibleWidgetsDraft] = useState<DashboardWidgetId[] | null>(null);
  const [habitChainIdsDraft, setHabitChainIdsDraft] = useState<string[] | null>(null);
  const [widgetSidebarMessage, setWidgetSidebarMessage] = useState('');
  const logWeightMutation = useLogWeight();
  const saveDashboardConfigMutation = useSaveDashboardConfig();
  const selectedDateKey = toDateKey(selectedDate);
  const habitRangeStart = toDateKey(addDays(selectedDate, -29));
  const selectedDateLabel = dashboardDateFormatter.format(selectedDate);
  const isViewingToday = isSameDay(selectedDate, getToday());
  const greeting = getDashboardGreeting();

  const snapshotQuery = useDashboardSnapshot(selectedDateKey, {
    refetchIntervalMs: getForegroundPollingInterval(DASHBOARD_SNAPSHOT_POLL_INTERVAL_MS),
  });
  // TODO: apply widgetOrder to section layout once ordering UI is added.
  const dashboardConfigQuery = useDashboardConfig();
  const habitsQuery = useHabits({
    refetchIntervalMs: getForegroundPollingInterval(HABIT_ENTRIES_POLL_INTERVAL_MS),
  });
  const habitChainEntriesQuery = useHabitChains(habitRangeStart, selectedDateKey, {
    refetchIntervalMs: getForegroundPollingInterval(HABIT_ENTRIES_POLL_INTERVAL_MS),
  });
  const recentWorkoutsQuery = useRecentWorkouts();
  const persistedVisibleWidgets = getUniqueWidgetIds(
    dashboardConfigQuery.data?.visibleWidgets ?? DEFAULT_VISIBLE_WIDGETS,
  ).filter(isDashboardWidgetId);
  const persistedHabitChainIds = getUniqueWidgetIds(dashboardConfigQuery.data?.habitChainIds ?? []);
  const visibleWidgets = visibleWidgetsDraft ?? persistedVisibleWidgets;
  const habitChainIds = habitChainIdsDraft ?? persistedHabitChainIds;
  const visibleHabitDailyWidgets = visibleWidgets.filter(isHabitDailyWidgetId).map((widgetId) => ({
    habitId: getHabitIdFromDailyWidgetId(widgetId),
    widgetId,
  }));
  const showWeightTrendChart = visibleWidgets.includes('weight-trend');
  const isSavingDashboardConfig = saveDashboardConfigMutation.isPending;
  const hasSidebarDraft = visibleWidgetsDraft !== null || habitChainIdsDraft !== null;
  const hasSidebarChanges =
    hasSidebarDraft &&
    (!areWidgetArraysEqual(visibleWidgets, persistedVisibleWidgets) ||
      !areWidgetArraysEqual(habitChainIds, persistedHabitChainIds));
  const selectedWeight = snapshotQuery.data?.weight;
  const hasWeightForSelectedDay = selectedWeight?.date === selectedDateKey;

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  function openWidgetSidebar() {
    setVisibleWidgetsDraft(persistedVisibleWidgets);
    setHabitChainIdsDraft(persistedHabitChainIds);
    setWidgetSidebarMessage('');
    setIsWidgetSidebarOpen(true);
  }

  function setStaticWidgetVisibility(widgetId: DashboardStaticWidgetId, isVisible: boolean) {
    setVisibleWidgetsDraft((currentDraft) => {
      const current = currentDraft ?? persistedVisibleWidgets;
      if (isVisible) {
        if (current.includes(widgetId)) {
          return current;
        }

        return getUniqueWidgetIds([...current, widgetId]);
      }

      if (!current.includes(widgetId)) {
        return current;
      }

      return current.filter((value) => value !== widgetId);
    });
  }

  function handleSelectedDateChange(nextDate: Date) {
    setIsWeightEditorOpen(false);
    setWeightInput('');
    setWeightStatus(null);
    setSelectedDate(nextDate);
    setIsCalendarOpen(false);
  }

  function setHabitDailyWidgetVisibility(habitId: string, isVisible: boolean) {
    const widgetId = toHabitDailyWidgetId(habitId);

    setVisibleWidgetsDraft((currentDraft) => {
      const current = currentDraft ?? persistedVisibleWidgets;
      if (isVisible) {
        if (current.includes(widgetId)) {
          return current;
        }

        return getUniqueWidgetIds([...current, widgetId]);
      }

      return current.filter((value) => value !== widgetId);
    });
  }

  function setAllHabitDailyWidgetsVisibility(isVisible: boolean) {
    const habitDailyWidgetIds = (habitsQuery.data ?? []).map((habit) =>
      toHabitDailyWidgetId(habit.id),
    );

    setVisibleWidgetsDraft((currentDraft) => {
      const current = currentDraft ?? persistedVisibleWidgets;
      if (isVisible) {
        return getUniqueWidgetIds([...current, ...habitDailyWidgetIds]);
      }

      return current.filter((widgetId) => !isHabitDailyWidgetId(widgetId));
    });
  }

  function setHabitChainVisibility(habitId: string, isVisible: boolean) {
    setHabitChainIdsDraft((currentDraft) => {
      const current = currentDraft ?? persistedHabitChainIds;
      if (isVisible) {
        if (current.includes(habitId)) {
          return current;
        }

        return [...current, habitId];
      }

      return current.filter((value) => value !== habitId);
    });
  }

  function handleVisibleWidgetReorder(nextVisibleWidgets: string[]) {
    setVisibleWidgetsDraft(nextVisibleWidgets.filter(isDashboardWidgetId));
  }

  function resetWidgetSidebarDraft() {
    setVisibleWidgetsDraft(null);
    setHabitChainIdsDraft(null);
    setWidgetSidebarMessage('');
  }

  async function saveWidgetSidebarChanges() {
    if (!hasSidebarChanges) {
      if (isMountedRef.current) {
        resetWidgetSidebarDraft();
      }
      return true;
    }

    const sourceConfig = dashboardConfigQuery.data ?? DEFAULT_DASHBOARD_CONFIG;
    try {
      await saveDashboardConfigMutation.mutateAsync({
        ...sourceConfig,
        habitChainIds,
        trendMetrics: [...sourceConfig.trendMetrics],
        visibleWidgets,
      });
      if (isMountedRef.current) {
        resetWidgetSidebarDraft();
      }
      return true;
    } catch {
      if (isMountedRef.current) {
        setWidgetSidebarMessage('Unable to save dashboard widgets. Please try again.');
      }
      return false;
    }
  }

  async function saveWidgetSidebarAndClose() {
    const didSave = await saveWidgetSidebarChanges();
    if (didSave && isMountedRef.current) {
      setIsWidgetSidebarOpen(false);
    }
  }

  function handleSidebarOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setIsWidgetSidebarOpen(true);
      return;
    }

    if (isSavingDashboardConfig) {
      return;
    }

    if (!hasSidebarDraft) {
      setIsWidgetSidebarOpen(false);
      return;
    }

    void saveWidgetSidebarAndClose();
  }

  function handleWidgetSidebarSave() {
    if (isSavingDashboardConfig) {
      return;
    }

    void saveWidgetSidebarAndClose();
  }

  useEffect(() => {
    const previousDateKey = toDateKey(addDays(selectedDate, -1));
    const nextDateKey = toDateKey(addDays(selectedDate, 1));

    void prefetchDashboardSnapshot(queryClient, previousDateKey);
    void prefetchDashboardSnapshot(queryClient, nextDateKey);
  }, [queryClient, selectedDate]);

  async function handleWeightSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedWeight = Number(weightInput);
    if (Number.isNaN(parsedWeight) || parsedWeight <= 0) {
      setWeightStatus({
        message: 'Enter a valid weight above 0.',
        type: 'error',
      });
      return;
    }

    try {
      await logWeightMutation.mutateAsync({
        date: selectedDateKey,
        weight: parsedWeight,
      });
      setWeightInput('');
      setWeightStatus({
        message: 'Weight entry saved.',
        type: 'success',
      });
      setIsWeightEditorOpen(false);
    } catch {
      setWeightStatus({
        message: 'Unable to save weight. Please try again.',
        type: 'error',
      });
    }
  }

  const shouldShowEmptyState =
    !snapshotQuery.isLoading &&
    !habitsQuery.isLoading &&
    !recentWorkoutsQuery.isLoading &&
    !snapshotQuery.isError &&
    !habitsQuery.isError &&
    !recentWorkoutsQuery.isError &&
    (habitsQuery.data?.length ?? 0) === 0 &&
    (recentWorkoutsQuery.data?.length ?? 0) === 0;

  return (
    <main className="mr-auto flex w-full max-w-screen-xl flex-col gap-6 py-5 sm:gap-7 sm:py-6">
      <div className="animate-fade-in space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted sm:text-sm">
          {greeting}
        </p>
        <PageHeader
          actions={
            <>
              <HelpIcon title="Dashboard help">
                <p>
                  Dashboard gives you a daily snapshot of nutrition, body weight trend, habits,
                  and recent workout activity.
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    Nutrition totals come from meals logged by your AI agent, not manual entry.
                  </li>
                  <li>
                    Use Weight Trend range buttons to zoom and compare short vs long-term
                    direction.
                  </li>
                  <li>
                    The trend line smooths daily swings so it is easier to spot overall momentum.
                  </li>
                  <li>
                    Habit streaks show how many consecutive days each habit has been completed.
                  </li>
                </ul>
              </HelpIcon>
              {!isViewingToday ? (
                <Button
                  onClick={() => handleSelectedDateChange(getToday())}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Back to today
                </Button>
              ) : null}
              <Button
                aria-label="Edit dashboard widgets"
                onClick={openWidgetSidebar}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <Pencil />
              </Button>
            </>
          }
          title="Dashboard"
        >
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground sm:text-base">{selectedDateLabel}</p>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button aria-label="Change date" size="icon-sm" type="button" variant="ghost">
                  <Calendar className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <CalendarPicker
                  className="border-0"
                  onDateSelect={handleSelectedDateChange}
                  selectedDate={selectedDate}
                />
              </PopoverContent>
            </Popover>
          </div>
        </PageHeader>
      </div>

      {shouldShowEmptyState ? (
        <EmptyState
          description="Start by setting up your habits and logging your first workout."
          icon={LayoutDashboard}
          title="Welcome to Pulse!"
        />
      ) : (
        <div
          className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2"
          data-slot="dashboard-layout"
        >
          <div
            className="order-1 flex min-w-0 flex-col gap-3 sm:gap-4 md:order-1"
            data-slot="dashboard-main-column"
          >
            {visibleWidgets.includes('snapshot-cards') || visibleWidgets.includes('log-weight') ? (
              <div className="order-2 md:order-1" data-slot="dashboard-snapshot-panel">
                <div className="flex flex-col gap-3 sm:gap-4">
                  {visibleWidgets.includes('snapshot-cards') ? (
                    <DashboardWidgetFrame widgetLabel={DASHBOARD_WIDGET_IDS['snapshot-cards']}>
                      {snapshotQuery.isLoading ? (
                        <div
                          aria-label="Loading dashboard snapshots"
                          className="grid grid-cols-2 gap-3"
                        >
                          {Array.from({ length: 5 }).map((_, index) => (
                            <StatCardSkeleton
                              className={index === 4 ? 'col-span-2' : undefined}
                              key={index}
                              showTrend={index !== 4}
                            />
                          ))}
                        </div>
                      ) : (
                        <SnapshotCards snapshot={snapshotQuery.data} />
                      )}
                    </DashboardWidgetFrame>
                  ) : null}
                  {visibleWidgets.includes('log-weight') ? (
                    <DashboardWidgetFrame widgetLabel={DASHBOARD_WIDGET_IDS['log-weight']}>
                      <Card
                        className="gap-3 py-3 transition-[box-shadow,border-color,background-color] duration-200 hover:border-primary/35 hover:bg-card/80 hover:shadow-md focus-within:border-primary/45 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 sm:py-3.5"
                        data-qa="dashboard-log-weight-card"
                        data-testid="dashboard-log-weight-card"
                      >
                        <CardHeader className="gap-1.5 px-3 sm:px-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="space-y-1">
                              <CardTitle className="leading-tight">Body Weight</CardTitle>
                              <CardDescription className="text-xs sm:text-sm">
                                Track your body weight for the selected day.
                              </CardDescription>
                            </div>
                            <DashboardCardHeaderLink
                              ariaLabel="View weight history"
                              label="History"
                              to="/weight/history"
                            />
                          </div>
                        </CardHeader>
                        <CardContent className="px-3 sm:px-4">
                          <div className="space-y-2.5">
                            {hasWeightForSelectedDay ? (
                              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-secondary/30 px-3 py-2.5">
                                <div className="space-y-1">
                                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                    Logged
                                  </p>
                                  <p className="text-xl font-semibold text-foreground">
                                    {selectedWeight.value.toFixed(1)} lbs
                                  </p>
                                </div>
                                <Button
                                  onClick={() => {
                                    setWeightInput(selectedWeight.value.toFixed(1));
                                    setWeightStatus(null);
                                    setIsWeightEditorOpen(true);
                                  }}
                                  type="button"
                                  variant="outline"
                                >
                                  Edit
                                </Button>
                              </div>
                            ) : (
                              <Button
                                className="w-full justify-between border-accent bg-accent/20 text-foreground shadow-[0_0_0_1px_var(--color-accent)] hover:bg-accent/25"
                                data-testid="dashboard-log-weight-cta"
                                onClick={() => {
                                  setWeightInput('');
                                  setWeightStatus(null);
                                  setIsWeightEditorOpen(true);
                                }}
                                type="button"
                                variant="outline"
                              >
                                <span>Log weight</span>
                                <span
                                  aria-hidden="true"
                                  className="size-2 rounded-full bg-accent animate-pulse"
                                />
                              </Button>
                            )}

                            {isWeightEditorOpen ? (
                              <form
                                className="space-y-2.5"
                                data-qa="dashboard-log-weight-form"
                                data-testid="dashboard-log-weight-form"
                                onSubmit={handleWeightSubmit}
                              >
                                <div className="space-y-2">
                                  <Label htmlFor="dashboard-weight-input">Weight (lbs)</Label>
                                  <Input
                                    aria-describedby="dashboard-weight-status"
                                    data-qa="dashboard-weight-input"
                                    data-testid="dashboard-weight-input"
                                    id="dashboard-weight-input"
                                    inputMode="decimal"
                                    min="0.1"
                                    name="weight"
                                    onChange={(event) => {
                                      setWeightInput(event.currentTarget.value);
                                      setWeightStatus(null);
                                    }}
                                    placeholder="e.g. 175.5"
                                    step="0.1"
                                    type="number"
                                    value={weightInput}
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    data-qa="dashboard-save-weight"
                                    data-testid="dashboard-save-weight"
                                    id="dashboard-save-weight"
                                    disabled={logWeightMutation.isPending}
                                    type="submit"
                                  >
                                    {logWeightMutation.isPending ? 'Saving...' : 'Save Weight'}
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      setIsWeightEditorOpen(false);
                                      setWeightStatus(null);
                                    }}
                                    type="button"
                                    variant="ghost"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                                {weightStatus ? (
                                  <p
                                    className={cn(
                                      'text-sm',
                                      weightStatus.type === 'error'
                                        ? 'text-destructive'
                                        : 'text-muted-foreground',
                                    )}
                                    id="dashboard-weight-status"
                                    role="status"
                                  >
                                    {weightStatus.message}
                                  </p>
                                ) : null}
                              </form>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    </DashboardWidgetFrame>
                  ) : null}
                </div>
              </div>
            ) : null}

            {visibleWidgets.includes('macro-rings') ? (
              <DashboardWidgetFrame
                className="order-3 md:order-2"
                dataSlot="dashboard-macro-panel"
                widgetLabel={DASHBOARD_WIDGET_IDS['macro-rings']}
              >
                <MacroRings snapshot={snapshotQuery.data} />
              </DashboardWidgetFrame>
            ) : null}
          </div>

          <div
            className="order-2 flex min-w-0 flex-col gap-3 sm:gap-4 md:order-2"
            data-slot="dashboard-sidebar-column"
          >
            {visibleHabitDailyWidgets.map(({ habitId, widgetId }) => {
              const habit = habitsQuery.data?.find((item) => item.id === habitId);

              return (
                <DashboardWidgetFrame
                  key={widgetId}
                  dataSlot={`dashboard-habit-daily-card-${habitId}`}
                  widgetLabel={habit ? `${habit.name} daily status` : 'Habit daily status'}
                >
                  <HabitDailyStatusCard compact habitId={habitId} />
                </DashboardWidgetFrame>
              );
            })}
            {visibleWidgets.includes('habit-chain') ? (
              <DashboardWidgetFrame widgetLabel={DASHBOARD_WIDGET_IDS['habit-chain']}>
                <HabitChain
                  endDate={selectedDateKey}
                  habitIds={habitChainIds}
                  habits={habitsQuery.data ?? []}
                  entries={habitChainEntriesQuery.data ?? []}
                />
              </DashboardWidgetFrame>
            ) : null}
            {visibleWidgets.includes('trend-sparklines') ? (
              <DashboardWidgetFrame widgetLabel={DASHBOARD_WIDGET_IDS['trend-sparklines']}>
                <TrendSparklines
                  endDate={selectedDateKey}
                  metrics={dashboardConfigQuery.data?.trendMetrics}
                />
              </DashboardWidgetFrame>
            ) : null}
          </div>

          {visibleWidgets.includes('recent-workouts') ? (
            <DashboardWidgetFrame
              className="order-3 min-w-0 md:col-span-2"
              dataSlot="dashboard-recent-workouts-column"
              widgetLabel={DASHBOARD_WIDGET_IDS['recent-workouts']}
            >
              <RecentWorkouts />
            </DashboardWidgetFrame>
          ) : null}

          {showWeightTrendChart ? (
            <DashboardWidgetFrame
              className="order-4 min-w-0 md:col-span-2"
              dataSlot="dashboard-weight-trend-row"
              widgetLabel={DASHBOARD_WIDGET_IDS['weight-trend']}
            >
              <WeightTrendChart />
            </DashboardWidgetFrame>
          ) : null}
        </div>
      )}

      <DashboardWidgetSidebar
        habitChainIds={habitChainIds}
        habits={habitsQuery.data ?? []}
        isSaving={isSavingDashboardConfig}
        onOpenChange={handleSidebarOpenChange}
        onReorderVisibleWidgets={handleVisibleWidgetReorder}
        onSave={handleWidgetSidebarSave}
        onToggleAllHabitDaily={setAllHabitDailyWidgetsVisibility}
        onToggleHabitChain={setHabitChainVisibility}
        onToggleHabitDaily={setHabitDailyWidgetVisibility}
        onToggleWidget={setStaticWidgetVisibility}
        open={isWidgetSidebarOpen}
        saveErrorMessage={widgetSidebarMessage}
        visibleWidgets={visibleWidgets}
      />
    </main>
  );
}
