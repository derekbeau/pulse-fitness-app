import { useQuery } from '@tanstack/react-query';
import { dashboardWeightTrendSchema, type DashboardWeightTrendPoint } from '@pulse/shared';

import { apiRequest } from '@/lib/api-client';
import { addDays, getToday, parseDateInput, toDateKey } from '@/lib/date';

const DEFAULT_TREND_DAYS = 30;
const DEFAULT_QUERY_ENABLED = true;

export const dashboardWeightTrendQueryKeys = {
  all: ['dashboard', 'weight-trend'] as const,
  range: (from: string, to: string) => [...dashboardWeightTrendQueryKeys.all, from, to] as const,
};

const resolveDateRange = (from?: string, to?: string) => {
  const resolvedTo = to ?? toDateKey(getToday());
  const resolvedFrom =
    from ?? toDateKey(addDays(parseDateInput(resolvedTo), -(DEFAULT_TREND_DAYS - 1)));

  return {
    from: resolvedFrom,
    to: resolvedTo,
  };
};

const fetchWeightTrend = async (
  from?: string,
  to?: string,
  signal?: AbortSignal,
): Promise<DashboardWeightTrendPoint[]> => {
  const range = resolveDateRange(from, to);
  const trend = await apiRequest<DashboardWeightTrendPoint[]>(
    `/api/v1/dashboard/trends/weight?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
    {
      method: 'GET',
      signal,
    },
  );

  return dashboardWeightTrendSchema.parse(trend);
};

type WeightTrendQueryOptions = {
  enabled?: boolean;
  refetchIntervalMs?: number;
};

export const useWeightTrend = (
  from?: string,
  to?: string,
  options: WeightTrendQueryOptions = {},
) => {
  const range = resolveDateRange(from, to);
  const enabled = options.enabled ?? DEFAULT_QUERY_ENABLED;

  return useQuery({
    enabled,
    queryFn: ({ signal }) => fetchWeightTrend(range.from, range.to, signal),
    queryKey: dashboardWeightTrendQueryKeys.range(range.from, range.to),
    refetchInterval: options.refetchIntervalMs ?? false,
    refetchIntervalInBackground: false,
  });
};
