import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSetSchema, sessionSetSchema, type SessionSet, updateSetSchema } from '@pulse/shared';
import { z } from 'zod';

import { apiRequest } from '@/lib/api-client';

import { workoutSessionQueryKeys } from './use-workout-session';

const sessionSetResponseSchema = z.object({
  data: sessionSetSchema,
}) as unknown as z.ZodType<{ data: SessionSet }>;

type CreateSetRequest = z.input<typeof createSetSchema>;
type UpdateSetRequest = z.input<typeof updateSetSchema>;

type UpdateSetVariables = {
  setId: string;
  update: UpdateSetRequest;
};

async function createSessionSet(sessionId: string, input: CreateSetRequest) {
  const parsedInput = createSetSchema.parse(input);
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}/sets`, {
    body: JSON.stringify(parsedInput),
    method: 'POST',
  });
  const payload = sessionSetResponseSchema.parse({ data });

  return payload.data;
}

async function patchSessionSet(sessionId: string, setId: string, input: UpdateSetRequest) {
  const parsedInput = updateSetSchema.parse(input);
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}/sets/${setId}`, {
    body: JSON.stringify(parsedInput),
    method: 'PATCH',
  });
  const payload = sessionSetResponseSchema.parse({ data });

  return payload.data;
}

async function invalidateSessionQueries(queryClient: ReturnType<typeof useQueryClient>, sessionId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: workoutSessionQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: workoutSessionQueryKeys.detail(sessionId) }),
  ]);
}

export function useLogSet(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedSessionId = sessionId?.trim() ?? '';

  return useMutation<SessionSet, Error, CreateSetRequest>({
    mutationFn: async (input) => {
      if (!normalizedSessionId) {
        throw new Error('Session id is required to log sets');
      }

      return createSessionSet(normalizedSessionId, input);
    },
    onSuccess: async () => {
      if (!normalizedSessionId) {
        return;
      }

      await invalidateSessionQueries(queryClient, normalizedSessionId);
    },
  });
}

export function useUpdateSet(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedSessionId = sessionId?.trim() ?? '';

  return useMutation<SessionSet, Error, UpdateSetVariables>({
    mutationFn: async ({ setId, update }) => {
      if (!normalizedSessionId) {
        throw new Error('Session id is required to update sets');
      }

      return patchSessionSet(normalizedSessionId, setId, update);
    },
    onSuccess: async () => {
      if (!normalizedSessionId) {
        return;
      }

      await invalidateSessionQueries(queryClient, normalizedSessionId);
    },
  });
}
