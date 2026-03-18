import type { HabitEntry } from '@pulse/shared';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { habitChainQueryKeys, useHabitChains } from './use-habit-chains';

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });

const entriesFixture: HabitEntry[] = [
  {
    id: 'entry-1',
    habitId: 'habit-1',
    userId: 'user-1',
    date: '2026-03-05',
    completed: true,
    value: null,
    createdAt: 1,
  },
  {
    id: 'entry-2',
    habitId: 'habit-1',
    userId: 'user-1',
    date: '2026-03-06',
    completed: false,
    value: null,
    createdAt: 2,
  },
];

describe('useHabitChains', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('loads habit entries for the provided date range', async () => {
    mockFetch.mockResolvedValue(createJsonResponse(entriesFixture));

    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({
      queries: { retry: false },
      mutations: { retry: false },
    });
    const { result } = renderHook(() => useHabitChains('2026-03-01', '2026-03-06'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/habit-entries?from=2026-03-01&to=2026-03-06',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.current.data).toEqual(entriesFixture);
  });

  it('surfaces an error when the payload shape is invalid', async () => {
    mockFetch.mockResolvedValue(createJsonResponse([{ id: 'entry-1' }]));

    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({
      queries: { retry: false },
      mutations: { retry: false },
    });
    const { result } = renderHook(() => useHabitChains('2026-03-01', '2026-03-06'), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('configures foreground polling when a refetch interval is provided', async () => {
    mockFetch.mockResolvedValue(createJsonResponse(entriesFixture));

    const { queryClient, wrapper } = createQueryClientWrapper();
    const { result } = renderHook(
      () =>
        useHabitChains('2026-03-01', '2026-03-06', {
          refetchIntervalMs: 30_000,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const query = queryClient.getQueryCache().find({
      queryKey: habitChainQueryKeys.range('2026-03-01', '2026-03-06'),
    });
    const queryOptions = query?.options as
      | {
          refetchInterval?: number | false;
          refetchIntervalInBackground?: boolean;
        }
      | undefined;

    expect(queryOptions?.refetchInterval).toBe(30_000);
    expect(queryOptions?.refetchIntervalInBackground).toBe(false);
  });
});
