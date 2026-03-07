import { CalendarDays, Dumbbell, Layers3, ListChecks } from 'lucide-react';
import { Link } from 'react-router';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { addDays, parseDateKey, startOfWeek, toDateKey } from '@/lib/date-utils';
import {
  mockSessions,
  mockTemplates,
  type WorkoutSession,
  type WorkoutTemplate,
} from '@/lib/mock-data/workouts';
import { cn } from '@/lib/utils';

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
  sessions?: WorkoutSession[];
};

type WorkoutWeekGroup = {
  weekKey: string;
  weekStart: Date;
  weekEnd: Date;
  sessions: WorkoutListItem[];
};

type WorkoutListItem = {
  accentColor: string;
  date: Date;
  exerciseCount: number;
  id: string;
  name: string;
  sectionCount: number;
  totalSets: number;
  typeLabel: string;
};

const templateById = new Map(mockTemplates.map((template) => [template.id, template]));

export function WorkoutList({
  buildSessionHref = (sessionId) => `/workouts/${sessionId}`,
  sessions = mockSessions,
}: WorkoutListProps) {
  const weekGroups = groupSessionsByWeek(sessions);

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

            <span
              className="inline-flex w-fit rounded-full bg-[var(--color-accent-cream)] px-3 py-1 text-xs font-semibold tracking-[0.18em] text-[#8b6914] uppercase dark:text-[#7a5c10]"
            >
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
                          session.accentColor === 'var(--color-accent-mint)'
                            ? 'bg-[var(--color-accent-mint)] text-[#1a6b45] dark:text-[#14573a]'
                            : session.accentColor === 'var(--color-accent-pink)'
                              ? 'bg-[var(--color-accent-pink)] text-[#8b2252] dark:text-[#7a1e48]'
                              : 'bg-[var(--color-accent-cream)] text-[#8b6914] dark:text-[#7a5c10]',
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
                        label={`${sessionDateFormatter.format(session.date)}`}
                      />
                      <WorkoutStat icon={Layers3} label={`${session.sectionCount} sections`} />
                      <WorkoutStat icon={Dumbbell} label={`${session.exerciseCount} exercises`} />
                      <WorkoutStat icon={ListChecks} label={`${session.totalSets} sets`} />
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

function groupSessionsByWeek(sessions: WorkoutSession[]): WorkoutWeekGroup[] {
  const groups = new Map<string, WorkoutWeekGroup>();

  for (const session of sessions) {
    const sessionDate = parseDateKey(session.startedAt.slice(0, 10));
    const weekStart = startOfWeek(sessionDate);
    const weekKey = toDateKey(weekStart);
    const weekEnd = addDays(weekStart, 6);
    const group = groups.get(weekKey) ?? {
      weekKey,
      weekStart,
      weekEnd,
      sessions: [],
    };

    group.sessions.push(buildWorkoutListItem(session));
    groups.set(weekKey, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      sessions: group.sessions.sort((left, right) => right.date.getTime() - left.date.getTime()),
    }))
    .sort((left, right) => right.weekStart.getTime() - left.weekStart.getTime());
}

function buildWorkoutListItem(session: WorkoutSession): WorkoutListItem {
  const template = templateById.get(session.templateId);
  const date = parseDateKey(session.startedAt.slice(0, 10));
  const exerciseCount = session.exercises.length;
  const totalSets = session.exercises.reduce((count, exercise) => count + exercise.sets.length, 0);
  const presentation = getWorkoutPresentation(template);

  return {
    accentColor: presentation.accentColor,
    date,
    exerciseCount,
    id: session.id,
    name: template?.name ?? 'Workout Session',
    sectionCount: template?.sections.length ?? 0,
    totalSets,
    typeLabel: presentation.typeLabel,
  };
}

function getWorkoutPresentation(template?: WorkoutTemplate) {
  if (template?.tags.includes('legs')) {
    return {
      accentColor: 'var(--color-accent-mint)',
      typeLabel: 'Legs',
    };
  }

  if (template?.tags.includes('push')) {
    return {
      accentColor: 'var(--color-accent-pink)',
      typeLabel: 'Push',
    };
  }

  return {
    accentColor: 'var(--color-accent-cream)',
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
