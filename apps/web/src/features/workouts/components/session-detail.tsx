import { Link } from 'react-router';
import {
  ArrowLeft,
  ChevronDown,
  Clock3,
  Dumbbell,
  ListChecks,
  NotebookPen,
  Scale,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { mockExercises, mockTemplates, type WorkoutTemplateSectionType } from '@/lib/mock-data/workouts';
import { cn } from '@/lib/utils';

import { workoutCompletedSessions, workoutEnhancedExercises } from '../lib/mock-data';
import type { ActiveWorkoutCompletedSession } from '../types';

type SessionDetailProps = {
  sessionId: string;
};

type SessionDetailSectionType = WorkoutTemplateSectionType | 'supplemental';

type SessionDetailExercise = {
  exerciseId: string;
  name: string;
  notes: string | null;
  phaseBadge: 'moderate' | 'rebuild' | 'recovery' | 'test';
  sets: ActiveWorkoutCompletedSession['exercises'][number]['sets'];
};

type SessionDetailSection = {
  exercises: SessionDetailExercise[];
  subtitle: string;
  type: SessionDetailSectionType;
};

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

const integerFormatter = new Intl.NumberFormat('en-US');
const decimalFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const templateById = new Map(mockTemplates.map((template) => [template.id, template]));
const exerciseById = new Map(mockExercises.map((exercise) => [exercise.id, exercise]));
const enhancedExerciseById = new Map(
  workoutEnhancedExercises.map((exercise) => [exercise.exerciseId, exercise]),
);

const sectionLabels: Record<SessionDetailSectionType, string> = {
  warmup: 'Warmup',
  main: 'Main',
  cooldown: 'Cooldown',
  supplemental: 'Supplemental',
};

const phaseBadgeStyles = {
  rebuild:
    'border-transparent bg-[var(--color-accent-mint)] text-on-mint dark:bg-emerald-500/20 dark:text-emerald-400',
  recovery:
    'border-transparent bg-[var(--color-accent-cream)] text-on-cream dark:bg-amber-500/20 dark:text-amber-400',
  moderate:
    'border-transparent bg-secondary text-secondary-foreground dark:bg-secondary/80 dark:text-foreground',
  test:
    'border-transparent bg-[var(--color-accent-pink)] text-on-pink dark:bg-pink-500/20 dark:text-pink-400',
} as const;

export function SessionDetail({ sessionId }: SessionDetailProps) {
  const session = workoutCompletedSessions.find((candidate) => candidate.id === sessionId);

  if (!session) {
    return (
      <Card>
        <CardHeader className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Session not found</h1>
          <p className="text-sm text-muted">
            The requested completed workout session is not available in the prototype data.
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
  const summary = getSessionSummary(session);
  const sections = buildSections(session);

  return (
    <section className="space-y-6">
      <Button asChild className="gap-2" size="sm" variant="ghost">
        <Link to="/workouts">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to Workouts
        </Link>
      </Button>

      <Card className="gap-0 overflow-hidden border-transparent bg-card/80 py-0">
        <div className="space-y-4 bg-[var(--color-accent-mint)] px-6 py-6 text-on-mint dark:border-b dark:border-border dark:bg-card dark:text-foreground">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-70 dark:text-muted dark:opacity-100">
                  Workout receipt
                </p>
                <Badge
                  className="border-transparent bg-white/55 text-on-accent dark:bg-secondary"
                  variant="outline"
                >
                  Completed
                </Badge>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {session.name ?? template?.name ?? 'Workout Session'}
              </h1>
              <p className="max-w-3xl text-sm opacity-80 sm:text-base dark:text-muted dark:opacity-100">
                {dateFormatter.format(sessionDate)}
                {' · '}
                {`${session.duration} min`}
                {' · '}
                {`Started ${timeFormatter.format(sessionDate)}`}
              </p>
            </div>

            {template?.tags?.length ? (
              <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
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
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Dumbbell aria-hidden="true" className="size-4" />}
          label="Exercises"
          value={`${summary.totalExercises}`}
        />
        <StatCard
          icon={<ListChecks aria-hidden="true" className="size-4" />}
          label="Sets"
          value={`${summary.totalSets}`}
        />
        <StatCard
          icon={<Clock3 aria-hidden="true" className="size-4" />}
          label="Reps"
          value={integerFormatter.format(summary.totalReps)}
        />
        <StatCard
          icon={<Scale aria-hidden="true" className="size-4" />}
          label="Volume"
          value={`${formatNumber(summary.totalVolume)} kg`}
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">Section breakdown</h2>
          <p className="text-sm text-muted">Review each phase exactly as it was logged.</p>
        </div>

        {sections.map((section) => (
          <details
            className="group overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
            key={section.type}
            open={section.type === 'main'}
          >
            <summary className="cursor-pointer list-none px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">{sectionLabels[section.type]}</h3>
                  <p className="text-sm text-muted">{section.subtitle}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className="border-border bg-secondary/70" variant="outline">
                    {`${section.exercises.length} exercise${section.exercises.length === 1 ? '' : 's'}`}
                  </Badge>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 text-muted transition-transform duration-200 group-open:rotate-180"
                  />
                </div>
              </div>
            </summary>

            <div className="space-y-3 border-t border-border px-4 py-4 sm:px-6 sm:py-5">
              {section.exercises.map((exercise) => (
                <Card className="gap-4 py-0" key={`${section.type}-${exercise.exerciseId}`}>
                  <CardHeader className="gap-3 py-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle>{exercise.name}</CardTitle>
                          <Badge
                            className={cn('border-transparent', phaseBadgeStyles[exercise.phaseBadge])}
                            variant="outline"
                          >
                            {formatLabel(exercise.phaseBadge)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted">
                          {`${exercise.sets.length} logged set${exercise.sets.length === 1 ? '' : 's'}`}
                        </p>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pb-5">
                    <div className="flex flex-wrap gap-2">
                      {exercise.sets.map((set) => (
                        <span
                          className="inline-flex rounded-full border border-border bg-secondary/55 px-3 py-1.5 text-sm text-foreground"
                          key={set.setNumber}
                        >
                          {`Set ${set.setNumber}: ${set.weight != null ? `${formatNumber(set.weight)} kg × ` : ''}${integerFormatter.format(set.reps)} reps`}
                        </span>
                      ))}
                    </div>

                    {exercise.notes ? (
                      <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-3 text-sm text-foreground">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                          Exercise notes
                        </p>
                        <p>{exercise.notes}</p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          </details>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-2">
          <CardTitle>Feedback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {session.customFeedback.map((field) => (
              <div className="rounded-2xl border border-border bg-secondary/35 p-4" key={field.id}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {field.label}
                </p>
                <p className="mt-2 text-base font-semibold text-foreground">
                  {field.type === 'scale'
                    ? field.value != null
                      ? `${field.value}/${field.max}`
                      : 'Not rated'
                    : field.value?.trim() || 'No response'}
                </p>
                {field.notes?.trim() ? (
                  <p className="mt-2 text-sm leading-6 text-muted">{field.notes}</p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <FeedbackScore label="Energy" score={session.feedback.energy} />
            <FeedbackScore label="Recovery" score={session.feedback.recovery} />
            <FeedbackScore label="Technique" score={session.feedback.technique} />
          </div>

          {session.feedback.notes ? (
            <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-3 text-sm text-foreground">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                Reflection
              </p>
              <p>{session.feedback.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {session.notes ? (
        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="flex items-center gap-2">
              <NotebookPen aria-hidden="true" className="size-5 text-primary" />
              Session notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="rounded-2xl border border-border bg-secondary/35 px-4 py-3 text-sm leading-6 text-foreground">
              {session.notes}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Button asChild className="w-full sm:w-auto" size="lg">
        <Link to={`/workouts/active?template=${session.templateId}`}>Repeat Workout</Link>
      </Button>
    </section>
  );
}

function buildSections(session: ActiveWorkoutCompletedSession): SessionDetailSection[] {
  const template = templateById.get(session.templateId);
  const templateSectionByExerciseId = new Map<string, WorkoutTemplateSectionType>();

  template?.sections.forEach((section) => {
    section.exercises.forEach((exercise) => {
      templateSectionByExerciseId.set(exercise.exerciseId, section.type);
    });
  });

  const supplementalByExerciseId = new Map(
    session.supplemental.map((exercise) => [exercise.exerciseId, exercise.details]),
  );

  const exercisesBySection = new Map<SessionDetailSectionType, SessionDetailExercise[]>([
    ['warmup', []],
    ['main', []],
    ['cooldown', []],
    ['supplemental', []],
  ]);

  session.exercises.forEach((exerciseLog) => {
    const sectionType = supplementalByExerciseId.has(exerciseLog.exerciseId)
      ? 'supplemental'
      : (templateSectionByExerciseId.get(exerciseLog.exerciseId) ?? 'main');
    const catalogExercise = exerciseById.get(exerciseLog.exerciseId);
    const enhancedExercise = enhancedExerciseById.get(exerciseLog.exerciseId);

    exercisesBySection.get(sectionType)?.push({
      exerciseId: exerciseLog.exerciseId,
      name: catalogExercise?.name ?? formatLabel(exerciseLog.exerciseId),
      notes: supplementalByExerciseId.get(exerciseLog.exerciseId) ?? null,
      phaseBadge: enhancedExercise?.phaseBadge ?? inferPhaseBadge(sectionType),
      sets: exerciseLog.sets,
    });
  });

  return (['warmup', 'main', 'cooldown', 'supplemental'] as const)
    .map((sectionType) => {
      const exercises = exercisesBySection.get(sectionType) ?? [];

      return {
        exercises,
        subtitle: buildSectionSubtitle(sectionType, exercises.length),
        type: sectionType,
      };
    })
    .filter((section) => section.exercises.length > 0);
}

function buildSectionSubtitle(sectionType: SessionDetailSectionType, count: number) {
  if (sectionType === 'supplemental') {
    return `${count} logged add-on${count === 1 ? '' : 's'}`;
  }

  return `${count} exercise${count === 1 ? '' : 's'} logged`;
}

function getSessionSummary(session: ActiveWorkoutCompletedSession) {
  return session.exercises.reduce(
    (summary, exercise) => {
      summary.totalExercises += 1;
      summary.totalSets += exercise.sets.length;

      exercise.sets.forEach((set) => {
        summary.totalReps += set.reps;
        if (set.weight != null) {
          summary.totalVolume += set.weight * set.reps;
        }
      });

      return summary;
    },
    { totalExercises: 0, totalReps: 0, totalSets: 0, totalVolume: 0 },
  );
}

function FeedbackScore({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-2xl border border-border bg-secondary/35 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 text-base font-semibold text-foreground">{`${score}/5`}</p>
    </div>
  );
}

function inferPhaseBadge(sectionType: SessionDetailSectionType) {
  switch (sectionType) {
    case 'warmup':
    case 'cooldown':
      return 'recovery';
    case 'supplemental':
      return 'rebuild';
    default:
      return 'moderate';
  }
}

function formatLabel(value: string) {
  return value
    .split(/[- ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? integerFormatter.format(value) : decimalFormatter.format(value);
}
