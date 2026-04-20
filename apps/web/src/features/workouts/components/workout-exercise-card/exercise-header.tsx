import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { formatTrackingTypeLabel } from './formatters';

import type { WorkoutExerciseCardTemplateExercise } from './types';

type ExerciseHeaderProps = {
  className?: string;
  exercise: Pick<
    WorkoutExerciseCardTemplateExercise,
    | 'equipment'
    | 'muscleGroups'
    | 'name'
    | 'notes'
    | 'phaseBadge'
    | 'priorityBadge'
    | 'trackingType'
  >;
  leadingSlot?: ReactNode;
  onOpenDetails?: () => void;
  targetHint?: string | null;
  trailingSlot?: ReactNode;
};

export function ExerciseHeader({
  className,
  exercise,
  leadingSlot,
  onOpenDetails,
  targetHint,
  trailingSlot,
}: ExerciseHeaderProps) {
  const trackingTypeLabel = formatTrackingTypeLabel(exercise.trackingType);

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          {leadingSlot ? <div className="pt-0.5">{leadingSlot}</div> : null}
          <div className="min-w-0 space-y-0.5">
            <h3 className="truncate text-base font-semibold sm:text-lg">
              {onOpenDetails ? (
                <button
                  className="cursor-pointer truncate text-left hover:text-primary hover:underline"
                  onClick={onOpenDetails}
                  type="button"
                >
                  {exercise.name}
                </button>
              ) : (
                exercise.name
              )}
            </h3>
            {targetHint ? (
              <p className="text-xs font-medium text-muted sm:text-sm">{targetHint}</p>
            ) : null}
            {exercise.notes ? (
              <p className="line-clamp-2 text-[11px] italic text-muted/85">{exercise.notes}</p>
            ) : null}
          </div>
        </div>

        {trailingSlot ? (
          <div className="flex shrink-0 items-center gap-1">{trailingSlot}</div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          className="border-transparent bg-secondary text-secondary-foreground"
          variant="outline"
        >
          {trackingTypeLabel}
        </Badge>
        {exercise.phaseBadge ? (
          <Badge variant="outline">{exercise.phaseBadge.replaceAll('-', ' ')}</Badge>
        ) : null}
        {exercise.priorityBadge ? (
          <Badge className="capitalize" variant="outline">
            {exercise.priorityBadge.replaceAll('-', ' ')}
          </Badge>
        ) : null}
        {exercise.equipment ? (
          <Badge className="capitalize" variant="outline">
            {exercise.equipment.replaceAll('-', ' ')}
          </Badge>
        ) : null}
        {(exercise.muscleGroups ?? []).slice(0, 2).map((group) => (
          <Badge className="capitalize" key={group} variant="outline">
            {group.replaceAll('-', ' ')}
          </Badge>
        ))}
      </div>
    </div>
  );
}
