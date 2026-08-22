import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  adaptiveAcceptResultSchema,
  adaptiveCheckInDetailSchema,
  adaptiveCheckInSummarySchema,
  adaptiveCurrentGoalSchema,
  adaptiveGoalDetailSchema,
  adaptiveGoalHistorySummarySchema,
  adaptiveGoalTrajectorySchema,
  adaptiveNutritionStateSchema,
  energyBalanceAnalyticsSchema,
  adaptiveProgramSchema,
  adaptiveWeeklyReviewPendingSchema,
  adaptiveWeeklyReviewSchema,
  apiMetaSchema,
  type AdaptiveAcceptInput,
  type AdaptiveGoalCompleteInput,
  type AdaptiveGoalEditInput,
  type AdaptiveGoalStartInput,
  type AdaptiveGoalTrajectoryQuery,
  type AdaptivePreviewInput,
  type AdaptiveProgramMutation,
  type AdaptiveReviewActionInput,
  type AdaptiveWeeklyReviewPreviewInput,
  type EnergyBalanceAnalyticsQuery,
} from '@pulse/shared';
import { toast } from 'sonner';

import { apiRequest, apiRequestWithMeta } from '@/lib/api-client';
import { crossFeatureInvalidationMap, invalidateQueryKeys } from '@/lib/query-invalidation';

import { adaptiveNutritionQueryKeys } from './keys';

const fetchAdaptiveNutritionState = (signal?: AbortSignal) =>
  apiRequest<unknown>('/api/v1/adaptive-nutrition', { signal }).then((value) =>
    adaptiveNutritionStateSchema.parse(value),
  );

const fetchAdaptiveEnergyBalance = (query: EnergyBalanceAnalyticsQuery, signal?: AbortSignal) => {
  const params = new URLSearchParams({ aggregation: query.aggregation, range: query.range });
  if (query.end) params.set('end', query.end);
  return apiRequest<unknown>(`/api/v1/adaptive-nutrition/analytics?${params.toString()}`, {
    signal,
  }).then((value) => energyBalanceAnalyticsSchema.parse(value));
};

const fetchPendingAdaptiveWeeklyReview = (signal?: AbortSignal) =>
  apiRequest<unknown>('/api/v1/adaptive-nutrition/reviews/pending', { signal }).then((value) =>
    adaptiveWeeklyReviewPendingSchema.parse(value),
  );

const fetchAdaptiveWeeklyReview = (id: string, signal?: AbortSignal) =>
  apiRequest<unknown>(`/api/v1/adaptive-nutrition/reviews/${id}`, { signal }).then((value) =>
    adaptiveWeeklyReviewSchema.parse(value),
  );

const fetchAdaptiveWeeklyReviewHistory = async (
  page: number,
  limit: number,
  signal?: AbortSignal,
) => {
  const response = await apiRequestWithMeta<unknown, unknown>(
    `/api/v1/adaptive-nutrition/reviews?page=${page}&limit=${limit}`,
    { signal },
  );
  return {
    data: adaptiveWeeklyReviewSchema.array().parse(response.data),
    meta: apiMetaSchema.parse(response.meta),
  };
};

const previewAdaptiveWeeklyReview = (input: AdaptiveWeeklyReviewPreviewInput) =>
  apiRequest<unknown>('/api/v1/adaptive-nutrition/reviews/preview', {
    body: input,
    method: 'POST',
  }).then((value) => adaptiveWeeklyReviewSchema.parse(value));

const refreshAdaptiveWeeklyReview = (id: string) =>
  apiRequest<unknown>(`/api/v1/adaptive-nutrition/reviews/${id}/refresh`, {
    method: 'POST',
  }).then((value) => adaptiveWeeklyReviewSchema.parse(value));

const actOnAdaptiveWeeklyReview = ({
  id,
  input,
}: {
  id: string;
  input: AdaptiveReviewActionInput;
}) =>
  apiRequest<unknown>(`/api/v1/adaptive-nutrition/reviews/${id}/actions`, {
    body: input,
    method: 'POST',
  }).then((value) => adaptiveWeeklyReviewSchema.parse(value));

const putAdaptiveNutritionProgram = (input: AdaptiveProgramMutation) =>
  apiRequest<unknown>('/api/v1/adaptive-nutrition/program', {
    body: input,
    method: 'PUT',
  }).then((value) => adaptiveProgramSchema.parse(value));

const previewAdaptiveNutritionCheckIn = (input: AdaptivePreviewInput) =>
  apiRequest<unknown>('/api/v1/adaptive-nutrition/check-ins/preview', {
    body: input,
    method: 'POST',
  }).then((value) => adaptiveCheckInDetailSchema.parse(value));

const acceptAdaptiveNutritionCheckIn = ({
  id,
  input,
}: {
  id: string;
  input: AdaptiveAcceptInput;
}) =>
  apiRequest<unknown>(`/api/v1/adaptive-nutrition/check-ins/${id}/accept`, {
    body: input,
    method: 'POST',
  }).then((value) => adaptiveAcceptResultSchema.parse(value));

