import { useMemo, useState } from 'react';
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
  Trash2,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router';
import type {
  ScheduledWorkoutListItem,
  WorkoutSessionListItem,
  WorkoutSessionStatus,
} from '@pulse/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { useNavigate } from 'react-router';
import { toDateKey } from '@/lib/date-utils';
import { formatDuration } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import {
  useRescheduleWorkout,
  useScheduledWorkouts,
  useUnscheduleWorkout,
  useWorkoutTemplate,
  useWorkoutSessions,
} from '../api/workouts';
import { useTodayKey } from '../hooks/use-today-key';
import { hasAvailableTemplate } from '../lib/workout-filters';
import { buildInitialSessionSets } from '../lib/workout-session-sets';
import {
  useCancelAndRevertSession,
  useDeleteSession,
  useStartSession,
} from '@/hooks/use-workout-session';
import { formatTrackingTypeSummary } from '../lib/tracking';
import { ScheduleWorkoutDialog } from './schedule-workout-dialog';

const sessionDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

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

const SCHEDULED_PAGE_SIZE = 4;
const COMPLETED_PAGE_SIZE = 6;

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
  const todayKey = useTodayKey();
  const sessionsQuery = useWorkoutSessions({}, { enabled: sessions === undefined });
  const scheduledRange = useMemo(() => getScheduledRange(todayKey), [todayKey]);
  const scheduledQuery = useScheduledWorkouts(scheduledRange, {
    enabled: scheduledWorkouts === undefined,
  });

  const resolvedSessions = sessions ?? sessionsQuery.data ?? [];
  const sessionsById = new Map(resolvedSessions.map((session) => [session.id, session]));
  const visibleSessions = resolvedSessions.filter(hasAvailableTemplate);
  const resolvedScheduledWorkouts = scheduledWorkouts ?? scheduledQuery.data ?? [];
  const dedupedScheduledWorkouts = Array.from(
    new Map(resolvedScheduledWorkouts.map((workout) => [workout.id, workout])).values(),
  );

  const scheduledItems = dedupedScheduledWorkouts
    .filter((scheduledWorkout) => {
      if (scheduledWorkout.sessionId == null) {
        return true;
      }

      return !sessionsById.has(scheduledWorkout.sessionId);
    })
    .map((scheduledWorkout) => ({
      ...scheduledWorkout,
      isMissed:
        scheduledWorkout.date < todayKey &&
        (scheduledWorkout.sessionId == null || !sessionsById.has(scheduledWorkout.sessionId)),
      isUnavailable: scheduledWorkout.templateId == null || scheduledWorkout.templateName == null,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const listItems = visibleSessions.map((session) => buildWorkoutListItem(session));
  const inProgressSessions = listItems
    .filter((session) => session.status === 'in-progress' || session.status === 'paused')
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const completedSessions = listItems
    .filter((session) => session.status === 'completed')
    .sort((left, right) => right.date.getTime() - left.date.getTime());
  const hasPlannedWorkouts = scheduledItems.length > 0 || inProgressSessions.length > 0;
  const [scheduledVisibleCount, setScheduledVisibleCount] = useState(SCHEDULED_PAGE_SIZE);
  const [completedVisibleCount, setCompletedVisibleCount] = useState(COMPLETED_PAGE_SIZE);
  const visibleScheduledItems = scheduledItems.slice(0, scheduledVisibleCount);
  const visibleCompletedSessions = completedSessions.slice(0, completedVisibleCount);

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
        <SectionHeading count={inProgressSessions.length} title="In Progress" />
        {inProgressSessions.length > 0 ? (
          <div className="grid gap-3">
            {inProgressSessions.map((session) => (
              <InProgressWorkoutCard
                buildSessionHref={buildSessionHref}
                key={session.id}
                session={session}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No workouts in progress.</p>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading count={scheduledItems.length} title="Scheduled" />
        {!hasPlannedWorkouts ? (
          <Card className="border-dashed">
            <CardContent className="space-y-3 py-4">
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
        {scheduledItems.length > 0 ? (
          <div className="grid gap-3">
            {visibleScheduledItems.map((scheduledWorkout) => (
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
        {scheduledItems.length > scheduledVisibleCount ? (
          <Button
            onClick={() => setScheduledVisibleCount((count) => count + SCHEDULED_PAGE_SIZE)}
            size="sm"
            type="button"
            variant="outline"
          >
            Show more
          </Button>
        ) : null}
      </section>

      <section className="space-y-3">
        <SectionHeading count={completedSessions.length} title="Completed" />
        {completedSessions.length > 0 ? (
          <div className="grid gap-3">
            {visibleCompletedSessions.map((session) => (
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
        {completedSessions.length > completedVisibleCount ? (
          <Button
            onClick={() => setCompletedVisibleCount((count) => count + COMPLETED_PAGE_SIZE)}
            size="sm"
            type="button"
            variant="outline"
          >
            Show more
          </Button>
        ) : null}
      </section>
    </div>
  );
}

function InProgressWorkoutCard({
  buildSessionHref,
  session,
}: {
  buildSessionHref: (sessionId: string, status: WorkoutSessionStatus) => string;
  session: WorkoutListViewItem;
}) {
  const { confirm, dialog } = useConfirmation();
  const cancelSessionMutation = useCancelAndRevertSession(session.id);
  const deleteSessionMutation = useDeleteSession(session.id);
  const isMutating = cancelSessionMutation.isPending || deleteSessionMutation.isPending;

  async function handleCancel() {
    await cancelSessionMutation.mutateAsync();
  }

  async function handleDelete() {
    await deleteSessionMutation.mutateAsync();
  }

  return (
    <Card
      className={cn(
        'h-full gap-2.5 border-l-4 py-0 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md',
        session.cardClass,
      )}
      style={{ borderLeftColor: session.accentColor }}
    >
      <CardHeader className="gap-2.5 py-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
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

      <CardContent className="space-y-3 pb-3">
        <ul className="flex flex-wrap gap-2 text-sm text-muted">
          {buildStatusStats(session).map((stat) => (
            <WorkoutStat icon={stat.icon} key={`${session.id}-${stat.label}`} label={stat.label} />
          ))}
        </ul>

        <div className="flex flex-wrap gap-1.5">
          <Button asChild size="sm">
            <Link to={buildSessionHref(session.id, session.status)}>Resume</Link>
          </Button>
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
            <XCircle aria-hidden="true" className="size-4" />
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
            <Trash2 aria-hidden="true" className="size-4" />
            Delete
          </Button>
        </div>
      </CardContent>
      {dialog}
    </Card>
  );
}

function ScheduledWorkoutCard({
  buildStartWorkoutHref,
  scheduledWorkout,
}: {
  buildStartWorkoutHref: (templateId: string) => string;
  scheduledWorkout: ScheduledWorkoutListItem & { isMissed: boolean; isUnavailable: boolean };
}) {
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirmation();
  const rescheduleWorkoutMutation = useRescheduleWorkout();
  const unscheduleWorkoutMutation = useUnscheduleWorkout();
  const startSessionMutation = useStartSession();
  const activeSessionsQuery = useWorkoutSessions({ status: ['in-progress', 'paused'] });
  const templateId = scheduledWorkout.templateId ?? '';
  const templateQuery = useWorkoutTemplate(templateId);

  const isMutating =
    rescheduleWorkoutMutation.isPending ||
    unscheduleWorkoutMutation.isPending ||
    startSessionMutation.isPending;
  const trackingTypeSummary = formatTrackingTypeSummary(
    scheduledWorkout.templateTrackingTypes ?? [],
  );
  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false);
  const isTemplateAvailable = !scheduledWorkout.isUnavailable && !templateQuery.isError;
  const isStartDisabled = isMutating || !isTemplateAvailable || templateQuery.isPending;

  async function handleReschedule(requestedDate: string) {
    await rescheduleWorkoutMutation.mutateAsync({
      date: requestedDate,
      id: scheduledWorkout.id,
    });
  }

  async function doStart() {
    if (!templateQuery.data || !scheduledWorkout.templateId || !scheduledWorkout.templateName) {
      return;
    }

    const startedAt = Date.now();
    const session = await startSessionMutation.mutateAsync({
      date: toDateKey(new Date(startedAt)),
      name: scheduledWorkout.templateName,
      sets: buildInitialSessionSets(templateQuery.data),
      startedAt,
      templateId: scheduledWorkout.templateId,
    });
    navigate(`/workouts/active?template=${scheduledWorkout.templateId}&sessionId=${session.id}`);
  }

  function handleStartNow() {
    const todayKey = toDateKey(new Date());
    const activeSessions = activeSessionsQuery.data ?? [];

    if (scheduledWorkout.date !== todayKey) {
      confirm({
        title: 'Start workout early?',
        description: `This workout is scheduled for ${sessionDateFormatter.format(parseDateForDisplay(scheduledWorkout.date))}. Starting now will begin it today instead.`,
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

  async function handleRemove() {
    await unscheduleWorkoutMutation.mutateAsync({ id: scheduledWorkout.id });
  }

  return (
    <Card
      className={cn(
        'gap-2.5 border-l-4 py-0',
        scheduledWorkout.isUnavailable
          ? 'border-destructive/45 bg-destructive/5'
          : scheduledWorkout.isMissed
            ? 'border-amber-500/55 bg-amber-500/6'
            : 'border-slate-300/70 dark:border-slate-700/70',
      )}
    >
      <CardHeader className="gap-2.5 py-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>
              {scheduledWorkout.templateId && !scheduledWorkout.isUnavailable ? (
                <Link className="hover:underline" to={`/workouts/scheduled/${scheduledWorkout.id}`}>
                  {scheduledWorkout.templateName ?? 'Workout unavailable'}
                </Link>
              ) : (
                (scheduledWorkout.templateName ?? 'Workout unavailable')
              )}
            </CardTitle>
            <p className="text-sm text-muted">
              {sessionDateFormatter.format(parseDateForDisplay(scheduledWorkout.date))}
            </p>
          </div>

          <span
            className={cn(
              'inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.18em] uppercase',
              scheduledWorkout.isUnavailable
                ? 'bg-destructive/10 text-destructive'
                : scheduledWorkout.isMissed
                  ? 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                  : 'bg-secondary text-muted-foreground',
            )}
          >
            {scheduledWorkout.isUnavailable ? (
              <TriangleAlert aria-hidden="true" className="size-3.5" />
            ) : scheduledWorkout.isMissed ? (
              <TriangleAlert aria-hidden="true" className="size-3.5" />
            ) : (
              <CalendarClock aria-hidden="true" className="size-3.5" />
            )}
            {scheduledWorkout.isUnavailable
              ? 'Unavailable'
              : scheduledWorkout.isMissed
                ? 'Missed'
                : 'Scheduled'}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-3">
        <ul className="flex flex-wrap gap-2 text-sm text-muted">
          <WorkoutStat
            icon={CalendarPlus2}
            label={`Scheduled ${sessionDateFormatter.format(parseDateForDisplay(scheduledWorkout.date))}`}
          />
          {trackingTypeSummary ? <WorkoutStat icon={Dumbbell} label={trackingTypeSummary} /> : null}
          {scheduledWorkout.isUnavailable ? (
            <WorkoutStat icon={TriangleAlert} label="Template was deleted from trash/soft delete" />
          ) : null}
          {scheduledWorkout.isMissed ? (
            <WorkoutStat icon={TriangleAlert} label="No active linked session" />
          ) : null}
        </ul>

        <div className="flex flex-wrap gap-1.5">
          <Button
            disabled={isStartDisabled}
            onClick={() => {
              void handleStartNow();
            }}
            size="sm"
            type="button"
          >
            Start
          </Button>
          <Button
            className="hover:text-foreground active:text-foreground"
            disabled={isMutating || !isTemplateAvailable}
            onClick={() => setIsRescheduleDialogOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            Reschedule
          </Button>
          {!isTemplateAvailable && scheduledWorkout.templateId ? (
            <Button asChild size="sm" variant="secondary">
              <Link to={buildStartWorkoutHref(scheduledWorkout.templateId)}>
                Open template view
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
      <ScheduleWorkoutDialog
        description={`Move ${scheduledWorkout.templateName ?? 'this workout'} to a new date.`}
        initialDate={scheduledWorkout.date}
        isPending={rescheduleWorkoutMutation.isPending}
        onOpenChange={setIsRescheduleDialogOpen}
        onRemove={handleRemove}
        onSubmitDate={handleReschedule}
        open={isRescheduleDialogOpen}
        disallowDateKey={scheduledWorkout.date}
        disallowDateMessage="Pick a different date to reschedule."
        submitLabel="Save"
        title="Reschedule workout"
      />
      {dialog}
    </Card>
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
          'h-full gap-2.5 border-l-4 py-0 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md',
          session.cardClass,
        )}
        style={{ borderLeftColor: session.accentColor }}
      >
        <CardHeader className="gap-2.5 py-3">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
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

        <CardContent className="pb-3">
          <ul className="flex flex-wrap gap-2 text-sm text-muted">
            {buildStatusStats(session).map((stat) => (
              <WorkoutStat
                icon={stat.icon}
                key={`${session.id}-${stat.label}`}
                label={stat.label}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </Link>
  );
}

function WorkoutStat({ icon: Icon, label }: { icon: typeof CalendarDays; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full bg-secondary/55 px-2.5 py-1">
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
    const durationLabel = formatDuration(session.duration);

    return [
      { icon: CalendarCheck2, label: sessionDateFormatter.format(session.date) },
      { icon: Timer, label: durationLabel === '-' ? 'Duration n/a' : durationLabel },
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
