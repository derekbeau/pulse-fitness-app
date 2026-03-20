import type { ExerciseTrackingType, WeightUnit } from '@pulse/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useExerciseHistory } from '@/hooks/use-exercise-history';

import { formatCompactSets } from '../lib/tracking';

const historyDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

type ExerciseHistoryModalProps = {
  exerciseId: string;
  exerciseName: string;
  limit?: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  trackingType: ExerciseTrackingType;
  weightUnit?: WeightUnit;
};

export function ExerciseHistoryModal({
  exerciseId,
  exerciseName,
  limit = 10,
  onOpenChange,
  open,
  trackingType,
  weightUnit = 'lbs',
}: ExerciseHistoryModalProps) {
  const historyQuery = useExerciseHistory(exerciseId, {
    enabled: open,
    limit,
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{`${exerciseName} history`}</DialogTitle>
          <DialogDescription>{`Last ${limit} completed sessions`}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 pr-1">
          {historyQuery.isPending ? (
            <p className="text-sm text-muted">Loading exercise history...</p>
          ) : null}

          {!historyQuery.isPending && (historyQuery.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted">No completed history yet.</p>
          ) : null}

          {historyQuery.data?.map((session) => {
            const setSummary = formatCompactSets(
              session.sets.map((set) =>
                trackingType === 'distance'
                  ? { distance: set.reps, weight: set.weight }
                  : { reps: set.reps, weight: set.weight },
              ),
              trackingType,
              {
                useLegacySecondsFallback: trackingType !== 'reps_seconds',
                weightUnit,
              },
            );

            return (
              <div
                className="rounded-lg border border-border bg-card px-3 py-2.5"
                key={session.sessionId}
              >
                <p className="text-sm font-semibold text-foreground">
                  {`${historyDateFormatter.format(new Date(`${session.date}T12:00:00`))} · ${setSummary}`}
                </p>
                {session.notes?.trim() ? (
                  <p className="mt-1 text-xs text-muted">{`Notes: ${session.notes.trim()}`}</p>
                ) : null}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
