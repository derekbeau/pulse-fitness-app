import {
  applyWorkoutProgressionActionInputSchema,
  workoutMuscleAnalyticsQuerySchema,
  workoutMuscleAnalyticsSchema,
  workoutProgressionActionSchema,
  workoutProgressionPreviewResponseSchema,
  type ApplyWorkoutProgressionActionInput,
  type WorkoutMuscleAnalyticsQuery,
} from '@pulse/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api-client';
import { workoutQueryKeys } from './workouts';

export const workoutProgressionQueryKeys = {
  all: ['workout-progression'] as const,
  muscles: (query: WorkoutMuscleAnalyticsQuery) =>
    ['workout-progression', 'muscles', query] as const,
  preview: (scheduledWorkoutId: string) =>
    ['workout-progression', 'preview', scheduledWorkoutId] as const,
};

export function useWorkoutProgressionPreview(scheduledWorkoutId: string, enabled = true) {
  return useQuery({
    enabled: enabled && scheduledWorkoutId.trim().length > 0,
    queryFn: async () =>
      workoutProgressionPreviewResponseSchema.parse(
        await apiRequest('/api/v1/workout-progression/preview', {
          body: { scheduledWorkoutId },
          method: 'POST',
        }),
      ),
    queryKey: workoutProgressionQueryKeys.preview(scheduledWorkoutId),
  });
}

export function useApplyWorkoutProgressionAction(scheduledWorkoutId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      recommendationId,
    }: {
      input: ApplyWorkoutProgressionActionInput;
      recommendationId: string;
    }) =>
      workoutProgressionActionSchema.parse(
        await apiRequest(
          `/api/v1/workout-progression/recommendations/${encodeURIComponent(recommendationId)}/actions`,
          { body: applyWorkoutProgressionActionInputSchema.parse(input), method: 'POST' },
        ),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutProgressionQueryKeys.preview(scheduledWorkoutId),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.scheduledWorkout(scheduledWorkoutId),
        }),
      ]);
    },
  });
}

export function useWorkoutMuscleAnalytics(query: WorkoutMuscleAnalyticsQuery) {
  const parsed = workoutMuscleAnalyticsQuerySchema.parse(query);
  const search = new URLSearchParams({ range: parsed.range });
  if (parsed.end) search.set('end', parsed.end);
  if (parsed.timeZone) search.set('timeZone', parsed.timeZone);

  return useQuery({
    queryFn: async () =>
      workoutMuscleAnalyticsSchema.parse(
        await apiRequest(`/api/v1/workout-progression/muscles?${search.toString()}`),
      ),
    queryKey: workoutProgressionQueryKeys.muscles(parsed),
  });
}
