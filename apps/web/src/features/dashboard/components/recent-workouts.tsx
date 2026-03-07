import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { parseDateInput } from '@/lib/date';
import { formatRelativeWorkoutDate } from '@/features/dashboard/lib/recent-workouts';
import { mockRecentWorkouts } from '@/lib/mock-data/dashboard';

const WORKOUTS_TO_SHOW = 5;

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const formatWorkoutDate = (value: string): string => {
  return dateFormatter.format(parseDateInput(value));
};

export function RecentWorkouts() {
  const workouts = mockRecentWorkouts.slice(0, WORKOUTS_TO_SHOW);

  return (
    <section aria-labelledby="recent-workouts-heading" className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <h2
            className="text-xl font-semibold text-foreground md:text-2xl"
            id="recent-workouts-heading"
          >
            Recent Workouts
          </h2>
          <p className="text-sm text-muted">Your last five sessions at a glance.</p>
        </div>

        <Button asChild className="h-auto px-0 py-0" size="sm" variant="link">
          <Link to="/workouts">View all</Link>
        </Button>
      </div>

      <ul className="grid gap-3">
        {workouts.map((workout) => (
          <li key={workout.id}>
            <Link
              aria-label={`Open ${workout.name}`}
              className="block cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              to={`/workouts/${workout.id}`}
            >
              <Card
                className="h-full gap-4 px-4 py-4 transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                data-slot="recent-workout-card"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-base font-semibold text-foreground">
                        {workout.name}
                      </p>
                      <time className="text-sm text-muted" dateTime={workout.date}>
                        {formatWorkoutDate(workout.date)}
                      </time>
                    </div>

                    <span className="shrink-0 rounded-full bg-[var(--color-accent-cream)] px-2.5 py-1 text-xs font-semibold text-on-cream dark:bg-amber-500/20 dark:text-amber-400">
                      {formatRelativeWorkoutDate(workout.date)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 text-sm text-foreground">
                    <span className="rounded-full bg-secondary px-3 py-1">{`${workout.totalSets} sets`}</span>
                    <span className="rounded-full bg-secondary px-3 py-1">{`${workout.totalReps} reps`}</span>
                    <span className="rounded-full bg-secondary px-3 py-1">{`${workout.duration} min`}</span>
                  </div>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
