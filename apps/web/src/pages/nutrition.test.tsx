import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DailyNutrition, DailyNutritionMeal, NutritionMacroTotals } from '@pulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NutritionPage } from '@/pages/nutrition';
import { createQueryClientWrapper } from '@/test/query-client';

type DateState = {
  daily: DailyNutrition;
  target: NutritionMacroTotals | null;
};

const TARGETS: NutritionMacroTotals = {
  calories: 2300,
  protein: 190,
  carbs: 260,
  fat: 75,
};

function createJsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function cloneDaily(daily: DailyNutrition): DailyNutrition {
  return daily ? (JSON.parse(JSON.stringify(daily)) as DailyNutrition) : null;
}

function calculateActuals(daily: DailyNutrition): NutritionMacroTotals {
  if (!daily) {
    return {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    };
  }

  return daily.meals
    .flatMap((meal) => meal.items)
    .reduce(
      (totals, item) => ({
        calories: totals.calories + item.calories,
        protein: totals.protein + item.protein,
        carbs: totals.carbs + item.carbs,
        fat: totals.fat + item.fat,
      }),
      {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
    );
}

function createMeal(args: {
  id: string;
  name: string;
  time: string;
  items: Array<{
    id: string;
    name: string;
    amount: number;
    unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>;
}): DailyNutritionMeal {
  return {
    meal: {
      id: args.id,
      nutritionLogId: 'log-2026-03-05',
      name: args.name,
      time: args.time,
      notes: null,
      createdAt: 1,
      updatedAt: 1,
    },
    items: args.items.map((item) => ({
      id: item.id,
      mealId: args.id,
      foodId: null,
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      fiber: null,
      sugar: null,
      createdAt: 1,
    })),
  };
}

function createNutritionApiMock(initialState: Record<string, DateState>) {
  const state = new Map<string, DateState>(
    Object.entries(initialState).map(([date, value]) => [
      date,
      {
        daily: cloneDaily(value.daily),
        target: value.target,
      },
    ]),
  );

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
    const method = init?.method ?? 'GET';
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (pathParts[0] !== 'api' || pathParts[1] !== 'v1' || pathParts[2] !== 'nutrition') {
      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    }

    const date = pathParts[3];
    const dateState = state.get(date) ?? {
      daily: null,
      target: null,
    };

    if (method === 'GET' && pathParts.length === 4) {
      return createJsonResponse(cloneDaily(dateState.daily));
    }

    if (method === 'GET' && pathParts.length === 5 && pathParts[4] === 'summary') {
      const actual = calculateActuals(dateState.daily);
      const meals = dateState.daily?.meals.length ?? 0;

      return createJsonResponse({
        date,
        meals,
        actual,
        target: dateState.target,
      });
    }

    if (method === 'DELETE' && pathParts.length === 6 && pathParts[4] === 'meals') {
      const mealId = pathParts[5];

      if (!dateState.daily) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'MEAL_NOT_FOUND',
              message: 'Meal not found',
            },
          }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 404,
          },
        );
      }

      dateState.daily = {
        ...dateState.daily,
        meals: dateState.daily.meals.filter((entry) => entry.meal.id !== mealId),
      };
      state.set(date, dateState);

      return createJsonResponse({ success: true });
    }

    throw new Error(`Unhandled request: ${method} ${url.pathname}`);
  });

  return { fetchMock };
}

