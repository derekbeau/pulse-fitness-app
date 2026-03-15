import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardConfigSchema, type DashboardConfig } from '@pulse/shared';

import { apiRequest } from '@/lib/api-client';

export const dashboardConfigQueryKeys = {
  all: ['dashboard', 'config'] as const,
  detail: () => [...dashboardConfigQueryKeys.all, 'current'] as const,
};

const fetchDashboardConfig = async (signal?: AbortSignal): Promise<DashboardConfig> => {
  const config = await apiRequest<DashboardConfig>('/api/v1/dashboard/config', {
    method: 'GET',
    signal,
  });

  return dashboardConfigSchema.parse(config);
};

const putDashboardConfig = async (config: DashboardConfig): Promise<DashboardConfig> => {
  const payload = dashboardConfigSchema.parse(config);
  const saved = await apiRequest<DashboardConfig>('/api/v1/dashboard/config', {
    body: payload,
    method: 'PUT',
  });

  return dashboardConfigSchema.parse(saved);
};

export const useDashboardConfig = () =>
  useQuery({
    queryFn: ({ signal }) => fetchDashboardConfig(signal),
    queryKey: dashboardConfigQueryKeys.detail(),
  });

export const useSaveDashboardConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: putDashboardConfig,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dashboardConfigQueryKeys.all });
    },
  });
};
