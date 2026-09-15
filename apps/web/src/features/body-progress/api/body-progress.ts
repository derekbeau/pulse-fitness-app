import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiMetaSchema,
  bodyCheckInHistorySchema,
  bodyProgressAnalyticsSchema,
  bodyCheckInPreferenceSchema,
  bodyCheckInSchema,
  bodyContextFactsSchema,
  bodyDueStateSchema,
  bodyMeasurementEntrySchema,
  type BodyCheckIn,
  type CreateBodyCheckInInput,
  type PatchBodyCheckInInput,
  type PatchBodyCheckInPreference,
  type BodyProgressRange,
} from '@pulse/shared';

import { apiRequest, apiRequestWithMeta } from '@/lib/api-client';
import { crossFeatureInvalidationMap, invalidateQueryKeys } from '@/lib/query-invalidation';
import { bodyProgressQueryKeys } from './keys';

type AppQueryClient = ReturnType<typeof useQueryClient>;
const invalidateBodyConsumers = (queryClient: AppQueryClient) =>
  invalidateQueryKeys(queryClient, crossFeatureInvalidationMap.bodyProgressMutation());

export function useBodyPreferences() {
  return useQuery({
    queryKey: bodyProgressQueryKeys.preferences(),
    queryFn: async () =>
      bodyCheckInPreferenceSchema
        .nullable()
        .parse(await apiRequest('/api/v1/body-check-ins/preferences')),
    retry: false,
  });
}

export function useSaveBodyPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PatchBodyCheckInPreference) =>
      bodyCheckInPreferenceSchema.parse(
        await apiRequest('/api/v1/body-check-ins/preferences', {
          body: input,
          method: 'PATCH',
        }),
      ),
    onSuccess: async (preference) => {
      queryClient.setQueryData(bodyProgressQueryKeys.preferences(), preference);
      await invalidateBodyConsumers(queryClient);
    },
  });
}

export function useBodyDue() {
  return useQuery({
    queryKey: bodyProgressQueryKeys.due(),
    queryFn: async () => bodyDueStateSchema.parse(await apiRequest('/api/v1/body-check-ins/due')),
    retry: false,
  });
}

export function useBodyContext() {
  return useQuery({
    queryKey: bodyProgressQueryKeys.context(),
    queryFn: async () => bodyContextFactsSchema.parse(await apiRequest('/api/v1/context/body')),
    retry: false,
  });
}

export function useBodyProgressAnalytics(range: BodyProgressRange, end?: string) {
  return useQuery({
    queryKey: bodyProgressQueryKeys.analytics(range, end),
    queryFn: async () => {
      const search = new URLSearchParams({ range });
      if (end) search.set('end', end);
      return bodyProgressAnalyticsSchema.parse(
        await apiRequest(`/api/v1/body-check-ins/analytics?${search.toString()}`),
      );
    },
    retry: false,
  });
}

export function useBodyCheckIns() {
  return useQuery({
    queryKey: bodyProgressQueryKeys.list(),
    queryFn: async () => {
      const response = await apiRequestWithMeta<unknown, unknown>(
        '/api/v1/body-check-ins?limit=200',
      );
      return {
        data: bodyCheckInSchema.array().parse(response.data),
        meta: apiMetaSchema.parse(response.meta),
      };
    },
    retry: false,
  });
}

export function useLegacyBodyMeasurements() {
  return useQuery({
    queryKey: bodyProgressQueryKeys.legacy(),
    queryFn: async () =>
      bodyMeasurementEntrySchema.array().parse(await apiRequest('/api/v1/body-measurements')),
    retry: false,
  });
}

export function useBodyCheckIn(id: string) {
  return useQuery({
    enabled: id.length > 0,
    queryKey: bodyProgressQueryKeys.detail(id),
    queryFn: async () => bodyCheckInSchema.parse(await apiRequest(`/api/v1/body-check-ins/${id}`)),
  });
}

export function useBodyCheckInHistory(id: string) {
  return useQuery({
    enabled: id.length > 0,
    queryKey: bodyProgressQueryKeys.history(id),
    queryFn: async () =>
      bodyCheckInHistorySchema.parse(await apiRequest(`/api/v1/body-check-ins/${id}/history`)),
  });
}

export function useCreateBodyCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBodyCheckInInput) =>
      bodyCheckInSchema.parse(
        await apiRequest('/api/v1/body-check-ins', { body: input, method: 'POST' }),
      ),
    onSuccess: async (entry) => {
      queryClient.setQueryData(bodyProgressQueryKeys.detail(entry.id), entry);
      await invalidateBodyConsumers(queryClient);
    },
  });
}

export function useUpdateBodyCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: PatchBodyCheckInInput }) =>
      bodyCheckInSchema.parse(
        await apiRequest(`/api/v1/body-check-ins/${id}`, { body: input, method: 'PATCH' }),
      ),
    onSuccess: async (entry) => {
      queryClient.setQueryData(bodyProgressQueryKeys.detail(entry.id), entry);
      await invalidateBodyConsumers(queryClient);
    },
  });
}

export function useDeleteBodyCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Pick<BodyCheckIn, 'id'>) =>
      apiRequest<{ deleted: true; id: string }>(`/api/v1/body-check-ins/${entry.id}`, {
        method: 'DELETE',
      }),
    onSuccess: async ({ id }) => {
      queryClient.removeQueries({ queryKey: bodyProgressQueryKeys.detail(id) });
      queryClient.removeQueries({ queryKey: bodyProgressQueryKeys.history(id) });
      await invalidateBodyConsumers(queryClient);
    },
  });
}

export function useSkipBodyDue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dueDate: string) =>
      bodyDueStateSchema.parse(
        await apiRequest(`/api/v1/body-check-ins/due/${dueDate}/skip`, {
          body: {},
          method: 'POST',
        }),
      ),
    onSuccess: async (due) => {
      queryClient.setQueryData(bodyProgressQueryKeys.due(), due);
      await invalidateBodyConsumers(queryClient);
    },
  });
}

export function useSnoozeBodyDue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ dueDate, snoozedUntil }: { dueDate: string; snoozedUntil: string }) =>
      bodyDueStateSchema.parse(
        await apiRequest(`/api/v1/body-check-ins/due/${dueDate}/snooze`, {
          body: { snoozedUntil },
          method: 'POST',
        }),
      ),
    onSuccess: async (due) => {
      queryClient.setQueryData(bodyProgressQueryKeys.due(), due);
      await invalidateBodyConsumers(queryClient);
    },
  });
}
