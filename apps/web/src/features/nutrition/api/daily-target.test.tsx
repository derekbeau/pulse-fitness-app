import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { createQueryClientWrapper } from '@/test/query-client';

import { usePatchDailyNutritionTarget, useRestoreDailyNutritionTarget } from './daily-target';
import { nutritionQueryKeys } from './keys';

const mockFetch = vi.fn();
const date = '2026-03-09';
const resolved = {
  date,
  timeZone: 'America/Detroit',
  baseline: null,
  override: null,
  effective: null,
  adjusted: false,
  overriddenFields: [],
};

const response = () =>
  new Response(JSON.stringify({ data: resolved }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });

describe('daily nutrition target hooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('sends partial patches and invalidates only selected-date consumers', async () => {
    mockFetch.mockResolvedValueOnce(response());
    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => usePatchDailyNutritionTarget(), { wrapper });

    await act(() =>
      result.current.mutateAsync({ date, input: { calories: 2_500, protein: null } }),
    );

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/v1/nutrition/${date}/target-override`,
      expect.objectContaining({
        body: JSON.stringify({ calories: 2_500, protein: null }),
        method: 'PATCH',
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: nutritionQueryKeys.targetOverride(date) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: nutritionQueryKeys.summary(date) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: nutritionQueryKeys.energyAdherence(date) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: nutritionQueryKeys.weekSummary(date) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: dashboardSnapshotQueryKeys.detail(date) });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: dashboardSnapshotQueryKeys.all });
  });

  it('uses idempotent delete for baseline restoration', async () => {
    mockFetch.mockResolvedValueOnce(response());
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useRestoreDailyNutritionTarget(), { wrapper });

    await act(() => result.current.mutateAsync(date));

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/v1/nutrition/${date}/target-override`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
