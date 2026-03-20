import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardCardHeaderLink } from '@/features/dashboard/components/dashboard-drilldown-link';
import { formatRelativeWorkoutDate } from '@/features/dashboard/lib/recent-workouts';
import { useRecentWorkouts } from '@/hooks/use-recent-workouts';
import { parseDateInput } from '@/lib/date';
import { formatDuration } from '@/lib/format-utils';

const WORKOUTS_TO_SHOW = 5;
const WORKOUT_SKELETON_ROWS = 4;

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const formatWorkoutDate = (value: string): string => {
  return dateFormatter.format(parseDateInput(value));
};

function RecentWorkoutRowsSkeleton() {
  return (
    <ul className="grid gap-2.5" data-slot="recent-workout-skeleton-list">
      {Array.from({ length: WORKOUT_SKELETON_ROWS }).map((_, index) => (
        <li key={`workout-skeleton-${index}`}>
          <Card
            className="h-full gap-2.5 overflow-hidden px-3 py-2.5"
            data-slot="recent-workout-card-skeleton"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-2">
                  <div className="h-5 w-40 animate-pulse rounded bg-muted/50" />
                  <div className="h-4 w-28 animate-pulse rounded bg-muted/50" />
                </div>
                <div className="h-6 w-20 animate-pulse rounded-full bg-muted/50" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <div className="h-6 w-24 animate-pulse rounded-full bg-muted/50" />
                <div className="h-6 w-20 animate-pulse rounded-full bg-muted/50" />
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function RecentWorkouts() {
  const recentWorkoutsQuery = useRecentWorkouts(WORKOUTS_TO_SHOW);

  return (
    <Card aria-labelledby="recent-workouts-heading" className="gap-3 py-3 sm:py-3.5">
      <CardHeader className="flex flex-row items-start justify-between gap-2.5 px-3 space-y-0 sm:px-4">
        <CardTitle>
          <h2
            className="text-lg leading-tight font-semibold text-foreground md:text-xl"
            id="recent-workouts-heading"
          >
            Recent Workouts
          </h2>
        </CardTitle>
        <DashboardCardHeaderLink
          ariaLabel="View all workouts"
          label="All"
          to="/workouts?view=list"
        />
      </CardHeader>

      <CardContent className="overflow-hidden px-3 sm:px-4">
        {recentWorkoutsQuery.isLoading ? (
          <RecentWorkoutRowsSkeleton />
        ) : recentWorkoutsQuery.isError ? (
          <p className="text-sm text-muted-foreground">Unable to load recent workouts.</p>
        ) : recentWorkoutsQuery.data && recentWorkoutsQuery.data.length > 0 ? (
          <ul className="grid gap-2.5 py-0.5">
            {recentWorkoutsQuery.data.map((workout) => {
              const durationLabel = formatDuration(workout.duration);

              return (
                <li className="min-w-0" key={workout.id}>
                  <Link
                    aria-label={`Open ${workout.name}`}
                    className="block cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    to={`/workouts/sessions/${workout.id}`}
                  >
                    <Card
                      className="h-full gap-2.5 overflow-hidden px-3 py-2.5 transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                      data-slot="recent-workout-card"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-semibold leading-tight text-foreground sm:text-base">
                              {workout.name}
                            </p>
                            <time className="text-sm text-muted" dateTime={workout.date}>
                              {formatWorkoutDate(workout.date)}
                            </time>
                          </div>

                          <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                            {formatRelativeWorkoutDate(workout.date)}
                          </span>
                        </div>

                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap gap-1.5 text-xs text-foreground">
                            <span className="rounded-full bg-secondary px-2 py-0.5">
                              {`${workout.exerciseCount} exercises`}
                            </span>
                            <span className="rounded-full bg-secondary px-2 py-0.5">
                              {durationLabel === '-' ? 'Duration n/a' : durationLabel}
                            </span>
                          </div>
                          <span
                            aria-hidden="true"
                            className="inline-flex shrink-0 items-center text-muted-foreground"
                          >
                            <ChevronRight className="size-4" />
                          </span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="space-y-2.5" data-slot="recent-workout-empty-state">
            <p className="text-sm text-muted">No completed workouts yet</p>
            <Button asChild size="sm">
              <Link to="/workouts">Start a workout</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
