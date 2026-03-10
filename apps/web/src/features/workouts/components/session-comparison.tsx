import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { type SessionSet, type WeightUnit, type WorkoutSession } from '@pulse/shared';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  getExerciseTrackingType,
  getMetricLabelForTrackingType,
  getMetricSuffixForTrackingType,
  getSessionMetricKind,
  getSetDistance,
  getSetSeconds,
  getSetTrackingVolume,
} from '../lib/tracking';

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
  currentDistance: number | null;
  currentReps: number | null;
  currentSeconds: number | null;
  currentWeight: number | null;
  hasPr: boolean;
  metricDelta: number;
  metricLabel: string;
  setNumber: number;
  weightDelta: number | null;
};

type ExerciseComparison = {
  metricSuffix: string;
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
  const sessionMetric = getSessionMetricKind(currentSession);
  const sessionMetricSuffix = getSessionMetricSuffix(sessionMetric, weightUnit);

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
          <p className="mt-2 text-2xl font-semibold">{`${formatNumber(currentVolume)} ${sessionMetricSuffix}`}</p>
        </div>
        <div className="rounded-2xl bg-white/45 p-4 dark:border dark:border-border dark:bg-secondary/35">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70 dark:text-muted dark:opacity-100">
            Previous
          </p>
          <p className="mt-2 text-2xl font-semibold">{`${formatNumber(previousVolume)} ${sessionMetricSuffix}`}</p>
        </div>
        <div className="rounded-2xl bg-white/55 p-4 dark:border dark:border-border dark:bg-secondary/35">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70 dark:text-muted dark:opacity-100">
            Change
          </p>
          <div className="mt-2 flex items-center gap-2">
            <DeltaIndicator
              direction={getDirection(volumeDelta)}
              label={`${formatSignedNumber(volumeDelta)} ${sessionMetricSuffix}`}
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
  const comparison = getExerciseComparison(currentSession, previousSession, exerciseId, weightUnit);

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
            label={`${formatSignedNumber(comparison.volumeDelta)} ${comparison.metricSuffix}`}
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
              direction={getDirection(set.metricDelta)}
              label={`${formatMetricLabel(set.metricLabel)} ${formatSignedInteger(set.metricDelta)}`}
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
  weightUnit: WeightUnit,
) {
  if (!previousSession) {
    return null;
  }

  const currentSets = getSetsForExercise(currentSession, exerciseId);
  const previousSets = getSetsForExercise(previousSession, exerciseId);
  const trackingType = getExerciseTrackingType(exerciseId);

  if (currentSets.length === 0 || previousSets.length === 0) {
    return null;
  }

  return {
    previousSessionDate: dateFormatter.format(new Date(previousSession.startedAt)),
    metricSuffix: getMetricSuffixForTrackingType(trackingType, weightUnit),
    setComparisons: currentSets.map((set) => {
      const previousSet =
        previousSets.find((candidate) => candidate.setNumber === set.setNumber) ?? null;
      const currentMetric = getMetricValue(set, trackingType);
      const previousMetric = previousSet ? getMetricValue(previousSet, trackingType) : 0;

      return {
        currentDistance: getSetDistance(set),
        currentReps: set.reps,
        currentSeconds: getSetSeconds(set),
        currentWeight: set.weight ?? null,
        hasPr: isPersonalRecord(
          set,
          trackingType,
          previousSet
            ? [previousSet]
            : [],
        ),
        metricDelta: previousSet ? currentMetric - previousMetric : 0,
        metricLabel: getSetComparisonMetricLabel(trackingType),
        setNumber: set.setNumber,
        weightDelta:
          set.weight != null && previousSet?.weight != null ? set.weight - previousSet.weight : null,
      };
    }),
    volumeDelta:
      getExerciseVolumeFromSets(currentSets, trackingType) -
      getExerciseVolumeFromSets(previousSets, trackingType),
  } satisfies ExerciseComparison;
}

