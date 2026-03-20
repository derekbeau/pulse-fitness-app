import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';
import type {
  ScheduledWorkoutListItem,
  WorkoutSessionListItem,
  WorkoutSessionStatus,
} from '@pulse/shared';
import { Link, useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import {
  addDays,
  differenceInDays,
  getMondayIndex,
  parseDateKey,
  toDateKey,
} from '@/lib/date-utils';
import { accentCardStyles } from '@/lib/accent-card-styles';
import { cn } from '@/lib/utils';
import {
  useCancelAndRevertSession,
  useDeleteSession,
  useStartSession,
} from '@/hooks/use-workout-session';
import {
  useRescheduleWorkout,
  useScheduledWorkouts,
  useUnscheduleWorkout,
  useWorkoutTemplate,
  useWorkoutSessions,
} from '../api/workouts';
import { ScheduleWorkoutDialog } from './schedule-workout-dialog';
import { useTodayKey } from '../hooks/use-today-key';
import { hasAvailableTemplate } from '../lib/workout-filters';
import { buildInitialSessionSets } from '../lib/workout-session-sets';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
});
const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});
const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
type WorkoutCalendarProps = {
  buildDayHref?: (date: string) => string;
  buildSessionHref?: (sessionId: string, status?: WorkoutSessionStatus) => string;
  buildTemplateHref?: (templateId: string) => string;
};

type DayStatus = 'completed' | 'scheduled' | 'in-progress' | 'mixed' | 'none';
type WorkoutIndicatorStatus = 'completed' | 'scheduled' | 'in-progress' | 'unavailable';

type WorkoutIndicator = {
  id: string;
  status: WorkoutIndicatorStatus;
};

type DayWorkoutStatus = 'scheduled' | 'in-progress' | 'completed';

type DayWorkout = {
  id: string;
  isUnavailable: boolean;
  name: string;
  scheduledWorkout: ScheduledWorkoutListItem | null;
  session: WorkoutSessionListItem | null;
  status: DayWorkoutStatus;
  templateId: string | null;
};

type DayDetails = {
  date: Date;
  dateKey: string;
  completedSession: WorkoutSessionListItem | null;
  workouts: DayWorkout[];
  workoutIndicators: WorkoutIndicator[];
  status: DayStatus;
};

type DayLookupContext = {
  completedSessionsByDate: Map<string, WorkoutSessionListItem[]>;
  inProgressSessionsByDate: Map<string, WorkoutSessionListItem[]>;
  sessionById: Map<string, WorkoutSessionListItem>;
  scheduledByDate: Map<string, ScheduledWorkoutListItem[]>;
};

