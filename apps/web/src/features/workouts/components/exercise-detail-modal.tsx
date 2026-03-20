import { useMemo, useState } from 'react';
import type { ExerciseTrackingType } from '@pulse/shared';

import { Badge } from '@/components/ui/badge';
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
import { useWeightUnit } from '@/hooks/use-weight-unit';

import { useExercise } from '../api/workouts';
import { formatCompactSets } from '../lib/tracking';
import type {
  ActiveWorkoutExerciseHistoryPoint,
  ActiveWorkoutPerformanceHistorySession,
} from '../types';
import { ExerciseTrendChart } from './exercise-trend-chart';

type ExerciseDetailModalContext = 'template' | 'session' | 'library' | 'receipt';

export interface ExerciseDetailModalProps {
  context: ExerciseDetailModalContext;
  exerciseId: string;
  onAddToTemplate?: () => void;
  onOpenChange: (open: boolean) => void;
  onSwapExercise?: () => void;
  open: boolean;
  templateExerciseId?: string;
}

const historyDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const EMPTY_HISTORY: ActiveWorkoutPerformanceHistorySession[] = [];

export function ExerciseDetailModal({
  context,
  exerciseId,
  onAddToTemplate,
  onOpenChange,
  onSwapExercise,
  open,
  templateExerciseId,
}: ExerciseDetailModalProps) {
  const { weightUnit } = useWeightUnit();
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
  const exerciseQuery = useExercise(exerciseId, { enabled: open });
  const historyQuery = useExerciseHistory(exerciseId, {
    enabled: open,
    limit: 10,
  });
  const exercise = exerciseQuery.data ?? null;
  const trackingType: ExerciseTrackingType = exercise?.trackingType ?? 'weight_reps';
  const historyList = historyQuery.data ?? EMPTY_HISTORY;
  const trendHistory = useMemo(
    () => toExerciseTrendHistory(historyQuery.data ?? EMPTY_HISTORY, trackingType),
    [historyQuery.data, trackingType],
  );

  const title = exercise?.name ?? 'Exercise details';
  const description = exercise
    ? `${formatTrackingTypeLabel(trackingType)} • ${exercise.muscleGroups.length > 0 ? exercise.muscleGroups.map(formatLabel).join(', ') : 'Muscle groups not specified'}`
    : 'Exercise metadata unavailable';

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setActiveTab('overview');
    }
    onOpenChange(nextOpen);
  };

  const closeModal = () => handleOpenChange(false);

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 border-b border-border pb-2">
          <Button
            onClick={() => setActiveTab('overview')}
            size="sm"
            type="button"
            variant={activeTab === 'overview' ? 'default' : 'outline'}
          >
            Overview
          </Button>
          <Button
            onClick={() => setActiveTab('history')}
            size="sm"
            type="button"
            variant={activeTab === 'history' ? 'default' : 'outline'}
          >
            History
          </Button>
        </div>

        {activeTab === 'overview' ? (
          <div className="space-y-4">
            {exerciseQuery.isPending ? (
              <p className="text-sm text-muted">Loading exercise details...</p>
            ) : null}

            {!exerciseQuery.isPending && !exercise ? (
              <p className="text-sm text-muted">Exercise details are unavailable.</p>
            ) : null}

            {exercise ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <OverviewField label="Category" value={formatLabel(exercise.category)} />
                  <OverviewField label="Equipment" value={formatLabel(exercise.equipment)} />
                  <OverviewField label="Tracking type" value={formatTrackingTypeLabel(trackingType)} />
                  <OverviewField
                    label="Muscle groups"
                    value={
                      exercise.muscleGroups.length > 0
                        ? exercise.muscleGroups.map(formatLabel).join(', ')
                        : 'Not specified'
                    }
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                    Form cues
                  </p>
                  {exercise.formCues.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {exercise.formCues.map((cue) => (
                        <Badge key={cue} variant="secondary">
                          {cue}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">No form cues provided.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                    Instructions
                  </p>
                  <p className="text-sm text-foreground">
                    {exercise.instructions?.trim() || 'No instructions provided.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                    Coaching notes
                  </p>
                  <p className="text-sm text-foreground">
                    {exercise.coachingNotes?.trim() || 'No coaching notes provided.'}
                  </p>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'history' ? (
          <div className="space-y-4">
            {historyQuery.isPending ? (
              <p className="text-sm text-muted">Loading exercise history...</p>
            ) : (
              <ExerciseTrendChart
                className="border-border shadow-none"
                exerciseName={exercise?.name ?? 'Exercise'}
                history={trendHistory}
                trackingType={trackingType}
                weightUnit={weightUnit}
              />
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                Session history
              </p>
              {!historyQuery.isPending && historyList.length === 0 ? (
                <p className="text-sm text-muted">No completed history yet.</p>
              ) : null}
              {historyList.map((session) => {
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
          </div>
        ) : null}

        <DialogFooter>
          <Button onClick={closeModal} type="button" variant="outline">
            Close
          </Button>
          {context === 'template' ? (
            <Button
              onClick={() => {
                if (templateExerciseId) {
                  const target = document.getElementById(`template-exercise-${templateExerciseId}`);
                  target?.scrollIntoView?.({
                    behavior: 'smooth',
                    block: 'center',
                  });
                }

                closeModal();
              }}
              type="button"
            >
              Edit exercise
            </Button>
          ) : null}
          {context === 'session' ? (
            <Button
              disabled={!onSwapExercise}
              onClick={() => {
                onSwapExercise?.();
                closeModal();
              }}
              type="button"
            >
              Swap exercise
            </Button>
          ) : null}
          {context === 'library' ? (
            <Button
              disabled={!onAddToTemplate}
              onClick={() => {
                onAddToTemplate?.();
                closeModal();
              }}
              type="button"
            >
              Add to template
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OverviewField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

function formatTrackingTypeLabel(trackingType: ExerciseTrackingType) {
  return trackingType
    .replaceAll('_', ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatLabel(value: string) {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toExerciseTrendHistory(
  sessions: ActiveWorkoutPerformanceHistorySession[],
  trackingType: ExerciseTrackingType,
): ActiveWorkoutExerciseHistoryPoint[] {
  return sessions.flatMap((session) => {
    const topSet = pickTopSessionSet(session.sets, trackingType);

    if (!topSet || topSet.reps == null) {
      return [];
    }

    return [
      {
        date: session.date,
        distance: trackingType === 'distance' ? topSet.reps : null,
        reps: topSet.reps,
        seconds:
          trackingType === 'seconds_only' ||
          trackingType === 'cardio' ||
          trackingType === 'weight_seconds'
            ? topSet.reps
            : null,
        trackingType,
        weight: topSet.weight ?? 0,
      },
    ];
  });
}

function pickTopSessionSet(
  sets: ActiveWorkoutPerformanceHistorySession['sets'],
  trackingType: ExerciseTrackingType,
) {
  const [firstSet, ...remainingSets] = sets;
  if (!firstSet) {
    return null;
  }

  return remainingSets.reduce((bestSet, currentSet) => {
    if (currentSet.reps == null) {
      return bestSet;
    }

    if (bestSet.reps == null) {
      return currentSet;
    }

    if (
      trackingType === 'seconds_only' ||
      trackingType === 'cardio' ||
      trackingType === 'weight_seconds' ||
      trackingType === 'distance' ||
      trackingType === 'reps_only' ||
      trackingType === 'bodyweight_reps'
    ) {
      return currentSet.reps > bestSet.reps ? currentSet : bestSet;
    }

    const currentWeight = currentSet.weight ?? 0;
    const bestWeight = bestSet.weight ?? 0;
    if (currentWeight > bestWeight) {
      return currentSet;
    }

    if (currentWeight === bestWeight && currentSet.reps > bestSet.reps) {
      return currentSet;
    }

    return bestSet;
  }, firstSet);
}
