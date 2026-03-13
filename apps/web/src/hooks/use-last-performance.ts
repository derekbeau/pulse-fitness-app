import { useQuery } from '@tanstack/react-query';
import { exerciseHistoryWithRelatedSchema, type ExerciseLastPerformance } from '@pulse/shared';

import type {
  ActiveWorkoutExerciseHistorySummary,
  ActiveWorkoutLastPerformance,
} from '@/features/workouts/types';
import { ApiError, apiRequest } from '@/lib/api-client';

const lastPerformanceQueryKeys = {
  all: ['exercise-last-performance'] as const,
  detail: (exerciseId: string) => ['exercise-last-performance', exerciseId] as const,
};

function mapLastPerformance(
  payload: ExerciseLastPerformance | null,
): ActiveWorkoutLastPerformance | null {
  if (payload == null) {
    return null;
  }

  const sets = payload.sets
    .filter((set): set is typeof set & { reps: number } => set.reps !== null)
    .map((set) => ({
      completed: true,
      reps: set.reps,
      setNumber: set.setNumber,
      weight: set.weight,
    }));

  if (sets.length === 0) {
    return null;
  }

  return {
    date: payload.date,
    sessionId: payload.sessionId,
    sets,
  };
}

async function getLastPerformance(
  exerciseId: string,
): Promise<ActiveWorkoutExerciseHistorySummary | null> {
  try {
    const data = await apiRequest<unknown>(
      `/api/v1/exercises/${exerciseId}/last-performance?includeRelated=true`,
    );

    if (data == null) {
      return null;
    }

    const payload = exerciseHistoryWithRelatedSchema.parse(data);

    return {
      history: mapLastPerformance(payload.history),
      related: payload.related.map((relatedExercise) => ({
        exerciseId: relatedExercise.exerciseId,
        exerciseName: relatedExercise.exerciseName,
        history: mapLastPerformance(relatedExercise.history),
      })),
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.code === 'EXERCISE_NOT_FOUND') {
      return null;
    }

    throw error;
  }
}

export function useLastPerformance(
  exerciseId: string,
  options?: {
    enabled?: boolean;
  },
) {
  const normalizedExerciseId = exerciseId.trim();
  const enabled = options?.enabled ?? true;

  return useQuery<ActiveWorkoutExerciseHistorySummary | null>({
    enabled: enabled && normalizedExerciseId.length > 0,
    queryFn: () => getLastPerformance(normalizedExerciseId),
    queryKey: lastPerformanceQueryKeys.detail(normalizedExerciseId),
  });
}

export { lastPerformanceQueryKeys };
