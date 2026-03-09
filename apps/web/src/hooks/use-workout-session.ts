import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkoutSessionInputSchema,
  type WorkoutSession,
  workoutSessionSchema,
} from '@pulse/shared';
import { z } from 'zod';

import { apiRequest } from '@/lib/api-client';

const workoutSessionResponseSchema = z.object({
  data: workoutSessionSchema,
}) as unknown as z.ZodType<{ data: WorkoutSession }>;

type CreateWorkoutSessionRequest = z.input<typeof createWorkoutSessionInputSchema>;

export const workoutSessionQueryKeys = {
  all: ['workout-sessions'] as const,
  detail: (sessionId: string) => ['workout-sessions', sessionId] as const,
};

async function getWorkoutSession(sessionId: string) {
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}`);
  const payload = workoutSessionResponseSchema.parse({ data });

  return payload.data;
}

async function startSession(input: CreateWorkoutSessionRequest) {
  const parsedInput = createWorkoutSessionInputSchema.parse(input);
  const data = await apiRequest<unknown>('/api/v1/workout-sessions', {
    body: JSON.stringify(parsedInput),
    method: 'POST',
  });
  const payload = workoutSessionResponseSchema.parse({ data });

  return payload.data;
}

export function useWorkoutSession(sessionId: string | null | undefined) {
  const normalizedSessionId = sessionId?.trim() ?? '';

  return useQuery<WorkoutSession>({
    enabled: normalizedSessionId.length > 0,
    queryFn: () => getWorkoutSession(normalizedSessionId),
    queryKey: workoutSessionQueryKeys.detail(normalizedSessionId),
  });
}

export function useStartSession() {
  const queryClient = useQueryClient();

  return useMutation<WorkoutSession, Error, CreateWorkoutSessionRequest>({
    mutationFn: startSession,
    onSuccess: async (session) => {
      queryClient.setQueryData(workoutSessionQueryKeys.detail(session.id), session);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutSessionQueryKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: workoutSessionQueryKeys.detail(session.id),
        }),
      ]);
    },
  });
}
