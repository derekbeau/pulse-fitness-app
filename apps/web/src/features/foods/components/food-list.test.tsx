import { QueryClientProvider } from '@tanstack/react-query';
import type { Food } from '@pulse/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FoodList } from '@/features/foods/components/food-list';
import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { createAppQueryClient } from '@/lib/query-client';

function createDeferredResponse() {
  let resolve: (value: Response) => void = () => {};

  const promise = new Promise<Response>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

function createFood(id: string, name: string, overrides: Partial<Food> = {}): Food {
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
    verified: true,
    source: 'USDA',
    notes: null,
    lastUsedAt: Date.parse('2026-03-05T12:00:00.000Z'),
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function sortFoods(foods: Food[], sort: string) {
  const copy = [...foods];

  if (sort === 'recent') {
    return copy.sort((left, right) => {
      if (left.lastUsedAt === null && right.lastUsedAt === null) {
        return left.name.localeCompare(right.name);
      }

      if (left.lastUsedAt === null) {
        return 1;
      }

      if (right.lastUsedAt === null) {
        return -1;
      }

      return right.lastUsedAt - left.lastUsedAt || left.name.localeCompare(right.name);
    });
  }

  if (sort === 'protein') {
    return copy.sort(
      (left, right) => right.protein - left.protein || left.name.localeCompare(right.name),
    );
  }

  return copy.sort((left, right) => left.name.localeCompare(right.name));
}

function createFoodsApiMock(initialFoods: Food[], options?: { failDeleteForId?: string }) {
  let foods = [...initialFoods];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
    const method = init?.method ?? 'GET';

    if (url.pathname === '/api/v1/foods' && method === 'GET') {
      const q = url.searchParams.get('q')?.toLowerCase() ?? '';
      const sort = url.searchParams.get('sort') ?? 'name';
      const page = Number(url.searchParams.get('page') ?? '1');
      const limit = Number(url.searchParams.get('limit') ?? '12');
      const filteredFoods = foods.filter((food) =>
        [food.name, food.brand ?? ''].some((value) => value.toLowerCase().includes(q)),
      );
      const sortedFoods = sortFoods(filteredFoods, sort);
      const startIndex = (page - 1) * limit;
      const data = sortedFoods.slice(startIndex, startIndex + limit);

      return new Response(
        JSON.stringify({
          data,
          meta: {
            page,
            limit,
            total: filteredFoods.length,
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    }

    if (url.pathname.startsWith('/api/v1/foods/') && method === 'PUT') {
      const id = url.pathname.split('/').at(-1) ?? '';
      const body = JSON.parse(String(init?.body ?? '{}')) as Partial<Food>;
      const index = foods.findIndex((food) => food.id === id);

      if (index === -1) {
        return new Response(
          JSON.stringify({ error: { code: 'FOOD_NOT_FOUND', message: 'Missing' } }),
          {
            status: 404,
            headers: {
              'content-type': 'application/json',
            },
          },
        );
      }

      foods[index] = {
        ...foods[index],
        ...body,
        updatedAt: foods[index].updatedAt + 1,
      };

      return new Response(JSON.stringify({ data: foods[index] }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    }

    if (url.pathname.startsWith('/api/v1/foods/') && method === 'DELETE') {
      const id = url.pathname.split('/').at(-1) ?? '';

      if (options?.failDeleteForId === id) {
        return new Response(
          JSON.stringify({ error: { code: 'DELETE_FAILED', message: 'Delete failed' } }),
          {
            status: 500,
            headers: {
              'content-type': 'application/json',
            },
          },
        );
      }

      foods = foods.filter((food) => food.id !== id);

      return new Response(JSON.stringify({ data: { success: true } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    }

    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });

  return {
    fetchMock,
    getFoods: () => foods,
  };
}

function renderFoodList() {
  const queryClient = createAppQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <FoodList now={new Date('2026-03-06T12:00:00.000Z')} />
    </QueryClientProvider>,
  );
}

function selectSortOption(optionLabel: string) {
  const trigger = screen.getByRole('combobox', { name: 'Sort foods' });

  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.click(screen.getByText(optionLabel));
}

const paginatedFoods = [
  createFood('food-1', '2% Milk', {
    brand: 'Fairlife',
    protein: 13,
    servingSize: '1 cup',
    servingGrams: 240,
    lastUsedAt: Date.parse('2026-03-04T07:10:00.000Z'),
  }),
  createFood('food-2', 'Almonds', {
    protein: 6,
    lastUsedAt: Date.parse('2026-03-03T20:20:00.000Z'),
  }),
  createFood('food-3', 'Apple', {
    verified: false,
    source: null,
    protein: 0,
    lastUsedAt: Date.parse('2026-03-02T12:15:00.000Z'),
  }),
  createFood('food-4', 'Atlantic Salmon', {
    protein: 31,
    calories: 290,
    fat: 17,
    carbs: 0,
    lastUsedAt: Date.parse('2026-03-05T18:40:00.000Z'),
  }),
  createFood('food-5', 'Avocado', {
    protein: 2,
    fat: 11,
    lastUsedAt: Date.parse('2026-03-01T12:15:00.000Z'),
  }),
  createFood('food-6', 'Banana', {
    protein: 1,
    carbs: 27,
    lastUsedAt: Date.parse('2026-03-05T07:15:00.000Z'),
  }),
  createFood('food-7', 'Broccoli', {
    protein: 3,
    lastUsedAt: Date.parse('2026-03-05T12:30:00.000Z'),
  }),
  createFood('food-8', 'Chicken Breast', {
    protein: 35,
    carbs: 0,
    fat: 4,
    lastUsedAt: Date.parse('2026-03-05T12:30:00.000Z'),
  }),
  createFood('food-9', 'Greek Yogurt', {
    brand: 'Fage 0%',
    protein: 18,
    lastUsedAt: Date.parse('2026-03-05T15:30:00.000Z'),
  }),
  createFood('food-10', 'Ground Beef 90/10', {
    protein: 23,
    fat: 11,
    lastUsedAt: Date.parse('2026-03-03T18:30:00.000Z'),
  }),
  createFood('food-11', 'Olive Oil', {
    protein: 0,
    carbs: 0,
    fat: 14,
    lastUsedAt: Date.parse('2026-03-04T18:45:00.000Z'),
  }),
  createFood('food-12', 'Spinach', {
    protein: 3,
    lastUsedAt: Date.parse('2026-03-05T16:45:00.000Z'),
  }),
  createFood('food-13', 'Whey Protein', {
    brand: 'Optimum Nutrition Gold Standard',
    protein: 24,
    carbs: 3,
    fat: 1,
    calories: 120,
    servingSize: '1 scoop',
    lastUsedAt: Date.parse('2026-03-05T16:45:00.000Z'),
  }),
];

describe('FoodList', () => {
  beforeEach(() => {
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('shows loading placeholders, then renders the first server page with pagination', async () => {
    const deferredFoods = createDeferredResponse();
    const delayedFetch = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/v1/foods') {
        return deferredFoods.promise;
      }

      throw new Error(`Unhandled request ${url.pathname}`);
    });

    vi.stubGlobal('fetch', delayedFetch);

    const view = renderFoodList();

    expect(screen.getByText('Showing 0 of 0 foods')).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(view.container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);

    deferredFoods.resolve(
      new Response(
        JSON.stringify({
          data: paginatedFoods.slice(0, 12),
          meta: {
            page: 1,
            limit: 12,
            total: paginatedFoods.length,
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

    expect(await screen.findByRole('button', { name: '2% Milk' })).toBeInTheDocument();
    expect(screen.getByText('Serving: 1 cup (240 g)')).toBeInTheDocument();
    expect(screen.getAllByText('Last used: 2 days ago').length).toBeGreaterThan(0);
    expect(screen.getByText('Showing 12 of 13 foods')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getAllByText('Verified').length).toBeGreaterThan(0);
  });

  it('debounces search and sends the query to the foods API', async () => {
    const api = createFoodsApiMock(paginatedFoods);
    vi.stubGlobal('fetch', api.fetchMock);

    renderFoodList();

    expect(await screen.findByRole('heading', { level: 3, name: '2% Milk' })).toBeInTheDocument();
    expect(api.fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search foods' }), {
      target: { value: 'fair' },
    });

    await new Promise((resolve) => window.setTimeout(resolve, 150));

    expect(api.fetchMock).toHaveBeenCalledTimes(1);

    await waitFor(
      () => {
        expect(api.fetchMock).toHaveBeenCalledTimes(2);
      },
      { timeout: 1000 },
    );
    expect(await screen.findByRole('heading', { level: 3, name: '2% Milk' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 3, name: 'Chicken Breast' }),
    ).not.toBeInTheDocument();

    const lastUrl = new URL(String(api.fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost');
    expect(lastUrl.searchParams.get('q')).toBe('fair');
    expect(lastUrl.searchParams.get('page')).toBe('1');
  });

  it('changes server sort, paginates, and saves inline edits through the API', async () => {
    const api = createFoodsApiMock(paginatedFoods);
    vi.stubGlobal('fetch', api.fetchMock);

    renderFoodList();

    expect(await screen.findByRole('heading', { level: 3, name: '2% Milk' })).toBeInTheDocument();

    selectSortOption('Highest Protein');

    expect(await screen.findByRole('button', { name: 'Whey Protein' })).toBeInTheDocument();

    let lastUrl = new URL(String(api.fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost');
    expect(lastUrl.searchParams.get('sort')).toBe('protein');

    fireEvent.click(screen.getByRole('button', { name: 'Whey Protein' }));
    const editInput = await screen.findByRole('textbox', { name: 'Edit Whey Protein name' });

    fireEvent.change(editInput, { target: { value: 'Casein Protein' } });
    fireEvent.submit(editInput.closest('form') as HTMLFormElement);

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Casein Protein' }),
    ).toBeInTheDocument();
    expect(api.getFoods().find((food) => food.id === 'food-13')?.name).toBe('Casein Protein');

    selectSortOption('Alphabetical');
    await waitFor(() => {
      const requestUrl = new URL(String(api.fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost');

      expect(requestUrl.searchParams.get('sort')).toBe('name');
    });
    await waitFor(() => {
      expect(screen.queryByText('Refreshing foods…')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 3, name: '2% Milk' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      const requestUrl = new URL(String(api.fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost');

      expect(requestUrl.searchParams.get('page')).toBe('2');
    });
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

    lastUrl = new URL(String(api.fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost');
    expect(lastUrl.pathname).toBe('/api/v1/foods');
  });

  it('removes foods optimistically and keeps the total count in sync', async () => {
    const api = createFoodsApiMock(paginatedFoods);
    vi.stubGlobal('fetch', api.fetchMock);

    renderFoodList();

    expect(await screen.findByRole('heading', { level: 3, name: '2% Milk' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Broccoli' }));
    expect(screen.getByText('Are you sure you want to remove Broccoli?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 3, name: 'Broccoli' })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Showing 12 of 12 foods')).toBeInTheDocument();
    });
  });
});
