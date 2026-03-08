import { Link, useNavigate } from 'react-router';

import type { WorkoutTemplateExercise } from '@pulse/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api-client';
import { toDateKey } from '@/lib/date-utils';

import { useStartWorkoutSession, useWorkoutTemplate } from '../api/workouts';

type WorkoutTemplateDetailProps = {
  templateId: string;
};

const sectionLabels = {
  warmup: 'Warmup',
  main: 'Main',
  cooldown: 'Cooldown',
} as const;

export function WorkoutTemplateDetail({ templateId }: WorkoutTemplateDetailProps) {
  const navigate = useNavigate();
  const templateQuery = useWorkoutTemplate(templateId);
  const startWorkoutMutation = useStartWorkoutSession();

  if (templateQuery.isPending) {
    return <TemplateDetailSkeleton />;
  }

  if (templateQuery.isError) {
    const isNotFound =
      templateQuery.error instanceof ApiError && templateQuery.error.status === 404;

    return (
      <Card>
        <CardHeader className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            {isNotFound ? 'Template not found' : 'Unable to load template'}
          </h1>
          <p className="text-sm text-muted">
            {isNotFound
              ? 'The requested workout template could not be found.'
              : 'Try reloading this page in a moment.'}
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

  const template = templateQuery.data;

  return (
    <section className="space-y-6">
      <Card className="gap-4 overflow-hidden border-transparent bg-card/80 py-0">
        <div className="space-y-4 bg-[var(--color-accent-cream)] px-6 py-6 text-on-cream dark:border-b dark:border-border dark:bg-card dark:text-foreground">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-70 dark:text-muted dark:opacity-100">
              Workout template
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">{template.name}</h1>
            {template.description ? (
              <p className="max-w-3xl text-sm opacity-80 sm:text-base dark:text-muted dark:opacity-100">
                {template.description}
              </p>
            ) : null}
          </div>

          {template.tags.length > 0 ? (
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
          ) : null}
        </div>
      </Card>

      <div className="space-y-4">
        {template.sections.map((section) => (
          <details
            className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
            key={section.type}
            open={section.type === 'main'}
          >
            <summary className="cursor-pointer list-outside px-6 py-5">
              <div className="flex flex-col gap-2 pr-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold text-foreground">
                    {sectionLabels[section.type]}
                  </h2>
                  <p className="text-sm text-muted">
                    {`${section.exercises.length} exercise${section.exercises.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                <Badge
                  className="border-transparent bg-secondary text-secondary-foreground"
                  variant="outline"
                >
                  {`${section.exercises.length} exercise${section.exercises.length === 1 ? '' : 's'}`}
                </Badge>
              </div>
            </summary>

            <div className="space-y-3 border-t border-border px-4 py-4 sm:px-6 sm:py-5">
              {section.exercises.length === 0 ? (
                <Card>
                  <CardContent className="py-5">
                    <p className="text-sm text-muted">
                      No exercises have been added to this section yet.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                section.exercises.map((exercise) => (
                  <Card className="gap-4 py-0" key={exercise.id}>
                    <CardHeader className="gap-3 py-5">
                      <div className="space-y-2">
                        <CardTitle>{exercise.exerciseName}</CardTitle>
                        <p className="text-sm font-medium text-foreground">
                          {formatPrescription(exercise)}
                        </p>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 pb-5">
                      <div className="flex flex-wrap gap-2 text-sm">
                        {exercise.restSeconds !== null ? (
                          <MetadataPill label={`Rest: ${exercise.restSeconds}s`} />
                        ) : null}
                        {exercise.tempo ? (
                          <MetadataPill label={`Tempo: ${formatTempo(exercise.tempo)}`} />
                        ) : null}
                      </div>

                      {exercise.notes ? (
                        <div className="space-y-1 rounded-2xl border border-border bg-secondary/35 px-4 py-3">
                          <p className="text-sm font-medium text-foreground">Notes</p>
                          <p className="text-sm text-muted">{exercise.notes}</p>
                        </div>
                      ) : null}

                      {exercise.cues.length > 0 ? (
                        <details className="rounded-2xl border border-border bg-secondary/35 px-4 py-3">
                          <summary className="cursor-pointer text-sm font-medium text-foreground">
                            Form cues
                          </summary>
                          <ul className="mt-3 space-y-2 text-sm text-muted">
                            {exercise.cues.map((cue) => (
                              <li className="ml-5 list-disc" key={cue}>
                                {cue}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </details>
        ))}
      </div>

      <div className="space-y-2">
        <Button
          className="w-full sm:w-auto"
          disabled={startWorkoutMutation.isPending}
          onClick={() => {
            const startedAt = Date.now();

            startWorkoutMutation.mutate(
              {
                date: toDateKey(new Date(startedAt)),
                name: template.name,
                startedAt,
                templateId: template.id,
              },
              {
                onSuccess: (session) => {
                  navigate(`/workouts/active?template=${template.id}&sessionId=${session.id}`);
                },
              },
            );
          }}
          size="lg"
          type="button"
        >
          {startWorkoutMutation.isPending ? 'Starting workout...' : 'Start Workout'}
        </Button>

        {startWorkoutMutation.isError ? (
          <p className="text-sm text-destructive">Unable to start the workout. Try again.</p>
        ) : null}
      </div>
    </section>
  );
}

function MetadataPill({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-secondary/55 px-3 py-1.5 text-foreground">
      {label}
    </span>
  );
}

function TemplateDetailSkeleton() {
  return (
    <section aria-label="Loading workout template" className="space-y-6">
      <Card className="py-0">
        <CardContent className="space-y-4 py-6">
          <div className="h-3 w-28 animate-pulse rounded-full bg-secondary" />
          <div className="h-10 w-64 animate-pulse rounded-2xl bg-secondary" />
          <div className="h-4 w-full animate-pulse rounded-full bg-secondary" />
          <div className="h-4 w-3/4 animate-pulse rounded-full bg-secondary" />
        </CardContent>
      </Card>

      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardContent className="space-y-4 py-6">
            <div className="h-8 w-40 animate-pulse rounded-2xl bg-secondary" />
            <div className="h-24 w-full animate-pulse rounded-3xl bg-secondary/70" />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function formatLabel(value: string) {
  return value
    .split(/[- ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatPrescription(exercise: WorkoutTemplateExercise) {
  const repsTarget = formatRepTarget(exercise.repsMin, exercise.repsMax);

  if (exercise.sets !== null && repsTarget) {
    return `${exercise.sets} x ${repsTarget}`;
  }

  if (exercise.sets !== null) {
    return `${exercise.sets} set${exercise.sets === 1 ? '' : 's'}`;
  }

  if (repsTarget) {
    return repsTarget;
  }

  return 'Prescription not set';
}

function formatRepTarget(repsMin: number | null, repsMax: number | null) {
  if (repsMin !== null && repsMax !== null) {
    return repsMin === repsMax ? `${repsMin}` : `${repsMin}-${repsMax}`;
  }

  if (repsMin !== null) {
    return `${repsMin}+`;
  }

  if (repsMax !== null) {
    return `Up to ${repsMax}`;
  }

  return null;
}

function formatTempo(tempo: string) {
  return tempo.split('').join('-');
}
