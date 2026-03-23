import { QueryClientProvider } from '@tanstack/react-query';
import type { Food } from '@pulse/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FoodList } from '@/features/foods/components/food-list';
import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { createAppQueryClient, resetAppQueryClient } from '@/lib/query-client';

const FOOD_LIST_VIEW_STORAGE_KEY = 'food-list-view';

vi.mock('@/components/ui/column-picker', () => ({
  ColumnPicker: ({
    columns,
    onChange,
    visibleColumns,
  }: {
    columns: { key: string; label: string }[];
    onChange: (columns: string[]) => void;
    visibleColumns: string[];
    storageKey?: string;
    className?: string;
  }) => {
    const removeProtein = columns
      .map((column) => column.key)
      .filter((key) => visibleColumns.includes(key) && key !== 'protein');
    const withProtein = columns
      .map((column) => column.key)
      .filter((key) => key === 'protein' || visibleColumns.includes(key));

    return (
      <div>
        <button onClick={() => onChange(removeProtein)} type="button">
          Hide protein column
        </button>
        <button onClick={() => onChange(withProtein)} type="button">
          Show protein column
        </button>
      </div>
    );
  },
}));

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
    usageCount: 0,
    tags: [],
    lastUsedAt: Date.parse('2026-03-05T12:00:00.000Z'),
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function sortFoods(foods: Food[], sort: string) {
  const copy = [...foods];

  if (sort === 'most-used') {
    return copy.sort(
      (left, right) => right.usageCount - left.usageCount || left.name.localeCompare(right.name),
    );
  }

  if (sort === 'least-used') {
    return copy.sort(
      (left, right) => left.usageCount - right.usageCount || left.name.localeCompare(right.name),
    );
  }

  if (sort === 'recently-updated') {
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

  if (sort === 'newest') {
    return copy.sort((left, right) => right.createdAt - left.createdAt || left.name.localeCompare(right.name));
  }

  if (sort === 'oldest') {
    return copy.sort((left, right) => left.createdAt - right.createdAt || left.name.localeCompare(right.name));
  }

  if (sort === 'name-desc') {
    return copy.sort((left, right) => right.name.localeCompare(left.name));
  }

  return copy.sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeTags(tags: string[]) {
  return tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
}

function createFoodsApiMock(
  initialFoods: Food[],
  options?: {
    deferredUpdateForId?: string;
    deferredUpdateResponse?: Promise<Response>;
    failDeleteForId?: string;
  },
) {
  let foods = [...initialFoods];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
    const method = init?.method ?? 'GET';

    if (url.pathname === '/api/v1/foods' && method === 'GET') {
      const q = url.searchParams.get('q')?.toLowerCase() ?? '';
      const selectedTags = normalizeTags((url.searchParams.get('tags') ?? '').split(','));
      const sort = url.searchParams.get('sort') ?? 'recently-updated';
      const page = Number(url.searchParams.get('page') ?? '1');
      const limit = Number(url.searchParams.get('limit') ?? '25');
      const filteredFoods = foods.filter((food) => {
        const matchesQuery = [food.name, food.brand ?? ''].some((value) =>
          value.toLowerCase().includes(q),
        );
        if (!matchesQuery) {
          return false;
        }

        if (selectedTags.length === 0) {
          return true;
        }

        const foodTags = normalizeTags(food.tags);
        return selectedTags.every((tag) => foodTags.includes(tag));
      });
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

      if (options?.deferredUpdateForId === id && options.deferredUpdateResponse) {
        return options.deferredUpdateResponse;
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
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <FoodList now={new Date('2026-03-06T12:00:00.000Z')} />
      </QueryClientProvider>
    </BrowserRouter>,
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
    usageCount: 12,
    tags: ['dairy', 'breakfast'],
    servingSize: '1 cup',
    servingGrams: 240,
    lastUsedAt: Date.parse('2026-03-04T07:10:00.000Z'),
  }),
  createFood('food-2', 'Almonds', {
    protein: 6,
    usageCount: 8,
    tags: ['snack'],
    lastUsedAt: Date.parse('2026-03-03T20:20:00.000Z'),
  }),
  createFood('food-3', 'Apple', {
    verified: false,
    source: null,
    protein: 0,
    usageCount: 3,
    tags: ['fruit', 'snack'],
    lastUsedAt: Date.parse('2026-03-02T12:15:00.000Z'),
  }),
  createFood('food-4', 'Atlantic Salmon', {
    protein: 31,
    usageCount: 4,
    tags: ['dinner', 'protein'],
    calories: 290,
    fat: 17,
    carbs: 0,
    lastUsedAt: Date.parse('2026-03-05T18:40:00.000Z'),
  }),
  createFood('food-5', 'Avocado', {
    protein: 2,
    usageCount: 2,
    tags: ['produce'],
    fat: 11,
    lastUsedAt: Date.parse('2026-03-01T12:15:00.000Z'),
  }),
  createFood('food-6', 'Banana', {
    protein: 1,
    usageCount: 6,
    tags: ['fruit'],
    carbs: 27,
    lastUsedAt: Date.parse('2026-03-05T07:15:00.000Z'),
  }),
  createFood('food-7', 'Broccoli', {
    protein: 3,
    usageCount: 7,
    tags: ['produce'],
    lastUsedAt: Date.parse('2026-03-05T12:30:00.000Z'),
  }),
  createFood('food-8', 'Chicken Breast', {
    protein: 35,
    usageCount: 11,
    tags: ['protein', 'dinner'],
    carbs: 0,
    fat: 4,
    lastUsedAt: Date.parse('2026-03-05T12:30:00.000Z'),
  }),
  createFood('food-9', 'Greek Yogurt', {
    brand: 'Fage 0%',
    protein: 18,
    usageCount: 16,
    tags: ['dairy', 'protein'],
    lastUsedAt: Date.parse('2026-03-05T15:30:00.000Z'),
  }),
  createFood('food-10', 'Ground Beef 90/10', {
    protein: 23,
    usageCount: 9,
    tags: ['protein', 'dinner'],
    fat: 11,
    lastUsedAt: Date.parse('2026-03-03T18:30:00.000Z'),
  }),
  createFood('food-11', 'Olive Oil', {
    protein: 0,
    carbs: 0,
    usageCount: 5,
    tags: ['fats'],
    fat: 14,
    lastUsedAt: Date.parse('2026-03-04T18:45:00.000Z'),
  }),
  createFood('food-12', 'Spinach', {
    protein: 3,
    usageCount: 10,
    tags: ['produce'],
    lastUsedAt: Date.parse('2026-03-05T16:45:00.000Z'),
  }),
  createFood('food-13', 'Whey Protein', {
    brand: 'Optimum Nutrition Gold Standard',
    protein: 24,
    usageCount: 25,
    tags: ['supplement', 'protein'],
    carbs: 3,
    fat: 1,
    calories: 120,
    servingSize: '1 scoop',
    lastUsedAt: Date.parse('2026-03-05T16:45:00.000Z'),
  }),
  ...Array.from({ length: 15 }, (_, index) =>
    createFood(`food-extra-${index + 1}`, `Template Food ${index + 1}`, {
      usageCount: index,
      lastUsedAt: Date.parse(`2026-02-${String((index % 9) + 10).padStart(2, '0')}T12:00:00.000Z`),
    }),
  ),
];

describe('FoodList', () => {
  beforeEach(() => {
    resetAppQueryClient();
    window.history.pushState({}, '', '/nutrition?view=foods');
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
  });

  afterEach(() => {
    createAppQueryClient().clear();
    resetAppQueryClient();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('shows loading placeholders, then renders the first server page with pagination', async () => {
    const deferredFoods = createDeferredResponse();
    const delayedFetch = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/v1/foods') {
        return deferredFoods.promise.then((response) => response.clone());
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
          data: paginatedFoods.slice(0, 25),
          meta: {
            page: 1,
            limit: 25,
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
    expect(screen.getByText('Showing 25 of 28 foods')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getAllByText('Verified').length).toBeGreaterThan(0);
  });

  it('keeps deep-linked page params while food totals are still loading', async () => {
    window.history.pushState({}, '', '/nutrition?view=foods&page=2');
    const deferredFoods = createDeferredResponse();
    const delayedFetch = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/v1/foods') {
        return deferredFoods.promise.then((response) => response.clone());
      }

      throw new Error(`Unhandled request ${url.pathname}`);
    });

    vi.stubGlobal('fetch', delayedFetch);

    renderFoodList();

    await waitFor(() => {
      expect(window.location.search).toContain('page=2');
    });

    deferredFoods.resolve(
      new Response(
        JSON.stringify({
          data: paginatedFoods.slice(25),
          meta: {
            page: 2,
            limit: 25,
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
  });

  it('does not normalize the URL with a default sort param on initial load', async () => {
    const api = createFoodsApiMock(paginatedFoods);
    vi.stubGlobal('fetch', api.fetchMock);

    renderFoodList();

    expect(await screen.findByRole('heading', { level: 3, name: 'Spinach' })).toBeInTheDocument();
    expect(window.location.search).toBe('?view=foods');
  });

  it('debounces search and sends the query to the foods API', async () => {
    const api = createFoodsApiMock(paginatedFoods);
    vi.stubGlobal('fetch', api.fetchMock);

    renderFoodList();

    expect(await screen.findByRole('heading', { level: 3, name: 'Spinach' })).toBeInTheDocument();
    const initialCallCount = api.fetchMock.mock.calls.length;
    expect(initialCallCount).toBeGreaterThanOrEqual(1);
    const initialUrl = new URL(String(api.fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost');
    expect(initialUrl.searchParams.get('sort')).toBe('recently-updated');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search foods' }), {
      target: { value: 'fair' },
    });

    const immediateFairCalls = api.fetchMock.mock.calls.filter(([url]) => {
      const requestUrl = new URL(String(url), 'http://localhost');
      return requestUrl.searchParams.get('q') === 'fair';
    });
    expect(immediateFairCalls).toHaveLength(0);

    await waitFor(
      () => {
        expect(api.fetchMock.mock.calls.length).toBeGreaterThan(initialCallCount);
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

  it('paginates while preserving sort query params', async () => {
    const api = createFoodsApiMock(paginatedFoods);
    vi.stubGlobal('fetch', api.fetchMock);

    renderFoodList();

    expect(await screen.findByRole('heading', { level: 3, name: 'Spinach' })).toBeInTheDocument();
    selectSortOption('Name (A-Z)');

    await waitFor(() => {
      const requestUrl = new URL(String(api.fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost');

      expect(requestUrl.searchParams.get('sort')).toBe('name-asc');
    });
    await waitFor(() => {
      expect(screen.queryByText('Refreshing foods…')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 3, name: '2% Milk' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      const requestUrl = new URL(String(api.fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost');

      expect(requestUrl.searchParams.get('page')).toBe('2');
      expect(requestUrl.searchParams.get('sort')).toBe('name-asc');
    });
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

    const lastUrl = new URL(String(api.fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost');
    expect(lastUrl.pathname).toBe('/api/v1/foods');
  });

  it('persists per-page in URL params and resets to page 1 when changed', async () => {
    const api = createFoodsApiMock(paginatedFoods);
    vi.stubGlobal('fetch', api.fetchMock);

    renderFoodList();

    expect(await screen.findByRole('heading', { level: 3, name: 'Spinach' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(window.location.search).toContain('page=2');
    });
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Foods per page' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(screen.getByText('10 / page'));

    await waitFor(() => {
      expect(window.location.search).toContain('limit=10');
      expect(window.location.search).toContain('page=1');
    });
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();

    const requestUrl = new URL(String(api.fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost');
    expect(requestUrl.searchParams.get('limit')).toBe('10');
    expect(requestUrl.searchParams.get('page')).toBe('1');
  });

  it('keeps the inline editor open if a pending save blurs before the API fails', async () => {
    const deferredUpdate = createDeferredResponse();
    const api = createFoodsApiMock(paginatedFoods, {
      deferredUpdateForId: 'food-13',
      deferredUpdateResponse: deferredUpdate.promise,
    });
    vi.stubGlobal('fetch', api.fetchMock);

    renderFoodList();

    expect(await screen.findByRole('heading', { level: 3, name: 'Spinach' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Whey Protein' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Whey Protein' }));
    const editInput = await screen.findByRole('textbox', { name: 'Edit Whey Protein name' });

    fireEvent.change(editInput, { target: { value: 'Casein Protein' } });
    fireEvent.submit(editInput.closest('form') as HTMLFormElement);
    fireEvent.blur(editInput);

    deferredUpdate.resolve(
      new Response(
        JSON.stringify({
          error: {
            code: 'UPDATE_FAILED',
            message: 'Update failed',
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
      expect(screen.getByText('Update failed')).toBeInTheDocument();
    });
    expect(screen.getByRole('textbox', { name: 'Edit Whey Protein name' })).toHaveValue(
      'Casein Protein',
    );
  });

  it('filters foods by tag chips and supports tag add/remove edits', async () => {
    const api = createFoodsApiMock(paginatedFoods);
    vi.stubGlobal('fetch', api.fetchMock);

    renderFoodList();

    expect(await screen.findByRole('heading', { level: 3, name: 'Spinach' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'dairy' }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Greek Yogurt' })).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { level: 3, name: 'Atlantic Salmon' }),
      ).not.toBeInTheDocument();
    });
    const filterRequest = new URL(String(api.fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost');
    expect(filterRequest.searchParams.get('tags')).toBe('dairy');

    fireEvent.click(screen.getByRole('button', { name: 'Remove dairy tag from Greek Yogurt' }));
    await waitFor(() => {
      expect(api.getFoods().find((food) => food.id === 'food-9')?.tags).toEqual(['protein']);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Apple' })).toBeInTheDocument();

    const appleTagInput = screen.getByRole('textbox', { name: 'Add tag for Apple' });
    fireEvent.change(appleTagInput, { target: { value: 'portable' } });
    fireEvent.keyDown(appleTagInput, { key: 'Enter' });

    await waitFor(() => {
      expect(api.getFoods().find((food) => food.id === 'food-3')?.tags).toContain('portable');
    });
  });

  it('removes foods optimistically and keeps the total count in sync', async () => {
    const api = createFoodsApiMock(paginatedFoods);
    vi.stubGlobal('fetch', api.fetchMock);

    renderFoodList();

    expect(await screen.findByRole('heading', { level: 3, name: 'Spinach' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Broccoli' }));
    expect(screen.getByText('Delete food?')).toBeInTheDocument();
    expect(
      screen.getByText('This will permanently remove "Broccoli" from your foods database.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete food' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 3, name: 'Broccoli' })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Showing 25 of 27 foods')).toBeInTheDocument();
    });
  });

  it('renders card and table views and persists the selected view', async () => {
    const api = createFoodsApiMock(paginatedFoods);
    vi.stubGlobal('fetch', api.fetchMock);

    const firstRender = renderFoodList();

    expect(await screen.findByRole('heading', { level: 3, name: 'Spinach' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Foods table view' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    expect(await screen.findByRole('table', { name: 'Foods table view' })).toBeInTheDocument();
    expect(window.localStorage.getItem(FOOD_LIST_VIEW_STORAGE_KEY)).toBe('table');

    fireEvent.click(screen.getByRole('button', { name: 'Card view' }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Spinach' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    expect(await screen.findByRole('table', { name: 'Foods table view' })).toBeInTheDocument();

    firstRender.unmount();
    renderFoodList();

    expect(await screen.findByRole('table', { name: 'Foods table view' })).toBeInTheDocument();
  });

  it('paginates in table mode', async () => {
    const api = createFoodsApiMock(paginatedFoods);
    vi.stubGlobal('fetch', api.fetchMock);

    renderFoodList();

    await screen.findByRole('heading', { level: 3, name: 'Spinach' });
    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    await screen.findByRole('table', { name: 'Foods table view' });
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    });
    expect(screen.getByRole('table', { name: 'Foods table view' })).toBeInTheDocument();
  });

  it('shows and hides table columns through the shared column picker integration', async () => {
    const api = createFoodsApiMock(paginatedFoods);
    vi.stubGlobal('fetch', api.fetchMock);

    renderFoodList();

    await screen.findByRole('heading', { level: 3, name: 'Spinach' });
    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    await screen.findByRole('table', { name: 'Foods table view' });
    expect(screen.getByRole('columnheader', { name: 'Protein' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide protein column' }));
    await waitFor(() => {
      expect(screen.queryByRole('columnheader', { name: 'Protein' })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show protein column' }));
    expect(screen.getByRole('columnheader', { name: 'Protein' })).toBeInTheDocument();
  });

  it('opens table inline editing only from the food name cell', async () => {
    const api = createFoodsApiMock(paginatedFoods);
    vi.stubGlobal('fetch', api.fetchMock);

    renderFoodList();

    await screen.findByRole('heading', { level: 3, name: 'Spinach' });
    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    await screen.findByRole('table', { name: 'Foods table view' });

    fireEvent.click(screen.getByRole('cell', { name: '13g' }));
    expect(screen.queryByRole('textbox', { name: 'Edit 2% Milk name' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2% Milk' }));
    expect(await screen.findByRole('textbox', { name: 'Edit 2% Milk name' })).toBeInTheDocument();
  });

  it('preserves filter and sort state when switching between card and table views', async () => {
    const api = createFoodsApiMock(paginatedFoods);
    vi.stubGlobal('fetch', api.fetchMock);

    renderFoodList();

    await screen.findByRole('heading', { level: 3, name: 'Spinach' });

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search foods' }), {
      target: { value: 'fair' },
    });
    selectSortOption('Name (A-Z)');

    await waitFor(() => {
      expect(window.location.search).toContain('sort=name-asc');
    });
    expect(await screen.findByRole('heading', { level: 3, name: '2% Milk' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    expect(await screen.findByRole('table', { name: 'Foods table view' })).toBeInTheDocument();
    expect(screen.getByText('2% Milk')).toBeInTheDocument();
    expect(window.location.search).toContain('sort=name-asc');

    fireEvent.click(screen.getByRole('button', { name: 'Card view' }));
    expect(await screen.findByRole('heading', { level: 3, name: '2% Milk' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search foods' })).toHaveValue('fair');
    expect(window.location.search).toContain('sort=name-asc');
  });
});
