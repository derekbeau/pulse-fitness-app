import type { QueryClient } from '@tanstack/react-query';
import type { WorkoutSession } from '@pulse/shared';

import { crossFeatureInvalidationMap, invalidateQueryKeys } from '@/lib/query-invalidation';

export const workoutSessionQueryKeys = {
  all: ['workout-sessions'] as const,
  detail: (sessionId: string) => ['workout-sessions', sessionId] as const,
};

const canonicalWorkoutSessionQueryKeys = {
  sessions: () => ['workouts', 'sessions'] as const,
  session: (sessionId: string) => ['workouts', 'session', sessionId] as const,
};

export async function syncSessionMutationCache(
  queryClient: QueryClient,
  session: WorkoutSession,
  options?: { invalidateDashboard?: boolean },
) {
  queryClient.setQueryData(workoutSessionQueryKeys.detail(session.id), session);
  queryClient.setQueryData(canonicalWorkoutSessionQueryKeys.session(session.id), session);

  const invalidations = [
    queryClient.invalidateQueries({
      queryKey: workoutSessionQueryKeys.all,
    }),
    queryClient.invalidateQueries({
      queryKey: workoutSessionQueryKeys.detail(session.id),
    }),
    queryClient.invalidateQueries({
      queryKey: canonicalWorkoutSessionQueryKeys.sessions(),
    }),
    queryClient.invalidateQueries({
      queryKey: canonicalWorkoutSessionQueryKeys.session(session.id),
    }),
  ];

  if (options?.invalidateDashboard) {
    invalidations.push(
      invalidateQueryKeys(queryClient, crossFeatureInvalidationMap.activeWorkoutSessionMutation()),
    );
  }

  await Promise.all(invalidations);
}
