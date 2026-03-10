import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { WorkoutSessionListItem } from '@pulse/shared';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  addDays,
  differenceInDays,
  getMondayIndex,
  parseDateKey,
  toDateKey,
} from '@/lib/date-utils';
import { accentCardStyles } from '@/lib/accent-card-styles';
import { cn } from '@/lib/utils';
import { useCompletedSessions, useWorkoutTemplates } from '../api/workouts';

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
};

type DayStatus = 'completed' | 'none';

type DayDetails = {
  date: Date;
  dateKey: string;
  session?: WorkoutSessionListItem;
  status: DayStatus;
  templateName: string | null;
  notes: string | null;
};

type DayLookupContext = {
  sessionByDate: Map<string, WorkoutSessionListItem>;
  templateNameById: Map<string, string>;
};

export function WorkoutCalendar({ buildDayHref, buildSessionHref }: WorkoutCalendarProps) {
  const completedQuery = useCompletedSessions();
  const templatesQuery = useWorkoutTemplates();
  const initialMonth = startOfMonth(parseDateKey(TODAY_KEY));
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);

  const templateNameById = useMemo(
    () => new Map((templatesQuery.data ?? []).map((template) => [template.id, template.name])),
    [templatesQuery.data],
  );
  const sessionByDate = useMemo(
    () => new Map((completedQuery.data ?? []).map((session) => [session.date, session])),
    [completedQuery.data],
  );
  const lookupContext = useMemo(
    () => ({
      sessionByDate,
      templateNameById,
    }),
    [sessionByDate, templateNameById],
  );

  const [selectedDateKey, setSelectedDateKey] = useState(getDefaultSelectedDateKey(initialMonth, sessionByDate));

  const calendarDays = buildCalendarDays(visibleMonth);
  const selectedDay = getDayDetails(selectedDateKey, lookupContext);
  const detailHref = selectedDay.session
    ? (buildSessionHref?.(selectedDay.session.id) ?? `/workouts/session/${selectedDay.session.id}`)
    : (buildDayHref?.(selectedDateKey) ?? `?date=${selectedDateKey}`);
  const detailStats = getDetailStats(selectedDay);
  const hasWorkout = selectedDay.status === 'completed';

  const accentPanel = hasWorkout ? accentCardStyles.mint : 'bg-card text-foreground';

  function handleMonthChange(offset: number) {
    const nextMonth = addMonths(visibleMonth, offset);
    setVisibleMonth(nextMonth);
    setSelectedDateKey(getDefaultSelectedDateKey(nextMonth, sessionByDate));
  }

  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="gap-4 border-b border-border pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Workout Calendar</CardTitle>
            <p className="text-sm text-muted">
              Track completed sessions and review workout activity in one monthly view.
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
          <LegendDot className="bg-emerald-500" label="Completed workout" />
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
              const isWorkoutDay = details.status === 'completed';

              return (
                <button
                  key={dateKey}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={fullDateFormatter.format(day)}
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
                  onClick={() => setSelectedDateKey(dateKey)}
                  type="button"
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
                    {isWorkoutDay ? (
                      <span className="hidden shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide text-emerald-700 dark:text-emerald-400 sm:inline">
                        Done
                      </span>
                    ) : null}
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
                      {details.notes ?? (isWorkoutDay ? 'Tap for details' : '')}
                    </p>
                  </div>

                  <div className="mt-auto flex items-center gap-1 pt-1 sm:gap-1.5 sm:pt-3">
                    {details.status === 'completed' ? (
                      <span
                        aria-label="Completed workout"
                        className="size-2 rounded-full bg-emerald-500 sm:size-2.5"
                      />
                    ) : null}
                    {isToday ? (
                      <span className="hidden text-[11px] font-medium text-primary sm:inline">
                        Today
                      </span>
                    ) : null}
                  </div>
                </button>
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
                key={stat.label}
                className={cn(
                  'rounded-2xl border p-3',
                  hasWorkout
                    ? 'border-white/35 bg-white/45 dark:border-border dark:bg-secondary/60'
                    : 'border-border bg-secondary/40 text-foreground',
                )}
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
              'No workout is attached to this day yet. Complete a session to see it on the calendar.'}
          </p>

          {hasWorkout ? (
            <Button
              asChild
              className="mt-auto self-start bg-white/60 hover:bg-white/75 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
              size="sm"
              variant="secondary"
            >
              <Link to={detailHref}>View Session</Link>
            </Button>
          ) : null}
        </aside>
      </CardContent>
    </Card>
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
  const session = context.sessionByDate.get(dateKey);
  const templateName =
    session?.templateName ??
    (session?.templateId ? (context.templateNameById.get(session.templateId) ?? null) : null);
  const status: DayStatus = session ? 'completed' : 'none';
  const notes =
    session != null
      ? `${session.exerciseCount} exercise${session.exerciseCount === 1 ? '' : 's'} logged`
      : null;

  return {
    date,
    dateKey,
    session,
    status,
    templateName,
    notes,
  };
}

function getDetailStats(selectedDay: DayDetails) {
  if (selectedDay.session) {
    return [
      { label: 'Status', value: 'Completed' },
      {
        label: 'Duration',
        value:
          selectedDay.session.duration != null ? `${selectedDay.session.duration} min` : 'Not tracked',
      },
      {
        label: 'Exercises',
        value: `${selectedDay.session.exerciseCount}`,
      },
      {
        label: 'Started',
        value: timeFormatter.format(new Date(selectedDay.session.startedAt)),
      },
    ];
  }

  return [
    { label: 'Status', value: 'Open day' },
    { label: 'Focus', value: 'No session linked' },
    { label: 'Plan', value: 'Use for flexibility' },
    { label: 'Readiness', value: 'Template can be added later' },
  ];
}

function getDefaultSelectedDateKey(month: Date, sessionByDate: Map<string, WorkoutSessionListItem>): string {
  const monthActivity = [...sessionByDate.keys()]
    .map((dateKey) => parseDateKey(dateKey))
    .filter((date) => isSameMonth(date, month))
    .sort((left, right) => left.getTime() - right.getTime());

  if (isSameMonth(parseDateKey(TODAY_KEY), month) && hasWorkoutEntry(TODAY_KEY, sessionByDate)) {
    return TODAY_KEY;
  }

  if (monthActivity[0]) {
    return toDateKey(monthActivity[0]);
  }

  return isSameMonth(parseDateKey(TODAY_KEY), month) ? TODAY_KEY : toDateKey(month);
}

function hasWorkoutEntry(dateKey: string, sessionByDate: Map<string, WorkoutSessionListItem>) {
  return sessionByDate.has(dateKey);
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
