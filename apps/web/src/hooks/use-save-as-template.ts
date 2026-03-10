import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  saveWorkoutSessionAsTemplateInputSchema,
  workoutTemplateSchema,
  type SaveWorkoutSessionAsTemplateInput,
  type WorkoutTemplate,
} from '@pulse/shared';
import { toast } from 'sonner';
import { z } from 'zod';

import { workoutQueryKeys } from '@/features/workouts/api/workouts';
import { apiRequest } from '@/lib/api-client';

import { workoutSessionQueryKeys } from './use-workout-session';

const workoutTemplateResponseSchema = z.object({
  data: workoutTemplateSchema,
}) as unknown as z.ZodType<{ data: WorkoutTemplate }>;

type SaveAsTemplateInput = SaveWorkoutSessionAsTemplateInput | undefined;

async function saveAsTemplate(sessionId: string, input: SaveAsTemplateInput) {
  const parsedInput = saveWorkoutSessionAsTemplateInputSchema.parse(input);
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}/save-as-template`, {
    body: JSON.stringify(parsedInput),
    method: 'POST',
  });
  const payload = workoutTemplateResponseSchema.parse({ data });

  return payload.data;
}

export function useSaveAsTemplate(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedSessionId = sessionId?.trim() ?? '';

  return useMutation<WorkoutTemplate, Error, SaveAsTemplateInput>({
    mutationFn: async (input) => {
      if (!normalizedSessionId) {
        throw new Error('Session id is required to save as template');
      }

      return saveAsTemplate(normalizedSessionId, input);
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
      toast.success('Template saved');
    },
  });
}
