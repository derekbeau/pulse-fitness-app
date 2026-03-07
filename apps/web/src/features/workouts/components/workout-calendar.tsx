import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  addDays,
  differenceInDays,
  getMondayIndex,
  parseDateKey,
  toDateKey,
} from '@/lib/date-utils';
import {
  mockSchedule,
  mockSessions,
  mockTemplates,
  type WorkoutScheduleEntry,
  type WorkoutSession,
} from '@/lib/mock-data/workouts';
import { cn } from '@/lib/utils';

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

type WorkoutCalendarProps = {
  buildDayHref?: (date: string) => string;
};

type DayStatus = 'completed' | 'scheduled' | 'rest' | 'none';

type DayDetails = {
  date: Date;
  dateKey: string;
  schedule?: WorkoutScheduleEntry;
  session?: WorkoutSession;
  status: DayStatus;
  templateName: string | null;
  notes: string | null;
};

const templateNameById = new Map(mockTemplates.map((template) => [template.id, template.name]));
const scheduleByDate = new Map(mockSchedule.map((entry) => [entry.date, entry]));
const sessionByDate = new Map(
  mockSessions.map((session) => [session.startedAt.slice(0, 10), session]),
);

export function WorkoutCalendar({ buildDayHref }: WorkoutCalendarProps) {
  const initialMonth = startOfMonth(parseDateKey(TODAY_KEY));
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);
  const [selectedDateKey, setSelectedDateKey] = useState(getDefaultSelectedDateKey(initialMonth));

  const calendarDays = buildCalendarDays(visibleMonth);
  const selectedDay = getDayDetails(selectedDateKey);
  const detailHref = buildDayHref?.(selectedDateKey) ?? `?date=${selectedDateKey}`;
  const detailStats = getDetailStats(selectedDay);
  const hasWorkout = selectedDay.status === 'completed' || selectedDay.status === 'scheduled';
  const accentPanel =
    selectedDay.status === 'completed' || selectedDay.status === 'scheduled'
      ? 'border-transparent text-[var(--color-on-accent)]'
      : 'bg-card text-foreground';

  const accentPanelStyle =
    selectedDay.status === 'completed'
      ? { backgroundColor: 'var(--color-accent-mint)' }
      : selectedDay.status === 'scheduled'
        ? { backgroundColor: 'var(--color-accent-cream)' }
        : undefined;

  function handleMonthChange(offset: number) {
    const nextMonth = addMonths(visibleMonth, offset);
    setVisibleMonth(nextMonth);
    setSelectedDateKey(getDefaultSelectedDateKey(nextMonth));
  }

  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="gap-4 border-b border-border pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Workout Calendar</CardTitle>
            <p className="text-sm text-muted">
              Track completed sessions, upcoming plans, and recovery days in one monthly view.
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
          <LegendDot className="bg-blue-500" label="Scheduled workout" />
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
              const details = getDayDetails(dateKey);
              const isSelected = selectedDateKey === dateKey;
              const isToday = dateKey === TODAY_KEY;
              const isInMonth = day.getMonth() === visibleMonth.getMonth();
              const isWorkoutDay = details.status === 'completed' || details.status === 'scheduled';

              return (
                <button
                  key={dateKey}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={fullDateFormatter.format(day)}
                  aria-pressed={isSelected}
                  className={cn(
                    'flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border p-1 text-center transition-colors sm:aspect-auto sm:min-h-28 sm:items-start sm:justify-start sm:rounded-2xl sm:px-3 sm:py-3 sm:text-left',
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
                  <span
                    className={cn(
                      'text-sm font-semibold sm:self-start',
                      isToday ? 'text-primary' : 'text-foreground',
                      !isInMonth && 'text-muted',
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {isWorkoutDay ? (
                    <span
                      className={cn(
                        'hidden max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] sm:inline-block',
                        details.status === 'completed'
                          ? 'bg-emerald-500/15 text-emerald-700'
                          : 'bg-blue-500/15 text-blue-700',
                      )}
                    >
                      {details.status}
                    </span>
                  ) : null}

                  <div className="mt-1 hidden space-y-1 sm:block">
                    <p
                      className={cn(
                        'line-clamp-2 text-xs font-medium',
                        isInMonth ? 'text-foreground' : 'text-muted',
                      )}
                    >
                      {details.templateName ??
                        (details.status === 'rest' ? 'Recovery / rest' : 'No workout')}
                    </p>
                    <p className="line-clamp-2 text-[11px] text-muted">
                      {details.notes ?? 'Tap to review the day details.'}
                    </p>
                  </div>

                  <div className="mt-0.5 flex items-center justify-center gap-1 sm:mt-auto sm:justify-start sm:gap-1.5 sm:pt-3">
                    {details.status === 'completed' ? (
                      <span
                        aria-label="Completed workout"
                        className="size-2 rounded-full bg-emerald-500 sm:size-2.5"
                      />
                    ) : null}
                    {details.status === 'scheduled' ? (
                      <span
                        aria-label="Scheduled workout"
                        className="size-2 rounded-full bg-blue-500 sm:size-2.5"
                      />
                    ) : null}
                    {isToday ? (
                      <span className="hidden text-[11px] font-medium text-primary sm:inline">Today</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside
          className={cn(
            'flex min-h-0 flex-col gap-4 rounded-3xl border p-5 shadow-sm',
            accentPanel,
          )}
          id="workout-day-details"
          style={accentPanelStyle}
        >
          <div className="space-y-1">
            <p
              className={cn(
                'text-xs font-semibold uppercase tracking-[0.2em]',
                hasWorkout ? 'text-[var(--color-on-accent)]/70' : 'text-muted',
              )}
            >
              Day details
            </p>
            <h3 className="text-2xl font-semibold">
              {selectedDay.templateName ??
                (selectedDay.status === 'rest' ? 'Recovery day' : 'No workout planned')}
            </h3>
            <p
              className={cn(
                'text-sm',
                hasWorkout ? 'text-[var(--color-on-accent)]/80' : 'text-muted',
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
                    ? 'border-white/35 bg-white/45 text-[var(--color-on-accent)]'
                    : 'border-border bg-secondary/40 text-foreground',
                )}
              >
                <p
                  className={cn(
                    'text-[11px] font-semibold uppercase tracking-[0.18em]',
                    hasWorkout ? 'text-[var(--color-on-accent)]/70' : 'text-muted',
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
              hasWorkout ? 'text-[var(--color-on-accent)]/85' : 'text-muted',
            )}
          >
            {selectedDay.notes ??
              (selectedDay.status === 'rest'
                ? 'Recovery focus: keep steps up, get meals in, and stay ready for the next lift.'
                : 'No workout is attached to this day yet. Navigate months or select a marked day to inspect the plan.')}
          </p>

          {hasWorkout ? (
            <Button
              asChild
              className="mt-auto self-start bg-white/60 text-[var(--color-on-accent)] hover:bg-white/75"
              size="sm"
              variant="secondary"
            >
              <a href={detailHref}>View Details</a>
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

function getDayDetails(dateKey: string): DayDetails {
  const date = parseDateKey(dateKey);
  const schedule = scheduleByDate.get(dateKey);
  const session = sessionByDate.get(dateKey);

  let status: DayStatus = 'none';

  if (session || schedule?.status === 'completed') {
    status = 'completed';
  } else if (schedule?.status === 'scheduled') {
    status = 'scheduled';
  } else if (schedule?.status === 'rest') {
    status = 'rest';
  }

  const templateName =
    schedule?.templateName ?? (session ? (templateNameById.get(session.templateId) ?? null) : null);

  return {
    date,
    dateKey,
    schedule,
    session,
    status,
    templateName,
    notes: schedule?.notes ?? session?.feedback?.notes ?? null,
  };
}

function getDetailStats(selectedDay: DayDetails) {
  if (selectedDay.session) {
    const exerciseCount = selectedDay.session.exercises.length;
    const completedSets = selectedDay.session.exercises.reduce((total, exercise) => {
      return total + exercise.sets.filter((set) => set.completed).length;
    }, 0);
    const feedback = selectedDay.session.feedback;
    const averageFeedback = feedback
      ? ((feedback.energy + feedback.recovery + feedback.technique) / 3).toFixed(1)
      : null;

    return [
      { label: 'Status', value: 'Completed' },
      { label: 'Duration', value: `${selectedDay.session.duration} min` },
      { label: 'Volume', value: `${exerciseCount} exercises / ${completedSets} sets` },
      { label: 'Feedback', value: averageFeedback ? `${averageFeedback}/5` : 'Not rated' },
    ];
  }

  if (selectedDay.status === 'scheduled') {
    return [
      { label: 'Status', value: 'Scheduled' },
      { label: 'Plan', value: '1 session queued' },
      { label: 'Focus', value: selectedDay.templateName ?? 'Workout block' },
      {
        label: 'Day',
        value: fullDateFormatter.format(selectedDay.date).split(',')[0] ?? 'Planned',
      },
    ];
  }

  if (selectedDay.status === 'rest') {
    return [
      { label: 'Status', value: 'Recovery' },
      { label: 'Focus', value: 'Walking + mobility' },
      { label: 'Plan', value: 'No lifting block' },
      { label: 'Readiness', value: 'Reset for next session' },
    ];
  }

  return [
    { label: 'Status', value: 'Open day' },
    { label: 'Focus', value: 'No session linked' },
    { label: 'Plan', value: 'Use for flexibility' },
    { label: 'Readiness', value: 'Template can be added later' },
  ];
}

function getDefaultSelectedDateKey(month: Date): string {
  const monthActivity = [...new Set([...scheduleByDate.keys(), ...sessionByDate.keys()])]
    .map((dateKey) => parseDateKey(dateKey))
    .filter((date) => isSameMonth(date, month))
    .sort((left, right) => left.getTime() - right.getTime());

  if (isSameMonth(parseDateKey(TODAY_KEY), month) && hasWorkoutEntry(TODAY_KEY)) {
    return TODAY_KEY;
  }

  if (monthActivity[0]) {
    return toDateKey(monthActivity[0]);
  }

  return isSameMonth(parseDateKey(TODAY_KEY), month) ? TODAY_KEY : toDateKey(month);
}

function hasWorkoutEntry(dateKey: string) {
  const details = getDayDetails(dateKey);
  return details.status === 'completed' || details.status === 'scheduled';
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
