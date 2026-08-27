import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import type { FoodAnalyticsDetail, FoodAnalyticsResponse } from '@pulse/shared';

import { useFoodAnalytics, useFoodAnalyticsDetail } from '@/features/foods/api/food-analytics';
import { useUpdateFood } from '@/features/foods/api/foods';

import { FoodAnalyticsWorkspace } from './food-analytics-workspace';

vi.mock('@/features/foods/api/food-analytics', () => ({
  useFoodAnalytics: vi.fn(),
  useFoodAnalyticsDetail: vi.fn(),
}));
vi.mock('@/features/foods/api/foods', () => ({
  useUpdateFood: vi.fn(),
}));

const food = {
  foodId: '00000000-0000-4000-8000-000000000001',
  name: 'Greek Yogurt',
  brand: 'Plain Foods',
  tags: ['breakfast', 'protein'],
  currentDefinition: {
    servingSize: '1 cup',
    servingGrams: 170,
    calories: 150,
    protein: 15,
    carbs: 10,
    fat: 3,
    fiber: null,
    sugar: 6,
    proteinPer100Kcal: 10,
    caloriesPer100Grams: 88.235,
    macroDerivedCalories: 127,
    macroCalorieDifference: 23,
    macroCalorieTolerance: 10,
    verified: true,
    source: 'Manufacturer label',
    notes: 'Plain',
    updatedAt: 1_700_000_000_000,
  },
  observed: {
    usageOccurrences: 2,
    distinctLoggedDays: 2,
    lastLoggedLocalDate: '2026-08-24',
    totalCalories: 300,
    totalProtein: 30,
    linkedCalorieSharePercent: 85.714,
    proteinPer100Kcal: 10,
    caloriesPer100Grams: 88.235,
    portion: {
      state: 'compatible' as const,
      unit: 'g',
      medianQuantity: 170,
      recentQuantity: 170,
      recentLocalDate: '2026-08-24',
      evidenceCount: 2,
    },
    dayStates: {
      complete: { occurrences: 1, distinctDays: 1 },
      partial: { occurrences: 1, distinctDays: 1 },
      unknown: { occurrences: 0, distinctDays: 0 },
    },
  },
  definitionReviewReasons: ['MACRO_CALORIE_MISMATCH' as const],
};

const response: FoodAnalyticsResponse = {
  data: {
    range: {
      kind: '30d',
      startDate: '2026-07-27',
      endDate: '2026-08-25',
      calendarDays: 30,
      timeZone: 'America/Detroit',
      timeZoneSource: 'request',
      isHistorical: false,
    },
    summary: {
      savedFoodsTotal: 2,
      savedFoodsUsed: 1,
      linkedUsageOccurrences: 2,
      distinctLoggedDays: 2,
      linkedFoodCalories: 300,
      totalMealItemCalories: 400,
      linkedCaloriesPercent: 75,
      unlinkedMealItemCount: 1,
      unlinkedMealItemCalories: 100,
      inactiveLinkedMealItemCount: 0,
      inactiveLinkedMealItemCalories: 0,
      unresolvedLinkedMealItemCount: 0,
      unresolvedLinkedMealItemCalories: 0,
      definitionsNeedingReview: 1,
      dayStates: {
        complete: { occurrences: 1, distinctDays: 1 },
        partial: { occurrences: 1, distinctDays: 1 },
        unknown: { occurrences: 0, distinctDays: 0 },
      },
    },
    items: [food],
    availableTags: ['breakfast', 'protein'],
  },
  meta: { page: 1, limit: 10, total: 1 },
};

const detail: FoodAnalyticsDetail = {
  range: response.data.range,
  food,
  occurrences: [
    {
      mealItemId: '10000000-0000-4000-8000-000000000001',
      mealId: '20000000-0000-4000-8000-000000000001',
      localDate: '2026-08-24',
      mealName: 'Lunch',
      mealTime: '12:00',
      quantity: 170,
      unit: 'g',
      calories: 200,
      protein: 20,
      carbs: 10,
      fat: 3,
      nutritionDayState: 'complete',
    },
  ],
  occurrenceMeta: { page: 1, limit: 25, total: 1 },
  snapshotNotice:
    'Editing this saved food changes future defaults only. Historical meal snapshots stay unchanged.',
};

