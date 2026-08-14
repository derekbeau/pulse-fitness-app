import { adaptiveNutritionQueryKey } from '@/lib/query-invalidation';

const normalizeHistoryFilters = (page: number, limit: number) => ({ limit, page });

export const adaptiveNutritionQueryKeys = {
  all: adaptiveNutritionQueryKey,
  state: () => [...adaptiveNutritionQueryKey, 'state'] as const,
  checkIns: () => [...adaptiveNutritionQueryKey, 'check-ins'] as const,
  history: (page: number, limit: number) =>
    [...adaptiveNutritionQueryKey, 'check-ins', normalizeHistoryFilters(page, limit)] as const,
  detail: (id: string) => [...adaptiveNutritionQueryKey, 'check-ins', 'detail', id] as const,
  goals: () => [...adaptiveNutritionQueryKey, 'goals'] as const,
  goalHistory: (page: number, limit: number) =>
    [...adaptiveNutritionQueryKey, 'goals', normalizeHistoryFilters(page, limit)] as const,
  goalHistoryInfinite: (limit: number) =>
    [...adaptiveNutritionQueryKey, 'goals', 'infinite', { limit }] as const,
  goalDetail: (id: string) => [...adaptiveNutritionQueryKey, 'goals', 'detail', id] as const,
};
