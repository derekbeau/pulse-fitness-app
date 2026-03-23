import { useQuery } from '@tanstack/react-query';
import {
  exercisePerformanceHistorySchema,
  exerciseHistoryWithRelatedSchema,
  exerciseLastPerformanceQuerySchema,
  type ExerciseLastPerformance,
} from '@pulse/shared';

import type {
  ActiveWorkoutExerciseHistorySummary,
  ActiveWorkoutLastPerformance,
} from '@/features/workouts/types';
import { ApiError, apiRequest } from '@/lib/api-client';

const lastPerformanceQueryKeys = {
  all: ['exercise-last-performance'] as const,
  detail: (exerciseId: string, includeRelated: boolean, limit: number) =>
    ['exercise-last-performance', exerciseId, { includeRelated, limit }] as const,
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
    notes: null,
    sessionId: payload.sessionId,
    sets,
  };
}

async function getLastPerformance(
  exerciseId: string,
  includeRelated: boolean,
  limit: number,
): Promise<ActiveWorkoutExerciseHistorySummary | null> {
  const query = new URLSearchParams({
    limit: String(limit),
  });
  if (includeRelated) {
    query.set('includeRelated', 'true');
  }

  try {
    const data = await apiRequest<unknown>(
      `/api/v1/exercises/${exerciseId}/${includeRelated ? 'last-performance' : 'history'}?${query}`,
    );

    if (data == null) {
      return null;
    }

    if (!includeRelated) {
      const payload = exercisePerformanceHistorySchema.parse(data);
      const historyEntries = payload
        .map((entry) =>
          mapLastPerformance({
            date: entry.date,
            sessionId: entry.sessionId,
            sets: entry.sets,
          }),
        )
        .filter((entry): entry is ActiveWorkoutLastPerformance => entry != null);
      const notesBySessionId = new Map(payload.map((entry) => [entry.sessionId, entry.notes]));
      const historyEntriesWithNotes = historyEntries.map((entry) => ({
        ...entry,
        notes: notesBySessionId.get(entry.sessionId) ?? null,
      }));

      return {
        history: historyEntriesWithNotes[0] ?? null,
        historyEntries: historyEntriesWithNotes,
        related: [],
      };
    }

    const payload = exerciseHistoryWithRelatedSchema.parse(data);
    const history = mapLastPerformance(payload.history);

    return {
      history,
      historyEntries: history ? [history] : [],
      related: payload.related.map((relatedExercise) => ({
        exerciseId: relatedExercise.exerciseId,
        exerciseName: relatedExercise.exerciseName,
        trackingType: relatedExercise.trackingType,
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
    includeRelated?: boolean;
    limit?: number;
  },
) {
  const normalizedExerciseId = exerciseId.trim();
  const enabled = options?.enabled ?? true;
  const { includeRelated, limit } = exerciseLastPerformanceQuerySchema.parse({
    includeRelated: options?.includeRelated ?? false,
    limit: options?.limit,
  });

  return useQuery<ActiveWorkoutExerciseHistorySummary | null>({
    enabled: enabled && normalizedExerciseId.length > 0,
    queryFn: () => getLastPerformance(normalizedExerciseId, includeRelated, limit),
    queryKey: lastPerformanceQueryKeys.detail(normalizedExerciseId, includeRelated, limit),
  });
}

export { lastPerformanceQueryKeys };
