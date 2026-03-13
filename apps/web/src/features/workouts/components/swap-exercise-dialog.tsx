import { useMemo, useState } from 'react';
import type { Exercise } from '@pulse/shared';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';

import { useExercises, useSwapSessionExercise, useSwapTemplateExercise } from '../api/workouts';
import { getTrackingTypeLabel } from '../lib/tracking';

type SwapExerciseDialogProps = {
  contextId: string;
  mode: 'session' | 'template';
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sourceExerciseId: string;
  sourceExerciseName: string;
  sourceLabel: string;
};

export function SwapExerciseDialog({
  contextId,
  mode,
  onOpenChange,
  open,
  sourceExerciseId,
  sourceExerciseName,
  sourceLabel,
}: SwapExerciseDialogProps) {
  const [search, setSearch] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const exercisesQuery = useExercises(
    {
      limit: 100,
      page: 1,
    },
    {
      enabled: open,
    },
  );
  const swapTemplateExerciseMutation = useSwapTemplateExercise();
  const swapSessionExerciseMutation = useSwapSessionExercise();
  const isPending =
    swapTemplateExerciseMutation.isPending || swapSessionExerciseMutation.isPending;
  const selectedExerciseId = useMemo(() => {
    if (swapTemplateExerciseMutation.isPending) {
      return swapTemplateExerciseMutation.variables?.newExerciseId;
    }

    if (swapSessionExerciseMutation.isPending) {
      return swapSessionExerciseMutation.variables?.newExerciseId;
    }

    return null;
  }, [
    swapSessionExerciseMutation.isPending,
    swapSessionExerciseMutation.variables?.newExerciseId,
    swapTemplateExerciseMutation.isPending,
    swapTemplateExerciseMutation.variables?.newExerciseId,
  ]);

  const exercises = useMemo(() => exercisesQuery.data?.data ?? [], [exercisesQuery.data?.data]);
  const exerciseMap = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);
  const sourceExercise = exerciseMap.get(sourceExerciseId);
  const relatedIds = useMemo(
    () => sourceExercise?.relatedExerciseIds ?? [],
    [sourceExercise?.relatedExerciseIds],
  );
  const normalizedSearch = search.trim().toLowerCase();

  const filteredExercises = useMemo(() => {
    return exercises
      .filter((exercise) => exercise.id !== sourceExerciseId)
      .filter((exercise) => matchesSearch(exercise, normalizedSearch))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [exercises, normalizedSearch, sourceExerciseId]);

  const relatedExercises = useMemo(() => {
    if (relatedIds.length === 0) {
      return [];
    }

    return relatedIds
      .map((id) => exerciseMap.get(id))
      .filter((exercise): exercise is Exercise => exercise !== undefined)
      .filter((exercise) => exercise.id !== sourceExerciseId)
      .filter((exercise) => matchesSearch(exercise, normalizedSearch));
  }, [exerciseMap, normalizedSearch, relatedIds, sourceExerciseId]);

  const relatedIdSet = useMemo(
    () => new Set(relatedExercises.map((exercise) => exercise.id)),
    [relatedExercises],
  );
  const allExercises = useMemo(
    () => filteredExercises.filter((exercise) => !relatedIdSet.has(exercise.id)),
    [filteredExercises, relatedIdSet],
  );

  async function handleSwapSelection(targetExercise: Exercise) {
    if (isPending) {
      return;
    }

    setSubmitError(null);

    try {
      const payload =
        mode === 'template'
          ? await swapTemplateExerciseMutation.mutateAsync({
              templateId: contextId,
              exerciseId: sourceExerciseId,
              newExerciseId: targetExercise.id,
            })
          : await swapSessionExerciseMutation.mutateAsync({
              sessionId: contextId,
              exerciseId: sourceExerciseId,
              newExerciseId: targetExercise.id,
            });

      toast.success(`Swapped ${sourceExerciseName} → ${targetExercise.name}`);
      if (payload.meta?.warning) {
        toast(payload.meta.warning);
      }
      onOpenChange(false);
    } catch (error) {
      setSubmitError(
        error instanceof ApiError ? error.message : 'Unable to swap exercise. Try again.',
      );
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setSearch('');
          setSubmitError(null);
        }
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Swap exercise</DialogTitle>
          <DialogDescription>{`Replace ${sourceExerciseName} in ${sourceLabel}.`}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            aria-label="Search exercises"
            autoFocus
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search exercises..."
            value={search}
          />

          {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

          {exercisesQuery.isPending ? (
            <p className="text-sm text-muted">Loading exercises...</p>
          ) : null}

          {exercisesQuery.isError ? (
            <p className="text-sm text-destructive">Unable to load exercises.</p>
          ) : null}

          {!exercisesQuery.isPending && !exercisesQuery.isError ? (
            <div className="max-h-[22rem] space-y-4 overflow-y-auto">
              {relatedExercises.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">
                    Related exercises
                  </h3>
                  <div className="space-y-2">
                    {relatedExercises.map((exercise) => (
                      <ExerciseOptionRow
                        exercise={exercise}
                        isPending={isPending}
                        key={exercise.id}
                        onSelect={handleSwapSelection}
                        selectedExerciseId={selectedExerciseId}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <h3 className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">
                  All exercises
                </h3>
                {allExercises.length > 0 ? (
                  <div className="space-y-2">
                    {allExercises.map((exercise) => (
                      <ExerciseOptionRow
                        exercise={exercise}
                        isPending={isPending}
                        key={exercise.id}
                        onSelect={handleSwapSelection}
                        selectedExerciseId={selectedExerciseId}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No exercises match your search.</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExerciseOptionRow({
  exercise,
  isPending,
  onSelect,
  selectedExerciseId,
}: {
  exercise: Exercise;
  isPending: boolean;
  onSelect: (exercise: Exercise) => void;
  selectedExerciseId: string | null;
}) {
  const isSelected = selectedExerciseId === exercise.id;

  return (
    <button
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-secondary/45 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isPending}
      onClick={() => onSelect(exercise)}
      type="button"
    >
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">{exercise.name}</p>
        <p className="truncate text-xs text-muted">{formatMuscleGroupLabel(exercise.muscleGroups)}</p>
      </div>

      <Badge className="shrink-0 border-border bg-secondary/70 text-secondary-foreground" variant="outline">
        {isSelected ? 'Swapping...' : getTrackingTypeLabel(exercise.trackingType)}
      </Badge>
    </button>
  );
}

function formatMuscleGroupLabel(muscleGroups: string[]) {
  if (muscleGroups.length === 0) {
    return 'General';
  }

  return muscleGroups.map(formatLabel).join(', ');
}

function formatLabel(value: string) {
  return value
    .split(/[- ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function matchesSearch(exercise: Exercise, normalizedSearch: string) {
  if (!normalizedSearch) {
    return true;
  }

  const searchTarget = [
    exercise.name,
    ...exercise.muscleGroups,
    getTrackingTypeLabel(exercise.trackingType),
  ]
    .join(' ')
    .toLowerCase();

  return searchTarget.includes(normalizedSearch);
}
