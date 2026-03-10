import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatWeight, type SessionSet, type WeightUnit, type WorkoutSession } from '@pulse/shared';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type SessionComparisonProps = {
  currentSession: WorkoutSession;
  previousSession: WorkoutSession | null;
  weightUnit?: WeightUnit;
};

type SessionExerciseComparisonProps = {
  currentSession: WorkoutSession;
  exerciseId: string;
  previousSession: WorkoutSession | null;
  weightUnit?: WeightUnit;
};

type ComparisonDirection = 'down' | 'flat' | 'up';

type DeltaIndicatorProps = {
  direction: ComparisonDirection;
  label: string;
};

type SetComparison = {
  currentReps: number | null;
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

export function SessionComparison({
  currentSession,
  previousSession,
  weightUnit = 'lbs',
}: SessionComparisonProps) {
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
          <p className="mt-2 text-2xl font-semibold">{formatWeight(currentVolume, weightUnit)}</p>
        </div>
        <div className="rounded-2xl bg-white/45 p-4 dark:border dark:border-border dark:bg-secondary/35">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70 dark:text-muted dark:opacity-100">
            Previous
          </p>
          <p className="mt-2 text-2xl font-semibold">{formatWeight(previousVolume, weightUnit)}</p>
        </div>
        <div className="rounded-2xl bg-white/55 p-4 dark:border dark:border-border dark:bg-secondary/35">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70 dark:text-muted dark:opacity-100">
            Change
          </p>
          <div className="mt-2 flex items-center gap-2">
            <DeltaIndicator
              direction={getDirection(volumeDelta)}
              label={`${formatSignedNumber(volumeDelta)} ${weightUnit}`}
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
  weightUnit = 'lbs',
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
            label={`${formatSignedNumber(comparison.volumeDelta)} ${weightUnit}`}
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
                label={`Weight ${formatSignedNumber(set.weightDelta)} ${weightUnit}`}
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

function getSetsForExercise(session: WorkoutSession, exerciseId: string): SessionSet[] {
  return session.sets
    .filter((set) => set.exerciseId === exerciseId)
    .sort((left, right) => left.setNumber - right.setNumber);
}

function getExerciseComparison(
  currentSession: WorkoutSession,
  previousSession: WorkoutSession | null,
  exerciseId: string,
) {
  if (!previousSession) {
    return null;
  }

  const currentSets = getSetsForExercise(currentSession, exerciseId);
  const previousSets = getSetsForExercise(previousSession, exerciseId);

  if (currentSets.length === 0 || previousSets.length === 0) {
    return null;
  }

  return {
    previousSessionDate: dateFormatter.format(new Date(previousSession.startedAt)),
    setComparisons: currentSets.map((set) => {
      const previousSet =
        previousSets.find((candidate) => candidate.setNumber === set.setNumber) ?? null;

      return {
        currentReps: set.reps,
        currentWeight: set.weight ?? null,
        hasPr: isPersonalRecord(
          set.weight ?? null,
          set.reps ?? 0,
          previousSet
            ? [
                {
                  reps: previousSet.reps ?? 0,
                  weight: previousSet.weight ?? null,
                },
              ]
            : [],
        ),
        repsDelta: previousSet ? (set.reps ?? 0) - (previousSet.reps ?? 0) : 0,
        setNumber: set.setNumber,
        weightDelta:
          set.weight != null && previousSet?.weight != null ? set.weight - previousSet.weight : null,
      };
    }),
    volumeDelta: getExerciseVolumeFromSets(currentSets) - getExerciseVolumeFromSets(previousSets),
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

function getSessionVolume(session: WorkoutSession) {
  return session.sets.reduce(
    (total, set) => total + (set.weight != null && set.reps != null ? set.weight * set.reps : 0),
    0,
  );
}

function getExerciseVolumeFromSets(sets: SessionSet[]) {
  return sets.reduce(
    (total, set) => total + (set.weight != null && set.reps != null ? set.weight * set.reps : 0),
    0,
  );
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
