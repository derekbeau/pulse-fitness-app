import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { mockExercises, mockTemplates } from '@/lib/mock-data/workouts';
import { cn } from '@/lib/utils';

type WorkoutTemplateDetailProps = {
  templateId: string;
};

const sectionLabels = {
  warmup: 'Warmup',
  main: 'Main',
  cooldown: 'Cooldown',
} as const;

const categoryBadgeStyles = {
  compound: 'bg-[var(--color-accent-pink)] text-on-pink dark:bg-pink-500/20 dark:text-pink-400',
  isolation:
    'bg-[var(--color-accent-cream)] text-on-cream dark:bg-amber-500/20 dark:text-amber-400',
  cardio: 'bg-[var(--color-accent-mint)] text-on-mint dark:bg-emerald-500/20 dark:text-emerald-400',
  mobility: 'bg-[var(--color-accent-cream)] text-on-cream dark:bg-amber-500/20 dark:text-amber-400',
} as const;

const exerciseById = new Map(mockExercises.map((exercise) => [exercise.id, exercise]));

export function WorkoutTemplateDetail({ templateId }: WorkoutTemplateDetailProps) {
  const template = mockTemplates.find((candidate) => candidate.id === templateId);

  if (!template) {
    return (
      <Card>
        <CardHeader className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Template not found</h1>
          <p className="text-sm text-muted">
            The requested workout template is not available in the current prototype data.
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

  return (
    <section className="space-y-6">
      <Card className="gap-4 overflow-hidden border-transparent bg-card/80 py-0">
        <div className="space-y-4 bg-[var(--color-accent-cream)] px-6 py-6 text-on-cream dark:bg-card dark:text-foreground dark:border-b dark:border-border">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-70 dark:text-muted dark:opacity-100">
              Workout template
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">{template.name}</h1>
            <p className="max-w-3xl text-sm opacity-80 sm:text-base dark:text-muted dark:opacity-100">
              {template.description}
            </p>
          </div>

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
                    {section.title !== sectionLabels[section.type]
                      ? `${section.title} · ${section.exercises.length} exercise${section.exercises.length === 1 ? '' : 's'}`
                      : `${section.exercises.length} exercise${section.exercises.length === 1 ? '' : 's'}`}
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
              {section.exercises.map((templateExercise) => {
                const exercise = exerciseById.get(templateExercise.exerciseId);

                if (!exercise) {
                  return null;
                }

                return (
                  <Card className="gap-4 py-0" key={templateExercise.exerciseId}>
                    <CardHeader className="gap-3 py-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle>{exercise.name}</CardTitle>
                            <Badge
                              className={cn(
                                'border-transparent capitalize',
                                categoryBadgeStyles[exercise.category],
                              )}
                              variant="outline"
                            >
                              {exercise.category}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            {`${templateExercise.sets} x ${templateExercise.reps}`}
                          </p>
                        </div>

                        <Badge className="border-border bg-secondary/70" variant="outline">
                          {formatLabel(exercise.equipment)}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3 pb-5">
                      <div className="flex flex-wrap gap-2 text-sm">
                        <MetadataPill label={`Rest: ${templateExercise.restSeconds}s`} />
                        <MetadataPill label={`Equipment: ${formatLabel(exercise.equipment)}`} />
                        <MetadataPill label={`Tempo: ${formatTempo(templateExercise.tempo)}`} />
                      </div>

                      <details className="rounded-2xl border border-border bg-secondary/35 px-4 py-3">
                        <summary className="cursor-pointer text-sm font-medium text-foreground">
                          Form cues
                        </summary>
                        <ul className="mt-3 space-y-2 text-sm text-muted">
                          {templateExercise.formCues.map((cue) => (
                            <li className="list-disc ml-5" key={cue}>
                              {cue}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </details>
        ))}
      </div>

      <Button asChild className="w-full sm:w-auto" size="lg">
        <Link to={`/workouts/active?template=${template.id}`}>Start Workout</Link>
      </Button>
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

function formatLabel(value: string) {
  return value
    .split(/[- ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTempo(tempo: string) {
  return tempo.split('').join('-');
}
