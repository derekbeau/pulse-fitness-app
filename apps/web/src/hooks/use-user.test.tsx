import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { weightQueryKeys } from '@/features/weight/api/weight';
import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { dashboardWeightTrendQueryKeys } from '@/hooks/use-weight-trend';
import { createQueryClientWrapper } from '@/test/query-client';

import { useUpdateUser, userQueryKeys } from './use-user';

describe('useUpdateUser', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes every display-unit-dependent cache after a preference change', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            id: 'user-1',
            username: 'derek',
            name: 'Derek',
            weightUnit: 'kg',
            createdAt: 1,
            updatedAt: 2,
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const removeQueries = vi.spyOn(queryClient, 'removeQueries');
    const { result } = renderHook(() => useUpdateUser(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ weightUnit: 'kg' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: userQueryKeys.all });
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: weightQueryKeys.all });
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: dashboardSnapshotQueryKeys.all });
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: dashboardWeightTrendQueryKeys.all });
  });
});
