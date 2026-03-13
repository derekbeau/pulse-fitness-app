import { DASHBOARD_WIDGET_IDS } from '@pulse/shared';
import { useQueryClient } from '@tanstack/react-query';
import { EyeOff, LayoutDashboard, Pencil, Plus } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { StatCardSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { HelpIcon } from '@/components/ui/help-icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Toggle } from '@/components/ui/toggle';
import { CalendarPicker } from '@/features/dashboard/components/calendar-picker';
import { HabitChain } from '@/features/dashboard/components/habit-chain';
import { MacroRings } from '@/features/dashboard/components/macro-rings';
import { RecentWorkouts } from '@/features/dashboard/components/recent-workouts';
import { SnapshotCards } from '@/features/dashboard/components/snapshot-cards';
import { getDashboardGreeting } from '@/features/dashboard/lib/greeting';
import { TrendSparklines } from '@/features/dashboard/components/trend-sparkline';
import { WeightTrendChart } from '@/features/dashboard/components/weight-trend-chart';
import { useHabits } from '@/features/habits/api/habits';
import { useRecentWorkouts } from '@/hooks/use-recent-workouts';
import { useLogWeight } from '@/features/weight/api/weight';
import {
  prefetchDashboardSnapshot,
  useDashboardSnapshot,
  dashboardSnapshotKeys,
} from '@/hooks/use-dashboard-snapshot';
import { useDashboardConfig, useSaveDashboardConfig } from '@/hooks/use-dashboard-config';
import { useHabitChains } from '@/hooks/use-habit-chains';
import { addDays, getToday, isSameDay, toDateKey } from '@/lib/date';
import { cn } from '@/lib/utils';

const dashboardDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});
type DashboardWidgetId = keyof typeof DASHBOARD_WIDGET_IDS;
const DEFAULT_VISIBLE_WIDGETS = Object.keys(DASHBOARD_WIDGET_IDS) as DashboardWidgetId[];
const DEFAULT_DASHBOARD_CONFIG = {
  habitChainIds: [],
  trendMetrics: ['weight', 'calories', 'protein'] as const,
  visibleWidgets: DEFAULT_VISIBLE_WIDGETS,
};

function DashboardWidgetEditOverlay({
  onHide,
  widgetLabel,
}: {
  onHide: () => void;
  widgetLabel: string;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 rounded-2xl bg-background/60">
      <div className="pointer-events-auto absolute top-3 right-3">
        <Toggle
          aria-label={`Hide ${widgetLabel} widget`}
          onPressedChange={() => {
            onHide();
          }}
          pressed={false}
          size="sm"
          variant="outline"
        >
          <EyeOff />
          Hide
        </Toggle>
      </div>
    </div>
  );
}

function isDashboardWidgetId(value: string): value is DashboardWidgetId {
  return value in DASHBOARD_WIDGET_IDS;
}

type DashboardWeightStatus = {
  message: string;
  type: 'error' | 'success';
};

