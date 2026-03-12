import { FormEvent, useMemo, useState } from 'react';
import {
  Activity,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarPlus2,
  CheckCircle2,
  Dumbbell,
  Timer,
  TriangleAlert,
} from 'lucide-react';
import { Link } from 'react-router';
import type {
  ScheduledWorkoutListItem,
  WorkoutSessionListItem,
  WorkoutSessionStatus,
} from '@pulse/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toDateKey } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

import {
  useDeleteScheduledWorkout,
  useScheduledWorkouts,
  useUpdateScheduledWorkout,
  useWorkoutSessions,
} from '../api/workouts';
import {
  ActiveScheduledWorkoutListItem,
  isActiveScheduledWorkout,
  isActiveSessionListItem,
} from '../lib/workout-filters';

const sessionDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const TODAY_KEY = toDateKey(new Date());

type WorkoutListProps = {
  buildSessionHref?: (sessionId: string, status: WorkoutSessionStatus) => string;
  buildTemplatesHref?: () => string;
  buildPlanWorkoutHref?: () => string;
  buildStartWorkoutHref?: (templateId: string) => string;
  sessions?: WorkoutSessionListItem[];
  scheduledWorkouts?: ScheduledWorkoutListItem[];
};

type WorkoutListViewItem = {
  accentColor: string;
  cardClass: string;
  date: Date;
  duration: number | null;
  exerciseCount: number;
  id: string;
  name: string;
  status: WorkoutSessionStatus;
  statusBadgeClass: string;
  statusLabel: string;
};

