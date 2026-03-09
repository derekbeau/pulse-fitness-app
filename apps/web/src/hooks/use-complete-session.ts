import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type WorkoutSession,
  type WorkoutSessionFeedback,
  updateWorkoutSessionInputSchema,
  workoutSessionSchema,
} from '@pulse/shared';
import { z } from 'zod';

import { apiRequest } from '@/lib/api-client';

import { workoutSessionQueryKeys } from './use-workout-session';

const workoutSessionResponseSchema = z.object({
  data: workoutSessionSchema,
}) as unknown as z.ZodType<{ data: WorkoutSession }>;

type CompleteSessionInput = {
  completedAt?: number;
  duration?: number | null;
  feedback: WorkoutSessionFeedback;
  notes?: string | null;
};

async function completeSession(sessionId: string, input: CompleteSessionInput) {
  const parsedBody = updateWorkoutSessionInputSchema.parse({
    completedAt: input.completedAt ?? Date.now(),
    duration: input.duration ?? null,
    feedback: input.feedback,
    notes: input.notes ?? null,
    status: 'completed',
  });

  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}`, {
    body: JSON.stringify(parsedBody),
    method: 'PUT',
  });
  const payload = workoutSessionResponseSchema.parse({ data });

  return payload.data;
}

export function useCompleteSession(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedSessionId = sessionId?.trim() ?? '';

  return useMutation<WorkoutSession, Error, CompleteSessionInput>({
    mutationFn: async (input) => {
      if (!normalizedSessionId) {
        throw new Error('Session id is required to complete a workout');
      }

      return completeSession(normalizedSessionId, input);
    },
    onSuccess: async (session) => {
      queryClient.setQueryData(workoutSessionQueryKeys.detail(session.id), session);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workoutSessionQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: workoutSessionQueryKeys.detail(session.id) }),
      ]);
    },
  });
}

export type { CompleteSessionInput };
