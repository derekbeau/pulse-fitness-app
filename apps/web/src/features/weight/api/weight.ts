import { type QueryKey, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BodyWeightEntry,
  CreateWeightInput,
  DashboardSnapshot,
  DashboardWeightTrendPoint,
  DeleteWeightResult,
  PatchWeightInput,
} from '@pulse/shared';
import { toast } from 'sonner';

import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { dashboardWeightTrendQueryKeys } from '@/hooks/use-weight-trend';
import { apiRequest } from '@/lib/api-client';
import { createOptimisticMutation } from '@/lib/optimistic';
import { crossFeatureInvalidationMap, invalidateQueryKeys } from '@/lib/query-invalidation';

type WeightTrendFilters = {
  from?: string;
  to?: string;
};

type DashboardSnapshotCache = Array<readonly [QueryKey, DashboardSnapshot | undefined]>;
type DashboardWeightTrendCache = Array<readonly [QueryKey, DashboardWeightTrendPoint[] | undefined]>;

const normalizeWeightTrendFilters = ({ from, to }: WeightTrendFilters = {}) => ({
  from: from ?? null,
  to: to ?? null,
});

export const weightQueryKeys = {
  all: ['weight'] as const,
  latest: () => ['weight', 'latest'] as const,
  trendRoot: () => ['weight', 'trend'] as const,
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

const compareWeightEntries = (left: BodyWeightEntry, right: BodyWeightEntry) =>
  left.date.localeCompare(right.date) ||
  left.createdAt - right.createdAt ||
  left.id.localeCompare(right.id);

const upsertWeightEntry = (entries: BodyWeightEntry[] | undefined, nextEntry: BodyWeightEntry) => {
  const currentEntries = entries ?? [];
  const existingIndex = currentEntries.findIndex(
    (entry) =>
      entry.id === nextEntry.id ||
      (entry.id.startsWith('optimistic-weight-') && entry.date === nextEntry.date),
  );

  if (existingIndex === -1) {
    return [...currentEntries, nextEntry].sort(compareWeightEntries);
  }

  const nextEntries = [...currentEntries];
  nextEntries[existingIndex] = nextEntry;

  return nextEntries.sort(compareWeightEntries);
};

const getWeightTrendFiltersFromQueryKey = (queryKey: QueryKey) => {
  const maybeFilters = queryKey[2];

  if (
    typeof maybeFilters === 'object' &&
    maybeFilters !== null &&
    'from' in maybeFilters &&
    'to' in maybeFilters
  ) {
    return maybeFilters as { from: string | null; to: string | null };
  }

  return null;
};

const applyWeightEntryToTrendCache = (
  entries: BodyWeightEntry[] | undefined,
  nextEntry: BodyWeightEntry,
  queryKey: QueryKey,
) => {
  const filters = getWeightTrendFiltersFromQueryKey(queryKey);

  if (filters) {
    if ((filters.from && nextEntry.date < filters.from) || (filters.to && nextEntry.date > filters.to)) {
      return entries;
    }
  }

  return upsertWeightEntry(entries, nextEntry);
};

const isWeightEntryMoreRecent = (
  candidate: BodyWeightEntry,
  current: BodyWeightEntry | null | undefined,
) => {
  if (!current) {
    return true;
  }

  return (
    candidate.date > current.date ||
    (candidate.date === current.date && candidate.createdAt >= current.createdAt)
  );
};

const applyWeightEntryToLatestCache = (
  current: BodyWeightEntry | null | undefined,
  nextEntry: BodyWeightEntry,
) => (isWeightEntryMoreRecent(nextEntry, current) ? nextEntry : current ?? null);

const applyWeightEntryToDashboardSnapshot = (
  snapshot: DashboardSnapshot | undefined,
  nextEntry: BodyWeightEntry,
) => {
  if (!snapshot || snapshot.date !== nextEntry.date) {
    return snapshot;
  }

  return {
    ...snapshot,
    weight: {
      date: nextEntry.date,
      unit: 'lb' as const,
      value: nextEntry.weight,
    },
  };
};

const applyWeightEntryToDashboardTrend = (
  points: DashboardWeightTrendPoint[] | undefined,
  nextEntry: BodyWeightEntry,
  queryKey: QueryKey,
) => {
  const from = queryKey[2];
  const to = queryKey[3];

  if (typeof from !== 'string' || typeof to !== 'string') {
    return points;
  }

  if (nextEntry.date < from || nextEntry.date > to) {
    return points;
  }

  const currentPoints = points ?? [];
  const existingIndex = currentPoints.findIndex((point) => point.date === nextEntry.date);
  const nextPoint = {
    date: nextEntry.date,
    value: nextEntry.weight,
  };

  if (existingIndex === -1) {
    return [...currentPoints, nextPoint].sort((left, right) => left.date.localeCompare(right.date));
  }

  const nextPoints = [...currentPoints];
  nextPoints[existingIndex] = nextPoint;

  return nextPoints.sort((left, right) => left.date.localeCompare(right.date));
};

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
  return createOptimisticMutation<
    BodyWeightEntry[],
    BodyWeightEntry,
    CreateWeightInput,
    {
      optimisticEntry: BodyWeightEntry;
      previousDashboardSnapshots: DashboardSnapshotCache;
      previousDashboardWeightTrend: DashboardWeightTrendCache;
      previousLatest: BodyWeightEntry | null | undefined;
    }
  >({
    mutationFn: postWeightEntry,
    getMeta: (variables, queryClient) => ({
      optimisticEntry: {
        id: `optimistic-weight-${variables.date}`,
        date: variables.date,
        weight: variables.weight,
        notes: variables.notes ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      previousDashboardSnapshots: queryClient.getQueriesData<DashboardSnapshot>({
        queryKey: dashboardSnapshotQueryKeys.all,
      }),
      previousDashboardWeightTrend: queryClient.getQueriesData<DashboardWeightTrendPoint[]>({
        queryKey: dashboardWeightTrendQueryKeys.all,
      }),
      previousLatest: queryClient.getQueryData(weightQueryKeys.latest()),
    }),
    invalidateKeys: () => [weightQueryKeys.all, ...crossFeatureInvalidationMap.weightMutation()],
    onError: async (_error, _variables, context, queryClient) => {
      if (!context) {
        return;
      }

      queryClient.setQueryData(weightQueryKeys.latest(), context.meta.previousLatest);
      context.meta.previousDashboardSnapshots.forEach(([queryKey, snapshot]) => {
        queryClient.setQueryData(queryKey, snapshot);
      });
      context.meta.previousDashboardWeightTrend.forEach(([queryKey, trend]) => {
        queryClient.setQueryData(queryKey, trend);
      });
    },
    onMutate: async (_variables, context, queryClient) => {
      queryClient.setQueryData<BodyWeightEntry | null>(
        weightQueryKeys.latest(),
        (current) => applyWeightEntryToLatestCache(current, context.meta.optimisticEntry),
      );

      context.meta.previousDashboardSnapshots.forEach(([queryKey]) => {
        queryClient.setQueryData<DashboardSnapshot>(queryKey, (current) =>
          applyWeightEntryToDashboardSnapshot(current, context.meta.optimisticEntry),
        );
      });

      context.meta.previousDashboardWeightTrend.forEach(([queryKey]) => {
        queryClient.setQueryData<DashboardWeightTrendPoint[]>(queryKey, (current) =>
          applyWeightEntryToDashboardTrend(current, context.meta.optimisticEntry, queryKey),
        );
      });
    },
    onSuccess: async (entry, _variables, context, queryClient) => {
      queryClient.setQueryData<BodyWeightEntry | null>(weightQueryKeys.latest(), (current) =>
        applyWeightEntryToLatestCache(current, entry),
      );

      context?.meta.previousDashboardSnapshots.forEach(([queryKey]) => {
        queryClient.setQueryData<DashboardSnapshot>(queryKey, (current) =>
          applyWeightEntryToDashboardSnapshot(current, entry),
        );
      });

      context?.meta.previousDashboardWeightTrend.forEach(([queryKey]) => {
        queryClient.setQueryData<DashboardWeightTrendPoint[]>(queryKey, (current) =>
          applyWeightEntryToDashboardTrend(current, entry, queryKey),
        );
      });

      toast.success('Weight logged');
    },
    queryKey: () => weightQueryKeys.trendRoot(),
    reconcile: (current, entry, _variables, context) =>
      applyWeightEntryToTrendCache(current, entry, context.queryKey),
    updater: (current, _variables, context) =>
      applyWeightEntryToTrendCache(current, context.meta.optimisticEntry, context.queryKey),
  });
};

export const useDeleteWeight = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteWeightEntry,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: weightQueryKeys.all }),
        invalidateQueryKeys(queryClient, crossFeatureInvalidationMap.weightMutation()),
      ]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: weightQueryKeys.all }),
        invalidateQueryKeys(queryClient, crossFeatureInvalidationMap.weightMutation()),
      ]);
      toast.success('Weight entry updated');
    },
    onError: () => {
      toast.error('Failed to update weight entry');
    },
  });
};