export function WorkoutList({
  buildSessionHref = (sessionId, status) =>
    status === 'in-progress' || status === 'paused'
      ? `/workouts/active?sessionId=${sessionId}`
      : `/workouts/session/${sessionId}`,
  buildTemplatesHref = () => '/workouts?view=templates',
  buildPlanWorkoutHref = () => '/workouts?view=templates',
  buildStartWorkoutHref = (templateId) => `/workouts/active?template=${templateId}`,
  sessions,
  scheduledWorkouts,
}: WorkoutListProps) {
  const sessionsQuery = useWorkoutSessions({}, { enabled: sessions === undefined });
  const scheduledRange = useMemo(() => getScheduledRange(TODAY_KEY), []);
  const scheduledQuery = useScheduledWorkouts(scheduledRange, {
    enabled: scheduledWorkouts === undefined,
  });

  const resolvedSessions = sessions ?? sessionsQuery.data ?? [];
  const activeSessions = resolvedSessions.filter(isActiveSessionListItem);
  const linkedSessionIds = new Set(activeSessions.map((session) => session.id));
  const resolvedScheduledWorkouts = (scheduledWorkouts ?? scheduledQuery.data ?? []).filter(
    isActiveScheduledWorkout,
  );

  const scheduledItems = resolvedScheduledWorkouts
    .map((scheduledWorkout) => ({
      ...scheduledWorkout,
      isMissed:
        scheduledWorkout.date < TODAY_KEY &&
        (scheduledWorkout.sessionId == null || !linkedSessionIds.has(scheduledWorkout.sessionId)),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const listItems = activeSessions.map((session) => buildWorkoutListItem(session));
  const upcomingSessions = listItems
    .filter((session) => session.status !== 'completed' && session.status !== 'scheduled')
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const completedSessions = listItems
    .filter((session) => session.status === 'completed')
    .sort((left, right) => right.date.getTime() - left.date.getTime());
  const hasPlannedWorkouts = scheduledItems.length > 0 || upcomingSessions.length > 0;

  if ((sessionsQuery.isLoading && !sessions) || (scheduledQuery.isLoading && !scheduledWorkouts)) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted">Loading workouts…</p>
        </CardContent>
      </Card>
    );
  }

  if (listItems.length === 0 && scheduledItems.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted">No workouts yet. Plan one to get started.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeading count={scheduledItems.length} title="Scheduled" />
        {scheduledItems.length > 0 ? (
          <div className="grid gap-3">
            {scheduledItems.map((scheduledWorkout) => (
              <ScheduledWorkoutCard
                buildStartWorkoutHref={buildStartWorkoutHref}
                key={scheduledWorkout.id}
                scheduledWorkout={scheduledWorkout}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No scheduled workouts right now.</p>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading count={upcomingSessions.length} title="Upcoming" />
        {!hasPlannedWorkouts ? (
          <Card className="border-dashed">
            <CardContent className="space-y-4 py-5">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">No workouts planned</h3>
                <p className="text-sm text-muted">
                  Start by picking a template and scheduling your next session.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to={buildPlanWorkoutHref()}>Plan a workout</Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link to={buildTemplatesHref()}>Browse templates</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
        {upcomingSessions.length > 0 ? (
          <div className="grid gap-3">
            {upcomingSessions.map((session) => (
              <WorkoutListCard
                buildSessionHref={buildSessionHref}
                key={session.id}
                session={session}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No upcoming sessions right now.</p>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading count={completedSessions.length} title="Completed" />
        {completedSessions.length > 0 ? (
          <div className="grid gap-3">
            {completedSessions.map((session) => (
              <WorkoutListCard
                buildSessionHref={buildSessionHref}
                key={session.id}
                session={session}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No completed workouts yet.</p>
        )}
      </section>
    </div>
  );
}

function ScheduledWorkoutCard({
  buildStartWorkoutHref,
  scheduledWorkout,
}: {
  buildStartWorkoutHref: (templateId: string) => string;
  scheduledWorkout: ActiveScheduledWorkoutListItem & { isMissed: boolean };
}) {
  const updateScheduledWorkoutMutation = useUpdateScheduledWorkout();
  const deleteScheduledWorkoutMutation = useDeleteScheduledWorkout();

  const isMutating =
    updateScheduledWorkoutMutation.isPending || deleteScheduledWorkoutMutation.isPending;
  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false);

  async function handleReschedule(requestedDate: string) {
    await updateScheduledWorkoutMutation.mutateAsync({
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

    void deleteScheduledWorkoutMutation.mutateAsync({ id: scheduledWorkout.id });
  }

  return (
    <Card
      className={cn(
        'gap-4 border-l-4 py-0',
        scheduledWorkout.isMissed
          ? 'border-amber-500/55 bg-amber-500/6'
          : 'border-slate-300/70 dark:border-slate-700/70',
      )}
    >
      <CardHeader className="gap-3 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>{scheduledWorkout.templateName}</CardTitle>
            <p className="text-sm text-muted">{sessionDateFormatter.format(parseDateForDisplay(scheduledWorkout.date))}</p>
          </div>

          <span
            className={cn(
              'inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.18em] uppercase',
              scheduledWorkout.isMissed
                ? 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                : 'bg-secondary text-muted-foreground',
            )}
          >
            {scheduledWorkout.isMissed ? (
              <TriangleAlert aria-hidden="true" className="size-3.5" />
            ) : (
              <CalendarClock aria-hidden="true" className="size-3.5" />
            )}
            {scheduledWorkout.isMissed ? 'Missed' : 'Scheduled'}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pb-5">
        <ul className="flex flex-wrap gap-3 text-sm text-muted">
          <WorkoutStat
            icon={CalendarPlus2}
            label={`Scheduled ${sessionDateFormatter.format(parseDateForDisplay(scheduledWorkout.date))}`}
          />
          {scheduledWorkout.isMissed ? <WorkoutStat icon={TriangleAlert} label="No active linked session" /> : null}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Button asChild disabled={isMutating} size="sm">
            <Link to={buildStartWorkoutHref(scheduledWorkout.templateId)}>Start</Link>
          </Button>
          <Button
            disabled={isMutating}
            onClick={() => setIsRescheduleDialogOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            Reschedule
          </Button>
          <Button disabled={isMutating} onClick={handleRemove} size="sm" type="button" variant="ghost">
            Remove
          </Button>
        </div>
      </CardContent>
      <RescheduleScheduledWorkoutDialog
        currentDate={scheduledWorkout.date}
        isPending={updateScheduledWorkoutMutation.isPending}
        onOpenChange={setIsRescheduleDialogOpen}
        onReschedule={handleReschedule}
        open={isRescheduleDialogOpen}
        templateName={scheduledWorkout.templateName}
      />
    </Card>
  );
}

function RescheduleScheduledWorkoutDialog({
  currentDate,
  isPending,
  onOpenChange,
  onReschedule,
  open,
  templateName,
}: {
  currentDate: string;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onReschedule: (date: string) => Promise<unknown>;
  open: boolean;
  templateName: string | null;
}) {
  const [requestedDate, setRequestedDate] = useState(currentDate);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setRequestedDate(currentDate);
      setErrorMessage(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = requestedDate.trim();
    const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(normalized);
    if (!isIsoDate) {
      setErrorMessage('Enter a valid date in YYYY-MM-DD format.');
      return;
    }

    if (normalized === currentDate) {
      setErrorMessage('Pick a different date to reschedule.');
      return;
    }

    setErrorMessage(null);
    try {
      await onReschedule(normalized);
      handleOpenChange(false);
    } catch {
      setErrorMessage('Unable to reschedule right now. Try again.');
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule workout</DialogTitle>
          <DialogDescription>
            Move {templateName ?? 'this workout'} to a new date.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <Input
            aria-invalid={errorMessage != null}
            min="1900-01-01"
            onChange={(event) => setRequestedDate(event.target.value)}
            type="date"
            value={requestedDate}
          />
          {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isPending} type="submit">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SectionHeading({ count, title }: { count: number; title: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <span className="rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-xs font-semibold text-muted">
        {`${count} workout${count === 1 ? '' : 's'}`}
      </span>
    </div>
  );
}

function WorkoutListCard({
  buildSessionHref,
  session,
}: {
  buildSessionHref: (sessionId: string, status: WorkoutSessionStatus) => string;
  session: WorkoutListViewItem;
}) {
  return (
    <Link
      className="block cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      to={buildSessionHref(session.id, session.status)}
    >
      <Card
        className={cn(
          'h-full gap-4 border-l-4 py-0 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md',
          session.cardClass,
        )}
        style={{ borderLeftColor: session.accentColor }}
      >
        <CardHeader className="gap-3 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>{session.name}</CardTitle>
              <p className="text-sm text-muted">{sessionDateFormatter.format(session.date)}</p>
            </div>

            <span
              className={cn(
                'inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.18em] uppercase',
                session.statusBadgeClass,
              )}
            >
              {getStatusBadgeIcon(session.status)}
              {session.statusLabel}
            </span>
          </div>
        </CardHeader>

        <CardContent className="pb-5">
          <ul className="flex flex-wrap gap-3 text-sm text-muted">
            {buildStatusStats(session).map((stat) => (
              <WorkoutStat icon={stat.icon} key={`${session.id}-${stat.label}`} label={stat.label} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </Link>
  );
}

function WorkoutStat({ icon: Icon, label }: { icon: typeof CalendarDays; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full bg-secondary/55 px-3 py-1.5">
      <Icon aria-hidden="true" className="size-3.5 text-primary" />
      <span>{label}</span>
    </li>
  );
}

function buildWorkoutListItem(session: WorkoutSessionListItem): WorkoutListViewItem {
  const date = parseDateForDisplay(session.date);
  const presentation = getWorkoutPresentation(session.status);

  return {
    accentColor: presentation.accentColor,
    cardClass: presentation.cardClass,
    date,
    duration: session.duration,
    exerciseCount: session.exerciseCount,
    id: session.id,
    name: session.templateName ?? session.name,
    status: session.status,
    statusBadgeClass: presentation.statusBadgeClass,
    statusLabel: presentation.statusLabel,
  };
}

function getWorkoutPresentation(status: WorkoutSessionStatus) {
  if (status === 'completed') {
    return {
      accentColor: 'rgb(16 185 129)',
      cardClass: 'border-emerald-500/40',
      statusBadgeClass:
        'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
      statusLabel: 'Completed',
    };
  }

  if (status === 'in-progress') {
    return {
      accentColor: 'rgb(249 115 22)',
      cardClass: 'border-orange-500/40',
      statusBadgeClass:
        'bg-orange-500/15 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
      statusLabel: 'In Progress',
    };
  }

  if (status === 'paused') {
    return {
      accentColor: 'rgb(245 158 11)',
      cardClass: 'border-amber-500/40',
      statusBadgeClass: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
      statusLabel: 'Paused',
    };
  }

  return {
    accentColor: 'rgb(148 163 184)',
    cardClass: 'border-slate-300/70 dark:border-slate-700/70',
    statusBadgeClass: 'bg-secondary text-muted-foreground',
    statusLabel: 'Planned',
  };
}

function buildStatusStats(session: WorkoutListViewItem) {
  if (session.status === 'completed') {
    return [
      { icon: CalendarCheck2, label: sessionDateFormatter.format(session.date) },
      { icon: Timer, label: session.duration != null ? `${session.duration} min` : 'Duration n/a' },
      { icon: Dumbbell, label: `${session.exerciseCount} exercises` },
    ];
  }

  if (session.status === 'in-progress') {
    return [
      { icon: CalendarDays, label: sessionDateFormatter.format(session.date) },
      { icon: Activity, label: 'In Progress' },
      { icon: Dumbbell, label: `${session.exerciseCount} exercises` },
    ];
  }

  if (session.status === 'paused') {
    return [
      { icon: CalendarDays, label: sessionDateFormatter.format(session.date) },
      { icon: Activity, label: 'Paused' },
      { icon: Dumbbell, label: `${session.exerciseCount} exercises` },
    ];
  }

  return [
    { icon: CalendarPlus2, label: `Scheduled ${sessionDateFormatter.format(session.date)}` },
    { icon: Dumbbell, label: `${session.exerciseCount} exercises` },
  ];
}

function getStatusBadgeIcon(status: WorkoutSessionStatus) {
  if (status === 'completed') {
    return <CheckCircle2 aria-hidden="true" className="size-3.5" />;
  }

  if (status === 'in-progress') {
    return <span aria-hidden="true" className="size-2 rounded-full bg-current animate-pulse" />;
  }

  if (status === 'paused') {
    return <Activity aria-hidden="true" className="size-3.5" />;
  }

  return <CalendarDays aria-hidden="true" className="size-3.5" />;
}

function parseDateForDisplay(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

function getScheduledRange(today: string) {
  const pivot = new Date(`${today}T12:00:00`);
  const from = new Date(pivot);
  const to = new Date(pivot);
  from.setDate(from.getDate() - 30);
  to.setDate(to.getDate() + 90);

  return {
    from: toDateKey(from),
    to: toDateKey(to),
  };
}
