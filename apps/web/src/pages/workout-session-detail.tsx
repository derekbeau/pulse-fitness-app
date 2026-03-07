import { Link, useParams } from 'react-router';
import { ArrowLeft, CalendarDays, Clock, Dumbbell, ListChecks, Star } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import {
  mockExercises,
  mockSessions,
  mockTemplates,
  type WorkoutLoggedSet,
} from '@/lib/mock-data/workouts';
import { cn } from '@/lib/utils';

const exerciseById = new Map(mockExercises.map((e) => [e.id, e]));
const templateById = new Map(mockTemplates.map((t) => [t.id, t]));

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

export function WorkoutSessionDetailPage() {
  const { sessionId = '' } = useParams();
  const session = mockSessions.find((s) => s.id === sessionId);

  if (!session) {
    return (
      <Card>
        <CardHeader className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Session not found</h1>
          <p className="text-sm text-muted">
            The requested workout session is not available in the current prototype data.
          </p>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full sm:w-auto">
            <Link to="/workouts">Back to Workouts</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const template = templateById.get(session.templateId);
  const sessionDate = new Date(session.startedAt);
  const completedSets = session.exercises.reduce(
    (total, ex) => total + ex.sets.filter((s) => s.completed).length,
    0,
  );
  const totalExercises = session.exercises.length;
  const feedback = session.feedback;
  const averageFeedback = feedback
    ? ((feedback.energy + feedback.recovery + feedback.technique) / 3).toFixed(1)
    : null;

  return (
    <section className="space-y-6">
      <Button asChild className="gap-2" size="sm" variant="ghost">
        <Link to="/workouts">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to Workouts
        </Link>
      </Button>

      <Card className="gap-4 overflow-hidden border-transparent bg-card/80 py-0">
        <div className="space-y-4 bg-[var(--color-accent-mint)] px-6 py-6 text-on-mint dark:bg-card dark:text-foreground dark:border-b dark:border-border">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-70 dark:text-muted dark:opacity-100">
              Completed session
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {template?.name ?? 'Workout Session'}
            </h1>
            <p className="max-w-3xl text-sm opacity-80 sm:text-base dark:text-muted dark:opacity-100">
              {template?.description ?? 'Recorded workout session.'}
            </p>
          </div>

          {template?.tags && (
            <div className="flex flex-wrap gap-2">
              {template.tags.map((tag) => (
                <Badge
                  className="border-white/45 bg-white/55 dark:border-border dark:bg-secondary"
                  key={tag}
                  variant="outline"
                >
                  {formatLabel(tag)}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CalendarDays aria-hidden="true" className="size-4" />}
          label="Date"
          value={dateFormatter.format(sessionDate)}
        />
        <StatCard
          icon={<Clock aria-hidden="true" className="size-4" />}
          label="Duration"
          value={`${session.duration} min`}
        />
        <StatCard
          icon={<Dumbbell aria-hidden="true" className="size-4" />}
          label="Exercises"
          value={`${totalExercises}`}
        />
        <StatCard
          icon={<ListChecks aria-hidden="true" className="size-4" />}
          label="Sets Completed"
          value={`${completedSets}`}
        />
      </div>

      {feedback && (
        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="flex items-center gap-2">
              <Star aria-hidden="true" className="size-5 text-primary" />
              Session Feedback
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <FeedbackItem label="Energy" score={feedback.energy} />
              <FeedbackItem label="Recovery" score={feedback.recovery} />
              <FeedbackItem label="Technique" score={feedback.technique} />
            </div>
            {averageFeedback && (
              <p className="text-sm text-muted">
                Average: <span className="font-semibold text-foreground">{averageFeedback}/5</span>
              </p>
            )}
            {feedback.notes && (
              <p className="rounded-2xl border border-border bg-secondary/35 px-4 py-3 text-sm text-foreground">
                {feedback.notes}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Exercise Log</h2>

        {session.exercises.map((exerciseLog) => {
          const exercise = exerciseById.get(exerciseLog.exerciseId);

          if (!exercise) {
            return null;
          }

          const completedCount = exerciseLog.sets.filter((s) => s.completed).length;

          return (
            <Card className="gap-4 py-0" key={exerciseLog.exerciseId}>
              <CardHeader className="gap-3 py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle>{exercise.name}</CardTitle>
                    <p className="text-sm text-muted">
                      {`${completedCount}/${exerciseLog.sets.length} sets completed`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      className={cn(
                        'border-transparent capitalize',
                        categoryBadgeStyles[exercise.category],
                      )}
                      variant="outline"
                    >
                      {exercise.category}
                    </Badge>
                    <Badge className="border-border bg-secondary/70" variant="outline">
                      {formatLabel(exercise.equipment)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pb-5">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wider text-muted">
                        <th className="pb-2 pr-4">Set</th>
                        <th className="pb-2 pr-4">Weight</th>
                        <th className="pb-2 pr-4">Reps</th>
                        <th className="pb-2 pr-4">Time</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exerciseLog.sets.map((set) => (
                        <SetRow key={set.setNumber} set={set} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {template && (
        <Button asChild className="w-full sm:w-auto" size="lg">
          <Link to={`/workouts/active?template=${template.id}`}>Repeat Workout</Link>
        </Button>
      )}
    </section>
  );
}

const categoryBadgeStyles = {
  compound: 'bg-[var(--color-accent-pink)] text-on-pink dark:bg-pink-500/20 dark:text-pink-400',
  isolation:
    'bg-[var(--color-accent-cream)] text-on-cream dark:bg-amber-500/20 dark:text-amber-400',
  cardio: 'bg-[var(--color-accent-mint)] text-on-mint dark:bg-emerald-500/20 dark:text-emerald-400',
  mobility: 'bg-[var(--color-accent-cream)] text-on-cream dark:bg-amber-500/20 dark:text-amber-400',
} as const;

function FeedbackItem({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-2xl border border-border bg-secondary/40 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{score}/5</p>
    </div>
  );
}

function SetRow({ set }: { set: WorkoutLoggedSet }) {
  const time = new Date(set.timestamp);

  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="py-2.5 pr-4 font-medium text-foreground">{set.setNumber}</td>
      <td className="py-2.5 pr-4 text-muted">{set.weight != null ? `${set.weight} kg` : '--'}</td>
      <td className="py-2.5 pr-4 text-muted">{set.reps}</td>
      <td className="py-2.5 pr-4 text-muted">{timeFormatter.format(time)}</td>
      <td className="py-2.5">
        <span
          className={cn(
            'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
            set.completed
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
              : 'bg-red-500/15 text-red-700 dark:text-red-400',
          )}
        >
          {set.completed ? 'Done' : 'Skipped'}
        </span>
      </td>
    </tr>
  );
}

function formatLabel(value: string) {
  return value
    .split(/[- ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
