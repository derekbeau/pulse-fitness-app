import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { useDashboardConfig, useSaveDashboardConfig } from './use-dashboard-config';

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });

describe('dashboard config hooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('loads persisted dashboard config', async () => {
    mockFetch.mockResolvedValue(
      createJsonResponse({
        habitChainIds: ['habit-1', 'habit-2'],
        trendMetrics: ['weight', 'calories'],
        visibleWidgets: ['snapshot', 'weight-trend'],
        widgetOrder: ['snapshot', 'habits'],
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({
      queries: { retry: false },
      mutations: { retry: false },
    });

    const { result } = renderHook(() => useDashboardConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/dashboard/config',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.current.data).toEqual({
      habitChainIds: ['habit-1', 'habit-2'],
      trendMetrics: ['weight', 'calories'],
      visibleWidgets: ['snapshot', 'weight-trend'],
      widgetOrder: ['snapshot', 'habits'],
    });
  });

  it('saves dashboard config with PUT', async () => {
    mockFetch.mockResolvedValue(
      createJsonResponse({
        habitChainIds: ['habit-1'],
        trendMetrics: ['protein'],
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({
      queries: { retry: false },
      mutations: { retry: false },
    });

    const { result } = renderHook(() => useSaveDashboardConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.isIdle).toBe(true);
    });

    await result.current.mutateAsync({
      habitChainIds: ['habit-1'],
      trendMetrics: ['protein'],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/dashboard/config',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
