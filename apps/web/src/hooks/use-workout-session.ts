import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkoutSessionInputSchema,
  type WorkoutSession,
  updateWorkoutSessionInputSchema,
  workoutSessionSchema,
} from '@pulse/shared';
import { toast } from 'sonner';
import { z } from 'zod';

import { setStoredActiveWorkoutSessionId } from '@/features/workouts/lib/session-persistence';
import { apiRequest } from '@/lib/api-client';

const workoutSessionResponseSchema = z.object({
  data: workoutSessionSchema,
}) as unknown as z.ZodType<{ data: WorkoutSession }>;

type CreateWorkoutSessionRequest = z.input<typeof createWorkoutSessionInputSchema>;
type UpdateSessionStartTimeRequest = {
  startedAt: number;
};

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

async function updateSessionStartTime(sessionId: string, input: UpdateSessionStartTimeRequest) {
  const parsedInput = updateWorkoutSessionInputSchema.parse({
    startedAt: input.startedAt,
  });
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}`, {
    body: JSON.stringify(parsedInput),
    method: 'PATCH',
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
      setStoredActiveWorkoutSessionId(session.id);
      queryClient.setQueryData(workoutSessionQueryKeys.detail(session.id), session);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutSessionQueryKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: workoutSessionQueryKeys.detail(session.id),
        }),
      ]);
      toast.success('Workout started');
    },
  });
}

export function useUpdateSessionStartTime(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedSessionId = sessionId?.trim() ?? '';

  return useMutation<WorkoutSession, Error, UpdateSessionStartTimeRequest>({
    mutationFn: async (input) => {
      if (!normalizedSessionId) {
        throw new Error('Session id is required to update session start time');
      }

      return updateSessionStartTime(normalizedSessionId, input);
    },
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
