import { DASHBOARD_WIDGET_IDS } from '@pulse/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Calendar, EyeOff, LayoutDashboard, Pencil, Plus } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';

import { StatCardSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { HelpIcon } from '@/components/ui/help-icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useHabits } from '@/features/habits/api/habits';
import { useRecentWorkouts } from '@/hooks/use-recent-workouts';
import { useLogWeight } from '@/features/weight/api/weight';
import { prefetchDashboardSnapshot, useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
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
const HABIT_DAILY_WIDGET_PREFIX = 'habit-daily:';
const DASHBOARD_CARD_TYPES = {
  'habit-daily': 'Habit Daily Status',
} as const;
type DashboardStaticWidgetId = keyof typeof DASHBOARD_WIDGET_IDS;
type HabitDailyWidgetId = `${typeof HABIT_DAILY_WIDGET_PREFIX}${string}`;
type DashboardCardTypeId = keyof typeof DASHBOARD_CARD_TYPES;
type DashboardWidgetId = DashboardStaticWidgetId | HabitDailyWidgetId;
const DEFAULT_VISIBLE_WIDGETS = Object.keys(DASHBOARD_WIDGET_IDS) as DashboardStaticWidgetId[];
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
    <div className="pointer-events-auto absolute inset-0 z-30 rounded-2xl border-2 border-dashed border-primary/45 bg-background/65 backdrop-blur-[1px]">
      <p className="absolute top-3 left-3 rounded-full border border-border/80 bg-background/95 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/90 shadow-sm">
        Edit mode
      </p>
      <div className="absolute top-3 right-3 z-40">
        <Button
          aria-label={`Hide ${widgetLabel} widget`}
          className="rounded-full border-border/80 bg-background/95 px-3 text-xs font-semibold shadow-sm hover:bg-background"
          onClick={onHide}
          size="sm"
          type="button"
          variant="outline"
        >
          <EyeOff className="size-4" />
          Hide
        </Button>
      </div>
    </div>
  );
}

function isDashboardStaticWidgetId(value: string): value is DashboardStaticWidgetId {
  return value in DASHBOARD_WIDGET_IDS;
}

function isHabitDailyWidgetId(value: string): value is HabitDailyWidgetId {
  return value.startsWith(HABIT_DAILY_WIDGET_PREFIX) && value.length > HABIT_DAILY_WIDGET_PREFIX.length;
}

function isDashboardWidgetId(value: string): value is DashboardWidgetId {
  return isDashboardStaticWidgetId(value) || isHabitDailyWidgetId(value);
}

function toHabitDailyWidgetId(habitId: string): HabitDailyWidgetId {
  return `${HABIT_DAILY_WIDGET_PREFIX}${habitId}`;
}

function getHabitIdFromDailyWidgetId(widgetId: HabitDailyWidgetId) {
  return widgetId.slice(HABIT_DAILY_WIDGET_PREFIX.length);
}

