import { useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  ChevronDown,
  Dumbbell,
  ListChecks,
  NotebookPen,
  Repeat2,
  Scale,
  TrendingUp,
} from 'lucide-react';
import type {
  SessionSet,
  WorkoutSession,
  WorkoutTemplate,
  WorkoutTemplateSectionType,
} from '@pulse/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { StatCard } from '@/components/ui/stat-card';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import { cn } from '@/lib/utils';

import { useCompletedSessions, useWorkoutSession, useWorkoutTemplate } from '../api/workouts';
import { findPreviousTemplateSession } from '../lib/session-comparison';
import type { ActiveWorkoutExerciseHistoryPoint } from '../types';
import { ExerciseTrendChart } from './exercise-trend-chart';
import { SessionComparison, SessionExerciseComparison } from './session-comparison';

type SessionDetailProps = {
  sessionId: string;
};

type SessionDetailSectionType = WorkoutTemplateSectionType | 'supplemental';

type SessionDetailExercise = {
  exerciseId: string;
  name: string;
  notes: string | null;
  phaseBadge: 'moderate' | 'rebuild' | 'recovery' | 'test';
  sets: SessionSet[];
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
  const comparisonToggleId = useId();
  const [showComparison, setShowComparison] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const { weightLabel, weightUnit } = useWeightUnit();
  const [searchParams] = useSearchParams();
  const sessionQuery = useWorkoutSession(sessionId);
  const completedSessionsQuery = useCompletedSessions();
  const session = sessionQuery.data;
  const templateQuery = useWorkoutTemplate(session?.templateId ?? '');
  const template = templateQuery.data;
  const viewParam = searchParams.get('view');
  const backView = viewParam === 'list' || viewParam === 'calendar' ? viewParam : 'calendar';
  const backToWorkoutsHref = `/workouts?view=${backView}`;

  const previousSessionItem = useMemo(() => {
    if (!session || !completedSessionsQuery.data) {
      return null;
    }

    return findPreviousTemplateSession(session, completedSessionsQuery.data);
  }, [completedSessionsQuery.data, session]);

  const previousSessionQuery = useWorkoutSession(previousSessionItem?.id ?? '', {
    enabled: showComparison && previousSessionItem != null,
  });
  const previousSession = previousSessionQuery.data ?? null;
  const comparisonToggleDisabled = completedSessionsQuery.isLoading;

  if (sessionQuery.isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted">Loading session…</p>
        </CardContent>
      </Card>
    );
  }

  if (!session) {
    return (
      <Card>
        <CardHeader className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Session not found</h1>
          <p className="text-sm text-muted">
            The requested completed workout session could not be loaded.
          </p>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full sm:w-auto">
            <Link to={backToWorkoutsHref}>Back to Workouts</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sessionDate = new Date(session.startedAt);
  const summary = getSessionSummary(session);
  const sections = buildSections(session, template);
  const selectedExercise = sections
    .flatMap((section) => section.exercises)
    .find((exercise) => exercise.exerciseId === selectedExerciseId);
  const selectedExerciseHistory =
    selectedExercise != null
      ? buildExerciseHistory({
          currentSession: session,
          exerciseId: selectedExercise.exerciseId,
          previousSession,
        })
      : [];

  return (
    <section className="space-y-6">
      <Button asChild className="gap-2" size="sm" variant="ghost">
        <Link to={backToWorkoutsHref}>
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
                {session.name || template?.name || 'Workout Session'}
              </h1>
              <p className="max-w-3xl text-sm opacity-80 sm:text-base dark:text-muted dark:opacity-100">
                {dateFormatter.format(sessionDate)}
                {' · '}
                {session.duration != null ? `${session.duration} min` : 'Duration not tracked'}
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
          icon={<Repeat2 aria-hidden="true" className="size-4" />}
          label="Reps"
          value={integerFormatter.format(summary.totalReps)}
        />
        <StatCard
          icon={<Scale aria-hidden="true" className="size-4" />}
          label="Volume"
          value={`${formatNumber(summary.totalVolume)} ${weightLabel}`}
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Session comparison</h2>
            <p className="text-sm text-muted">
              Compare this workout against the previous session on the same template.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              checked={showComparison}
              disabled={comparisonToggleDisabled}
              id={comparisonToggleId}
              onCheckedChange={(checked) => setShowComparison(checked === true)}
            />
            <Label className="cursor-pointer" htmlFor={comparisonToggleId}>
              Show comparison
            </Label>
          </div>
        </CardContent>
      </Card>

      {showComparison && !comparisonToggleDisabled ? (
        <SessionComparison
          currentSession={session}
          previousSession={previousSession}
          weightUnit={weightUnit}
        />
      ) : null}

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

                      <Button
                        aria-label={`Open ${exercise.name} trend chart`}
                        className="self-start"
                        onClick={() => setSelectedExerciseId(exercise.exerciseId)}
                        size="icon-sm"
                        type="button"
                        variant="outline"
                      >
                        <TrendingUp aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pb-5">
                    <div className="flex flex-wrap gap-2">
                      {exercise.sets.map((set) => (
                        <span
                          className="inline-flex rounded-full border border-border bg-secondary/55 px-3 py-1.5 text-sm text-foreground"
                          key={set.id}
                        >
                          {formatSetLabel(set, weightLabel)}
                        </span>
                      ))}
                    </div>

                    {showComparison ? (
                      <SessionExerciseComparison
                        currentSession={session}
                        exerciseId={exercise.exerciseId}
                        previousSession={previousSession}
                        weightUnit={weightUnit}
                      />
                    ) : null}

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
          {session.feedback ? (
            <>
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
            </>
          ) : (
            <p className="text-sm text-muted">No feedback captured for this session.</p>
          )}
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

      {session.templateId ? (
        <Button asChild className="w-full sm:w-auto" size="lg">
          <Link to={`/workouts/active?template=${session.templateId}`}>Repeat Workout</Link>
        </Button>
      ) : null}

      <Dialog onOpenChange={(open) => (!open ? setSelectedExerciseId(null) : null)} open={selectedExercise != null}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-t-3xl border-border p-0 sm:max-w-4xl sm:rounded-3xl">
          {selectedExercise ? (
            <div className="space-y-0">
              <DialogHeader className="px-6 pt-6">
                <DialogTitle>{`${selectedExercise.name} trends`}</DialogTitle>
                <DialogDescription>
                  Review weight and rep progression for this exercise.
                </DialogDescription>
              </DialogHeader>
              <div className="px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
                <ExerciseTrendChart
                  exerciseName={selectedExercise.name}
                  history={selectedExerciseHistory}
                  weightUnit={weightUnit}
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function buildSections(session: WorkoutSession, template?: WorkoutTemplate): SessionDetailSection[] {
  const templateSectionByExerciseId = new Map<string, WorkoutTemplateSectionType>();
  const templateExerciseNameById = new Map<string, string>();

  template?.sections.forEach((section) => {
    section.exercises.forEach((exercise) => {
      templateSectionByExerciseId.set(exercise.exerciseId, section.type);
      templateExerciseNameById.set(exercise.exerciseId, exercise.exerciseName);
    });
  });

  const sectionBuckets = new Map<SessionDetailSectionType, Map<string, SessionSet[]>>([
    ['warmup', new Map()],
    ['main', new Map()],
    ['cooldown', new Map()],
    ['supplemental', new Map()],
  ]);
  const sortedSets = [...session.sets].sort(
    (left, right) => left.setNumber - right.setNumber || left.createdAt - right.createdAt,
  );

  for (const set of sortedSets) {
    const derivedSection =
      set.section ?? templateSectionByExerciseId.get(set.exerciseId) ?? 'supplemental';
    const sectionMap = sectionBuckets.get(derivedSection) ?? new Map<string, SessionSet[]>();
    const exerciseSets = sectionMap.get(set.exerciseId) ?? [];

    exerciseSets.push(set);
    sectionMap.set(set.exerciseId, exerciseSets);
    sectionBuckets.set(derivedSection, sectionMap);
  }

  return (['warmup', 'main', 'cooldown', 'supplemental'] as const)
    .map((sectionType) => {
      const groupedExercises = sectionBuckets.get(sectionType) ?? new Map<string, SessionSet[]>();
      const exercises = [...groupedExercises.entries()].map(([exerciseId, sets]) => ({
        exerciseId,
        name: templateExerciseNameById.get(exerciseId) ?? formatLabel(exerciseId),
        notes: sets.find((set) => set.notes)?.notes ?? null,
        phaseBadge: inferPhaseBadge(sectionType),
        sets: [...sets].sort((left, right) => left.setNumber - right.setNumber),
      }));

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

function getSessionSummary(session: WorkoutSession) {
  const exerciseIds = new Set<string>();

  return session.sets.reduce(
    (summary, set) => {
      exerciseIds.add(set.exerciseId);
      summary.totalSets += 1;
      summary.totalExercises = exerciseIds.size;

      if (set.reps != null) {
        summary.totalReps += set.reps;
      }

      if (set.weight != null && set.reps != null) {
        summary.totalVolume += set.weight * set.reps;
      }

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

function inferPhaseBadge(sectionType: SessionDetailSectionType): SessionDetailExercise['phaseBadge'] {
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

function buildExerciseHistory({
  currentSession,
  exerciseId,
  previousSession,
}: {
  currentSession: WorkoutSession;
  exerciseId: string;
  previousSession: WorkoutSession | null;
}): ActiveWorkoutExerciseHistoryPoint[] {
  const history: ActiveWorkoutExerciseHistoryPoint[] = [];

  const previousPoint =
    previousSession != null ? buildHistoryPoint(previousSession, exerciseId) : null;
  const currentPoint = buildHistoryPoint(currentSession, exerciseId);

  if (previousPoint) {
    history.push(previousPoint);
  }

  if (currentPoint) {
    history.push(currentPoint);
  }

  return history;
}

function buildHistoryPoint(session: WorkoutSession, exerciseId: string): ActiveWorkoutExerciseHistoryPoint | null {
  const sets = session.sets.filter((set) => set.exerciseId === exerciseId && set.reps != null);

  if (sets.length === 0) {
    return null;
  }

  const topSet = sets.reduce<SessionSet>((best, current) => {
    const bestWeight = best.weight ?? 0;
    const currentWeight = current.weight ?? 0;

    if (currentWeight > bestWeight) {
      return current;
    }

    if (currentWeight === bestWeight && (current.reps ?? 0) > (best.reps ?? 0)) {
      return current;
    }

    return best;
  }, sets[0]);

  return {
    date: session.date,
    reps: topSet.reps ?? 0,
    weight: topSet.weight ?? 0,
  };
}

function formatSetLabel(set: SessionSet, weightLabel: string) {
  if (set.skipped) {
    return `Set ${set.setNumber}: Skipped`;
  }

  const repsLabel = set.reps != null ? `${integerFormatter.format(set.reps)} reps` : 'No reps';
  const formattedWeight = set.weight != null ? `${formatNumber(set.weight)} ${weightLabel} × ` : '';

  return `Set ${set.setNumber}: ${formattedWeight}${repsLabel}`;
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
