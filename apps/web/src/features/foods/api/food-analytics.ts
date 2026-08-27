import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  foodAnalyticsDetailSchema,
  foodAnalyticsResponseSchema,
  type FoodAnalyticsDetailQuery,
  type FoodAnalyticsQuery,
} from '@pulse/shared';

import { apiRequest, apiRequestWithMeta } from '@/lib/api-client';

import { foodQueryKeys } from './keys';

const appendQueryValue = (search: URLSearchParams, key: string, value: unknown) => {
  if (value === undefined || value === null || value === '') return;
  if (Array.isArray(value)) {
    if (value.length > 0) search.set(key, value.join(','));
    return;
  }
  search.set(key, String(value));
};

const buildQuery = (params: FoodAnalyticsQuery | FoodAnalyticsDetailQuery) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => appendQueryValue(search, key, value));
  return search.toString();
};

export const fetchFoodAnalytics = async (params: FoodAnalyticsQuery, signal?: AbortSignal) => {
  const response = await apiRequestWithMeta<unknown, unknown>(
    `/api/v1/foods/analytics?${buildQuery(params)}`,
    { method: 'GET', signal },
  );
  return foodAnalyticsResponseSchema.parse(response);
};

export const fetchFoodAnalyticsDetail = async (
  foodId: string,
  params: FoodAnalyticsDetailQuery,
  signal?: AbortSignal,
) => {
  const response = await apiRequest<unknown>(
    `/api/v1/foods/${foodId}/analytics?${buildQuery(params)}`,
    { method: 'GET', signal },
  );
  return foodAnalyticsDetailSchema.parse(response);
};

export function useFoodAnalytics(params: FoodAnalyticsQuery) {
  return useQuery({
    queryKey: foodQueryKeys.analytics(params),
    queryFn: ({ signal }) => fetchFoodAnalytics(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useFoodAnalyticsDetail(foodId: string | null, params: FoodAnalyticsDetailQuery) {
  return useQuery({
    queryKey: foodQueryKeys.analyticsDetail(foodId ?? 'none', params),
    queryFn: ({ signal }) => {
      if (foodId === null) throw new Error('Food analytics detail requires a food ID');
      return fetchFoodAnalyticsDetail(foodId, params, signal);
    },
    enabled: foodId !== null,
  });
}
