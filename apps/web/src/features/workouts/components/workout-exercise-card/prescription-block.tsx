import type { ExerciseTrackingType, WeightUnit } from '@pulse/shared';

import { cn } from '@/lib/utils';

import { formatPrescription, formatSetTargetBreakdown, formatTempo } from './formatters';
import type { WorkoutExerciseSetTarget } from './types';

type PrescriptionBlockProps = {
  className?: string;
  repsMax: number | null;
  repsMin: number | null;
  restSeconds: number | null;
  setTargets?: WorkoutExerciseSetTarget[] | null;
  sets: number | null;
  tempo: string | null;
  trackingType: ExerciseTrackingType;
  weightUnit: WeightUnit;
};

export function PrescriptionBlock({
  className,
  repsMax,
  repsMin,
  restSeconds,
  setTargets,
  sets,
  tempo,
  trackingType,
  weightUnit,
}: PrescriptionBlockProps) {
  const prescription = formatPrescription(
    {
      repsMax,
      repsMin,
      restSeconds,
      setTargets,
      sets,
      trackingType,
    },
    weightUnit,
  );
  const targetBreakdown = formatSetTargetBreakdown(
    {
      repsMax,
      repsMin,
      setTargets,
      trackingType,
    },
    weightUnit,
  );

  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">
        Prescription
      </p>
      <p className="text-sm font-medium text-foreground">{prescription}</p>
      {targetBreakdown ? <p className="text-xs text-muted">{targetBreakdown}</p> : null}
      {tempo || restSeconds !== null ? (
        <p className="text-xs text-muted">
          {tempo ? `Tempo: ${formatTempo(tempo)}` : null}
          {tempo && restSeconds !== null ? ' • ' : null}
          {restSeconds !== null ? `Rest: ${restSeconds}s` : null}
        </p>
      ) : null}
    </div>
  );
}
