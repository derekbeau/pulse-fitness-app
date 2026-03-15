import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BodyWeightEntry,
  CreateWeightInput,
  DeleteWeightResult,
  PatchWeightInput,
} from '@pulse/shared';
import { toast } from 'sonner';

import { apiRequest } from '@/lib/api-client';

type WeightTrendFilters = {
  from?: string;
  to?: string;
};

const normalizeWeightTrendFilters = ({ from, to }: WeightTrendFilters = {}) => ({
  from: from ?? null,
  to: to ?? null,
});

export const weightQueryKeys = {
  all: ['weight'] as const,
  latest: () => ['weight', 'latest'] as const,
  trend: ({ from, to }: WeightTrendFilters = {}) =>
    ['weight', 'trend', normalizeWeightTrendFilters({ from, to })] as const,
};

export const weightKeys = weightQueryKeys;

const buildWeightTrendPath = ({ from, to }: WeightTrendFilters = {}) => {
  const searchParams = new URLSearchParams();

  if (from) {
    searchParams.set('from', from);
  }

  if (to) {
    searchParams.set('to', to);
  }

  const queryString = searchParams.toString();

  return queryString ? `/api/v1/weight?${queryString}` : '/api/v1/weight';
};

const fetchLatestWeight = () => apiRequest<BodyWeightEntry | null>('/api/v1/weight/latest');

const fetchWeightTrend = (filters: WeightTrendFilters) =>
  apiRequest<BodyWeightEntry[]>(buildWeightTrendPath(filters));

const postWeightEntry = (input: CreateWeightInput) =>
  apiRequest<BodyWeightEntry>('/api/v1/weight', {
    body: JSON.stringify(input),
    method: 'POST',
  });

const deleteWeightEntry = (id: string) =>
  apiRequest<DeleteWeightResult>(`/api/v1/weight/${id}`, {
    method: 'DELETE',
  });

const patchWeightEntry = (id: string, input: PatchWeightInput) =>
  apiRequest<BodyWeightEntry>(`/api/v1/weight/${id}`, {
    body: JSON.stringify(input),
    method: 'PATCH',
  });

export const useLatestWeight = () =>
  useQuery({
    queryKey: weightQueryKeys.latest(),
    queryFn: fetchLatestWeight,
  });

export const useWeightTrend = (from?: string, to?: string) =>
  useQuery({
    queryKey: weightQueryKeys.trend({ from, to }),
    queryFn: () => fetchWeightTrend({ from, to }),
  });

export const useLogWeight = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postWeightEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: weightQueryKeys.all });
      toast.success('Weight logged');
    },
  });
};

export const useDeleteWeight = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteWeightEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: weightQueryKeys.all });
      toast.success('Weight entry deleted');
    },
    onError: () => {
      toast.error('Failed to delete weight entry');
    },
  });
};

export const useUpdateWeight = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchWeightInput }) =>
      patchWeightEntry(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: weightQueryKeys.all });
      toast.success('Weight entry updated');
    },
    onError: () => {
      toast.error('Failed to update weight entry');
    },
  });
};