export function WorkoutCalendar({
  buildDayHref,
  buildSessionHref,
  buildTemplateHref = (templateId) => `/workouts/template/${templateId}`,
}: WorkoutCalendarProps) {
  const todayKey = useTodayKey();
  const initialMonth = startOfMonth(parseDateKey(todayKey));
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);

  const calendarDays = buildCalendarDays(visibleMonth);
  const dateRange = useMemo(() => {
    const firstDay = calendarDays[0] ?? visibleMonth;
    const lastDay = calendarDays[calendarDays.length - 1] ?? visibleMonth;

    return {
      from: toDateKey(firstDay),
      to: toDateKey(lastDay),
    };
  }, [calendarDays, visibleMonth]);

  const sessionsQuery = useWorkoutSessions({
    status: ['completed', 'in-progress', 'paused'],
  });
  const scheduledQuery = useScheduledWorkouts({
    from: dateRange.from,
    to: dateRange.to,
  });

  const activeSessions = useMemo(
    () => (sessionsQuery.data ?? []).filter(hasAvailableTemplate),
    [sessionsQuery.data],
  );
  const activeCompletedSessions = useMemo(
    () =>
      activeSessions.filter(
        (session) =>
          session.status === 'completed' &&
          session.date >= dateRange.from &&
          session.date <= dateRange.to,
      ),
    [activeSessions, dateRange.from, dateRange.to],
  );
  const completedSessionByDate = useMemo(() => {
    const grouped = new Map<string, WorkoutSessionListItem[]>();
    for (const session of activeCompletedSessions
      .slice()
      .sort((left, right) => right.startedAt - left.startedAt)) {
      const sessionsForDate = grouped.get(session.date) ?? [];
      sessionsForDate.push(session);
      grouped.set(session.date, sessionsForDate);
    }

    return grouped;
  }, [activeCompletedSessions]);
  const scheduledByDate = useMemo(() => {
    const grouped = new Map<string, ScheduledWorkoutListItem[]>();
    for (const scheduledWorkout of scheduledQuery.data ?? []) {
      const scheduledOnDate = grouped.get(scheduledWorkout.date) ?? [];
      scheduledOnDate.push(scheduledWorkout);
      grouped.set(scheduledWorkout.date, scheduledOnDate);
    }

    return grouped;
  }, [scheduledQuery.data]);
  const inProgressSessionsByDate = useMemo(() => {
    const grouped = new Map<string, WorkoutSessionListItem[]>();
    for (const session of activeSessions) {
      if (session.status !== 'in-progress' && session.status !== 'paused') {
        continue;
      }
      const sessionsForDate = grouped.get(session.date) ?? [];
      sessionsForDate.push(session);
      grouped.set(session.date, sessionsForDate);
    }

    return grouped;
  }, [activeSessions]);
  const sessionById = useMemo(
    () => new Map(activeSessions.map((session) => [session.id, session])),
    [activeSessions],
  );

  const lookupContext = useMemo(
    () => ({
      completedSessionsByDate: completedSessionByDate,
      inProgressSessionsByDate,
      sessionById,
      scheduledByDate,
    }),
    [completedSessionByDate, inProgressSessionsByDate, scheduledByDate, sessionById],
  );

  const [selectedDateKey, setSelectedDateKey] = useState(
    getDefaultSelectedDateKey(
      initialMonth,
      completedSessionByDate,
      inProgressSessionsByDate,
      scheduledByDate,
      todayKey,
    ),
  );

  const selectedDay = getDayDetails(selectedDateKey, lookupContext);
  const scheduleDayHref =
    buildDayHref?.(selectedDateKey) ?? `/workouts?view=templates&date=${selectedDateKey}`;
  const hasWorkout = selectedDay.workouts.length > 0;
  const accentPanel = hasWorkout ? accentCardStyles.mint : 'bg-card text-foreground';

  function handleMonthChange(offset: number) {
    const nextMonth = addMonths(visibleMonth, offset);
    setVisibleMonth(nextMonth);
    setSelectedDateKey(toDateKey(startOfMonth(nextMonth)));
  }

  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center justify-center gap-2">
          <Button
            aria-label="Previous month"
            onClick={() => handleMonthChange(-1)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <p className="min-w-28 text-center text-sm font-semibold text-foreground">
            {monthFormatter.format(visibleMonth)}
          </p>
          <Button
            aria-label="Next month"
            onClick={() => handleMonthChange(1)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <div className="flex items-center justify-center gap-3 text-[10px] text-muted sm:text-[11px]">
          <LegendDot className="bg-emerald-500" label="Done" />
          <LegendDot className="border border-slate-500 bg-transparent" label="Planned" />
          <LegendDot className="bg-orange-500" label="Active" />
        </div>
      </CardHeader>

      <CardContent className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)] lg:gap-6 lg:px-6 lg:py-6">
        <section aria-label="Monthly workout calendar" className="space-y-3">
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {DAY_LABELS.map((day) => (
              <p
                key={day}
                className="px-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted"
              >
                {day}
              </p>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {calendarDays.map((day) => {
              const dateKey = toDateKey(day);
              const details = getDayDetails(dateKey, lookupContext);
              const isSelected = selectedDateKey === dateKey;
              const isToday = dateKey === todayKey;
              const isInMonth = day.getMonth() === visibleMonth.getMonth();

              return (
                <div
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={`${fullDateFormatter.format(day)}${isSelected ? ', selected' : ''}`}
                  aria-pressed={isSelected}
                  className={cn(
                    'flex min-h-14 min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl border px-1 py-1 text-center transition-all duration-200 sm:min-h-28 sm:rounded-2xl sm:px-3 sm:py-3 sm:text-left',
                    isInMonth
                      ? 'bg-card hover:border-primary/40 hover:bg-secondary/50'
                      : 'bg-secondary/35 opacity-55',
                    isSelected && 'border-primary bg-secondary shadow-sm',
                    isToday && 'ring-2 ring-primary/30',
                  )}
                  data-outside-month={!isInMonth}
                  key={dateKey}
                  onClick={() => setSelectedDateKey(dateKey)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedDateKey(dateKey);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex min-w-0 items-center justify-center gap-1 sm:items-start sm:justify-between sm:gap-0.5">
                    <span
                      className={cn(
                        'shrink-0 text-center text-xs font-semibold sm:text-sm',
                        isToday ? 'text-primary' : 'text-foreground',
                        !isInMonth && 'text-muted',
                      )}
                    >
                      {day.getDate()}
                    </span>
                    <div className="flex min-w-0 items-center gap-1">
                      {details.completedSession ? (
                        <Link
                          aria-label="Done"
                          className="inline-flex h-2 w-2 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 p-0 text-[8px] font-bold uppercase leading-none tracking-wide text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400 sm:h-auto sm:w-auto sm:px-1.5 sm:py-0.5 sm:text-[9px]"
                          onClick={(event) => event.stopPropagation()}
                          to={
                            buildSessionHref?.(
                              details.completedSession.id,
                              details.completedSession.status,
                            ) ?? `/workouts/session/${details.completedSession.id}`
                          }
                        >
                          <span className="hidden sm:inline">Done</span>
                        </Link>
                      ) : null}
                      {details.workouts.some((workout) => workout.isUnavailable) ? (
                        <span
                          aria-label="Unavailable scheduled workout"
                          className="inline-flex items-center rounded-full border border-destructive/50 bg-destructive/10 p-1 text-destructive"
                        >
                          <TriangleAlert aria-hidden="true" className="size-3" />
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-1 hidden min-w-0 space-y-0.5 sm:block">
                    <p
                      className={cn(
                        'truncate text-xs font-medium leading-snug',
                        isInMonth ? 'text-foreground' : 'text-muted',
                      )}
                    >
                      {details.workouts[0]?.name ?? 'No workout'}
                    </p>
                    <p className="truncate text-[10px] leading-snug text-muted">
                      {getDaySubtitle(details)}
                    </p>
                  </div>

                  <div className="mt-auto flex min-w-0 items-center justify-center gap-1 pt-1 sm:justify-start sm:gap-1.5 sm:pt-3">
                    {getTileIndicators(details.workoutIndicators).map((indicator) => (
                      <span
                        aria-label={`${statusToLabel(indicator.status)} workout`}
                        className={cn(
                          'size-2 rounded-full sm:size-2.5',
                          indicatorDotClassName(indicator.status),
                        )}
                        key={indicator.id}
                      />
                    ))}
                    {details.workoutIndicators.length >= 3 ? (
                      <span className="hidden rounded-full border border-slate-500/70 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline-flex">
                        +{details.workoutIndicators.length - 2}
                      </span>
                    ) : null}
                    {isToday ? (
                      <span className="hidden text-[11px] font-medium text-primary sm:inline">
                        Today
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside
          className={cn(
            'order-first flex min-h-0 flex-col gap-3 rounded-2xl border p-3 shadow-sm lg:order-none lg:rounded-3xl lg:p-5',
            accentPanel,
          )}
          id="workout-day-details"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{shortDateFormatter.format(selectedDay.date)}</h3>
            {!hasWorkout ? (
              <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                <Link to={scheduleDayHref}>+ Schedule</Link>
              </Button>
            ) : null}
          </div>

          {selectedDay.workouts.length > 0 ? (
            <div className="space-y-2">
              {selectedDay.workouts.map((workout) => (
                <DayWorkoutItemCard
                  buildSessionHref={buildSessionHref}
                  buildTemplateHref={buildTemplateHref}
                  dateKey={selectedDay.dateKey}
                  key={workout.id}
                  workout={workout}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No workouts scheduled. Tap a day to view details.</p>
          )}
        </aside>
      </CardContent>
    </Card>
  );
}

function DayWorkoutItemCard({
  buildSessionHref,
  buildTemplateHref,
  dateKey,
  workout,
}: {
  buildSessionHref?: (sessionId: string, status?: WorkoutSessionStatus) => string;
  buildTemplateHref: (templateId: string) => string;
  dateKey: string;
  workout: DayWorkout;
}) {
  const navigate = useNavigate();
  const unscheduleWorkoutMutation = useUnscheduleWorkout();
  const rescheduleWorkoutMutation = useRescheduleWorkout();
  const startSessionMutation = useStartSession();
  const deleteSessionMutation = useDeleteSession(workout.session?.id ?? null);
  const cancelSessionMutation = useCancelAndRevertSession(workout.session?.id ?? null);
  const activeSessionsQuery = useWorkoutSessions({ status: ['in-progress', 'paused'] });
  const templateId = workout.templateId ?? '';
  const shouldFetchTemplate = workout.status === 'scheduled' && templateId.trim().length > 0;
  const templateQuery = useWorkoutTemplate(templateId, { enabled: shouldFetchTemplate });
  const { confirm, dialog } = useConfirmation();
  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false);
  const canStart = workout.status === 'scheduled' && !workout.isUnavailable;
  const isMutating =
    unscheduleWorkoutMutation.isPending ||
    rescheduleWorkoutMutation.isPending ||
    startSessionMutation.isPending ||
    deleteSessionMutation.isPending ||
    cancelSessionMutation.isPending;

  async function doStart() {
    if (!workout.scheduledWorkout || !workout.templateId || !templateQuery.data) {
      return;
    }

    const startedAt = Date.now();
    const session = await startSessionMutation.mutateAsync({
      date: toDateKey(new Date(startedAt)),
      name: workout.name,
      sets: buildInitialSessionSets(templateQuery.data),
      startedAt,
      templateId: workout.templateId,
    });
    navigate(`/workouts/active?template=${workout.templateId}&sessionId=${session.id}`);
  }

  function handleStart() {
    const todayKey = toDateKey(new Date());
    const activeSessions = activeSessionsQuery.data ?? [];

    if (workout.scheduledWorkout && dateKey !== todayKey) {
      confirm({
        title: 'Start workout early?',
        description: `This workout is scheduled for ${shortDateFormatter.format(parseDateKey(dateKey))}. Starting now will begin it today instead.`,
        confirmLabel: 'Start now',
        onConfirm: () => {
          void doStart();
        },
      });
      return;
    }

    if (activeSessions.length > 0) {
      confirm({
        title: 'You already have an active workout',
        description: `You have ${activeSessions.length === 1 ? 'a workout' : `${activeSessions.length} workouts`} in progress. Starting another will create an additional session for today.`,
        confirmLabel: 'Start anyway',
        cancelLabel: 'Go back',
        onConfirm: () => {
          void doStart();
        },
      });
      return;
    }

    void doStart();
  }

  async function handleDelete() {
    if (workout.status === 'scheduled' && workout.scheduledWorkout) {
      await unscheduleWorkoutMutation.mutateAsync({ id: workout.scheduledWorkout.id });
      return;
    }

    if (workout.session) {
      await deleteSessionMutation.mutateAsync();
    }
  }

  async function handleCancel() {
    await cancelSessionMutation.mutateAsync();
  }

  async function handleReschedule(requestedDate: string) {
    if (!workout.scheduledWorkout) {
      return;
    }
    await rescheduleWorkoutMutation.mutateAsync({
      date: requestedDate,
      id: workout.scheduledWorkout.id,
    });
  }

  async function handleRemoveFromSchedule() {
    if (!workout.scheduledWorkout) {
      return;
    }
    await unscheduleWorkoutMutation.mutateAsync({ id: workout.scheduledWorkout.id });
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-secondary/40 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {workout.status === 'scheduled' && workout.scheduledWorkout && !workout.isUnavailable ? (
            <Link
              className="hover:underline"
              to={`/workouts/scheduled/${workout.scheduledWorkout.id}`}
            >
              {workout.name}
            </Link>
          ) : (
            workout.name
          )}
        </p>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
            workout.status === 'completed'
              ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
              : workout.status === 'in-progress'
                ? 'bg-orange-500/15 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300'
                : workout.isUnavailable
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-secondary text-muted-foreground',
          )}
        >
          {workoutStatusLabel(workout)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {workout.status === 'scheduled' ? (
          <Button
            disabled={isMutating || !canStart || templateQuery.isPending}
            onClick={() => {
              void handleStart();
            }}
            size="sm"
            type="button"
          >
            Start
          </Button>
        ) : null}

        {workout.status === 'in-progress' && workout.session ? (
          <Button asChild size="sm">
            <Link
              to={
                buildSessionHref?.(workout.session.id, workout.session.status) ??
                `/workouts/active?sessionId=${workout.session.id}`
              }
            >
              Resume
            </Link>
          </Button>
        ) : null}

        {workout.status === 'completed' && workout.session ? (
          <Button asChild size="sm" variant="secondary">
            <Link
              to={
                buildSessionHref?.(workout.session.id, workout.session.status) ??
                `/workouts/session/${workout.session.id}`
              }
            >
              View details
            </Link>
          </Button>
        ) : null}

        {workout.status === 'scheduled' && workout.scheduledWorkout ? (
          <Button
            disabled={isMutating || !workout.templateId}
            onClick={() => setIsRescheduleDialogOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            Reschedule
          </Button>
        ) : null}

        {workout.status === 'in-progress' ? (
          <>
            <Button
              disabled={isMutating}
              onClick={() =>
                confirm({
                  title: 'Cancel workout?',
                  description:
                    'This will cancel the workout and discard all progress. If started from a scheduled workout, it will return to your schedule.',
                  confirmLabel: 'Cancel workout',
                  cancelLabel: 'Keep going',
                  onConfirm: handleCancel,
                })
              }
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isMutating}
              onClick={() =>
                confirm({
                  title: 'Delete workout?',
                  description:
                    'This workout will be moved to trash and can be recovered from there. Your template and exercises are not affected.',
                  confirmLabel: 'Delete workout',
                  variant: 'destructive',
                  onConfirm: handleDelete,
                })
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              Delete
            </Button>
          </>
        ) : null}

        {workout.status === 'completed' ? (
          <Button
            disabled={isMutating}
            onClick={() =>
              confirm({
                title: 'Delete workout?',
                description:
                  'This workout will be moved to trash and can be recovered from there. Your template and exercises are not affected.',
                confirmLabel: 'Delete workout',
                variant: 'destructive',
                onConfirm: handleDelete,
              })
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            Delete
          </Button>
        ) : null}

        {workout.status === 'scheduled' && workout.templateId && workout.isUnavailable ? (
          <Button asChild size="sm" variant="secondary">
            <Link to={buildTemplateHref(workout.templateId)}>View template</Link>
          </Button>
        ) : null}
      </div>
      {workout.scheduledWorkout && isRescheduleDialogOpen ? (
        <ScheduleWorkoutDialog
          description={`Move ${workout.name} to a new date.`}
          initialDate={dateKey}
          isPending={rescheduleWorkoutMutation.isPending}
          onOpenChange={setIsRescheduleDialogOpen}
          onRemove={handleRemoveFromSchedule}
          onSubmitDate={handleReschedule}
          open={isRescheduleDialogOpen}
          disallowDateKey={dateKey}
          disallowDateMessage="Pick a different date to reschedule."
          submitLabel="Save"
          title="Reschedule workout"
        />
      ) : null}
      {dialog}
    </div>
  );
}

function workoutStatusLabel(workout: DayWorkout) {
  if (workout.status === 'completed') {
    return 'Completed';
  }
  if (workout.status === 'in-progress') {
    return 'In progress';
  }
  if (workout.isUnavailable) {
    return 'Unavailable';
  }
  return 'Scheduled';
}

function getDaySubtitle(day: DayDetails) {
  if (day.workouts.length === 0) {
    return '';
  }

  const completed = day.workouts.filter((workout) => workout.status === 'completed').length;
  const inProgress = day.workouts.filter((workout) => workout.status === 'in-progress').length;
  const scheduled = day.workouts.filter((workout) => workout.status === 'scheduled').length;
  const parts: string[] = [];

  if (inProgress > 0) {
    parts.push(`${inProgress} in progress`);
  }
  if (scheduled > 0) {
    parts.push(`${scheduled} scheduled`);
  }
  if (completed > 0) {
    parts.push(`${completed} completed`);
  }

  return parts.join(' · ');
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 sm:gap-1.5">
      <span className={cn('size-2 rounded-full sm:size-2.5', className)} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function getDayDetails(dateKey: string, context: DayLookupContext): DayDetails {
  const date = parseDateKey(dateKey);
  const completedSessions = context.completedSessionsByDate.get(dateKey) ?? [];
  const scheduledWorkouts = context.scheduledByDate.get(dateKey) ?? [];
  const inProgressSessions = context.inProgressSessionsByDate.get(dateKey) ?? [];
  const workouts = buildDayWorkouts({
    scheduledWorkouts,
    completedSessions,
    inProgressSessions,
    sessionById: context.sessionById,
  });
  const completedSession =
    workouts.find((workout) => workout.status === 'completed')?.session ?? null;
  const workoutIndicators = buildWorkoutIndicators(workouts);

  const hasCompleted = workouts.some((workout) => workout.status === 'completed');
  const hasScheduled = workouts.some((workout) => workout.status === 'scheduled');
  const hasInProgress = workouts.some((workout) => workout.status === 'in-progress');

  let status: DayStatus = 'none';
  if (hasCompleted && (hasScheduled || hasInProgress)) {
    status = 'mixed';
  } else if (hasCompleted) {
    status = 'completed';
  } else if (hasScheduled) {
    status = 'scheduled';
  } else if (hasInProgress) {
    status = 'in-progress';
  }

  return {
    completedSession,
    date,
    dateKey,
    workouts,
    workoutIndicators,
    status,
  };
}

function buildDayWorkouts({
  scheduledWorkouts,
  completedSessions,
  inProgressSessions,
  sessionById,
}: {
  scheduledWorkouts: ScheduledWorkoutListItem[];
  completedSessions: WorkoutSessionListItem[];
  inProgressSessions: WorkoutSessionListItem[];
  sessionById: Map<string, WorkoutSessionListItem>;
}) {
  const workouts: DayWorkout[] = [];
  const consumedSessionIds = new Set<string>();

  for (const scheduledWorkout of scheduledWorkouts) {
    const linkedSession = scheduledWorkout.sessionId
      ? (sessionById.get(scheduledWorkout.sessionId) ?? null)
      : null;
    const fallbackName = scheduledWorkout.templateName ?? 'Workout unavailable';

    if (linkedSession && linkedSession.status === 'completed') {
      workouts.push({
        id: `scheduled-${scheduledWorkout.id}`,
        isUnavailable: false,
        name: linkedSession.templateName ?? linkedSession.name ?? fallbackName,
        scheduledWorkout: scheduledWorkout,
        session: linkedSession,
        status: 'completed',
        templateId: linkedSession.templateId ?? scheduledWorkout.templateId ?? null,
      });
      consumedSessionIds.add(linkedSession.id);
      continue;
    }

    if (
      linkedSession &&
      (linkedSession.status === 'in-progress' || linkedSession.status === 'paused')
    ) {
      workouts.push({
        id: `scheduled-${scheduledWorkout.id}`,
        isUnavailable: false,
        name: linkedSession.templateName ?? linkedSession.name ?? fallbackName,
        scheduledWorkout: scheduledWorkout,
        session: linkedSession,
        status: 'in-progress',
        templateId: linkedSession.templateId ?? scheduledWorkout.templateId ?? null,
      });
      consumedSessionIds.add(linkedSession.id);
      continue;
    }

    workouts.push({
      id: `scheduled-${scheduledWorkout.id}`,
      isUnavailable: scheduledWorkout.templateId == null || scheduledWorkout.templateName == null,
      name: fallbackName,
      scheduledWorkout: scheduledWorkout,
      session: null,
      status: 'scheduled',
      templateId: scheduledWorkout.templateId ?? null,
    });
  }

  for (const session of completedSessions) {
    if (consumedSessionIds.has(session.id)) {
      continue;
    }
    workouts.push({
      id: `completed-${session.id}`,
      isUnavailable: false,
      name: session.templateName ?? session.name,
      scheduledWorkout: null,
      session,
      status: 'completed',
      templateId: session.templateId ?? null,
    });
  }

  for (const session of inProgressSessions) {
    if (consumedSessionIds.has(session.id)) {
      continue;
    }
    workouts.push({
      id: `in-progress-${session.id}`,
      isUnavailable: false,
      name: session.templateName ?? session.name,
      scheduledWorkout: null,
      session,
      status: 'in-progress',
      templateId: session.templateId ?? null,
    });
  }

  return workouts.sort((left, right) => {
    const priority = workoutPriority(left.status) - workoutPriority(right.status);
    if (priority !== 0) {
      return priority;
    }
    const leftTime = left.session?.startedAt ?? left.scheduledWorkout?.createdAt ?? 0;
    const rightTime = right.session?.startedAt ?? right.scheduledWorkout?.createdAt ?? 0;
    return rightTime - leftTime;
  });
}

function getDefaultSelectedDateKey(
  month: Date,
  completedByDate: Map<string, WorkoutSessionListItem[]>,
  inProgressByDate: Map<string, WorkoutSessionListItem[]>,
  scheduledByDate: Map<string, ScheduledWorkoutListItem[]>,
  todayKey: string,
): string {
  if (
    isSameMonth(parseDateKey(todayKey), month) &&
    (completedByDate.has(todayKey) ||
      inProgressByDate.has(todayKey) ||
      (scheduledByDate.get(todayKey)?.length ?? 0) > 0)
  ) {
    return todayKey;
  }

  const monthActivity = [
    ...completedByDate.keys(),
    ...inProgressByDate.keys(),
    ...scheduledByDate.keys(),
  ]
    .map((dateKey) => parseDateKey(dateKey))
    .filter((date) => isSameMonth(date, month))
    .sort((left, right) => left.getTime() - right.getTime());

  if (monthActivity[0]) {
    return toDateKey(monthActivity[0]);
  }

  return isSameMonth(parseDateKey(todayKey), month) ? todayKey : toDateKey(month);
}

function buildCalendarDays(month: Date): Date[] {
  const start = startOfCalendarWeek(startOfMonth(month));
  let totalDays = differenceInDays(start, endOfCalendarWeek(endOfMonth(month))) + 1;

  if (totalDays < 35) {
    totalDays = 35;
  }

  return Array.from({ length: totalDays }, (_, index) => addDays(start, index));
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfCalendarWeek(date: Date) {
  return addDays(date, -getMondayIndex(date));
}

function endOfCalendarWeek(date: Date) {
  return addDays(date, 6 - getMondayIndex(date));
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function workoutPriority(status: DayWorkoutStatus) {
  switch (status) {
    case 'in-progress':
      return 0;
    case 'scheduled':
      return 1;
    case 'completed':
      return 2;
    default:
      return 3;
  }
}

function buildWorkoutIndicators(workouts: DayWorkout[]): WorkoutIndicator[] {
  return workouts
    .map(
      (workout): WorkoutIndicator => ({
        id: workout.id,
        status:
          workout.status === 'scheduled'
            ? workout.isUnavailable
              ? 'unavailable'
              : 'scheduled'
            : workout.status,
      }),
    )
    .sort((left, right) => indicatorPriority(left.status) - indicatorPriority(right.status));
}

function indicatorPriority(status: WorkoutIndicatorStatus) {
  switch (status) {
    case 'in-progress':
      return 0;
    case 'completed':
      return 1;
    case 'scheduled':
      return 2;
    case 'unavailable':
      return 3;
    default:
      return 4;
  }
}

function getTileIndicators(indicators: WorkoutIndicator[]) {
  if (indicators.length <= 2) {
    return indicators;
  }

  return indicators.slice(0, 2);
}

function indicatorDotClassName(status: WorkoutIndicatorStatus) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500';
    case 'scheduled':
      return 'border border-slate-500 bg-transparent';
    case 'in-progress':
      return 'animate-pulse bg-orange-500 ring-2 ring-orange-500/30 ring-offset-1 ring-offset-background';
    case 'unavailable':
      return 'bg-destructive/80';
    default:
      return 'bg-muted';
  }
}

function statusToLabel(status: WorkoutIndicatorStatus) {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'scheduled':
      return 'Scheduled';
    case 'in-progress':
      return 'In-progress';
    case 'unavailable':
      return 'Unavailable scheduled';
    default:
      return 'Workout';
  }
}
