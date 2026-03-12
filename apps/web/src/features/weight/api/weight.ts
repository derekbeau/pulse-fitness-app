import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BodyWeightEntry, CreateWeightInput, DeleteWeightResult } from '@pulse/shared';
import { toast } from 'sonner';

import { apiRequest } from '@/lib/api-client';

type WeightTrendFilters = {
  from?: string;
  to?: string;
};

export const weightKeys = {
  all: ['weight'] as const,
  latest: () => [...weightKeys.all, 'latest'] as const,
  trend: ({ from, to }: WeightTrendFilters = {}) =>
    [...weightKeys.all, 'trend', from ?? null, to ?? null] as const,
};

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

export const useLatestWeight = () =>
  useQuery({
    queryKey: weightKeys.latest(),
    queryFn: fetchLatestWeight,
  });

export const useWeightTrend = (from?: string, to?: string) =>
  useQuery({
    queryKey: weightKeys.trend({ from, to }),
    queryFn: () => fetchWeightTrend({ from, to }),
  });

export const useLogWeight = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postWeightEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: weightKeys.all });
      toast.success('Weight logged');
    },
  });
};

export const useDeleteWeight = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteWeightEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: weightKeys.all });
      toast.success('Weight entry deleted');
    },
    onError: () => {
      toast.error('Failed to delete weight entry');
    },
  });
};