function getUniqueWidgetIds<TWidgetId extends string>(widgetIds: TWidgetId[]) {
  return Array.from(new Set(widgetIds));
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
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [visibleWidgetsDraft, setVisibleWidgetsDraft] = useState<DashboardWidgetId[] | null>(null);
  const [editSessionHabitDailyWidgets, setEditSessionHabitDailyWidgets] = useState<
    HabitDailyWidgetId[]
  >([]);
  const [selectedCardType, setSelectedCardType] = useState<DashboardCardTypeId>('habit-daily');
  const [selectedHabitDailyId, setSelectedHabitDailyId] = useState('');
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
  const persistedVisibleWidgets = getUniqueWidgetIds(
    dashboardConfigQuery.data?.visibleWidgets ?? DEFAULT_VISIBLE_WIDGETS
  ).filter(isDashboardWidgetId);
  const persistedHabitDailyWidgets = persistedVisibleWidgets.filter(isHabitDailyWidgetId);
  const visibleWidgets = visibleWidgetsDraft ?? persistedVisibleWidgets;
  const restorableHabitDailyWidgets = isEditMode
    ? getUniqueWidgetIds([...persistedHabitDailyWidgets, ...editSessionHabitDailyWidgets])
    : persistedHabitDailyWidgets;
  const visibleHabitDailyWidgets = visibleWidgets
    .filter(isHabitDailyWidgetId)
    .map((widgetId) => ({
      habitId: getHabitIdFromDailyWidgetId(widgetId),
      widgetId,
    }));
  const visibleHabitDailyHabitIdSet = new Set(
    visibleHabitDailyWidgets.map((widget) => widget.habitId),
  );
  const availableHabitDailyHabits = (habitsQuery.data ?? []).filter(
    (habit) => !visibleHabitDailyHabitIdSet.has(habit.id),
  );
  const selectedHabitDailyCardId = availableHabitDailyHabits.some(
    (habit) => habit.id === selectedHabitDailyId,
  )
    ? selectedHabitDailyId
    : (availableHabitDailyHabits[0]?.id ?? '');
  const hiddenWidgets = getUniqueWidgetIds<DashboardWidgetId>([
    ...DEFAULT_VISIBLE_WIDGETS,
    ...restorableHabitDailyWidgets,
  ])
    .filter((widgetId) => !visibleWidgets.includes(widgetId))
    .map((widgetId) => {
      if (isHabitDailyWidgetId(widgetId)) {
        const habitId = getHabitIdFromDailyWidgetId(widgetId);
        const habitName = habitsQuery.data?.find((habit) => habit.id === habitId)?.name;
        return {
          widgetId,
          widgetLabel: habitName ? `${habitName} daily status` : 'Habit daily status',
        };
      }

      return {
        widgetId,
        widgetLabel: DASHBOARD_WIDGET_IDS[widgetId],
      };
    });
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

      return getUniqueWidgetIds([...current, widgetId]);
    });
  }

  function handleSelectedDateChange(nextDate: Date) {
    setIsWeightEditorOpen(false);
    setWeightInput('');
    setWeightStatus(null);
    setSelectedDate(nextDate);
    setIsCalendarOpen(false);
  }

  function hideWidget(widgetId: DashboardWidgetId) {
    setVisibleWidgetsDraft((currentDraft) => {
      const current = currentDraft ?? persistedVisibleWidgets;
      return current.filter((value) => value !== widgetId);
    });
  }

  function showAllWidgets() {
    setVisibleWidgetsDraft((currentDraft) => {
      const current = currentDraft ?? persistedVisibleWidgets;
      const habitDailyWidgets = getUniqueWidgetIds([
        ...current.filter(isHabitDailyWidgetId),
        ...restorableHabitDailyWidgets,
      ]);
      return getUniqueWidgetIds([...DEFAULT_VISIBLE_WIDGETS, ...habitDailyWidgets]);
    });
  }

  function handleStartEditMode() {
    setVisibleWidgetsDraft(persistedVisibleWidgets);
    setEditSessionHabitDailyWidgets(persistedHabitDailyWidgets);
    setWidgetVisibilityMessage('');
    setIsEditMode(true);
  }

  function handleCancelEditMode() {
    setVisibleWidgetsDraft(null);
    setEditSessionHabitDailyWidgets([]);
    setSelectedHabitDailyId('');
    setWidgetVisibilityMessage('');
    setIsEditMode(false);
  }

  function handleAddDashboardCard() {
    if (selectedCardType !== 'habit-daily' || selectedHabitDailyCardId.length === 0) {
      return;
    }

    const widgetId = toHabitDailyWidgetId(selectedHabitDailyCardId);
    setEditSessionHabitDailyWidgets((current) => getUniqueWidgetIds([...current, widgetId]));
    showWidget(widgetId);
    setSelectedHabitDailyId('');
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
      setEditSessionHabitDailyWidgets([]);
      setSelectedHabitDailyId('');
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
                  <li>
                    Nutrition totals come from meals logged by your AI agent, not manual entry.
                  </li>
                  <li>
                    Use Weight Trend range buttons to zoom and compare short vs long-term direction.
                  </li>
                  <li>
                    The trend line smooths daily swings so it is easier to spot overall momentum.
                  </li>
                  <li>
                    Habit streaks show how many consecutive days each habit has been completed.
                  </li>
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
      </header>

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
                    <DashboardWidgetFrame
                      isEditMode={isEditMode}
                      onHide={() => hideWidget('snapshot-cards')}
                      widgetLabel={DASHBOARD_WIDGET_IDS['snapshot-cards']}
                    >
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
                    <DashboardWidgetFrame
                      isEditMode={isEditMode}
                      onHide={() => hideWidget('log-weight')}
                      widgetLabel={DASHBOARD_WIDGET_IDS['log-weight']}
                    >
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
                isEditMode={isEditMode}
                onHide={() => hideWidget('macro-rings')}
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
                  isEditMode={isEditMode}
                  onHide={() => hideWidget(widgetId)}
                  widgetLabel={habit ? `${habit.name} daily status` : 'Habit daily status'}
                >
                  <HabitDailyStatusCard compact habitId={habitId} />
                </DashboardWidgetFrame>
              );
            })}
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
              className="order-3 min-w-0 md:col-span-2"
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
              className="order-4 min-w-0 md:col-span-2"
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
        <section className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-foreground">Hidden widgets</h2>
              {hiddenWidgets.length > 1 ? (
                <Button onClick={showAllWidgets} size="sm" type="button" variant="outline">
                  Show all
                </Button>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              Use Restore to add cards back before saving.
            </p>
            {hiddenWidgets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hidden widgets.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {hiddenWidgets.map(({ widgetId, widgetLabel }) => (
                  <Card
                    key={widgetId}
                    className="border-dashed border-border/80 bg-muted/30 py-3"
                    data-slot={`dashboard-hidden-widget-${widgetId}`}
                  >
                    <CardContent className="flex items-center justify-between gap-3 px-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{widgetLabel}</p>
                        <p className="text-xs text-muted-foreground">Currently hidden</p>
                      </div>
                      <Button
                        aria-label={`Show ${widgetLabel} widget`}
                        onClick={() => showWidget(widgetId)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Plus />
                        Restore
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Add cards</h2>
            <Card className="border-border/80 bg-muted/20 py-3">
              <CardContent className="grid gap-3 px-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="dashboard-add-card-type">Card type</Label>
                  <Select
                    onValueChange={(value) => {
                      if (value in DASHBOARD_CARD_TYPES) {
                        setSelectedCardType(value as DashboardCardTypeId);
                      }
                    }}
                    value={selectedCardType}
                  >
                    <SelectTrigger aria-label="Select card type" id="dashboard-add-card-type">
                      <SelectValue placeholder="Select card type" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(DASHBOARD_CARD_TYPES) as Array<
                        [DashboardCardTypeId, string]
                      >).map(([typeId, label]) => (
                        <SelectItem key={typeId} value={typeId}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dashboard-add-card-habit">Habit</Label>
                  <Select
                    disabled={availableHabitDailyHabits.length === 0}
                    onValueChange={setSelectedHabitDailyId}
                    value={selectedHabitDailyCardId}
                  >
                    <SelectTrigger aria-label="Select habit for daily status card" id="dashboard-add-card-habit">
                      <SelectValue placeholder="Select a habit" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableHabitDailyHabits.map((habit) => (
                        <SelectItem key={habit.id} value={habit.id}>
                          {habit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  disabled={selectedHabitDailyCardId.length === 0}
                  onClick={handleAddDashboardCard}
                  type="button"
                  variant="outline"
                >
                  <Plus />
                  Add card
                </Button>
              </CardContent>
            </Card>
            {availableHabitDailyHabits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All active habits already have a daily status card.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
