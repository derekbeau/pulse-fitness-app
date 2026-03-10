import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { useMacroTrend } from './use-macro-trend';

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });

describe('useMacroTrend', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads macro trend for an explicit date range', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse([
        {
          date: '2026-03-04',
          calories: 2100,
          protein: 170,
          carbs: 220,
          fat: 70,
        },
      ]),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({
      queries: { retry: false },
      mutations: { retry: false },
    });

    const { result } = renderHook(() => useMacroTrend('2026-03-04', '2026-03-05'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/dashboard/trends/macros?from=2026-03-04&to=2026-03-05',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.current.data).toEqual([
      {
        date: '2026-03-04',
        calories: 2100,
        protein: 170,
        carbs: 220,
        fat: 70,
      },
    ]);
  });

  it('defaults to a 30-day range ending today when range is omitted', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-10T10:00:00.000Z'));

    mockFetch.mockResolvedValueOnce(
      createJsonResponse([
        {
          date: '2026-02-09',
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
        {
          date: '2026-03-10',
          calories: 2200,
          protein: 180,
          carbs: 250,
          fat: 70,
        },
      ]),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({
      queries: { retry: false },
      mutations: { retry: false },
    });

    const { result } = renderHook(() => useMacroTrend(), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/dashboard/trends/macros?from=2026-02-09&to=2026-03-10',
      expect.any(Object),
    );
  });

  it('does not fetch when query is disabled', async () => {
    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({
      queries: { retry: false },
      mutations: { retry: false },
    });

    const { result } = renderHook(() => useMacroTrend('2026-03-04', '2026-03-05', { enabled: false }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.fetchStatus).toBe('idle');
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
