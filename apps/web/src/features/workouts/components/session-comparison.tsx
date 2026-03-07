import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import type { ActiveWorkoutCompletedSession } from '../types';

type SessionComparisonProps = {
  currentSession: ActiveWorkoutCompletedSession;
  previousSession: ActiveWorkoutCompletedSession | null;
};

type SessionExerciseComparisonProps = {
  currentSession: ActiveWorkoutCompletedSession;
  exerciseId: string;
  previousSession: ActiveWorkoutCompletedSession | null;
};

type ComparisonDirection = 'down' | 'flat' | 'up';

type DeltaIndicatorProps = {
  direction: ComparisonDirection;
  label: string;
};

type SetComparison = {
  currentReps: number;
  currentWeight: number | null;
  hasPr: boolean;
  repsDelta: number;
  setNumber: number;
  weightDelta: number | null;
};

type ExerciseComparison = {
  previousSessionDate: string;
  setComparisons: SetComparison[];
  volumeDelta: number;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const integerFormatter = new Intl.NumberFormat('en-US');
const decimalFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

export function SessionComparison({ currentSession, previousSession }: SessionComparisonProps) {
  if (!previousSession) {
    return (
      <Card className="border-dashed">
        <CardHeader className="gap-2">
          <CardTitle className="text-base">Comparison unavailable</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">First session — no comparison available</p>
        </CardContent>
      </Card>
    );
  }

  const currentVolume = getSessionVolume(currentSession);
  const previousVolume = getSessionVolume(previousSession);
  const volumeDelta = currentVolume - previousVolume;
  const percentChange =
    previousVolume > 0 ? Math.round((volumeDelta / previousVolume) * 100) : null;

  return (
    <Card className="border-transparent bg-[var(--color-accent-mint)] text-on-accent dark:bg-card dark:text-foreground">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Volume progression</CardTitle>
          <Badge className="border-white/40 bg-white/55 text-on-accent dark:border-border dark:bg-secondary">
            {`vs ${dateFormatter.format(new Date(previousSession.startedAt))}`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white/45 p-4 dark:border dark:border-border dark:bg-secondary/35">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70 dark:text-muted dark:opacity-100">
            This session
          </p>
          <p className="mt-2 text-2xl font-semibold">{`${formatNumber(currentVolume)} kg`}</p>
        </div>
        <div className="rounded-2xl bg-white/45 p-4 dark:border dark:border-border dark:bg-secondary/35">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70 dark:text-muted dark:opacity-100">
            Previous
          </p>
          <p className="mt-2 text-2xl font-semibold">{`${formatNumber(previousVolume)} kg`}</p>
        </div>
        <div className="rounded-2xl bg-white/55 p-4 dark:border dark:border-border dark:bg-secondary/35">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70 dark:text-muted dark:opacity-100">
            Change
          </p>
          <div className="mt-2 flex items-center gap-2">
            <DeltaIndicator
              direction={getDirection(volumeDelta)}
              label={`${formatSignedNumber(volumeDelta)} kg`}
            />
            {percentChange != null ? (
              <span className="text-sm font-medium opacity-80 dark:text-muted dark:opacity-100">
                {`${percentChange > 0 ? '+' : ''}${percentChange}%`}
              </span>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SessionExerciseComparison({
  currentSession,
  exerciseId,
  previousSession,
}: SessionExerciseComparisonProps) {
  const comparison = getExerciseComparison(currentSession, previousSession, exerciseId);

  if (!comparison) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-accent-mint)]/60 bg-[var(--color-accent-mint)]/14 px-4 py-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Comparison
        </p>
        <div className="flex items-center gap-2 text-sm text-foreground">
          <span className="text-muted">{`Volume vs ${comparison.previousSessionDate}`}</span>
          <DeltaIndicator
            direction={getDirection(comparison.volumeDelta)}
            label={`${formatSignedNumber(comparison.volumeDelta)} kg`}
          />
        </div>
      </div>

      <div className="space-y-2">
        {comparison.setComparisons.map((set) => (
          <div
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-background/75 px-3 py-2 text-sm dark:bg-card/70"
            key={set.setNumber}
          >
            <span className="font-medium text-foreground">{`Set ${set.setNumber}`}</span>
            {set.currentWeight != null && set.weightDelta != null ? (
              <DeltaIndicator
                direction={getDirection(set.weightDelta)}
                label={`Weight ${formatSignedNumber(set.weightDelta)} kg`}
              />
            ) : null}
            <DeltaIndicator
              direction={getDirection(set.repsDelta)}
              label={`Reps ${formatSignedInteger(set.repsDelta)}`}
            />
            {set.hasPr ? (
              <Badge className="border-transparent bg-[var(--color-accent-cream)] text-on-accent">
                PR
              </Badge>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function DeltaIndicator({ direction, label }: DeltaIndicatorProps) {
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
        direction === 'up' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
        direction === 'down' && 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
        direction === 'flat' && 'bg-secondary/80 text-muted',
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {label}
    </span>
  );
}

function getExerciseComparison(
  currentSession: ActiveWorkoutCompletedSession,
  previousSession: ActiveWorkoutCompletedSession | null,
  exerciseId: string,
) {
  if (!previousSession) {
    return null;
  }

  const currentExercise = currentSession.exercises.find((exercise) => exercise.exerciseId === exerciseId);
  const previousExercise = previousSession.exercises.find(
    (exercise) => exercise.exerciseId === exerciseId,
  );

  if (!currentExercise || !previousExercise) {
    return null;
  }

  return {
    previousSessionDate: dateFormatter.format(new Date(previousSession.startedAt)),
    setComparisons: currentExercise.sets.map((set) => {
      const previousSet =
        previousExercise.sets.find((candidate) => candidate.setNumber === set.setNumber) ?? null;

      return {
        currentReps: set.reps,
        currentWeight: set.weight ?? null,
        hasPr: isPersonalRecord(
          set.weight ?? null,
          set.reps,
          previousSet
            ? [
                {
                  reps: previousSet.reps,
                  weight: previousSet.weight ?? null,
                },
              ]
            : [],
        ),
        repsDelta: previousSet ? set.reps - previousSet.reps : 0,
        setNumber: set.setNumber,
        weightDelta:
          set.weight != null && previousSet?.weight != null ? set.weight - previousSet.weight : null,
      };
    }),
    volumeDelta: getExerciseVolume(currentExercise) - getExerciseVolume(previousExercise),
  } satisfies ExerciseComparison;
}

function isPersonalRecord(
  currentWeight: number | null,
  currentReps: number,
  previousSets: Array<{ reps: number; weight: number | null }>,
) {
  if (previousSets.length === 0) {
    return false;
  }

  if (currentWeight != null) {
    const comparableSets = previousSets.reduce<Array<{ reps: number; weight: number }>>(
      (sets, set) => {
        if (set.weight != null && currentReps >= set.reps) {
          sets.push({ reps: set.reps, weight: set.weight });
        }

        return sets;
      },
      [],
    );

    if (comparableSets.length > 0) {
      return currentWeight > Math.max(...comparableSets.map((set) => set.weight));
    }
  }

  const maxPreviousReps = Math.max(0, ...previousSets.map((set) => set.reps));

  return currentReps > maxPreviousReps;
}

function getSessionVolume(session: ActiveWorkoutCompletedSession) {
  return session.exercises.reduce((total, exercise) => total + getExerciseVolume(exercise), 0);
}

function getExerciseVolume(
  exercise: ActiveWorkoutCompletedSession['exercises'][number],
) {
  return exercise.sets.reduce((total, set) => total + (set.weight != null ? set.weight * set.reps : 0), 0);
}

function getDirection(value: number): ComparisonDirection {
  if (value > 0) {
    return 'up';
  }

  if (value < 0) {
    return 'down';
  }

  return 'flat';
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? integerFormatter.format(value) : decimalFormatter.format(value);
}

function formatSignedInteger(value: number) {
  if (value === 0) {
    return '0';
  }

  return `${value > 0 ? '+' : ''}${integerFormatter.format(value)}`;
}

function formatSignedNumber(value: number) {
  if (value === 0) {
    return '0';
  }

  return `${value > 0 ? '+' : ''}${formatNumber(value)}`;
}
