import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  trashListResponseSchema,
  trashTypeSchema,
  type TrashListResponse,
  type TrashType,
} from '@pulse/shared';
import { z } from 'zod';

import { foodQueryKeys } from '@/features/foods/api/keys';
import { habitQueryKeys } from '@/features/habits/api/keys';
import { workoutQueryKeys } from '@/features/workouts/api/workouts';
import { apiRequest } from '@/lib/api-client';

const mutationResultSchema = z.object({
  success: z.boolean(),
});

export const trashQueryKeys = {
  all: ['trash'] as const,
  items: () => ['trash', 'items'] as const,
  list: () => ['trash', 'list'] as const,
};

export const trashKeys = {
  all: trashQueryKeys.all,
  items: trashQueryKeys.items,
  list: trashQueryKeys.list,
};

type TrashMutationInput = {
  id: string;
  type: TrashType;
};

async function fetchTrashItems(signal?: AbortSignal): Promise<TrashListResponse> {
  const payload = await apiRequest<TrashListResponse>('/api/v1/trash', {
    method: 'GET',
    signal,
  });

  return trashListResponseSchema.parse(payload);
}

async function restoreTrashItem(input: TrashMutationInput) {
  const type = trashTypeSchema.parse(input.type);
  const payload = await apiRequest<{ success: boolean }>(
    `/api/v1/trash/${type}/${input.id}/restore`,
    {
      method: 'POST',
    },
  );

  return mutationResultSchema.parse(payload);
}

async function purgeTrashItem(input: TrashMutationInput) {
  const type = trashTypeSchema.parse(input.type);
  const payload = await apiRequest<{ success: boolean }>(`/api/v1/trash/${type}/${input.id}`, {
    method: 'DELETE',
  });

  return mutationResultSchema.parse(payload);
}

async function invalidateRelatedQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: trashQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: habitQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: foodQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: workoutQueryKeys.all }),
  ]);
}

export function useTrashItems() {
  return useQuery({
    queryFn: ({ signal }) => fetchTrashItems(signal),
    queryKey: trashQueryKeys.items(),
  });
}

export function useRestoreItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreTrashItem,
    onSuccess: async () => {
      await invalidateRelatedQueries(queryClient);
    },
  });
}

export function usePurgeItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: purgeTrashItem,
    onSuccess: async () => {
      await invalidateRelatedQueries(queryClient);
    },
  });
}
