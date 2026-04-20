import type { ExerciseTrackingType, WeightUnit } from '@pulse/shared';

import { cn } from '@/lib/utils';

import { SetRow } from '../set-row';

import type { WorkoutExerciseCardMode, WorkoutExerciseSetListItem } from './types';

type WorkoutExerciseSetListProps = {
  className?: string;
  mode: WorkoutExerciseCardMode;
  sets: WorkoutExerciseSetListItem[];
  trackingType: ExerciseTrackingType;
  weightUnit: WeightUnit;
};

export function WorkoutExerciseSetList({
  className,
  mode,
  sets,
  trackingType,
  weightUnit,
}: WorkoutExerciseSetListProps) {
  if (sets.length === 0) {
    return null;
  }

  const isReadOnly = mode === 'readonly-template' || mode === 'readonly-scheduled';

  return (
    <div className={cn('space-y-2', className)}>
      {sets.map((setItem) => (
        <div
          className={isReadOnly ? 'pointer-events-none' : undefined}
          key={`set-row-${setItem.setNumber}`}
        >
          <SetRow
            completed={mode === 'readonly-completed' ? (setItem.completed ?? true) : false}
            distance={setItem.distance ?? null}
            onUpdate={() => undefined}
            reps={setItem.reps ?? null}
            seconds={setItem.seconds ?? null}
            setNumber={setItem.setNumber}
            targetDistance={mode === 'readonly-completed' ? null : (setItem.targetDistance ?? null)}
            targetSeconds={mode === 'readonly-completed' ? null : (setItem.targetSeconds ?? null)}
            targetWeight={mode === 'readonly-completed' ? null : (setItem.targetWeight ?? null)}
            targetWeightMax={
              mode === 'readonly-completed' ? null : (setItem.targetWeightMax ?? null)
            }
            targetWeightMin={
              mode === 'readonly-completed' ? null : (setItem.targetWeightMin ?? null)
            }
            trackingType={trackingType}
            weight={setItem.weight ?? null}
            weightUnit={weightUnit}
          />
        </div>
      ))}
    </div>
  );
}
