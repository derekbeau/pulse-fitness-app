import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { habitQueryKeys } from '@/features/habits/api/keys';
import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { habitChainQueryKeys } from '@/hooks/use-habit-chains';
import { dashboardWeightTrendQueryKeys } from '@/hooks/use-weight-trend';
import { createQueryClientWrapper } from '@/test/query-client';

import {
  useDeleteWeight,
  usePaginatedWeightEntries,
  useWeightEntries,
  useLatestWeight,
  useLogWeight,
  useUpdateWeight,
  useWeightTrend,
  weightQueryKeys,
} from './weight';

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status: 200,
  });

function createDeferredPromise<T>() {
  let resolveDeferred: ((value: T | PromiseLike<T>) => void) | undefined;
  let rejectDeferred: ((reason?: unknown) => void) | undefined;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolveDeferred = resolvePromise;
    rejectDeferred = rejectPromise;
  });

  return {
    promise,
    reject: (reason?: unknown) => {
      if (!rejectDeferred) {
        throw new Error('Deferred reject handler was not initialized');
      }

      rejectDeferred(reason);
    },
    resolve: (value: T | PromiseLike<T>) => {
      if (!resolveDeferred) {
        throw new Error('Deferred resolve handler was not initialized');
      }

      resolveDeferred(value);
    },
  };
}

