import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userProfileSchema, type UserProfile, type UpdateUserInput } from '@pulse/shared';

import { apiRequest } from '@/lib/api-client';

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userQueryKeys.all });
    },
  });
};
