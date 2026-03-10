import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import {
  formatWeight,
  type ExerciseTrackingType,
  type SessionSet,
  type WeightUnit,
  type WorkoutSession,
} from '@pulse/shared';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { getSetSeconds, getSetVolume, getTrackingVolumeLabel, resolveTrackingType } from '../lib/tracking';

type SessionComparisonProps = {
  currentSession: WorkoutSession;
  previousSession: WorkoutSession | null;
  weightUnit?: WeightUnit;
};

type SessionExerciseComparisonProps = {
  currentSession: WorkoutSession;
  exerciseId: string;
  previousSession: WorkoutSession | null;
  trackingType?: ExerciseTrackingType;
  weightUnit?: WeightUnit;
};

type ComparisonDirection = 'down' | 'flat' | 'up';

type DeltaIndicatorProps = {
  direction: ComparisonDirection;
  label: string;
};

type SetComparison = {
  currentMetric: number;
  currentWeight: number | null;
  hasPr: boolean;
  metricDelta: number;
  metricLabel: string;
  setNumber: number;
  weightDelta: number | null;
};

type ExerciseComparison = {
  previousSessionDate: string;
  setComparisons: SetComparison[];
  trackingType: ExerciseTrackingType;
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
  const volumeLabel = getSessionVolumeLabel(currentSession);

  return (
    <Card className="border-transparent bg-[var(--color-accent-mint)] text-on-accent dark:bg-card dark:text-foreground">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{`${capitalize(volumeLabel)} progression`}</CardTitle>
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
          <p className="mt-2 text-2xl font-semibold">
            {formatVolume(currentVolume, volumeLabel, weightUnit)}
          </p>
        </div>
        <div className="rounded-2xl bg-white/45 p-4 dark:border dark:border-border dark:bg-secondary/35">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70 dark:text-muted dark:opacity-100">
            Previous
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {formatVolume(previousVolume, volumeLabel, weightUnit)}
          </p>
        </div>
        <div className="rounded-2xl bg-white/55 p-4 dark:border dark:border-border dark:bg-secondary/35">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70 dark:text-muted dark:opacity-100">
            Change
          </p>
          <div className="mt-2 flex items-center gap-2">
            <DeltaIndicator
              direction={getDirection(volumeDelta)}
              label={formatVolumeDelta(volumeDelta, volumeLabel, weightUnit)}
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
  trackingType,
  weightUnit = 'lbs',
}: SessionExerciseComparisonProps) {
  const resolvedTrackingType = trackingType ?? resolveTrackingType({ exerciseId });
  const comparison = getExerciseComparison(
    currentSession,
    previousSession,
    exerciseId,
    resolvedTrackingType,
  );

  if (!comparison) {
    return null;
  }

  const volumeLabel = getTrackingVolumeLabel(comparison.trackingType);

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-accent-mint)]/60 bg-[var(--color-accent-mint)]/14 px-4 py-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Comparison
        </p>
        <div className="flex items-center gap-2 text-sm text-foreground">
          <span className="text-muted">{`${capitalize(volumeLabel)} vs ${comparison.previousSessionDate}`}</span>
          <DeltaIndicator
            direction={getDirection(comparison.volumeDelta)}
            label={formatVolumeDelta(comparison.volumeDelta, volumeLabel, weightUnit)}
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
              label={`${set.metricLabel} ${formatSignedInteger(set.metricDelta)}`}
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
  trackingType: ExerciseTrackingType,
) {
  if (!previousSession) {
    return null;
  }

  const currentSets = getSetsForExercise(currentSession, exerciseId);
  const previousSets = getSetsForExercise(previousSession, exerciseId);

  if (currentSets.length === 0 || previousSets.length === 0) {
    return null;
  }

  const metricLabel = getSetDeltaLabel(trackingType);

  return {
    previousSessionDate: dateFormatter.format(new Date(previousSession.startedAt)),
    setComparisons: currentSets.map((set) => {
      const previousSet =
        previousSets.find((candidate) => candidate.setNumber === set.setNumber) ?? null;
      const currentMetric = getPrimarySetMetric(set, trackingType);
      const previousMetric = previousSet ? getPrimarySetMetric(previousSet, trackingType) : 0;

      return {
        currentMetric,
        currentWeight: set.weight ?? null,
        hasPr: isPersonalRecord(set, previousSets, trackingType),
        metricDelta: currentMetric - previousMetric,
        metricLabel,
        setNumber: set.setNumber,
        weightDelta:
          set.weight != null && previousSet?.weight != null ? set.weight - previousSet.weight : null,
      };
    }),
    trackingType,
    volumeDelta: getExerciseVolumeFromSets(currentSets, trackingType) - getExerciseVolumeFromSets(previousSets, trackingType),
  } satisfies ExerciseComparison;
}

