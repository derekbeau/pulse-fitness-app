import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mealItems, meals, nutritionLogs, nutritionTargets } from '../../db/schema/index.js';

const testState = vi.hoisted(() => {
  const aggregateGet = vi.fn();
  const aggregateWhere = vi.fn(() => ({
    get: aggregateGet,
  }));
  const aggregateLeftJoinMealItems = vi.fn(() => ({
    where: aggregateWhere,
  }));
  const aggregateLeftJoinMeals = vi.fn(() => ({
    leftJoin: aggregateLeftJoinMealItems,
  }));
  const aggregateFrom = vi.fn(() => ({
    leftJoin: aggregateLeftJoinMeals,
  }));

  const targetGet = vi.fn();
  const targetLimit = vi.fn(() => ({
    get: targetGet,
  }));
  const targetOrderBy = vi.fn(() => ({
    limit: targetLimit,
  }));
  const targetWhere = vi.fn(() => ({
    orderBy: targetOrderBy,
  }));
  const targetFrom = vi.fn(() => ({
    where: targetWhere,
  }));

  const weekActualAll = vi.fn();
  const weekActualGroupBy = vi.fn(() => ({
    all: weekActualAll,
  }));
  const weekActualWhere = vi.fn(() => ({
    groupBy: weekActualGroupBy,
  }));
  const weekActualLeftJoinMealItems = vi.fn(() => ({
    where: weekActualWhere,
  }));
  const weekActualLeftJoinMeals = vi.fn(() => ({
    leftJoin: weekActualLeftJoinMealItems,
  }));
  const weekActualFrom = vi.fn(() => ({
    leftJoin: weekActualLeftJoinMeals,
  }));

  const weekTargetAll = vi.fn();
  const weekTargetLimit = vi.fn(() => ({
    all: weekTargetAll,
  }));
  const weekTargetOrderBy = vi.fn(() => ({
    limit: weekTargetLimit,
  }));
  const weekTargetWhere = vi.fn(() => ({
    orderBy: weekTargetOrderBy,
  }));
  const weekTargetFrom = vi.fn(() => ({
    where: weekTargetWhere,
  }));

  const select = vi.fn();

  const queueSummarySelects = () => {
    select.mockImplementationOnce(() => ({
      from: aggregateFrom,
    }));
    select.mockImplementationOnce(() => ({
      from: targetFrom,
    }));
  };

  const queueWeekSummarySelects = () => {
    select.mockImplementationOnce(() => ({
      from: weekActualFrom,
    }));
    select.mockImplementationOnce(() => ({
      from: weekTargetFrom,
    }));
  };

  return {
    db: {
      select,
    },
    reset() {
      select.mockReset();
      aggregateFrom.mockClear();
      aggregateLeftJoinMeals.mockClear();
      aggregateLeftJoinMealItems.mockClear();
      aggregateWhere.mockClear();
      aggregateGet.mockClear();
      targetFrom.mockClear();
      targetWhere.mockClear();
      targetOrderBy.mockClear();
      targetLimit.mockClear();
      targetGet.mockClear();
      weekActualFrom.mockClear();
      weekActualLeftJoinMeals.mockClear();
      weekActualLeftJoinMealItems.mockClear();
      weekActualWhere.mockClear();
      weekActualGroupBy.mockClear();
      weekActualAll.mockClear();
      weekTargetFrom.mockClear();
      weekTargetWhere.mockClear();
      weekTargetOrderBy.mockClear();
      weekTargetLimit.mockClear();
      weekTargetAll.mockClear();
      queueSummarySelects();
    },
    queueWeekSummarySelects,
    select,
    aggregateFrom,
    aggregateLeftJoinMeals,
    aggregateLeftJoinMealItems,
    aggregateWhere,
    aggregateGet,
    targetFrom,
    targetWhere,
    targetOrderBy,
    targetLimit,
    targetGet,
    weekActualFrom,
    weekActualLeftJoinMeals,
    weekActualLeftJoinMealItems,
    weekActualWhere,
    weekActualGroupBy,
    weekActualAll,
    weekTargetFrom,
    weekTargetWhere,
    weekTargetOrderBy,
    weekTargetLimit,
    weekTargetAll,
  };
});

vi.mock('../../db/index.js', () => ({
  db: testState.db,
}));

