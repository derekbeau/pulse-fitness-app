import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { Food, FoodQueryParams, UpdateFoodInput } from '@pulse/shared';
import { toast } from 'sonner';
import { apiRequest, apiRequestWithMeta } from '@/lib/api-client';
import { foodQueryKeys } from './keys';

type FoodListResponse = {
  data: Food[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
};

type UseFoodsOptions = {
  enabled?: boolean;
};

function buildFoodsQueryString(params: FoodQueryParams) {
  const searchParams = new URLSearchParams();

  if (params.q) {
    searchParams.set('q', params.q);
  }
  if (params.tags && params.tags.length > 0) {
    searchParams.set('tags', params.tags.join(','));
  }

  searchParams.set('sort', params.sort);
  searchParams.set('page', String(params.page));
  searchParams.set('limit', String(params.limit));

  return searchParams.toString();
}

async function fetchFoods(params: FoodQueryParams, signal?: AbortSignal) {
  const query = buildFoodsQueryString(params);

  return apiRequestWithMeta<Food[], FoodListResponse['meta']>(`/api/v1/foods?${query}`, {
    method: 'GET',
    signal,
  });
}

async function putFood(id: string, updates: UpdateFoodInput) {
  return apiRequest<Food>(`/api/v1/foods/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

async function removeFood(id: string) {
  return apiRequest<{ success: true }>(`/api/v1/foods/${id}`, {
    method: 'DELETE',
  });
}

function patchFoodListCache(
  queryClient: QueryClient,
  updater: (current: FoodListResponse) => FoodListResponse,
) {
  const queries = queryClient.getQueriesData<FoodListResponse>({
    queryKey: foodQueryKeys.foods(),
  });

  queries.forEach(([queryKey, value]) => {
    if (!value) {
      return;
    }

    queryClient.setQueryData(queryKey, updater(value));
  });

  return queries;
}

export function useFoods(params: FoodQueryParams, options?: UseFoodsOptions) {
  return useQuery({
    queryKey: foodQueryKeys.foods(params),
    queryFn: ({ signal }) => fetchFoods(params, signal),
    enabled: options?.enabled,
    placeholderData: keepPreviousData,
  });
}

export function useUpdateFood() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateFoodInput }) => putFood(id, updates),
    onSuccess: async (updatedFood) => {
      patchFoodListCache(queryClient, (current) => ({
        ...current,
        data: current.data.map((food) => (food.id === updatedFood.id ? updatedFood : food)),
      }));

      queryClient.setQueryData(foodQueryKeys.food(updatedFood.id), updatedFood);
      await queryClient.invalidateQueries({
        queryKey: foodQueryKeys.foods(),
      });
      toast.success('Food updated');
    },
  });
}

export function useDeleteFood() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await removeFood(id);
      return id;
    },
    onMutate: async (foodId) => {
      await queryClient.cancelQueries({
        queryKey: foodQueryKeys.foods(),
      });

      const previousLists = queryClient.getQueriesData<FoodListResponse>({
        queryKey: foodQueryKeys.foods(),
      });

      previousLists.forEach(([queryKey, value]) => {
        if (!value) {
          return;
        }

        queryClient.setQueryData<FoodListResponse>(queryKey, {
          ...value,
          data: value.data.filter((food) => food.id !== foodId),
          meta: {
            ...value.meta,
            total: Math.max(0, value.meta.total - 1),
          },
        });
      });

      queryClient.removeQueries({
        queryKey: foodQueryKeys.food(foodId),
      });

      return {
        previousLists,
      };
    },
    onError: (_error, _foodId, context) => {
      context?.previousLists.forEach(([queryKey, value]) => {
        queryClient.setQueryData(queryKey as QueryKey, value);
      });
    },
    onSuccess: () => {
      toast.success('Food deleted');
    },
    onSettled: (_data, _error, foodId) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: foodQueryKeys.foods(),
        }),
        queryClient.invalidateQueries({
          queryKey: foodQueryKeys.food(foodId),
        }),
      ]),
  });
}

export type { FoodListResponse };
