import { type ExerciseTrackingType, type WeightUnit } from '@pulse/shared';
import { cn } from '@/lib/utils';

import { formatSummaryMetricValue, type TrackingSummaryMetricLabel } from '../lib/tracking';
import { MarkdownNote } from './markdown-note';
import {
  WorkoutExerciseCard,
  type WorkoutExerciseCardCompletedExercise,
  type WorkoutExerciseSetListItem,
} from './workout-exercise-card';

export type SessionSummaryExerciseSetResult = {
  completed?: boolean;
  distance?: number | null;
  reps?: number | null;
  seconds?: number | null;
  setNumber: number;
  weight?: number | null;
};

export type SessionSummaryExerciseResult = {
  completedSetValues?: SessionSummaryExerciseSetResult[];
  id: string;
  metricLabel?: TrackingSummaryMetricLabel;
  metricValue?: number;
  name: string;
  notes?: string | null;
  programmingNotes?: string | null;
  reps: number;
  setsCompleted: number;
  totalSets: number;
  trackingType?: ExerciseTrackingType | null;
  volume?: number;
};

export function SessionSummaryExerciseCard({
  exercise,
  weightUnit,
}: {
  exercise: SessionSummaryExerciseResult;
  weightUnit: WeightUnit;
}) {
  const metricLabel = exercise.metricLabel ?? 'volume';
  const trackingType = resolveSummaryTrackingType(exercise);
  const setValues = exercise.completedSetValues ?? [];
  const cardExercise: WorkoutExerciseCardCompletedExercise = {
    completedSets: setValues.map(toCompletedSetListItem),
    exerciseId: exercise.id,
    id: exercise.id,
    name: exercise.name,
    // Notes are intentionally rendered in footerSlot to keep the condensed header clean.
    notes: null,
    programmingNotes: exercise.programmingNotes ?? null,
    repsMax: null,
    repsMin: null,
    restSeconds: null,
    tempo: null,
    trackingType,
  };

  return (
    <WorkoutExerciseCard
      density="condensed"
      exercise={cardExercise}
      footerSlot={
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <MetricChip
              label={getExerciseMetricLabel(metricLabel)}
              tone={getMetricTone(metricLabel)}
              value={formatSummaryMetricValue(
                exercise.metricValue ?? exercise.volume ?? 0,
                metricLabel,
                weightUnit,
              )}
            />
            {exercise.reps > 0 && metricLabel !== 'reps' ? (
              <MetricChip label="Reps" tone="count" value={`${exercise.reps}`} />
            ) : null}
          </div>

          {exercise.notes?.trim() ? (
            <MarkdownNote className="text-xs text-muted" content={exercise.notes.trim()} />
          ) : null}
        </div>
      }
      headerSlot={
        <span className="shrink-0 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[11px] font-semibold text-fuchsia-700 dark:text-fuchsia-300">
          {`${exercise.setsCompleted}/${exercise.totalSets} sets`}
        </span>
      }
      mode="readonly-completed"
      showSetList={setValues.length > 0}
      weightUnit={weightUnit}
    />
  );
}

function toCompletedSetListItem(set: SessionSummaryExerciseSetResult): WorkoutExerciseSetListItem {
  return {
    completed: set.completed ?? true,
    distance: set.distance ?? null,
    reps: set.reps ?? null,
    seconds: set.seconds ?? null,
    setNumber: set.setNumber,
    weight: set.weight ?? null,
  };
}

function resolveSummaryTrackingType(exercise: SessionSummaryExerciseResult): ExerciseTrackingType {
  if (exercise.trackingType) {
    return exercise.trackingType;
  }

  switch (exercise.metricLabel) {
    case 'seconds':
      return 'seconds_only';
    case 'distance':
      return 'distance';
    case 'reps':
      return 'reps_only';
    case 'volume':
    default:
      return 'weight_reps';
  }
}

function getExerciseMetricLabel(label: TrackingSummaryMetricLabel) {
  switch (label) {
    case 'reps':
      return 'Reps';
    case 'seconds':
      return 'Seconds';
    case 'distance':
      return 'Distance';
    case 'volume':
    default:
      return 'Volume';
  }
}

function getMetricTone(label: TrackingSummaryMetricLabel): 'count' | 'time' | 'volume' {
  if (label === 'seconds') {
    return 'time';
  }

  if (label === 'volume') {
    return 'volume';
  }

  return 'count';
}

function MetricChip({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'count' | 'time' | 'volume';
  value: string;
}) {
  const toneClass =
    tone === 'volume'
      ? 'bg-blue-500/12 text-blue-800 dark:text-blue-200'
      : tone === 'time'
        ? 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-200'
        : 'bg-fuchsia-500/12 text-fuchsia-800 dark:text-fuchsia-200';

  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', toneClass)}>
      {`${label}: ${value}`}
    </span>
  );
}
