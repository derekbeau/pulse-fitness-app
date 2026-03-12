import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, EllipsisVertical } from 'lucide-react';
import type { WorkoutSessionListItem } from '@pulse/shared';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  useRescheduleWorkout,
  useScheduledWorkouts,
  useUnscheduleWorkout,
  useWorkoutSessions,
} from '../api/workouts';
import {
  ActiveScheduledWorkoutListItem,
  isActiveScheduledWorkout,
  isActiveSessionListItem,
} from '../lib/workout-filters';
import { ScheduleWorkoutDialog } from './schedule-workout-dialog';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const TODAY_KEY = toDateKey(new Date());
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
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

type WorkoutCalendarProps = {
  buildDayHref?: (date: string) => string;
  buildSessionHref?: (sessionId: string) => string;
  buildStartWorkoutHref?: (templateId: string) => string;
};

type DayStatus = 'completed' | 'scheduled' | 'in-progress' | 'mixed' | 'none';

type DayDetails = {
  date: Date;
  dateKey: string;
  completedSession: WorkoutSessionListItem | null;
  inProgressSession: WorkoutSessionListItem | null;
  scheduledWorkouts: ActiveScheduledWorkoutListItem[];
  status: DayStatus;
  templateName: string | null;
  notes: string | null;
};

type DayLookupContext = {
  completedSessionByDate: Map<string, WorkoutSessionListItem>;
  scheduledByDate: Map<string, ActiveScheduledWorkoutListItem[]>;
  inProgressTodaySession: WorkoutSessionListItem | null;
};

