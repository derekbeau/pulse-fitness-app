import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { useLatestWeight, useLogWeight, useWeightTrend, weightKeys } from './weight';

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status: 200,
  });

describe('weight api hooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
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

  it('posts a weight entry and invalidates weight queries', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        id: 'weight-2',
        date: '2026-03-07',
        weight: 180.8,
        notes: null,
        createdAt: 1,
        updatedAt: 2,
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useLogWeight(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        date: '2026-03-07',
        weight: 180.8,
      });
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
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: weightKeys.all });
  });
});
