import { QueryClientProvider } from '@tanstack/react-query';
import type { Food } from '@pulse/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeleteFood, useFoods, type FoodListResponse } from '@/features/foods/api/foods';
import { foodKeys } from '@/features/foods/api/keys';
import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { createAppQueryClient } from '@/lib/query-client';

function createDeferredResponse() {
  let resolve: (value: Response) => void = () => {};

  const promise = new Promise<Response>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

function createFood(id: string, name: string): Food {
  return {
    id,
    userId: 'user-1',
    name,
    brand: null,
    servingSize: '1 serving',
    servingGrams: null,
    calories: 100,
    protein: 10,
    carbs: 10,
    fat: 5,
    fiber: null,
    sugar: null,
    verified: false,
    source: null,
    notes: null,
    lastUsedAt: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
}

function createWrapper() {
  const queryClient = createAppQueryClient();

  return {
    queryClient,
    wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    },
  };
}

describe('foods api hooks', () => {
  beforeEach(() => {
    createAppQueryClient().clear();
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
  });

  afterEach(() => {
    createAppQueryClient().clear();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('uses the list query key and request params for foods fetches', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [createFood('food-1', 'Chicken Breast')],
            meta: {
              page: 2,
              limit: 5,
              total: 12,
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        useFoods({
          q: 'chicken',
          sort: 'protein',
          page: 2,
          limit: 5,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.data[0]?.name).toBe('Chicken Breast');
    expect(result.current.data?.meta.total).toBe(12);
    expect(
      queryClient.getQueryState(
        foodKeys.list({
          q: 'chicken',
          sort: 'protein',
          page: 2,
          limit: 5,
        }),
      ),
    ).toBeDefined();

    const firstRequest = (
      fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>
    ).at(0)?.[0];
    if (!firstRequest) {
      throw new Error('Expected at least one foods request');
    }
    const request = new URL(String(firstRequest), 'http://localhost');
    expect(request.pathname).toBe('/api/v1/foods');
    expect(request.searchParams.get('q')).toBe('chicken');
    expect(request.searchParams.get('sort')).toBe('protein');
    expect(request.searchParams.get('page')).toBe('2');
    expect(request.searchParams.get('limit')).toBe('5');
  });

  it('rolls back optimistic deletes when the API returns an error', async () => {
    const deferredDelete = createDeferredResponse();
    const fetchMock = vi.fn(() => deferredDelete.promise);
    vi.stubGlobal('fetch', fetchMock);

    const { queryClient, wrapper } = createWrapper();
    const initialData: FoodListResponse = {
      data: [createFood('food-1', 'Chicken Breast'), createFood('food-2', 'Greek Yogurt')],
      meta: {
        page: 1,
        limit: 12,
        total: 2,
      },
    };

    queryClient.setQueryData(foodKeys.list({ page: 1, limit: 12, sort: 'name' }), initialData);

    const { result } = renderHook(() => useDeleteFood(), { wrapper });

    act(() => {
      result.current.mutate('food-1');
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<FoodListResponse>(
          foodKeys.list({ page: 1, limit: 12, sort: 'name' }),
        )?.data,
      ).toHaveLength(1);
    });

    deferredDelete.resolve(
      new Response(
        JSON.stringify({
          error: {
            code: 'DELETE_FAILED',
            message: 'Delete failed',
          },
        }),
        {
          status: 500,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(
      queryClient.getQueryData<FoodListResponse>(
        foodKeys.list({ page: 1, limit: 12, sort: 'name' }),
      ),
    ).toEqual(initialData);
  });
});
