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

export const foodKeys = {
  all: ['foods'] as const,
  list: (params?: Partial<FoodQueryParams>) =>
    params
      ? (['foods', 'list', normalizeListParams(params)] as const)
      : (['foods', 'list'] as const),
  detail: (id: string) => ['foods', 'detail', id] as const,
};
