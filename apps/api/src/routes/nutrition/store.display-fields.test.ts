import { beforeEach, describe, expect, it, vi } from 'vitest';

import { foods, mealItems, meals, nutritionLogs } from '../../db/schema/index.js';

const testState = vi.hoisted(() => {
  const db = {
    transaction: vi.fn(),
    select: vi.fn(),
  };

  const capture = {
    insertedMealItemValues: [] as Array<Record<string, unknown>>,
  };

  const reset = () => {
    db.transaction.mockReset();
    db.select.mockReset();
    capture.insertedMealItemValues = [];
  };

  return { db, capture, reset };
});

vi.mock('../../db/index.js', () => ({
  db: testState.db,
}));

const createTxForMealInsert = (returnedItems: Array<Record<string, unknown>>) => {
  const runNutritionLogInsert = vi.fn();
  const getNutritionLog = vi.fn(() => ({
    id: 'log-1',
    userId: 'user-1',
    date: '2026-03-09',
    notes: null,
    createdAt: 1,
    updatedAt: 1,
  }));
  const getMeal = vi.fn(() => ({
    id: 'meal-1',
    nutritionLogId: 'log-1',
    name: 'Lunch',
    time: null,
    notes: null,
    createdAt: 2,
    updatedAt: 2,
  }));
  const allMealItems = vi.fn(() => returnedItems);

  const tx = {
    insert: vi.fn((table) => {
      if (table === nutritionLogs) {
        return {
          values: vi.fn(() => ({
            onConflictDoNothing: vi.fn(() => ({ run: runNutritionLogInsert })),
          })),
        };
      }

      if (table === meals) {
        return {
          values: vi.fn(() => ({
            returning: vi.fn(() => ({ get: getMeal })),
          })),
        };
      }

      if (table === mealItems) {
        return {
          values: vi.fn((values: Array<Record<string, unknown>>) => {
            testState.capture.insertedMealItemValues = values;
            return {
              returning: vi.fn(() => ({ all: allMealItems })),
            };
          }),
        };
      }

      throw new Error(`Unexpected insert table: ${String(table)}`);
    }),
    select: vi.fn(() => ({
      from: vi.fn((table) => {
        if (table === nutritionLogs) {
          return {
            where: vi.fn(() => ({
              limit: vi.fn(() => ({ get: getNutritionLog })),
            })),
          };
        }

        if (table === foods) {
          return {
            where: vi.fn(() => ({ all: vi.fn(() => []) })),
          };
        }

        throw new Error(`Unexpected select table: ${String(table)}`);
      }),
    })),
  };

  return tx;
};

describe('nutrition store display fields', () => {
  beforeEach(() => {
    testState.reset();
  });

  it('persists displayQuantity/displayUnit when provided', async () => {
    const returnedItems = [
      {
        id: 'item-1',
        mealId: 'meal-1',
        foodId: null,
        name: 'Whey Protein',
        amount: 1,
        unit: 'serving',
        displayQuantity: 2,
        displayUnit: 'scoops',
        calories: 120,
        protein: 24,
        carbs: 3,
        fat: 1.5,
        fiber: null,
        sugar: null,
        createdAt: 3,
      },
    ];

    testState.db.transaction.mockImplementation(
      (callback: (tx: ReturnType<typeof createTxForMealInsert>) => unknown) =>
        callback(createTxForMealInsert(returnedItems)),
    );

    const { createMealForDate } = await import('./store.js');
    const result = await createMealForDate('user-1', '2026-03-09', {
      name: 'Lunch',
      items: [
        {
          name: 'Whey Protein',
          amount: 1,
          unit: 'serving',
          displayQuantity: 2,
          displayUnit: 'scoops',
          calories: 120,
          protein: 24,
          carbs: 3,
          fat: 1.5,
        },
      ],
    });

    expect(testState.capture.insertedMealItemValues).toEqual([
      expect.objectContaining({
        displayQuantity: 2,
        displayUnit: 'scoops',
      }),
    ]);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ displayQuantity: 2, displayUnit: 'scoops' }),
    );
  });

  it('stores null display fields when omitted', async () => {
    const returnedItems = [
      {
        id: 'item-1',
        mealId: 'meal-1',
        foodId: null,
        name: 'Banana',
        amount: 1,
        unit: 'serving',
        displayQuantity: null,
        displayUnit: null,
        calories: 105,
        protein: 1.3,
        carbs: 27,
        fat: 0.3,
        fiber: null,
        sugar: null,
        createdAt: 3,
      },
    ];

    testState.db.transaction.mockImplementation(
      (callback: (tx: ReturnType<typeof createTxForMealInsert>) => unknown) =>
        callback(createTxForMealInsert(returnedItems)),
    );

    const { createMealForDate } = await import('./store.js');
    const result = await createMealForDate('user-1', '2026-03-09', {
      name: 'Breakfast',
      items: [
        {
          name: 'Banana',
          amount: 1,
          unit: 'serving',
          calories: 105,
          protein: 1.3,
          carbs: 27,
          fat: 0.3,
        },
      ],
    });

    expect(testState.capture.insertedMealItemValues).toEqual([
      expect.objectContaining({
        displayQuantity: null,
        displayUnit: null,
      }),
    ]);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ displayQuantity: null, displayUnit: null }),
    );
  });

  it('returns display fields when reading daily nutrition, including nulls', async () => {
    testState.db.select
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn(() => ({
                id: 'log-1',
                userId: 'user-1',
                date: '2026-03-09',
                notes: null,
                createdAt: 1,
                updatedAt: 1,
              })),
            })),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              all: vi.fn(() => [
                {
                  id: 'meal-1',
                  nutritionLogId: 'log-1',
                  name: 'Breakfast',
                  time: null,
                  notes: null,
                  createdAt: 2,
                  updatedAt: 2,
                },
              ]),
            })),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              all: vi.fn(() => [
                {
                  id: 'item-1',
                  mealId: 'meal-1',
                  foodId: null,
                  name: 'Whey Protein',
                  amount: 1,
                  unit: 'serving',
                  displayQuantity: 2,
                  displayUnit: 'scoops',
                  calories: 120,
                  protein: 24,
                  carbs: 3,
                  fat: 1.5,
                  fiber: null,
                  sugar: null,
                  createdAt: 3,
                },
                {
                  id: 'item-2',
                  mealId: 'meal-1',
                  foodId: null,
                  name: 'Creatine',
                  amount: 1,
                  unit: 'serving',
                  displayQuantity: null,
                  displayUnit: null,
                  calories: 0,
                  protein: 0,
                  carbs: 0,
                  fat: 0,
                  fiber: null,
                  sugar: null,
                  createdAt: 4,
                },
              ]),
            })),
          })),
        })),
      }));

    const { getDailyNutritionForDate } = await import('./store.js');
    const result = await getDailyNutritionForDate('user-1', '2026-03-09');

    expect(result?.meals[0]?.items).toEqual([
      expect.objectContaining({ displayQuantity: 2, displayUnit: 'scoops' }),
      expect.objectContaining({ displayQuantity: null, displayUnit: null }),
    ]);
  });
});