describe('nutrition store', () => {
  beforeEach(() => {
    testState.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a daily summary using aggregated actuals and effective target macros', async () => {
    testState.aggregateGet.mockReturnValue({
      calories: 1_850,
      protein: 150,
      carbs: 175,
      fat: 62,
      meals: 3,
    });
    testState.targetGet.mockReturnValue({
      calories: 2_200,
      protein: 180,
      carbs: 250,
      fat: 70,
    });

    const { getDailyNutritionSummaryForDate } = await import('./store.js');
    const summary = await getDailyNutritionSummaryForDate('user-1', '2026-03-09');

    expect(summary).toEqual({
      date: '2026-03-09',
      meals: 3,
      actual: {
        calories: 1_850,
        protein: 150,
        carbs: 175,
        fat: 62,
      },
      target: {
        calories: 2_200,
        protein: 180,
        carbs: 250,
        fat: 70,
      },
    });

    expect(testState.select).toHaveBeenCalledTimes(2);
    expect(testState.aggregateFrom).toHaveBeenCalledWith(nutritionLogs);
    expect(testState.aggregateLeftJoinMeals).toHaveBeenCalledWith(meals, expect.anything());
    expect(testState.aggregateLeftJoinMealItems).toHaveBeenCalledWith(mealItems, expect.anything());
    expect(testState.targetFrom).toHaveBeenCalledWith(nutritionTargets);
    expect(testState.targetLimit).toHaveBeenCalledWith(1);
  });

  it('returns zeroed actuals with null target when no log or target exists', async () => {
    testState.aggregateGet.mockReturnValue(undefined);
    testState.targetGet.mockReturnValue(undefined);

    const { getDailyNutritionSummaryForDate } = await import('./store.js');
    const summary = await getDailyNutritionSummaryForDate('user-1', '2026-03-10');

    expect(summary).toEqual({
      date: '2026-03-10',
      meals: 0,
      actual: {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
      target: null,
    });
    expect(testState.targetOrderBy).toHaveBeenCalledOnce();
  });

  it('calculates completeness as zero when no meals are logged', async () => {
    const { calculateNutritionCompleteness } = await import('./store.js');

    expect(
      calculateNutritionCompleteness({
        calories: 1500,
        caloriesTarget: 2200,
        protein: 120,
        proteinTarget: 180,
        mealCount: 0,
      }),
    ).toBe(0);
  });

  it('calculates completeness as one when calories and protein are at target', async () => {
    const { calculateNutritionCompleteness } = await import('./store.js');

    expect(
      calculateNutritionCompleteness({
        calories: 2200,
        caloriesTarget: 2200,
        protein: 180,
        proteinTarget: 180,
        mealCount: 3,
      }),
    ).toBe(1);
  });

  it('calculates completeness as partial when meals exist but macros are below target', async () => {
    const { calculateNutritionCompleteness } = await import('./store.js');

    expect(
      calculateNutritionCompleteness({
        calories: 1_650,
        caloriesTarget: 2_200,
        protein: 135,
        proteinTarget: 180,
        mealCount: 2,
      }),
    ).toBe(0.75);
  });

  it('returns monday-start week summary with carry-forward targets and zeroed missing days', async () => {
    testState.select.mockReset();
    testState.queueWeekSummarySelects();
    testState.weekActualAll.mockReturnValue([
      {
        date: '2026-03-04',
        calories: 1500,
        protein: 100,
        mealCount: 2,
      },
      {
        date: '2026-03-07',
        calories: 2100,
        protein: 170,
        mealCount: 3,
      },
    ]);
    testState.weekTargetAll.mockReturnValue([
      {
        effectiveDate: '2026-03-06',
        calories: 2100,
        protein: 170,
      },
      {
        effectiveDate: '2026-03-03',
        calories: 1900,
        protein: 150,
      },
      {
        effectiveDate: '2026-02-25',
        calories: 1700,
        protein: 130,
      },
    ]);

    const { getNutritionWeekSummaryForDate } = await import('./store.js');
    const summary = await getNutritionWeekSummaryForDate('user-1', new Date('2026-03-05T09:30:00Z'));

    expect(summary.map((day) => day.date)).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ]);
    expect(summary[0]).toMatchObject({
      date: '2026-03-02',
      calories: 0,
      protein: 0,
      mealCount: 0,
      caloriesTarget: 1700,
      proteinTarget: 130,
      completeness: 0,
    });
    expect(summary[2]).toMatchObject({
      date: '2026-03-04',
      calories: 1500,
      protein: 100,
      mealCount: 2,
      caloriesTarget: 1900,
      proteinTarget: 150,
      completeness: 0.7280701754385965,
    });
    expect(summary[4]).toMatchObject({
      date: '2026-03-06',
      caloriesTarget: 2100,
      proteinTarget: 170,
    });
    expect(summary[6]).toMatchObject({
      date: '2026-03-08',
      calories: 0,
      protein: 0,
      mealCount: 0,
      caloriesTarget: 2100,
      proteinTarget: 170,
      completeness: 0,
    });

    expect(testState.weekActualFrom).toHaveBeenCalledWith(nutritionLogs);
    expect(testState.weekTargetFrom).toHaveBeenCalledWith(nutritionTargets);
    expect(testState.weekTargetLimit).toHaveBeenCalledWith(8);
  });
});
