import { useQuery } from '@tanstack/react-query';
import { exerciseLastPerformanceSchema } from '@pulse/shared';
import { z } from 'zod';

import type { ActiveWorkoutLastPerformance } from '@/features/workouts/types';
import { ApiError, apiRequest } from '@/lib/api-client';

const exerciseLastPerformanceResponseSchema = z.object({
  data: exerciseLastPerformanceSchema,
});

const lastPerformanceQueryKeys = {
  all: ['exercise-last-performance'] as const,
  detail: (exerciseId: string) => ['exercise-last-performance', exerciseId] as const,
};

async function getLastPerformance(
  exerciseId: string,
): Promise<ActiveWorkoutLastPerformance | null> {
  try {
    const data = await apiRequest<unknown>(`/api/v1/exercises/${exerciseId}/last-performance`);

    if (data == null) {
      return null;
    }

    const payload = exerciseLastPerformanceResponseSchema.parse({ data });
    const sets = payload.data.sets
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
      date: payload.data.date,
      sessionId: payload.data.sessionId,
      sets,
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

  return useQuery<ActiveWorkoutLastPerformance | null>({
    enabled: enabled && normalizedExerciseId.length > 0,
    queryFn: () => getLastPerformance(normalizedExerciseId),
    queryKey: lastPerformanceQueryKeys.detail(normalizedExerciseId),
  });
}

export { lastPerformanceQueryKeys };