describe('weight api hooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('loads the latest body weight entry', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        id: 'weight-1',
        date: '2026-03-07',
        weight: 181.4,
        notes: 'Fasted',
        createdAt: 1,
        updatedAt: 1,
      }),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useLatestWeight(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.weight).toBe(181.4);
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/weight/latest', expect.any(Object));
  });

  it('loads the weight trend with the requested date range', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse([
        {
          id: 'weight-1',
          date: '2026-03-01',
          weight: 182.1,
          notes: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useWeightTrend('2026-03-01', '2026-03-07'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/weight?from=2026-03-01&to=2026-03-07',
      expect.any(Object),
    );
  });

  it('loads weight entries with general list filters', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse([
        {
          id: 'weight-1',
          date: '2026-03-07',
          weight: 181.4,
          notes: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useWeightEntries({ days: 30 }), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/weight?days=30', expect.any(Object));
  });

  it('loads paginated weight entries when page params are supplied', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'weight-1',
              date: '2026-03-07',
              weight: 181.4,
              notes: null,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          meta: {
            page: 2,
            limit: 10,
            total: 11,
          },
        }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 200,
        },
      ),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePaginatedWeightEntries({ page: 2, limit: 10 }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.meta).toEqual({
      page: 2,
      limit: 10,
      total: 11,
    });
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/weight?page=2&limit=10', expect.any(Object));
  });

  it('optimistically logs a weight entry, updates dashboard caches, and invalidates weight queries', async () => {
    const deferred = createDeferredPromise<Response>();

    const { queryClient, wrapper } = createQueryClientWrapper();
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries');
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(weightQueryKeys.latest(), {
      id: 'weight-1',
      date: '2026-03-06',
      weight: 181.4,
      notes: null,
      createdAt: 1,
      updatedAt: 1,
    });
    queryClient.setQueryData(weightQueryKeys.trend({ from: '2026-03-01', to: '2026-03-07' }), [
      {
        id: 'weight-1',
        date: '2026-03-06',
        weight: 181.4,
        notes: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    queryClient.setQueryData(dashboardSnapshotQueryKeys.detail('2026-03-07'), {
      date: '2026-03-07',
      weight: null,
      macros: {
        actual: { calories: 0, carbs: 0, fat: 0, protein: 0 },
        target: { calories: 0, carbs: 0, fat: 0, protein: 0 },
      },
      workout: null,
      habits: {
        completed: 0,
        percentage: 0,
        total: 0,
      },
    });
    queryClient.setQueryData(dashboardWeightTrendQueryKeys.range('2026-03-01', '2026-03-07'), [
      {
        date: '2026-03-06',
        value: 181.4,
      },
    ]);
    mockFetch.mockImplementationOnce(() => deferred.promise);

    const { result } = renderHook(() => useLogWeight(), { wrapper });

    act(() => {
      result.current.mutate({
        date: '2026-03-07',
        weight: 180.8,
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(weightQueryKeys.latest())).toEqual(
        expect.objectContaining({
          date: '2026-03-07',
          weight: 180.8,
        }),
      );
      expect(
        queryClient.getQueryData(weightQueryKeys.trend({ from: '2026-03-01', to: '2026-03-07' })),
      ).toEqual([
        expect.objectContaining({
          date: '2026-03-06',
          id: 'weight-1',
        }),
        expect.objectContaining({
          date: '2026-03-07',
          weight: 180.8,
        }),
      ]);
      expect(queryClient.getQueryData(dashboardSnapshotQueryKeys.detail('2026-03-07'))).toEqual(
        expect.objectContaining({
          weight: {
            date: '2026-03-07',
            unit: 'lb',
            value: 180.8,
            trendValue: null,
          },
        }),
      );
      expect(
        queryClient.getQueryData(dashboardWeightTrendQueryKeys.range('2026-03-01', '2026-03-07')),
      ).toEqual([
        {
          date: '2026-03-06',
          value: 181.4,
        },
        {
          date: '2026-03-07',
          value: 180.8,
        },
      ]);
    });

    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: weightQueryKeys.latest() });
    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: weightQueryKeys.trendRoot() });
    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: dashboardSnapshotQueryKeys.all });
    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: dashboardWeightTrendQueryKeys.all });

    await act(async () => {
      deferred.resolve(
        createJsonResponse({
          id: 'weight-2',
          date: '2026-03-07',
          weight: 180.8,
          notes: null,
          createdAt: 1,
          updatedAt: 2,
        }),
      );
      await deferred.promise;
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/weight',
      expect.objectContaining({
        body: JSON.stringify({
          date: '2026-03-07',
          weight: 180.8,
        }),
        method: 'POST',
      }),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: weightQueryKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: dashboardSnapshotQueryKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dashboardWeightTrendQueryKeys.all,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: habitQueryKeys.list() });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: habitQueryKeys.entryList() });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: habitChainQueryKeys.all });
    expect(toast.success).toHaveBeenCalledWith('Weight logged');
  });

  it('rolls back an optimistic weight entry when logging fails', async () => {
    const deferred = createDeferredPromise<Response>();
    void deferred.promise.catch(() => undefined);

    const { queryClient, wrapper } = createQueryClientWrapper();
    const initialTrend = [
      {
        id: 'weight-1',
        date: '2026-03-06',
        weight: 181.4,
        notes: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    queryClient.setQueryData(weightQueryKeys.latest(), initialTrend[0]);
    queryClient.setQueryData(
      weightQueryKeys.trend({ from: '2026-03-01', to: '2026-03-07' }),
      initialTrend,
    );
    queryClient.setQueryData(dashboardSnapshotQueryKeys.detail('2026-03-07'), {
      date: '2026-03-07',
      weight: null,
      macros: {
        actual: { calories: 0, carbs: 0, fat: 0, protein: 0 },
        target: { calories: 0, carbs: 0, fat: 0, protein: 0 },
      },
      workout: null,
      habits: {
        completed: 0,
        percentage: 0,
        total: 0,
      },
    });
    queryClient.setQueryData(dashboardWeightTrendQueryKeys.range('2026-03-01', '2026-03-07'), [
      {
        date: '2026-03-06',
        value: 181.4,
      },
    ]);
    mockFetch.mockImplementationOnce(() => deferred.promise);

    const { result } = renderHook(() => useLogWeight(), { wrapper });

    act(() => {
      result.current.mutate({
        date: '2026-03-07',
        weight: 180.8,
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(weightQueryKeys.latest())).toEqual(
        expect.objectContaining({
          date: '2026-03-07',
          weight: 180.8,
        }),
      );
    });

    act(() => {
      deferred.reject(new Error('log failed'));
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(weightQueryKeys.latest())).toEqual(initialTrend[0]);
      expect(
        queryClient.getQueryData(weightQueryKeys.trend({ from: '2026-03-01', to: '2026-03-07' })),
      ).toEqual(initialTrend);
      expect(queryClient.getQueryData(dashboardSnapshotQueryKeys.detail('2026-03-07'))).toEqual(
        expect.objectContaining({
          weight: null,
        }),
      );
      expect(
        queryClient.getQueryData(dashboardWeightTrendQueryKeys.range('2026-03-01', '2026-03-07')),
      ).toEqual([
        {
          date: '2026-03-06',
          value: 181.4,
        },
      ]);
    });
  });

  it('deletes a weight entry and invalidates weight queries', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        deleted: true,
        id: 'weight-2',
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteWeight(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('weight-2');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/weight/weight-2',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: weightQueryKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: dashboardSnapshotQueryKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dashboardWeightTrendQueryKeys.all,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: habitQueryKeys.list() });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: habitQueryKeys.entryList() });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: habitChainQueryKeys.all });
  });

  it('shows a specific error toast when deleting a weight entry fails', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'WEIGHT_NOT_FOUND',
            message: 'Weight entry not found',
          },
        }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 404,
        },
      ),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useDeleteWeight(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync('missing-weight')).rejects.toThrow(
        'Weight entry not found',
      );
    });

    expect(toast.error).toHaveBeenCalledWith('Failed to delete weight entry');
  });

  it('patches a weight entry and invalidates weight queries', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        id: 'weight-2',
        date: '2026-03-07',
        weight: 180.1,
        notes: null,
        createdAt: 1,
        updatedAt: 3,
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateWeight(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'weight-2',
        input: { weight: 180.1 },
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/weight/weight-2',
      expect.objectContaining({
        body: JSON.stringify({
          weight: 180.1,
        }),
        method: 'PATCH',
      }),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: weightQueryKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: dashboardSnapshotQueryKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dashboardWeightTrendQueryKeys.all,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: habitQueryKeys.list() });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: habitQueryKeys.entryList() });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: habitChainQueryKeys.all });
  });
});
