import { useQuery } from '@tanstack/react-query';
import {
  exercisePerformanceHistoryQuerySchema,
  exercisePerformanceHistorySchema,
} from '@pulse/shared';

import type { ActiveWorkoutPerformanceHistorySession } from '@/features/workouts/types';
import { ApiError, apiRequest } from '@/lib/api-client';

const exerciseHistoryQueryKeys = {
  all: ['exercise-history'] as const,
  detail: (exerciseId: string, limit: number) =>
    ['exercise-history', exerciseId, { limit }] as const,
};

async function getExerciseHistory(
  exerciseId: string,
  limit: number,
): Promise<ActiveWorkoutPerformanceHistorySession[]> {
  try {
    const data = await apiRequest<unknown>(`/api/v1/exercises/${exerciseId}/history?limit=${limit}`);
    const payload = exercisePerformanceHistorySchema.parse(data);

    return payload.map((session) => ({
      date: session.date,
      notes: session.notes,
      sessionId: session.sessionId,
      sets: session.sets.map((set) => ({
        reps: set.reps,
        setNumber: set.setNumber,
        weight: set.weight,
      })),
    }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.code === 'EXERCISE_NOT_FOUND') {
      return [];
    }

    throw error;
  }
}

export function useExerciseHistory(
  exerciseId: string,
  options?: {
    enabled?: boolean;
    limit?: number;
  },
) {
  const normalizedExerciseId = exerciseId.trim();
  const enabled = options?.enabled ?? true;
  const { limit } = exercisePerformanceHistoryQuerySchema.parse({
    limit: options?.limit ?? 10,
  });

  return useQuery<ActiveWorkoutPerformanceHistorySession[]>({
    enabled: enabled && normalizedExerciseId.length > 0,
    queryFn: () => getExerciseHistory(normalizedExerciseId, limit),
    queryKey: exerciseHistoryQueryKeys.detail(normalizedExerciseId, limit),
  });
}

export { exerciseHistoryQueryKeys };