function createDeferredResponse() {
  let resolve: (value: Response) => void = () => {};

  const promise = new Promise<Response>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

function getMealToggleButton(mealName: string) {
  const candidateButtons = screen.getAllByRole('button', {
    name: new RegExp(mealName, 'i'),
  });
  const button = candidateButtons.find((candidate) => candidate.hasAttribute('aria-controls'));

  if (!button) {
    throw new Error(`Expected a meal toggle button for ${mealName}`);
  }

  return button;
}

const previousDayMeals = [
  createMeal({
    id: 'meal-lunch',
    name: 'Lunch',
    time: '12:30',
    items: [
      {
        id: 'item-chicken',
        name: 'Chicken Breast',
        amount: 6,
        unit: 'oz',
        calories: 281,
        protein: 52,
        carbs: 0,
        fat: 6,
      },
      {
        id: 'item-rice',
        name: 'White Rice',
        amount: 1,
        unit: 'cup',
        calories: 205,
        protein: 4,
        carbs: 45,
        fat: 0,
      },
    ],
  }),
  createMeal({
    id: 'meal-breakfast',
    name: 'Breakfast',
    time: '07:20',
    items: [
      {
        id: 'item-eggs',
        name: 'Large Eggs',
        amount: 3,
        unit: 'eggs',
        calories: 210,
        protein: 18,
        carbs: 1,
        fat: 15,
      },
      {
        id: 'item-bread',
        name: 'Whole Wheat Bread',
        amount: 2,
        unit: 'slices',
        calories: 220,
        protein: 10,
        carbs: 44,
        fat: 2,
      },
    ],
  }),
  createMeal({
    id: 'meal-dinner',
    name: 'Dinner',
    time: '18:40',
    items: [
      {
        id: 'item-salmon',
        name: 'Atlantic Salmon',
        amount: 5,
        unit: 'oz',
        calories: 290,
        protein: 31,
        carbs: 0,
        fat: 17,
      },
      {
        id: 'item-potato',
        name: 'Sweet Potato',
        amount: 1,
        unit: 'medium',
        calories: 112,
        protein: 2,
        carbs: 26,
        fat: 0,
      },
    ],
  }),
  createMeal({
    id: 'meal-snacks',
    name: 'Snacks',
    time: '15:45',
    items: [
      {
        id: 'item-yogurt',
        name: 'Greek Yogurt',
        amount: 170,
        unit: 'g',
        calories: 90,
        protein: 18,
        carbs: 5,
        fat: 0,
      },
      {
        id: 'item-almonds',
        name: 'Almonds',
        amount: 1,
        unit: 'oz',
        calories: 164,
        protein: 6,
        carbs: 6,
        fat: 14,
      },
    ],
  }),
];

describe('NutritionPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads today from API, shows empty state, and blocks future navigation', async () => {
    const { fetchMock } = createNutritionApiMock({
      '2026-03-06': {
        daily: null,
        target: TARGETS,
      },
      '2026-03-05': {
        daily: {
          log: {
            id: 'log-2026-03-05',
            userId: 'user-1',
            date: '2026-03-05',
            notes: null,
            createdAt: 1,
            updatedAt: 1,
          },
          meals: previousDayMeals,
        },
        target: TARGETS,
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { wrapper } = createQueryClientWrapper();
    render(<NutritionPage />, { wrapper });

    await vi.runAllTimersAsync();
    await Promise.resolve();

    const dailyTotals = screen.getByLabelText('Daily macro totals');

    expect(screen.getByRole('heading', { name: 'Nutrition' })).toBeInTheDocument();
    expect(screen.getByText('Friday, March 6')).toBeInTheDocument();
    expect(screen.getByText('Friday, Mar 6')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to next day' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'No meals logged today' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to today' })).not.toBeInTheDocument();
    expect(within(dailyTotals).getByText(/\/ 2300 cal/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/nutrition/2026-03-05'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/nutrition/2026-03-07'),
      expect.objectContaining({ method: 'GET' }),
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/nutrition/2026-03-06', expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/nutrition/2026-03-06/summary',
      expect.any(Object),
    );
  });

  it('shows date-aware empty-state copy and go-to-today action on non-today dates', async () => {
    const { fetchMock } = createNutritionApiMock({
      '2026-03-06': {
        daily: null,
        target: TARGETS,
      },
      '2026-03-05': {
        daily: null,
        target: TARGETS,
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { wrapper } = createQueryClientWrapper();
    render(<NutritionPage />, { wrapper });

    await vi.runAllTimersAsync();
    await Promise.resolve();

    fireEvent.click(screen.getByRole('button', { name: 'Go to previous day' }));
    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.getByText('Thursday, March 5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No meals logged for this day' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to today' }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.getByText('Friday, March 6')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No meals logged today' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to today' })).not.toBeInTheDocument();
  });

  it('renders previous day meals from API in breakfast, lunch, dinner, snacks order', async () => {
    const { fetchMock } = createNutritionApiMock({
      '2026-03-06': {
        daily: null,
        target: TARGETS,
      },
      '2026-03-05': {
        daily: {
          log: {
            id: 'log-2026-03-05',
            userId: 'user-1',
            date: '2026-03-05',
            notes: null,
            createdAt: 1,
            updatedAt: 1,
          },
          meals: previousDayMeals,
        },
        target: TARGETS,
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { wrapper } = createQueryClientWrapper();
    render(<NutritionPage />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Go to previous day' }));
    await vi.runAllTimersAsync();
    await Promise.resolve();

    const breakfast = getMealToggleButton('Breakfast');
    const lunch = getMealToggleButton('Lunch');
    const dinner = getMealToggleButton('Dinner');
    const snacks = getMealToggleButton('Snacks');

    expect(screen.getByText('Thursday, March 5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
    expect(
      breakfast.compareDocumentPosition(lunch) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(lunch.compareDocumentPosition(dinner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dinner.compareDocumentPosition(snacks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('expands a meal and deletes it via the API mutation', async () => {
    const { fetchMock } = createNutritionApiMock({
      '2026-03-06': {
        daily: null,
        target: TARGETS,
      },
      '2026-03-05': {
        daily: {
          log: {
            id: 'log-2026-03-05',
            userId: 'user-1',
            date: '2026-03-05',
            notes: null,
            createdAt: 1,
            updatedAt: 1,
          },
          meals: previousDayMeals,
        },
        target: TARGETS,
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { wrapper } = createQueryClientWrapper();
    render(<NutritionPage />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Go to previous day' }));
    await vi.runAllTimersAsync();
    await Promise.resolve();

    fireEvent.click(getMealToggleButton('Breakfast'));
    expect(screen.getByText('Large Eggs')).toBeInTheDocument();
    expect(screen.getByText('3 eggs')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Breakfast' }));
    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(
      screen
        .queryAllByRole('button', { name: /breakfast/i })
        .find((candidate) => candidate.hasAttribute('aria-controls')),
    ).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/nutrition/2026-03-05/meals/meal-breakfast',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
    const dailyTotals = screen.getByLabelText('Daily macro totals');
    expect(within(dailyTotals).getByText('1142 cal')).toBeInTheDocument();
  });

  it('shows loading skeletons while daily + summary queries are pending', () => {
    const deferredDaily = createDeferredResponse();
    const deferredSummary = createDeferredResponse();

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');

      if (url.pathname === '/api/v1/nutrition/2026-03-06') {
        return deferredDaily.promise;
      }

      if (url.pathname === '/api/v1/nutrition/2026-03-06/summary') {
        return deferredSummary.promise;
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { wrapper } = createQueryClientWrapper();
    render(<NutritionPage />, { wrapper });

    expect(screen.getByLabelText('Loading nutrition')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading nutrition rings')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading nutrition meals')).toBeInTheDocument();
    expect(screen.getAllByTestId('meal-card-skeleton')).toHaveLength(4);
  });

  it('shows no-target copy and hides macro rings when no daily target is configured', async () => {
    const { fetchMock } = createNutritionApiMock({
      '2026-03-06': {
        daily: null,
        target: null,
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { wrapper } = createQueryClientWrapper();
    render(<NutritionPage />, { wrapper });

    await vi.runAllTimersAsync();
    await Promise.resolve();

    const dailyTotals = screen.getByLabelText('Daily macro totals');

    expect(within(dailyTotals).getAllByText('/ No target set')).toHaveLength(4);
    expect(screen.getByText(/No daily macro target is set yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eaten' })).not.toBeInTheDocument();
  });
});
