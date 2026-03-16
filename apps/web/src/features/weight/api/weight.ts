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
import { apiRequest, apiRequestWithMeta } from '@/lib/api-client';
import { addDays, formatUtcDateKey, parseDateInput } from '@/lib/date';
import { createOptimisticMutation } from '@/lib/optimistic';
import { crossFeatureInvalidationMap, invalidateQueryKeys } from '@/lib/query-invalidation';

type WeightListFilters = {
  days?: number;
  from?: string;
  limit?: number;
  page?: number;
  to?: string;
};

type LogWeightCache =
  | BodyWeightEntry[]
  | BodyWeightEntry
  | null
  | DashboardSnapshot
  | DashboardWeightTrendPoint[];

type PaginatedWeightListMeta = {
  limit: number;
  page: number;
  total: number;
};

const normalizeWeightListFilters = ({ days, from, limit, page, to }: WeightListFilters = {}) => ({
  days: days ?? null,
  from: from ?? null,
  limit: limit ?? null,
  page: page ?? null,
  to: to ?? null,
});

export const weightQueryKeys = {
  all: ['weight'] as const,
  latest: () => ['weight', 'latest'] as const,
  listRoot: () => ['weight', 'list'] as const,
  list: (filters: WeightListFilters = {}) =>
    ['weight', 'list', normalizeWeightListFilters(filters)] as const,
  // trendRoot intentionally aliases listRoot because trend data is fetched from the same
  // /weight endpoint and lives under the same list cache hierarchy.
  trendRoot: () => ['weight', 'list'] as const,
  trend: ({ from, to }: Pick<WeightListFilters, 'from' | 'to'> = {}) =>
    ['weight', 'list', normalizeWeightListFilters({ from, to })] as const,
  page: ({ days, from, limit, page, to }: Required<Pick<WeightListFilters, 'limit' | 'page'>> &
    WeightListFilters) =>
    ['weight', 'list', normalizeWeightListFilters({ days, from, limit, page, to })] as const,
};

export const weightKeys = weightQueryKeys;

const buildWeightEntriesPath = ({ days, from, limit, page, to }: WeightListFilters = {}) => {
  const searchParams = new URLSearchParams();

  if (days !== undefined) {
    searchParams.set('days', String(days));
  }

  if (from) {
    searchParams.set('from', from);
  }

  if (page !== undefined) {
    searchParams.set('page', String(page));
  }

  if (limit !== undefined) {
    searchParams.set('limit', String(limit));
  }

  if (to) {
    searchParams.set('to', to);
  }

  const queryString = searchParams.toString();

  return queryString ? `/api/v1/weight?${queryString}` : '/api/v1/weight';
};

const fetchLatestWeight = () => apiRequest<BodyWeightEntry | null>('/api/v1/weight/latest');

const fetchWeightEntries = (filters: WeightListFilters) =>
  apiRequest<BodyWeightEntry[]>(buildWeightEntriesPath(filters));

const fetchPaginatedWeightEntries = (filters: Required<Pick<WeightListFilters, 'limit' | 'page'>> &
  WeightListFilters) =>
  apiRequestWithMeta<BodyWeightEntry[], PaginatedWeightListMeta>(buildWeightEntriesPath(filters));

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

const getWeightListFiltersFromQueryKey = (queryKey: QueryKey) => {
  const maybeFilters = queryKey[2];

  if (
    typeof maybeFilters === 'object' &&
    maybeFilters !== null &&
    'days' in maybeFilters &&
    'from' in maybeFilters &&
    'limit' in maybeFilters &&
    'page' in maybeFilters &&
    'to' in maybeFilters
  ) {
    return maybeFilters as {
      days: number | null;
      from: string | null;
      limit: number | null;
      page: number | null;
      to: string | null;
    };
  }

  return null;
};