const declineAdaptiveNutritionCheckIn = (id: string) =>
  apiRequest<unknown>(`/api/v1/adaptive-nutrition/check-ins/${id}/decline`, {
    method: 'POST',
  }).then((value) => adaptiveCheckInDetailSchema.parse(value));

const editAdaptiveGoal = ({ id, input }: { id: string; input: AdaptiveGoalEditInput }) =>
  apiRequest<unknown>(`/api/v1/adaptive-nutrition/goals/${id}`, {
    body: input,
    method: 'PATCH',
  }).then((value) => adaptiveCurrentGoalSchema.parse(value));

const startAdaptiveGoal = (input: AdaptiveGoalStartInput) =>
  apiRequest<unknown>('/api/v1/adaptive-nutrition/goals', {
    body: input,
    method: 'POST',
  }).then((value) => adaptiveCurrentGoalSchema.parse(value));

const completeAdaptiveGoal = ({ id, input }: { id: string; input: AdaptiveGoalCompleteInput }) =>
  apiRequest<unknown>(`/api/v1/adaptive-nutrition/goals/${id}/complete`, {
    body: input,
    method: 'POST',
  }).then((value) => adaptiveCurrentGoalSchema.parse(value));

const fetchAdaptiveGoalHistory = async (page: number, limit: number, signal?: AbortSignal) => {
  const response = await apiRequestWithMeta<unknown, unknown>(
    `/api/v1/adaptive-nutrition/goals?page=${page}&limit=${limit}`,
    { signal },
  );
  return {
    data: adaptiveGoalHistorySummarySchema.array().parse(response.data),
    meta: apiMetaSchema.parse(response.meta),
  };
};

const fetchAdaptiveGoalDetail = (id: string, signal?: AbortSignal) =>
  apiRequest<unknown>(`/api/v1/adaptive-nutrition/goals/${id}`, { signal }).then((value) =>
    adaptiveGoalDetailSchema.parse(value),
  );

const fetchAdaptiveGoalTrajectory = (
  id: string,
  query: AdaptiveGoalTrajectoryQuery,
  signal?: AbortSignal,
) => {
  const params = new URLSearchParams({
    lookbackDays: String(query.lookbackDays),
    range: query.range,
  });
  if (query.end) params.set('end', query.end);
  return apiRequest<unknown>(
    `/api/v1/adaptive-nutrition/goals/${id}/trajectory?${params.toString()}`,
    { signal },
  ).then((value) => adaptiveGoalTrajectorySchema.parse(value));
};

const fetchAdaptiveNutritionHistory = async (page: number, limit: number, signal?: AbortSignal) => {
  const response = await apiRequestWithMeta<unknown, unknown>(
    `/api/v1/adaptive-nutrition/check-ins?page=${page}&limit=${limit}`,
    { signal },
  );

  return {
    data: adaptiveCheckInSummarySchema.array().parse(response.data),
    meta: apiMetaSchema.parse(response.meta),
  };
};

const fetchAdaptiveNutritionCheckIn = (id: string, signal?: AbortSignal) =>
  apiRequest<unknown>(`/api/v1/adaptive-nutrition/check-ins/${id}`, { signal }).then((value) =>
    adaptiveCheckInDetailSchema.parse(value),
  );

export const useAdaptiveNutritionState = () =>
  useQuery({
    queryKey: adaptiveNutritionQueryKeys.state(),
    queryFn: ({ signal }) => fetchAdaptiveNutritionState(signal),
  });

export const useAdaptiveEnergyBalance = (query: EnergyBalanceAnalyticsQuery) =>
  useQuery({
    queryKey: adaptiveNutritionQueryKeys.analytics(query.range, query.end, query.aggregation),
    queryFn: ({ signal }) => fetchAdaptiveEnergyBalance(query, signal),
    placeholderData: keepPreviousData,
  });

export const usePendingAdaptiveWeeklyReview = () =>
  useQuery({
    queryKey: adaptiveNutritionQueryKeys.pendingReview(),
    queryFn: ({ signal }) => fetchPendingAdaptiveWeeklyReview(signal),
  });

export const useAdaptiveWeeklyReview = (id: string | null, enabled = true) =>
  useQuery({
    enabled: enabled && id !== null,
    queryKey: adaptiveNutritionQueryKeys.reviewDetail(id ?? 'none'),
    queryFn: ({ signal }) => fetchAdaptiveWeeklyReview(id ?? '', signal),
  });

export const useAdaptiveWeeklyReviewHistory = (page = 1, limit = 20) =>
  useQuery({
    queryKey: adaptiveNutritionQueryKeys.reviewHistory(page, limit),
    queryFn: ({ signal }) => fetchAdaptiveWeeklyReviewHistory(page, limit, signal),
  });

