import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api-client';

export type AgentTokenListItem = {
  id: string;
  name: string;
  lastUsedAt: number | null;
  createdAt: number;
};

type CreateAgentTokenResponse = {
  id: string;
  name: string;
  token: string;
};

type RegenerateTokenResponse = {
  token: string;
};

export const agentTokenKeys = {
  all: ['agent-tokens'] as const,
  list: () => [...agentTokenKeys.all, 'list'] as const,
};

const fetchAgentTokens = async (signal?: AbortSignal): Promise<AgentTokenListItem[]> => {
  return apiRequest<AgentTokenListItem[]>('/api/v1/agent-tokens', {
    method: 'GET',
    signal,
  });
};

const createAgentToken = async (name: string): Promise<CreateAgentTokenResponse> => {
  return apiRequest<CreateAgentTokenResponse>('/api/v1/agent-tokens', {
    method: 'POST',
    body: { name },
  });
};

const regenerateAgentToken = async (id: string): Promise<RegenerateTokenResponse> => {
  return apiRequest<RegenerateTokenResponse>(`/api/v1/agent-tokens/${id}/regenerate`, {
    method: 'POST',
  });
};

const deleteAgentToken = async (id: string): Promise<{ success: boolean }> => {
  return apiRequest<{ success: boolean }>(`/api/v1/agent-tokens/${id}`, {
    method: 'DELETE',
  });
};

export const useAgentTokens = () =>
  useQuery({
    queryFn: ({ signal }) => fetchAgentTokens(signal),
    queryKey: agentTokenKeys.list(),
  });

export const useCreateAgentToken = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createAgentToken,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agentTokenKeys.all });
    },
  });
};

export const useRegenerateAgentToken = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: regenerateAgentToken,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agentTokenKeys.all });
    },
  });
};

export const useDeleteAgentToken = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteAgentToken,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agentTokenKeys.all });
    },
  });
};
