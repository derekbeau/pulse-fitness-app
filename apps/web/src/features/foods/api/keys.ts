import type { FoodQueryParams } from '@pulse/shared';

function normalizeListParams(params?: Partial<FoodQueryParams>) {
  return {
    limit: params?.limit ?? null,
    page: params?.page ?? null,
    q: params?.q ?? null,
    sort: params?.sort ?? null,
    tags: params?.tags?.join('|') ?? null,
  };
}

export const foodQueryKeys = {
  all: ['foods'] as const,
  food: (id: string) => ['foods', 'food', id] as const,
  foods: (params?: Partial<FoodQueryParams>) =>
    params
      ? (['foods', 'list', normalizeListParams(params)] as const)
      : (['foods', 'list'] as const),
  detail: (id: string) => ['foods', 'detail', id] as const,
  list: (params?: Partial<FoodQueryParams>) =>
    params
      ? (['foods', 'list', normalizeListParams(params)] as const)
      : (['foods', 'list'] as const),
};

export const foodKeys = {
  all: foodQueryKeys.all,
  detail: foodQueryKeys.detail,
  food: foodQueryKeys.food,
  foods: foodQueryKeys.foods,
  list: foodQueryKeys.list,
};
