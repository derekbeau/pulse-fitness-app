import { useQuery } from '@tanstack/react-query';
import { dashboardSnapshotSchema, type DashboardSnapshot } from '@pulse/shared';

import { apiRequest } from '@/lib/api-client';

export const dashboardSnapshotKeys = {
  all: ['dashboard', 'snapshot'] as const,
  detail: (date: string) => [...dashboardSnapshotKeys.all, date] as const,
};

const fetchDashboardSnapshot = async (
  date: string,
  signal?: AbortSignal,
): Promise<DashboardSnapshot> => {
  const snapshot = await apiRequest<DashboardSnapshot>(
    `/api/v1/dashboard/snapshot?date=${encodeURIComponent(date)}`,
    {
      method: 'GET',
      signal,
    },
  );

  return dashboardSnapshotSchema.parse(snapshot);
};

export const useDashboardSnapshot = (date: string) =>
  useQuery({
    enabled: date.length > 0,
    queryFn: ({ signal }) => fetchDashboardSnapshot(date, signal),
    queryKey: dashboardSnapshotKeys.detail(date),
  });
