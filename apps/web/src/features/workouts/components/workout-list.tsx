import { Activity, CalendarCheck2, CalendarDays, CalendarPlus2, CheckCircle2, Dumbbell, Timer } from 'lucide-react';
import { Link } from 'react-router';
import type { WorkoutSessionListItem, WorkoutSessionStatus } from '@pulse/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { useWorkoutSessions } from '../api/workouts';

const sessionDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

type WorkoutListProps = {
  buildSessionHref?: (sessionId: string, status: WorkoutSessionStatus) => string;
  buildTemplatesHref?: () => string;
  buildPlanWorkoutHref?: () => string;
  sessions?: WorkoutSessionListItem[];
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
    status === 'in-progress' ? `/workouts/active?sessionId=${sessionId}` : `/workouts/session/${sessionId}`,
  buildTemplatesHref = () => '/workouts?view=templates',
  buildPlanWorkoutHref = () => '/workouts?view=templates',
  sessions,
}: WorkoutListProps) {
  const sessionsQuery = useWorkoutSessions({}, { enabled: sessions === undefined });

  const resolvedSessions = sessions ?? sessionsQuery.data ?? [];
  const listItems = resolvedSessions.map((session) => buildWorkoutListItem(session));
  const upcomingSessions = listItems
    .filter((session) => session.status !== 'completed')
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const completedSessions = listItems
    .filter((session) => session.status === 'completed')
    .sort((left, right) => right.date.getTime() - left.date.getTime());
  const hasPlannedWorkouts = listItems.some(
    (session) => session.status === 'scheduled' || session.status === 'in-progress',
  );

  if (sessionsQuery.isLoading && !sessions) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted">Loading workouts…</p>
        </CardContent>
      </Card>
    );
  }

  if (listItems.length === 0) {
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
  const date = new Date(`${session.date}T12:00:00`);
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

  return <CalendarDays aria-hidden="true" className="size-3.5" />;
}
