import { useQuery } from '@tanstack/react-query';
import { planChangeProposalSchema, proposalApprovalStatementListSchema } from '@pulse/shared';
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

export const useProposalApprovalStatements = (id: string) =>
  useQuery({
    queryKey: ['plan-change-proposal', id, 'approval-statements'],
    queryFn: async ({ signal }) =>
      proposalApprovalStatementListSchema.parse(
        await apiRequest<unknown>(
          `/api/v1/plan-change-proposals/${encodeURIComponent(id)}/approval-statements`,
          { signal },
        ),
      ),
    enabled: Boolean(id),
    retry: (attempt, error) =>
      !(error instanceof ApiError && [400, 401, 404, 422].includes(error.status)) && attempt < 2,
  });