function isPersonalRecord(
  currentSet: SessionSet,
  previousSets: SessionSet[],
  trackingType: ExerciseTrackingType,
) {
  if (previousSets.length === 0) {
    return false;
  }

  if (trackingType === 'weight_reps' || trackingType === 'weight_seconds') {
    const currentWeight = currentSet.weight;

    if (currentWeight == null) {
      return false;
    }

    const currentMetric = trackingType === 'weight_seconds' ? (getSetSeconds(currentSet) ?? 0) : (currentSet.reps ?? 0);
    const comparableSets = previousSets.reduce<Array<{ metric: number; weight: number }>>((sets, set) => {
      if (set.weight != null && currentMetric >= getPrimarySetMetric(set, trackingType)) {
        sets.push({ metric: getPrimarySetMetric(set, trackingType), weight: set.weight });
      }

      return sets;
    }, []);

    if (comparableSets.length > 0) {
      return currentWeight > Math.max(...comparableSets.map((set) => set.weight));
    }

    return false;
  }

  const currentMetric = getPrimarySetMetric(currentSet, trackingType);
  const maxPreviousMetric = Math.max(0, ...previousSets.map((set) => getPrimarySetMetric(set, trackingType)));

  return currentMetric > maxPreviousMetric;
}

function getSessionVolume(session: WorkoutSession) {
  const trackingByExerciseId = new Map(
    session.sets.map((set) => [set.exerciseId, resolveTrackingType({ exerciseId: set.exerciseId })]),
  );

  return session.sets.reduce((total, set) => {
    const trackingType = trackingByExerciseId.get(set.exerciseId) ?? 'weight_reps';
    return total + getSetVolume(trackingType, set);
  }, 0);
}

function getExerciseVolumeFromSets(sets: SessionSet[], trackingType: ExerciseTrackingType) {
  return sets.reduce((total, set) => total + getSetVolume(trackingType, set), 0);
}

function getPrimarySetMetric(set: SessionSet, trackingType: ExerciseTrackingType) {
  switch (trackingType) {
    case 'weight_seconds':
    case 'seconds_only':
    case 'cardio':
      return getSetSeconds(set) ?? 0;
    case 'distance':
      return 0;
    default:
      return set.reps ?? 0;
  }
}

function getSetDeltaLabel(trackingType: ExerciseTrackingType) {
  if (trackingType === 'weight_seconds' || trackingType === 'seconds_only' || trackingType === 'cardio') {
    return 'Seconds';
  }

  if (trackingType === 'distance') {
    return 'Distance';
  }

  return 'Reps';
}

function getSessionVolumeLabel(session: WorkoutSession) {
  if (session.sets.length === 0) {
    return 'volume';
  }

  const trackingTypes = new Set(session.sets.map((set) => resolveTrackingType({ exerciseId: set.exerciseId })));

  if (trackingTypes.size === 1) {
    const only = [...trackingTypes][0];
    return getTrackingVolumeLabel(only);
  }

  return 'volume';
}

function formatVolume(value: number, label: string, weightUnit: WeightUnit) {
  if (label === 'volume') {
    return formatWeight(value, weightUnit);
  }

  if (label === 'seconds') {
    return `${formatNumber(value)} sec`;
  }

  return `${formatNumber(value)} reps`;
}

function formatVolumeDelta(value: number, label: string, weightUnit: WeightUnit) {
  if (label === 'volume') {
    return `${formatSignedNumber(value)} ${weightUnit}`;
  }

  if (label === 'seconds') {
    return `${formatSignedNumber(value)} sec`;
  }

  return `${formatSignedNumber(value)} reps`;
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
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