const setupMocks = () => {
  vi.mocked(useFoodAnalytics).mockReturnValue({
    data: response,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  } as never);
  vi.mocked(useFoodAnalyticsDetail).mockImplementation(
    (foodId) =>
      ({
        data: foodId ? detail : undefined,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      }) as never,
  );
  vi.mocked(useUpdateFood).mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  } as never);
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FoodAnalyticsWorkspace', () => {
  it('labels selected-range contribution denominators and keeps current definitions separate', () => {
    setupMocks();
    render(
      <MemoryRouter initialEntries={['/nutrition?view=foods&foodMode=analytics']}>
        <FoodAnalyticsWorkspace referenceDate="2026-08-25" timeZone="America/Detroit" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Food library analytics' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Of all meal-item calories')).toBeInTheDocument();
    expect(screen.getByText('85.7% of linked-food calories')).toBeInTheDocument();
    expect(screen.getByText(/America\/Detroit/)).toBeInTheDocument();
    expect(screen.getAllByText('Calories differ from macro estimate').length).toBeGreaterThan(0);
    expect(screen.queryByText(/health score/i)).not.toBeInTheDocument();

    const search = screen.getByRole('textbox', { name: 'Search saved foods' });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Trail ' } });
    expect(search).toHaveValue('Trail ');
    fireEvent.change(search, { target: { value: 'Trail M' } });
    expect(search).toHaveValue('Trail M');
  });

  it('opens exact immutable occurrence evidence and links to its date and meal', () => {
    setupMocks();
    render(
      <MemoryRouter initialEntries={['/nutrition?view=foods&foodMode=analytics']}>
        <FoodAnalyticsWorkspace referenceDate="2026-08-25" timeZone="America/Detroit" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View Greek Yogurt analytics' }));
    expect(screen.getByRole('heading', { name: 'Current definition' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Observed in 30D' })).toBeInTheDocument();
    expect(
      screen.getByText(/Historical meal entries keep the calories and macros recorded/),
    ).toBeInTheDocument();
    expect(screen.getByText('Complete 1 · Partial 1 · Unknown 0')).toBeInTheDocument();
    expect(screen.getAllByText('88.2 kcal / 100 g')).toHaveLength(3);
    expect(screen.getByText('170 g · Aug 24, 2026')).toBeInTheDocument();
    expect(screen.getByText(/10 g carbs · 3 g fat/)).toBeInTheDocument();
    expect(screen.getByText(/Nov 14, 2023/)).toBeInTheDocument();
    expect(screen.getByText(/Nov 14, 2023.*America\/Detroit/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open log/ })).toHaveAttribute(
      'href',
      '/nutrition?view=log&date=2026-08-24&meal=20000000-0000-4000-8000-000000000001',
    );
  });

  it('renders unavailable density and mixed portions without fabricated zeroes', () => {
    setupMocks();
    const unavailable = structuredClone(response);
    const firstItem = unavailable.data.items[0];
    if (!firstItem) throw new Error('Expected a food analytics fixture item');
    firstItem.observed.proteinPer100Kcal = null;
    firstItem.observed.caloriesPer100Grams = null;
    firstItem.observed.portion = {
      state: 'mixed_units',
      unit: null,
      medianQuantity: null,
      recentQuantity: null,
      recentLocalDate: null,
      evidenceCount: 2,
    };
    vi.mocked(useFoodAnalytics).mockReturnValue({
      data: unavailable,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    vi.mocked(useFoodAnalyticsDetail).mockReturnValue({
      data: { ...detail, food: firstItem },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(
      <MemoryRouter
        initialEntries={[
          '/nutrition?view=foods&foodMode=analytics&foodId=00000000-0000-4000-8000-000000000001',
        ]}
      >
        <FoodAnalyticsWorkspace referenceDate="2026-08-25" timeZone="America/Detroit" />
      </MemoryRouter>,
    );

    expect(screen.getByText('Not available · Observed calories are zero.')).toBeInTheDocument();
    expect(screen.getAllByText('Not comparable · Logged units differ.')).toHaveLength(2);
  });

  it('never renders stale placeholder detail as editable evidence', () => {
    setupMocks();
    vi.mocked(useFoodAnalyticsDetail).mockReturnValue({
      data: detail,
      isLoading: false,
      isPlaceholderData: true,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(
      <MemoryRouter
        initialEntries={[
          '/nutrition?view=foods&foodMode=analytics&foodId=00000000-0000-4000-8000-000000000002',
        ]}
      >
        <FoodAnalyticsWorkspace referenceDate="2026-08-25" timeZone="America/Detroit" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Food analytics' })).toBeInTheDocument();
    expect(screen.getByLabelText('Loading food detail')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit definition' })).not.toBeInTheDocument();
    expect(
      screen.queryByText('Greek Yogurt', { selector: '[data-slot="sheet-title"]' }),
    ).toBeNull();
  });

  it('renders loading, failure retry, empty-library, and search recovery states honestly', () => {
    setupMocks();
    vi.mocked(useFoodAnalytics).mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isError: false,
      refetch: vi.fn(),
    } as never);
    const { unmount } = render(
      <MemoryRouter initialEntries={['/nutrition?view=foods&foodMode=analytics']}>
        <FoodAnalyticsWorkspace referenceDate="2026-08-25" timeZone="America/Detroit" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status', { name: 'Loading food analytics' })).toBeInTheDocument();
    unmount();

    const refetch = vi.fn();
    vi.mocked(useFoodAnalytics).mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      refetch,
    } as never);
    const failure = render(
      <MemoryRouter initialEntries={['/nutrition?view=foods&foodMode=analytics']}>
        <FoodAnalyticsWorkspace referenceDate="2026-08-25" timeZone="America/Detroit" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
    failure.unmount();

    const empty = structuredClone(response);
    empty.data.items = [];
    empty.data.summary.savedFoodsTotal = 0;
    empty.meta.total = 0;
    vi.mocked(useFoodAnalytics).mockReturnValue({
      data: empty,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    const emptyRender = render(
      <MemoryRouter initialEntries={['/nutrition?view=foods&foodMode=analytics']}>
        <FoodAnalyticsWorkspace referenceDate="2026-08-25" timeZone="America/Detroit" />
      </MemoryRouter>,
    );
    expect(screen.getByText('No saved foods yet')).toBeInTheDocument();
    emptyRender.unmount();

    const noMatch = structuredClone(response);
    noMatch.data.items = [];
    noMatch.meta.total = 0;
    vi.mocked(useFoodAnalytics).mockReturnValue({
      data: noMatch,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(
      <MemoryRouter
        initialEntries={['/nutrition?view=foods&foodMode=analytics&analyticsQ=missing']}
      >
        <FoodAnalyticsWorkspace referenceDate="2026-08-25" timeZone="America/Detroit" />
      </MemoryRouter>,
    );
    const search = screen.getByRole('textbox', { name: 'Search saved foods' });
    expect(search).toHaveValue('missing');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(search).toHaveValue('');
  });
});
