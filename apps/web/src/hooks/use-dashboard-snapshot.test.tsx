import type { DashboardSnapshot } from '@pulse/shared';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { useDashboardSnapshot } from './use-dashboard-snapshot';

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });

const snapshotFixture: DashboardSnapshot = {
  date: '2026-03-06',
  weight: {
    date: '2026-03-06',
    unit: 'lb',
    value: 181.4,
  },
  macros: {
    actual: {
      calories: 1900,
      protein: 170,
      carbs: 210,
      fat: 70,
    },
    target: {
      calories: 2300,
      protein: 190,
      carbs: 260,
      fat: 75,
    },
  },
  workout: {
    name: 'Upper Push A',
    status: 'completed',
    duration: 62,
  },
  habits: {
    total: 4,
    completed: 3,
    percentage: 75,
  },
};

describe('useDashboardSnapshot', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('loads snapshot data for the provided date', async () => {
    mockFetch.mockResolvedValue(createJsonResponse(snapshotFixture));

    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({
      queries: { retry: false },
      mutations: { retry: false },
    });
    const { result } = renderHook(() => useDashboardSnapshot('2026-03-06'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/dashboard/snapshot?date=2026-03-06',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.current.data).toEqual(snapshotFixture);
  });

  it('surfaces an error when the response payload is invalid', async () => {
    mockFetch.mockResolvedValue(
      createJsonResponse({
        date: '2026-03-06',
        weight: null,
        macros: {
          actual: {
            calories: 1900,
            protein: 170,
            carbs: 210,
            fat: 70,
          },
        },
        workout: null,
        habits: {
          total: 0,
          completed: 0,
          percentage: 0,
        },
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({
      queries: { retry: false },
      mutations: { retry: false },
    });
    const { result } = renderHook(() => useDashboardSnapshot('2026-03-06'), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
