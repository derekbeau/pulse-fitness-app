import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workoutTemplateSchema, type WorkoutTemplate } from '@pulse/shared';
import { z } from 'zod';

import { workoutQueryKeys } from '@/features/workouts/api/workouts';
import { apiRequest } from '@/lib/api-client';

import { workoutSessionQueryKeys } from './use-workout-session';

const workoutTemplateResponseSchema = z.object({
  data: workoutTemplateSchema,
}) as unknown as z.ZodType<{ data: WorkoutTemplate }>;

async function saveAsTemplate(sessionId: string) {
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}/save-as-template`, {
    method: 'POST',
  });
  const payload = workoutTemplateResponseSchema.parse({ data });

  return payload.data;
}

export function useSaveAsTemplate(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedSessionId = sessionId?.trim() ?? '';

  return useMutation<WorkoutTemplate, Error, undefined>({
    mutationFn: async () => {
      if (!normalizedSessionId) {
        throw new Error('Session id is required to save as template');
      }

      return saveAsTemplate(normalizedSessionId);
    },
    onSuccess: async (template) => {
      queryClient.setQueryData(workoutQueryKeys.template(template.id), template);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workoutQueryKeys.templates() }),
        queryClient.invalidateQueries({ queryKey: workoutSessionQueryKeys.all }),
        queryClient.invalidateQueries({
          queryKey: workoutSessionQueryKeys.detail(normalizedSessionId),
        }),
      ]);
    },
  });
}