export function WorkoutCalendar({
  buildDayHref,
  buildSessionHref,
  buildStartWorkoutHref = (templateId) => `/workouts/active?template=${templateId}`,
}: WorkoutCalendarProps) {
  const initialMonth = startOfMonth(parseDateKey(TODAY_KEY));
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
    () => (sessionsQuery.data ?? []).filter(isActiveSessionListItem),
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
  const completedSessionByDate = useMemo(
    () =>
      new Map(
        activeCompletedSessions
          .slice()
          .sort((left, right) => right.startedAt - left.startedAt)
          .map((session) => [session.date, session]),
      ),
    [activeCompletedSessions],
  );
  const scheduledByDate = useMemo(() => {
    const grouped = new Map<string, ActiveScheduledWorkoutListItem[]>();
    for (const scheduledWorkout of (scheduledQuery.data ?? []).filter(isActiveScheduledWorkout)) {
      const scheduledOnDate = grouped.get(scheduledWorkout.date) ?? [];
      scheduledOnDate.push(scheduledWorkout);
      grouped.set(scheduledWorkout.date, scheduledOnDate);
    }

    return grouped;
  }, [scheduledQuery.data]);
  const inProgressTodaySession = useMemo(
    () =>
      activeSessions
        .filter((session) => session.status === 'in-progress' || session.status === 'paused')
        .find((session) => spansToday(session, TODAY_KEY)) ?? null,
    [activeSessions],
  );

  const lookupContext = useMemo(
    () => ({
      completedSessionByDate,
      inProgressTodaySession,
      scheduledByDate,
    }),
    [completedSessionByDate, inProgressTodaySession, scheduledByDate],
  );

  const [selectedDateKey, setSelectedDateKey] = useState(
    getDefaultSelectedDateKey(initialMonth, completedSessionByDate, scheduledByDate),
  );

  const selectedDay = getDayDetails(selectedDateKey, lookupContext);
  const openDayHref = buildDayHref?.(selectedDateKey) ?? `?date=${selectedDateKey}`;
  const detailStats = getDetailStats(selectedDay);
  const hasWorkout = selectedDay.status !== 'none';
  const accentPanel = hasWorkout ? accentCardStyles.mint : 'bg-card text-foreground';

  function handleMonthChange(offset: number) {
    const nextMonth = addMonths(visibleMonth, offset);
    setVisibleMonth(nextMonth);
    setSelectedDateKey(
      getDefaultSelectedDateKey(nextMonth, completedSessionByDate, scheduledByDate),
    );
  }

  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="gap-4 border-b border-border pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Workout Calendar</CardTitle>
            <p className="text-sm text-muted">
              Track completed sessions and scheduled workouts in one monthly view.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start">
            <Button
              aria-label="Previous month"
              onClick={() => handleMonthChange(-1)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <p className="min-w-40 text-center text-sm font-semibold text-foreground">
              {monthFormatter.format(visibleMonth)}
            </p>
            <Button
              aria-label="Next month"
              onClick={() => handleMonthChange(1)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <LegendDot className="bg-emerald-500" label="Completed" />
          <LegendDot className="border border-slate-500 bg-transparent" label="Scheduled" />
          <LegendDot className="bg-orange-500" label="In progress" />
          <span className="rounded-full border border-primary/30 px-2 py-1 text-foreground">
            Today
          </span>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 px-4 py-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)] lg:px-6 lg:py-6">
        <section aria-label="Monthly workout calendar" className="space-y-3">
          <div className="grid grid-cols-7 gap-2">
            {DAY_LABELS.map((day) => (
              <p
                key={day}
                className="px-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted"
              >
                {day}
              </p>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day) => {
              const dateKey = toDateKey(day);
              const details = getDayDetails(dateKey, lookupContext);
              const isSelected = selectedDateKey === dateKey;
              const isToday = dateKey === TODAY_KEY;
              const isInMonth = day.getMonth() === visibleMonth.getMonth();

              return (
                <div
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={`${fullDateFormatter.format(day)}${isSelected ? ', selected' : ''}`}
                  aria-pressed={isSelected}
                  className={cn(
                    'flex min-h-14 cursor-pointer flex-col rounded-xl border px-1.5 py-1.5 text-left transition-all duration-200 sm:min-h-28 sm:rounded-2xl sm:px-3 sm:py-3',
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
                  <div className="flex items-start justify-between gap-0.5">
                    <span
                      className={cn(
                        'shrink-0 text-xs font-semibold sm:text-sm',
                        isToday ? 'text-primary' : 'text-foreground',
                        !isInMonth && 'text-muted',
                      )}
                    >
                      {day.getDate()}
                    </span>
                    <div className="flex items-center gap-1">
                      {details.completedSession ? (
                        <Link
                          className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400"
                          onClick={(event) => event.stopPropagation()}
                          to={
                            buildSessionHref?.(details.completedSession.id) ??
                            `/workouts/session/${details.completedSession.id}`
                          }
                        >
                          Done
                        </Link>
                      ) : null}
                      {details.scheduledWorkouts[0] ? (
                        <ScheduledWorkoutActions
                          buildStartWorkoutHref={buildStartWorkoutHref}
                          compact
                          scheduledWorkout={details.scheduledWorkouts[0]}
                        />
                      ) : null}
                      {details.scheduledWorkouts.length > 1 ? (
                        <span className="rounded-full border border-slate-500/70 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                          +{details.scheduledWorkouts.length - 1}
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
                      {details.templateName ?? 'No workout'}
                    </p>
                    <p className="truncate text-[10px] leading-snug text-muted">
                      {details.notes ?? ''}
                    </p>
                  </div>

                  <div className="mt-auto flex items-center gap-1 pt-1 sm:gap-1.5 sm:pt-3">
                    {details.completedSession ? (
                      <span
                        aria-label="Completed workout"
                        className="size-2 rounded-full bg-emerald-500 sm:size-2.5"
                      />
                    ) : null}
                    {details.scheduledWorkouts.length > 0 ? (
                      <span
                        aria-label="Scheduled workout"
                        className="size-2 rounded-full border border-slate-500 bg-transparent sm:size-2.5"
                      />
                    ) : null}
                    {details.inProgressSession ? (
                      <span
                        aria-label="In-progress workout"
                        className="size-2 rounded-full bg-orange-500 animate-pulse sm:size-2.5"
                      />
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
            'order-first flex min-h-0 flex-col gap-4 rounded-3xl border p-5 shadow-sm lg:order-none',
            accentPanel,
          )}
          id="workout-day-details"
        >
          <div className="space-y-1">
            <p
              className={cn(
                'text-xs font-semibold uppercase tracking-[0.2em]',
                hasWorkout ? 'opacity-70 dark:text-muted dark:opacity-100' : 'text-muted',
              )}
            >
              Day details
            </p>
            <h3 className="text-2xl font-semibold">
              {selectedDay.templateName ?? 'No workout planned'}
            </h3>
            <p
              className={cn(
                'text-sm',
                hasWorkout ? 'opacity-80 dark:text-muted dark:opacity-100' : 'text-muted',
              )}
            >
              {fullDateFormatter.format(selectedDay.date)}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {detailStats.map((stat) => (
              <div
                className={cn(
                  'rounded-2xl border p-3',
                  hasWorkout
                    ? 'border-white/35 bg-white/45 dark:border-border dark:bg-secondary/60'
                    : 'border-border bg-secondary/40 text-foreground',
                )}
                key={stat.label}
              >
                <p
                  className={cn(
                    'text-[11px] font-semibold uppercase tracking-[0.18em]',
                    hasWorkout ? 'opacity-70 dark:text-muted dark:opacity-100' : 'text-muted',
                  )}
                >
                  {stat.label}
                </p>
                <p className="mt-2 text-base font-semibold">{stat.value}</p>
              </div>
            ))}
          </div>

          <p
            className={cn(
              'text-sm leading-6',
              hasWorkout ? 'opacity-85 dark:text-muted dark:opacity-100' : 'text-muted',
            )}
          >
            {selectedDay.notes ??
              'No workout is attached to this day yet. Complete or schedule a workout to see it here.'}
          </p>

          {selectedDay.completedSession ? (
            <Button
              asChild
              className="mt-auto self-start bg-white/60 hover:bg-white/75 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
              size="sm"
              variant="secondary"
            >
              <Link
                to={
                  buildSessionHref?.(selectedDay.completedSession.id) ??
                  `/workouts/session/${selectedDay.completedSession.id}`
                }
              >
                View Session
              </Link>
            </Button>
          ) : null}

          {selectedDay.scheduledWorkouts.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Scheduled
              </p>
              <div className="space-y-2">
                {selectedDay.scheduledWorkouts.map((scheduledWorkout) => (
                  <div
                    className="flex items-center justify-between gap-2 rounded-2xl border border-border/70 bg-secondary/40 px-3 py-2"
                    key={scheduledWorkout.id}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {scheduledWorkout.templateName}
                      </p>
                      <p className="text-xs text-muted">Scheduled</p>
                    </div>
                    <ScheduledWorkoutActions
                      buildStartWorkoutHref={buildStartWorkoutHref}
                      scheduledWorkout={scheduledWorkout}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!selectedDay.completedSession && selectedDay.scheduledWorkouts.length === 0 ? (
            <Button asChild className="mt-auto self-start" size="sm" variant="outline">
              <Link to={openDayHref}>Open Day</Link>
            </Button>
          ) : null}
        </aside>
      </CardContent>
    </Card>
  );
}

function ScheduledWorkoutActions({
  buildStartWorkoutHref,
  compact = false,
  scheduledWorkout,
}: {
  buildStartWorkoutHref: (templateId: string) => string;
  compact?: boolean;
  scheduledWorkout: ActiveScheduledWorkoutListItem;
}) {
  const rescheduleWorkoutMutation = useRescheduleWorkout();
  const unscheduleWorkoutMutation = useUnscheduleWorkout();
  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false);

  async function handleReschedule(requestedDate: string) {
    await rescheduleWorkoutMutation.mutateAsync({
      date: requestedDate,
      id: scheduledWorkout.id,
    });
  }

  function handleRemove() {
    if (typeof window === 'undefined') {
      return;
    }

    if (!window.confirm('Remove this scheduled workout?')) {
      return;
    }

    void unscheduleWorkoutMutation.mutateAsync({ id: scheduledWorkout.id });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={
              compact ? 'Scheduled workout actions' : `Actions for ${scheduledWorkout.templateName}`
            }
            className={cn(
              'inline-flex items-center justify-center rounded-full border border-slate-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground hover:bg-secondary',
              compact && 'size-5 border-slate-500/70 px-0 py-0',
            )}
            onClick={(event) => event.stopPropagation()}
            type="button"
          >
            {compact ? <EllipsisVertical aria-hidden="true" className="size-3" /> : 'Scheduled'}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-44"
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuItem asChild>
            <Link to={buildStartWorkoutHref(scheduledWorkout.templateId)}>Start workout</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setIsRescheduleDialogOpen(true)}>
            Reschedule
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleRemove} variant="destructive">
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ScheduleWorkoutDialog
        description={`Move ${scheduledWorkout.templateName ?? 'this workout'} to a new date.`}
        initialDate={scheduledWorkout.date}
        isPending={rescheduleWorkoutMutation.isPending}
        onOpenChange={setIsRescheduleDialogOpen}
        onSubmitDate={handleReschedule}
        open={isRescheduleDialogOpen}
        submitLabel="Save"
        title="Reschedule workout"
      />
    </>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('size-2.5 rounded-full', className)} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function getDayDetails(dateKey: string, context: DayLookupContext): DayDetails {
  const date = parseDateKey(dateKey);
  const completedSession = context.completedSessionByDate.get(dateKey) ?? null;
  const scheduledWorkouts = context.scheduledByDate.get(dateKey) ?? [];
  const inProgressSession = dateKey === TODAY_KEY ? context.inProgressTodaySession : null;

  const hasCompleted = completedSession != null;
  const hasScheduled = scheduledWorkouts.length > 0;
  const hasInProgress = inProgressSession != null;

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

  const templateName =
    completedSession?.templateName ??
    scheduledWorkouts[0]?.templateName ??
    inProgressSession?.templateName ??
    null;
  const notes = hasCompleted
    ? `${completedSession.exerciseCount} exercise${completedSession.exerciseCount === 1 ? '' : 's'} logged`
    : hasScheduled
      ? `${scheduledWorkouts.length} scheduled workout${scheduledWorkouts.length === 1 ? '' : 's'}`
      : hasInProgress
        ? 'Workout currently in progress'
        : null;

  return {
    completedSession,
    date,
    dateKey,
    inProgressSession,
    notes,
    scheduledWorkouts,
    status,
    templateName,
  };
}

function getDetailStats(selectedDay: DayDetails) {
  if (selectedDay.completedSession) {
    return [
      { label: 'Status', value: 'Completed' },
      {
        label: 'Duration',
        value:
          selectedDay.completedSession.duration != null
            ? `${selectedDay.completedSession.duration} min`
            : 'Not tracked',
      },
      {
        label: 'Exercises',
        value: `${selectedDay.completedSession.exerciseCount}`,
      },
      {
        label: 'Started',
        value: timeFormatter.format(new Date(selectedDay.completedSession.startedAt)),
      },
    ];
  }

  if (selectedDay.inProgressSession) {
    return [
      { label: 'Status', value: 'In progress' },
      { label: 'Duration', value: 'Timer running' },
      { label: 'Exercises', value: `${selectedDay.inProgressSession.exerciseCount}` },
      {
        label: 'Started',
        value: timeFormatter.format(new Date(selectedDay.inProgressSession.startedAt)),
      },
    ];
  }

  if (selectedDay.scheduledWorkouts.length > 0) {
    return [
      { label: 'Status', value: 'Scheduled' },
      { label: 'Planned', value: `${selectedDay.scheduledWorkouts.length} workouts` },
      {
        label: 'Focus',
        value: selectedDay.scheduledWorkouts[0]?.templateName ?? 'Workout planned',
      },
      { label: 'Readiness', value: 'Ready to start' },
    ];
  }

  return [
    { label: 'Status', value: 'Open day' },
    { label: 'Focus', value: 'No session linked' },
    { label: 'Plan', value: 'Use for flexibility' },
    { label: 'Readiness', value: 'Template can be added later' },
  ];
}

function getDefaultSelectedDateKey(
  month: Date,
  completedByDate: Map<string, WorkoutSessionListItem>,
  scheduledByDate: Map<string, ActiveScheduledWorkoutListItem[]>,
): string {
  if (
    isSameMonth(parseDateKey(TODAY_KEY), month) &&
    (completedByDate.has(TODAY_KEY) || (scheduledByDate.get(TODAY_KEY)?.length ?? 0) > 0)
  ) {
    return TODAY_KEY;
  }

  const monthActivity = [...completedByDate.keys(), ...scheduledByDate.keys()]
    .map((dateKey) => parseDateKey(dateKey))
    .filter((date) => isSameMonth(date, month))
    .sort((left, right) => left.getTime() - right.getTime());

  if (monthActivity[0]) {
    return toDateKey(monthActivity[0]);
  }

  return isSameMonth(parseDateKey(TODAY_KEY), month) ? TODAY_KEY : toDateKey(month);
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

function spansToday(session: WorkoutSessionListItem, todayKey: string) {
  const dayStart = new Date(`${todayKey}T00:00:00`).getTime();
  const dayEnd = new Date(`${todayKey}T23:59:59.999`).getTime();
  const sessionEnd = session.completedAt ?? Number.POSITIVE_INFINITY;

  return session.startedAt <= dayEnd && sessionEnd >= dayStart;
}
