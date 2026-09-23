import { useQuery } from '@tanstack/react-query';
import { planChangeProposalSchema } from '@pulse/shared';
import { apiRequest, ApiError } from '@/lib/api-client';

export const usePlanChangeProposal = (id: string) =>
  useQuery({
    queryKey: ['plan-change-proposal', id],
    queryFn: async ({ signal }) =>
      planChangeProposalSchema.parse(
        await apiRequest<unknown>(`/api/v1/plan-change-proposals/${encodeURIComponent(id)}`, {
          signal,
        }),
      ),
    enabled: Boolean(id),
    retry: (attempt, error) =>
      !(error instanceof ApiError && [400, 401, 404].includes(error.status)) && attempt < 2,
  });
