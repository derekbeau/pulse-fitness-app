import { useQuery } from '@tanstack/react-query';
import { dashboardMacrosTrendSchema, type DashboardMacrosTrendPoint } from '@pulse/shared';

import { apiRequest } from '@/lib/api-client';
import { addDays, getToday, parseDateInput, toDateKey } from '@/lib/date';

const DEFAULT_TREND_DAYS = 30;

export const macroTrendKeys = {
  all: ['dashboard', 'macro-trend'] as const,
  range: (from: string, to: string) => [...macroTrendKeys.all, from, to] as const,
};

const resolveDateRange = (from?: string, to?: string) => {
  const resolvedTo = to ?? toDateKey(getToday());
  const resolvedFrom = from ?? toDateKey(addDays(parseDateInput(resolvedTo), -(DEFAULT_TREND_DAYS - 1)));

  return {
    from: resolvedFrom,
    to: resolvedTo,
  };
};

const fetchMacroTrend = async (
  from?: string,
  to?: string,
  signal?: AbortSignal,
): Promise<DashboardMacrosTrendPoint[]> => {
  const range = resolveDateRange(from, to);
  const trend = await apiRequest<DashboardMacrosTrendPoint[]>(
    `/api/v1/dashboard/trends/macros?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
    {
      method: 'GET',
      signal,
    },
  );

  return dashboardMacrosTrendSchema.parse(trend);
};

export const useMacroTrend = (from?: string, to?: string) => {
  const range = resolveDateRange(from, to);

  return useQuery({
    queryFn: ({ signal }) => fetchMacroTrend(range.from, range.to, signal),
    queryKey: macroTrendKeys.range(range.from, range.to),
  });
};
