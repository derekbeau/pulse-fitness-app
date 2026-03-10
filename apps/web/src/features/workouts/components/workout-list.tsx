import { CalendarDays, Dumbbell, Timer } from 'lucide-react';
import { Link } from 'react-router';
import type { WorkoutSessionListItem, WorkoutTemplate } from '@pulse/shared';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { addDays, parseDateKey, startOfWeek, toDateKey } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

import { useCompletedSessions, useWorkoutTemplates } from '../api/workouts';

const weekOfFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const sessionDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

type WorkoutListProps = {
  buildSessionHref?: (sessionId: string) => string;
  sessions?: WorkoutSessionListItem[];
};

type WorkoutWeekGroup = {
  weekKey: string;
  weekStart: Date;
  weekEnd: Date;
  sessions: WorkoutListViewItem[];
};

type WorkoutListViewItem = {
  accentColor: string;
  badgeClass: string;
  date: Date;
  duration: number | null;
  exerciseCount: number;
  id: string;
  name: string;
  typeLabel: string;
};

export function WorkoutList({
  buildSessionHref = (sessionId) => `/workouts/session/${sessionId}`,
  sessions,
}: WorkoutListProps) {
  const completedQuery = useCompletedSessions();
  const templatesQuery = useWorkoutTemplates();

  const resolvedSessions = sessions ?? completedQuery.data ?? [];
  const templateById = new Map(
    (templatesQuery.data ?? []).map((template) => [template.id, template]),
  );

  const weekGroups = groupSessionsByWeek(resolvedSessions, templateById);

  if (completedQuery.isLoading && !sessions) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted">Loading completed workouts…</p>
        </CardContent>
      </Card>
    );
  }

  if (weekGroups.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted">No completed workouts yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {weekGroups.map((group) => (
        <section className="space-y-3" key={group.weekKey}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-foreground">
                {`Week of ${weekOfFormatter.format(group.weekStart)}`}
              </h2>
              <p className="text-sm text-muted">
                {formatWeekRange(group.weekStart, group.weekEnd)}
              </p>
            </div>

            <span className="inline-flex w-fit rounded-full bg-[var(--color-accent-cream)] px-3 py-1 text-xs font-semibold tracking-[0.18em] text-on-cream uppercase dark:bg-amber-500/20 dark:text-amber-400">
              {`${group.sessions.length} workout${group.sessions.length === 1 ? '' : 's'}`}
            </span>
          </div>

          <div className="grid gap-3">
            {group.sessions.map((session) => (
              <Link
                className="block cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                key={session.id}
                to={buildSessionHref(session.id)}
              >
                <Card
                  className="h-full gap-4 border-l-4 py-0 transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                  style={{ borderLeftColor: session.accentColor }}
                >
                  <CardHeader className="gap-3 py-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <CardTitle>{session.name}</CardTitle>
                        <p className="text-sm text-muted">
                          {sessionDateFormatter.format(session.date)}
                        </p>
                      </div>

                      <span
                        className={cn(
                          'inline-flex w-fit rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.18em] uppercase',
                          session.badgeClass,
                        )}
                      >
                        {session.typeLabel}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="pb-5">
                    <ul className="flex flex-wrap gap-3 text-sm text-muted">
                      <WorkoutStat
                        icon={CalendarDays}
                        label={sessionDateFormatter.format(session.date)}
                      />
                      {session.duration != null ? (
                        <WorkoutStat icon={Timer} label={`${session.duration} min`} />
                      ) : null}
                      <WorkoutStat icon={Dumbbell} label={`${session.exerciseCount} exercises`} />
                    </ul>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
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

function groupSessionsByWeek(
  sessions: WorkoutSessionListItem[],
  templateById: Map<string, WorkoutTemplate>,
): WorkoutWeekGroup[] {
  const groups = new Map<string, WorkoutWeekGroup>();

  for (const session of sessions) {
    const sessionDate = parseDateKey(session.date);
    const weekStart = startOfWeek(sessionDate);
    const weekKey = toDateKey(weekStart);
    const weekEnd = addDays(weekStart, 6);
    const group = groups.get(weekKey) ?? {
      weekKey,
      weekStart,
      weekEnd,
      sessions: [],
    };

    group.sessions.push(buildWorkoutListItem(session, templateById));
    groups.set(weekKey, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      sessions: group.sessions.sort((left, right) => right.date.getTime() - left.date.getTime()),
    }))
    .sort((left, right) => right.weekStart.getTime() - left.weekStart.getTime());
}

function buildWorkoutListItem(
  session: WorkoutSessionListItem,
  templateById: Map<string, WorkoutTemplate>,
): WorkoutListViewItem {
  const template = session.templateId ? templateById.get(session.templateId) : undefined;
  const date = parseDateKey(session.date);
  const presentation = getWorkoutPresentation(template);

  return {
    accentColor: presentation.accentColor,
    badgeClass: presentation.badgeClass,
    date,
    duration: session.duration,
    exerciseCount: session.exerciseCount,
    id: session.id,
    name: session.templateName ?? session.name,
    typeLabel: presentation.typeLabel,
  };
}

function getWorkoutPresentation(template?: WorkoutTemplate) {
  if (template?.tags.includes('legs')) {
    return {
      accentColor: 'var(--color-accent-mint)',
      badgeClass:
        'bg-[var(--color-accent-mint)] text-on-mint dark:bg-emerald-500/20 dark:text-emerald-400',
      typeLabel: 'Legs',
    };
  }

  if (template?.tags.includes('push')) {
    return {
      accentColor: 'var(--color-accent-pink)',
      badgeClass:
        'bg-[var(--color-accent-pink)] text-on-pink dark:bg-pink-500/20 dark:text-pink-400',
      typeLabel: 'Push',
    };
  }

  return {
    accentColor: 'var(--color-accent-cream)',
    badgeClass:
      'bg-[var(--color-accent-cream)] text-on-cream dark:bg-amber-500/20 dark:text-amber-400',
    typeLabel: 'Full Body',
  };
}

function formatWeekRange(weekStart: Date, weekEnd: Date) {
  const startLabel = weekOfFormatter.format(weekStart);
  const endLabel = weekOfFormatter.format(weekEnd);

  if (weekStart.getFullYear() === weekEnd.getFullYear()) {
    return `${startLabel} - ${endLabel}, ${weekEnd.getFullYear()}`;
  }

  return `${startLabel}, ${weekStart.getFullYear()} - ${endLabel}, ${weekEnd.getFullYear()}`;
}