function DashboardWidgetFrame({
  children,
  className,
  dataSlot,
  isEditMode,
  onHide,
  widgetLabel,
}: {
  children: ReactNode;
  className?: string;
  dataSlot?: string;
  isEditMode: boolean;
  onHide: () => void;
  widgetLabel: string;
}) {
  return (
    <div className={cn('relative', className)} data-slot={dataSlot} data-widget-label={widgetLabel}>
      {children}
      {isEditMode ? <DashboardWidgetEditOverlay onHide={onHide} widgetLabel={widgetLabel} /> : null}
    </div>
  );
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(() => getToday());
  const [weightInput, setWeightInput] = useState('');
  const [weightStatus, setWeightStatus] = useState<DashboardWeightStatus | null>(null);
  const [isWeightEditorOpen, setIsWeightEditorOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [visibleWidgetsDraft, setVisibleWidgetsDraft] = useState<DashboardWidgetId[] | null>(null);
  const [widgetVisibilityMessage, setWidgetVisibilityMessage] = useState('');
  const logWeightMutation = useLogWeight();
  const saveDashboardConfigMutation = useSaveDashboardConfig();
  const selectedDateKey = toDateKey(selectedDate);
  const habitRangeStart = toDateKey(addDays(selectedDate, -29));
  const selectedDateLabel = dashboardDateFormatter.format(selectedDate);
  const isViewingToday = isSameDay(selectedDate, getToday());
  const greeting = getDashboardGreeting();

  const snapshotQuery = useDashboardSnapshot(selectedDateKey);
  // TODO: apply widgetOrder to section layout once ordering UI is added.
  const dashboardConfigQuery = useDashboardConfig();
  const habitsQuery = useHabits();
  const habitChainEntriesQuery = useHabitChains(habitRangeStart, selectedDateKey);
  const recentWorkoutsQuery = useRecentWorkouts();
  const persistedVisibleWidgets = (dashboardConfigQuery.data?.visibleWidgets ?? DEFAULT_VISIBLE_WIDGETS)
    .filter(isDashboardWidgetId);
  const visibleWidgets = visibleWidgetsDraft ?? persistedVisibleWidgets;
  const hiddenWidgets = DEFAULT_VISIBLE_WIDGETS.filter((widgetId) => !visibleWidgets.includes(widgetId));
  const showWeightTrendChart = visibleWidgets.includes('weight-trend');
  const isSavingDashboardConfig = saveDashboardConfigMutation.isPending;
  const selectedWeight = snapshotQuery.data?.weight;
  const hasWeightForSelectedDay = selectedWeight?.date === selectedDateKey;

  function showWidget(widgetId: DashboardWidgetId) {
    setVisibleWidgetsDraft((currentDraft) => {
      const current = currentDraft ?? persistedVisibleWidgets;
      if (current.includes(widgetId)) {
        return current;
      }

      return [...current, widgetId];
    });
  }

  function handleSelectedDateChange(nextDate: Date) {
    setIsWeightEditorOpen(false);
    setWeightInput('');
    setWeightStatus(null);
    setSelectedDate(nextDate);
  }

  function hideWidget(widgetId: DashboardWidgetId) {
    setVisibleWidgetsDraft((currentDraft) => {
      const current = currentDraft ?? persistedVisibleWidgets;
      return current.filter((value) => value !== widgetId);
    });
  }

  function handleStartEditMode() {
    setVisibleWidgetsDraft(persistedVisibleWidgets);
    setWidgetVisibilityMessage('');
    setIsEditMode(true);
  }

  function handleCancelEditMode() {
    setVisibleWidgetsDraft(null);
    setWidgetVisibilityMessage('');
    setIsEditMode(false);
  }

  async function handleSaveWidgetVisibility() {
    const sourceConfig = dashboardConfigQuery.data ?? DEFAULT_DASHBOARD_CONFIG;
    try {
      await saveDashboardConfigMutation.mutateAsync({
        ...sourceConfig,
        trendMetrics: [...sourceConfig.trendMetrics],
        visibleWidgets,
      });
      setVisibleWidgetsDraft(null);
      setWidgetVisibilityMessage('');
      setIsEditMode(false);
    } catch {
      setWidgetVisibilityMessage('Unable to save widget visibility. Please try again.');
    }
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
      await queryClient.invalidateQueries({ queryKey: dashboardSnapshotKeys.all });
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
    <main className="flex w-full flex-col gap-8 py-6">
      <header className="animate-fade-in space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted sm:text-sm">
          {greeting}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                Dashboard
              </h1>
              <HelpIcon title="Dashboard help">
                <p>
                  Dashboard gives you a daily snapshot of nutrition, body weight trend, habits, and
                  recent workout activity.
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Nutrition totals come from meals logged by your AI agent, not manual entry.</li>
                  <li>Use Weight Trend range buttons to zoom and compare short vs long-term direction.</li>
                  <li>The trend line smooths daily swings so it is easier to spot overall momentum.</li>
                  <li>Habit streaks show how many consecutive days each habit has been completed.</li>
                </ul>
              </HelpIcon>
            </div>
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
          </div>
          <div className="flex items-center gap-2">
            {isEditMode ? (
              <>
                <Button
                  disabled={isSavingDashboardConfig}
                  onClick={handleCancelEditMode}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  disabled={isSavingDashboardConfig}
                  onClick={() => {
                    void handleSaveWidgetVisibility();
                  }}
                  size="sm"
                  type="button"
                >
                  {isSavingDashboardConfig ? 'Saving...' : 'Save'}
                </Button>
              </>
            ) : (
              <Button
                aria-label="Edit dashboard widgets"
                onClick={handleStartEditMode}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <Pencil />
              </Button>
            )}
          </div>
        </div>
        {isEditMode ? (
          <p
            className={cn(
              'text-sm',
              widgetVisibilityMessage ? 'text-destructive' : 'text-muted-foreground',
            )}
            role="status"
          >
            {widgetVisibilityMessage || 'Hide or restore widgets, then save changes.'}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground sm:text-base">{selectedDateLabel}</p>
      </header>

      {shouldShowEmptyState ? (
        <EmptyState
          description="Start by setting up your habits and logging your first workout."
          icon={LayoutDashboard}
          title="Welcome to Pulse!"
        />
      ) : (
        <div
          className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(280px,320px)]"
          data-slot="dashboard-layout"
        >
          <div
            className="order-1 flex min-w-0 flex-col gap-6 md:order-1 xl:order-2"
            data-slot="dashboard-main-column"
          >
            {visibleWidgets.includes('calendar') ? (
              <DashboardWidgetFrame
                className="order-1 md:order-3"
                dataSlot="dashboard-calendar-panel"
                isEditMode={isEditMode}
                onHide={() => hideWidget('calendar')}
                widgetLabel={DASHBOARD_WIDGET_IDS.calendar}
              >
                <CalendarPicker onDateSelect={handleSelectedDateChange} selectedDate={selectedDate} />
              </DashboardWidgetFrame>
            ) : null}

            {visibleWidgets.includes('snapshot-cards') || visibleWidgets.includes('log-weight') ? (
              <div className="order-2 md:order-1" data-slot="dashboard-snapshot-panel">
                <div className="flex flex-col gap-6">
                  {visibleWidgets.includes('snapshot-cards') ? (
                    <DashboardWidgetFrame
                      isEditMode={isEditMode}
                      onHide={() => hideWidget('snapshot-cards')}
                      widgetLabel={DASHBOARD_WIDGET_IDS['snapshot-cards']}
                    >
                      {snapshotQuery.isLoading ? (
                        <div
                          aria-label="Loading dashboard snapshots"
                          className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4"
                        >
                          {Array.from({ length: 5 }).map((_, index) => (
                            <StatCardSkeleton key={index} showTrend={index !== 4} />
                          ))}
                        </div>
                      ) : (
                        <SnapshotCards snapshot={snapshotQuery.data} />
                      )}
                    </DashboardWidgetFrame>
                  ) : null}
                  {visibleWidgets.includes('log-weight') ? (
                    <DashboardWidgetFrame
                      isEditMode={isEditMode}
                      onHide={() => hideWidget('log-weight')}
                      widgetLabel={DASHBOARD_WIDGET_IDS['log-weight']}
                    >
                      <Card data-qa="dashboard-log-weight-card" data-testid="dashboard-log-weight-card">
                        <CardHeader className="space-y-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="space-y-1">
                              <CardTitle>Body Weight</CardTitle>
                              <CardDescription>Track your body weight for the selected day.</CardDescription>
                            </div>
                            <Link
                              className="text-sm font-medium text-primary hover:underline"
                              to="/weight/history"
                            >
                              History
                            </Link>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {hasWeightForSelectedDay ? (
                              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-secondary/30 px-4 py-3">
                                <div className="space-y-1">
                                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                    Logged
                                  </p>
                                  <p className="text-2xl font-semibold text-foreground">
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
                                className="space-y-3"
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
                isEditMode={isEditMode}
                onHide={() => hideWidget('macro-rings')}
                widgetLabel={DASHBOARD_WIDGET_IDS['macro-rings']}
              >
                <MacroRings snapshot={snapshotQuery.data} />
              </DashboardWidgetFrame>
            ) : null}
          </div>

          <div
            className="order-2 flex min-w-0 flex-col gap-6 md:order-2 xl:order-1"
            data-slot="dashboard-sidebar-column"
          >
            {visibleWidgets.includes('habit-chain') ? (
              <DashboardWidgetFrame
                isEditMode={isEditMode}
                onHide={() => hideWidget('habit-chain')}
                widgetLabel={DASHBOARD_WIDGET_IDS['habit-chain']}
              >
                <HabitChain
                  endDate={selectedDateKey}
                  habitIds={dashboardConfigQuery.data?.habitChainIds}
                  habits={habitsQuery.data ?? []}
                  entries={habitChainEntriesQuery.data ?? []}
                />
              </DashboardWidgetFrame>
            ) : null}
            {visibleWidgets.includes('trend-sparklines') ? (
              <DashboardWidgetFrame
                isEditMode={isEditMode}
                onHide={() => hideWidget('trend-sparklines')}
                widgetLabel={DASHBOARD_WIDGET_IDS['trend-sparklines']}
              >
                <TrendSparklines
                  endDate={selectedDateKey}
                  metrics={dashboardConfigQuery.data?.trendMetrics}
                />
              </DashboardWidgetFrame>
            ) : null}
          </div>

          {visibleWidgets.includes('recent-workouts') ? (
            <DashboardWidgetFrame
              className="order-3 min-w-0 md:col-span-2 xl:col-span-1 xl:col-start-3"
              dataSlot="dashboard-recent-workouts-column"
              isEditMode={isEditMode}
              onHide={() => hideWidget('recent-workouts')}
              widgetLabel={DASHBOARD_WIDGET_IDS['recent-workouts']}
            >
              <RecentWorkouts />
            </DashboardWidgetFrame>
          ) : null}

          {showWeightTrendChart ? (
            <DashboardWidgetFrame
              className="order-4 min-w-0 md:col-span-2 xl:col-span-3"
              dataSlot="dashboard-weight-trend-row"
              isEditMode={isEditMode}
              onHide={() => hideWidget('weight-trend')}
              widgetLabel={DASHBOARD_WIDGET_IDS['weight-trend']}
            >
              <WeightTrendChart />
            </DashboardWidgetFrame>
          ) : null}
        </div>
      )}

      {isEditMode ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Hidden widgets</h2>
          {hiddenWidgets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hidden widgets.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {hiddenWidgets.map((widgetId) => (
                <Card
                  key={widgetId}
                  className="border-dashed border-border/80 bg-muted/30 py-4"
                  data-slot={`dashboard-hidden-widget-${widgetId}`}
                >
                  <CardContent className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{DASHBOARD_WIDGET_IDS[widgetId]}</p>
                      <p className="text-xs text-muted-foreground">Currently hidden</p>
                    </div>
                    <Button onClick={() => showWidget(widgetId)} size="sm" type="button" variant="outline">
                      <Plus />
                      Show
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