const applyWeightEntryToListCache = (
  entries: BodyWeightEntry[] | undefined,
  nextEntry: BodyWeightEntry,
  queryKey: QueryKey,
) => {
  const filters = getWeightListFiltersFromQueryKey(queryKey);

  if (filters) {
    if (filters.page !== null || filters.limit !== null) {
      return entries;
    }

    const resolvedTo = filters.to ?? formatUtcDateKey(new Date());
    const resolvedFrom =
      filters.from ??
      (filters.days !== null
        ? formatUtcDateKey(addDays(parseDateInput(`${resolvedTo}T00:00:00`), -(filters.days - 1)))
        : null);

    if (
      (resolvedFrom && nextEntry.date < resolvedFrom) ||
      (resolvedTo && nextEntry.date > resolvedTo)
    ) {
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

const hasQueryKeyPrefix = (queryKey: QueryKey, prefix: QueryKey) =>
  prefix.every((segment, index) => queryKey[index] === segment);

const isLatestWeightCache = (
  cache: LogWeightCache | undefined,
  queryKey: QueryKey,
): cache is BodyWeightEntry | null | undefined =>
  hasQueryKeyPrefix(queryKey, weightQueryKeys.latest()) &&
  (cache === undefined ||
    cache === null ||
    (typeof cache === 'object' && !Array.isArray(cache) && 'createdAt' in cache));

const isWeightListCache = (
  cache: LogWeightCache | undefined,
  queryKey: QueryKey,
): cache is BodyWeightEntry[] | undefined =>
  hasQueryKeyPrefix(queryKey, weightQueryKeys.listRoot()) &&
  (cache === undefined ||
    (Array.isArray(cache) &&
      (cache.length === 0 || (typeof cache[0] === 'object' && cache[0] !== null && 'createdAt' in cache[0]))));

const isDashboardSnapshotCache = (
  cache: LogWeightCache | undefined,
  queryKey: QueryKey,
): cache is DashboardSnapshot | undefined =>
  hasQueryKeyPrefix(queryKey, dashboardSnapshotQueryKeys.all) &&
  (cache === undefined ||
    (typeof cache === 'object' &&
      cache !== null &&
      !Array.isArray(cache) &&
      'macros' in cache &&
      'habits' in cache));

const isDashboardWeightTrendCache = (
  cache: LogWeightCache | undefined,
  queryKey: QueryKey,
): cache is DashboardWeightTrendPoint[] | undefined =>
  hasQueryKeyPrefix(queryKey, dashboardWeightTrendQueryKeys.all) &&
  (cache === undefined ||
    (Array.isArray(cache) &&
      (cache.length === 0 || (typeof cache[0] === 'object' && cache[0] !== null && 'value' in cache[0]))));

const updateLogWeightCache = (
  current: LogWeightCache | undefined,
  nextEntry: BodyWeightEntry,
  queryKey: QueryKey,
) => {
  if (isLatestWeightCache(current, queryKey)) {
    return applyWeightEntryToLatestCache(current, nextEntry);
  }

  if (isWeightListCache(current, queryKey)) {
    return applyWeightEntryToListCache(current, nextEntry, queryKey);
  }

  if (isDashboardSnapshotCache(current, queryKey)) {
    return applyWeightEntryToDashboardSnapshot(current, nextEntry);
  }

  if (isDashboardWeightTrendCache(current, queryKey)) {
    return applyWeightEntryToDashboardTrend(current, nextEntry, queryKey);
  }

  return current;
};

export const useLatestWeight = () =>
  useQuery({
    queryKey: weightQueryKeys.latest(),
    queryFn: fetchLatestWeight,
  });

export const useWeightEntries = (filters: WeightListFilters = {}) =>
  useQuery({
    queryKey: weightQueryKeys.list(filters),
    queryFn: () => fetchWeightEntries(filters),
  });

export const usePaginatedWeightEntries = (
  filters: Required<Pick<WeightListFilters, 'limit' | 'page'>> & WeightListFilters,
) =>
  useQuery({
    queryKey: weightQueryKeys.page(filters),
    queryFn: () => fetchPaginatedWeightEntries(filters),
  });

export const useWeightTrend = (from?: string, to?: string) =>
  useWeightEntries({ from, to });

export const useLogWeight = () => {
  return createOptimisticMutation<
    LogWeightCache,
    BodyWeightEntry,
    CreateWeightInput,
    { optimisticEntry: BodyWeightEntry }
  >({
    mutationFn: postWeightEntry,
    getMeta: (variables) => ({
      optimisticEntry: {
        id: `optimistic-weight-${variables.date}`,
        date: variables.date,
        weight: variables.weight,
        notes: variables.notes ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    }),
    invalidateKeys: () => [weightQueryKeys.all, ...crossFeatureInvalidationMap.weightMutation()],
    onSuccess: async () => {
      toast.success('Weight logged');
    },
    queryKey: () => [
      weightQueryKeys.latest(),
      weightQueryKeys.trendRoot(),
      dashboardSnapshotQueryKeys.all,
      dashboardWeightTrendQueryKeys.all,
    ],
    reconcile: (current, entry, _variables, context) => updateLogWeightCache(current, entry, context.queryKey),
    updater: (current, _variables, context) =>
      updateLogWeightCache(current, context.meta.optimisticEntry, context.queryKey),
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
