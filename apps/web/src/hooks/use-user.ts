import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userProfileSchema, type UserProfile, type UpdateUserInput } from '@pulse/shared';

import { apiRequest } from '@/lib/api-client';
import { weightQueryKeys } from '@/features/weight/api/weight';
import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { dashboardWeightTrendQueryKeys } from '@/hooks/use-weight-trend';
import { crossFeatureInvalidationMap, invalidateQueryKeys } from '@/lib/query-invalidation';

export const userQueryKeys = {
  all: ['user'] as const,
  current: () => [...userQueryKeys.all, 'current'] as const,
};

const fetchCurrentUser = async (signal?: AbortSignal): Promise<UserProfile> => {
  const user = await apiRequest<UserProfile>('/api/v1/users/me', {
    method: 'GET',
    signal,
  });

  return userProfileSchema.parse(user);
};

const patchCurrentUser = async (data: UpdateUserInput): Promise<UserProfile> => {
  const user = await apiRequest<UserProfile>('/api/v1/users/me', {
    body: data,
    method: 'PATCH',
  });

  return userProfileSchema.parse(user);
};

export const useUser = () =>
  useQuery({
    queryFn: ({ signal }) => fetchCurrentUser(signal),
    queryKey: userQueryKeys.current(),
  });

export const useUpdateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: patchCurrentUser,
    onSuccess: async (_user, input) => {
      await queryClient.invalidateQueries({ queryKey: userQueryKeys.all });

      if (input.weightUnit !== undefined) {
        // These API responses are already converted to the user's display unit. Remove the
        // inactive caches so returning to a weight surface cannot reuse values from the prior
        // preference; mounted queries will fetch normally on their next render.
        queryClient.removeQueries({ queryKey: weightQueryKeys.all });
        queryClient.removeQueries({ queryKey: dashboardSnapshotQueryKeys.all });
        queryClient.removeQueries({ queryKey: dashboardWeightTrendQueryKeys.all });
      }

      if (input.timeZone !== undefined) {
        await invalidateQueryKeys(
          queryClient,
          crossFeatureInvalidationMap.adaptiveProgramMutation(),
        );
      }
    },
  });
};