export const useAdaptiveNutritionHistory = (page = 1, limit = 20) =>
  useQuery({
    queryKey: adaptiveNutritionQueryKeys.history(page, limit),
    queryFn: ({ signal }) => fetchAdaptiveNutritionHistory(page, limit, signal),
  });

export const useAdaptiveNutritionCheckIn = (id: string | null, enabled = true) =>
  useQuery({
    enabled: enabled && id !== null,
    queryKey: adaptiveNutritionQueryKeys.detail(id ?? 'none'),
    queryFn: ({ signal }) => fetchAdaptiveNutritionCheckIn(id ?? '', signal),
  });

export const useAdaptiveGoalHistory = (page = 1, limit = 20) =>
  useQuery({
    queryKey: adaptiveNutritionQueryKeys.goalHistory(page, limit),
    queryFn: ({ signal }) => fetchAdaptiveGoalHistory(page, limit, signal),
  });

export const useInfiniteAdaptiveGoalHistory = (limit = 20) =>
  useInfiniteQuery({
    queryKey: adaptiveNutritionQueryKeys.goalHistoryInfinite(limit),
    queryFn: ({ pageParam, signal }) => fetchAdaptiveGoalHistory(pageParam, limit, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.page * lastPage.meta.limit < lastPage.meta.total
        ? lastPage.meta.page + 1
        : undefined,
  });

export const useAdaptiveGoalDetail = (id: string | null, enabled = true) =>
  useQuery({
    enabled: enabled && id !== null,
    queryKey: adaptiveNutritionQueryKeys.goalDetail(id ?? 'none'),
    queryFn: ({ signal }) => fetchAdaptiveGoalDetail(id ?? '', signal),
  });

export const useAdaptiveGoalTrajectory = (id: string, query: AdaptiveGoalTrajectoryQuery) =>
  useQuery({
    queryKey: adaptiveNutritionQueryKeys.goalTrajectory(
      id,
      query.range,
      query.lookbackDays,
      query.end,
    ),
    queryFn: ({ signal }) => fetchAdaptiveGoalTrajectory(id, query, signal),
    placeholderData: keepPreviousData,
  });

export const usePutAdaptiveNutritionProgram = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: putAdaptiveNutritionProgram,
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, crossFeatureInvalidationMap.adaptiveProgramMutation());
      toast.success('Nutrition coaching program created');
    },
  });
};

export const usePreviewAdaptiveNutritionCheckIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: previewAdaptiveNutritionCheckIn,
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, crossFeatureInvalidationMap.adaptivePreviewMutation());
    },
  });
};

export const usePreviewAdaptiveWeeklyReview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: previewAdaptiveWeeklyReview,
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, crossFeatureInvalidationMap.adaptivePreviewMutation());
      toast.success('Weekly decision review prepared');
    },
  });
};

export const useRefreshAdaptiveWeeklyReview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: refreshAdaptiveWeeklyReview,
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [adaptiveNutritionQueryKeys.all]);
      toast.success('Weekly review refreshed');
    },
  });
};

export const useAdaptiveWeeklyReviewAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: actOnAdaptiveWeeklyReview,
    onSuccess: async (_review, variables) => {
      await invalidateQueryKeys(
        queryClient,
        ['accept', 'edit'].includes(variables.input.type)
          ? crossFeatureInvalidationMap.adaptiveResolutionMutation()
          : [adaptiveNutritionQueryKeys.all],
      );
      const message =
        variables.input.type === 'accept'
          ? 'Weekly decision applied'
          : variables.input.type === 'decline'
            ? 'Current plan kept'
            : variables.input.type === 'defer'
              ? 'Review deferred'
              : variables.input.type === 'edit'
                ? 'Edited proposal saved for review'
                : 'Question saved for your connected agent';
      toast.success(message);
    },
  });
};

export const useAcceptAdaptiveNutritionCheckIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: acceptAdaptiveNutritionCheckIn,
    onSuccess: async () => {
      await invalidateQueryKeys(
        queryClient,
        crossFeatureInvalidationMap.adaptiveResolutionMutation(),
      );
      toast.success('Adaptive targets accepted');
    },
  });
};

export const useDeclineAdaptiveNutritionCheckIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: declineAdaptiveNutritionCheckIn,
    onSuccess: async () => {
      await invalidateQueryKeys(
        queryClient,
        crossFeatureInvalidationMap.adaptiveResolutionMutation(),
      );
      toast.success('Current targets kept');
    },
  });
};

export const useEditAdaptiveGoal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: editAdaptiveGoal,
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, crossFeatureInvalidationMap.adaptiveGoalMutation());
      toast.success('Goal updated');
    },
  });
};

export const useStartAdaptiveGoal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: startAdaptiveGoal,
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, crossFeatureInvalidationMap.adaptiveGoalMutation());
      toast.success('New goal started');
    },
  });
};

export const useCompleteAdaptiveGoal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: completeAdaptiveGoal,
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, crossFeatureInvalidationMap.adaptiveGoalMutation());
      toast.success('Goal completed; maintenance started');
    },
  });
};