function isPersonalRecord(
  currentSet: SessionSet,
  trackingType: ReturnType<typeof getExerciseTrackingType>,
  previousSets: SessionSet[],
) {
  if (previousSets.length === 0) {
    return false;
  }

  if (trackingType === 'weight_reps' || trackingType === 'weight_seconds') {
    const currentWeight = currentSet.weight ?? null;
    const currentReps = currentSet.reps ?? 0;

    if (currentWeight == null) {
      return false;
    }

    const comparableSets = previousSets.reduce<Array<{ reps: number; weight: number }>>(
      (sets, set) => {
        const previousWeight = set.weight ?? null;
        const previousReps = set.reps ?? 0;
        if (previousWeight != null && currentReps >= previousReps) {
          sets.push({ reps: previousReps, weight: previousWeight });
        }

        return sets;
      },
      [],
    );

    if (comparableSets.length > 0) {
      return currentWeight > Math.max(...comparableSets.map((set) => set.weight));
    }
  }

  if (trackingType === 'seconds_only' || trackingType === 'weight_seconds') {
    const currentSeconds = getSetSeconds(currentSet) ?? 0;
    const maxPreviousSeconds = Math.max(0, ...previousSets.map((set) => getSetSeconds(set) ?? 0));
    return currentSeconds > maxPreviousSeconds;
  }

  if (trackingType === 'distance') {
    const currentDistance = getSetDistance(currentSet) ?? 0;
    const maxPreviousDistance = Math.max(0, ...previousSets.map((set) => getSetDistance(set) ?? 0));
    return currentDistance > maxPreviousDistance;
  }

  const currentReps = currentSet.reps ?? 0;
  const maxPreviousReps = Math.max(0, ...previousSets.map((set) => set.reps ?? 0));

  return currentReps > maxPreviousReps;
}

function getSessionVolume(session: WorkoutSession) {
  return session.sets.reduce((total, set) => {
    const trackingType = getExerciseTrackingType(set.exerciseId);
    return total + getSetTrackingVolume(set, trackingType);
  }, 0);
}

function getExerciseVolumeFromSets(
  sets: SessionSet[],
  trackingType: ReturnType<typeof getExerciseTrackingType>,
) {
  return sets.reduce((total, set) => total + getSetTrackingVolume(set, trackingType), 0);
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

function getMetricValue(
  set: SessionSet,
  trackingType: ReturnType<typeof getExerciseTrackingType>,
) {
  switch (trackingType) {
    case 'weight_reps':
    case 'bodyweight_reps':
    case 'reps_only':
      return set.reps ?? 0;
    case 'weight_seconds':
    case 'seconds_only':
      return getSetSeconds(set) ?? 0;
    case 'distance':
      return getSetDistance(set) ?? 0;
    case 'reps_seconds':
      return (set.reps ?? 0) + (getSetSeconds(set) ?? 0);
    case 'cardio':
      return (getSetSeconds(set) ?? 0) + (getSetDistance(set) ?? 0);
    default:
      return set.reps ?? 0;
  }
}

function getSetComparisonMetricLabel(trackingType: ReturnType<typeof getExerciseTrackingType>) {
  if (trackingType === 'weight_reps' || trackingType === 'bodyweight_reps' || trackingType === 'reps_only') {
    return 'reps';
  }

  if (trackingType === 'weight_seconds' || trackingType === 'seconds_only') {
    return 'seconds';
  }

  return getMetricLabelForTrackingType(trackingType);
}

function formatMetricLabel(metricLabel: string) {
  return metricLabel.charAt(0).toUpperCase() + metricLabel.slice(1);
}

function getSessionMetricSuffix(metric: string, weightUnit: WeightUnit) {
  switch (metric) {
    case 'volume':
      return weightUnit;
    case 'distance':
      return weightUnit === 'lbs' ? 'mi' : 'm';
    case 'reps':
      return 'reps';
    case 'seconds':
      return 'seconds';
    default:
      return 'work';
  }
}
