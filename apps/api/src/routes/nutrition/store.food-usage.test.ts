import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTableName = (table: object) =>
  (table as Record<symbol, unknown>)[Symbol.for('drizzle:Name')];

const testState = vi.hoisted(() => {
  const db = {
    transaction: vi.fn(),
  };

  const trackFoodUsage = vi.fn();
  const decrementFoodUsage = vi.fn();

  const reset = () => {
    db.transaction.mockReset();
    trackFoodUsage.mockReset();
    decrementFoodUsage.mockReset();
  };

  return {
    db,
    trackFoodUsage,
    decrementFoodUsage,
    reset,
  };
});

vi.mock('../../db/index.js', () => ({
  db: testState.db,
}));

vi.mock('../foods/store.js', () => ({
  trackFoodUsage: testState.trackFoodUsage,
  decrementFoodUsage: testState.decrementFoodUsage,
}));

const createTxForMealInsert = (returnedItems: Array<Record<string, unknown>>) => {
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
    summary: null,
    time: null,
    notes: null,
    createdAt: 2,
    updatedAt: 2,
  }));
  const ownedFoodsAll = vi.fn(() =>
    returnedItems
      .map((item) => item.foodId)
      .filter((foodId): foodId is string => typeof foodId === 'string')
      .filter((foodId, index, foodIds) => foodIds.indexOf(foodId) === index)
      .map((id) => ({ id })),
  );
  const insertedMealItemsAll = vi.fn(() => returnedItems);

  return {
    insert: vi.fn((table) => {
      if (getTableName(table) === 'nutrition_logs') {
        return {
          values: vi.fn(() => ({
            onConflictDoNothing: vi.fn(() => ({
              run: vi.fn(),
            })),
          })),
        };
      }

      if (getTableName(table) === 'meals') {
        return {
          values: vi.fn(() => ({
            returning: vi.fn(() => ({
              get: getMeal,
            })),
          })),
        };
      }

      if (getTableName(table) === 'meal_items') {
        return {
          values: vi.fn(() => ({
            returning: vi.fn(() => ({
              all: insertedMealItemsAll,
            })),
          })),
        };
      }

      throw new Error(`Unexpected insert table: ${String(table)}`);
    }),
    select: vi.fn(() => ({
      from: vi.fn((table) => {
        if (getTableName(table) === 'nutrition_logs') {
          return {
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: getNutritionLog,
              })),
            })),
          };
        }

        if (getTableName(table) === 'foods') {
          return {
            where: vi.fn(() => ({
              all: ownedFoodsAll,
            })),
          };
        }

        throw new Error(`Unexpected select table: ${String(table)}`);
      }),
    })),
  };
};

const createTxForAddMealItems = (options: {
  mealExists?: boolean;
  insertedItems: Array<Record<string, unknown>>;
  allMealItems: Array<Record<string, unknown>>;
  updatedAt?: number;
}) => {
  const mealExists = options.mealExists ?? true;
  const existingMeal = mealExists
    ? {
        id: 'meal-1',
        nutritionLogId: 'log-1',
        name: 'Lunch',
        summary: null,
        time: null,
        notes: null,
        createdAt: 2,
        updatedAt: 2,
      }
    : undefined;
  const ownedFoodsAll = vi.fn(() =>
    options.insertedItems
      .map((item) => item.foodId)
      .filter((foodId): foodId is string => typeof foodId === 'string')
      .filter((foodId, index, foodIds) => foodIds.indexOf(foodId) === index)
      .map((id) => ({ id })),
  );
  const insertedMealItemsAll = vi.fn(() => options.insertedItems);
  const allMealItemsAll = vi.fn(() => options.allMealItems);
  const getUpdatedMeal = vi.fn(() =>
    existingMeal
      ? {
          ...existingMeal,
          updatedAt: options.updatedAt ?? 3,
        }
      : undefined,
  );

  return {
    select: vi.fn(() => ({
      from: vi.fn((table) => {
        if (getTableName(table) === 'meals') {
          return {
            innerJoin: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(() => ({
                  get: vi.fn(() => existingMeal),
                })),
              })),
            })),
          };
        }

        if (getTableName(table) === 'foods') {
          return {
            where: vi.fn(() => ({
              all: ownedFoodsAll,
            })),
          };
        }

        if (getTableName(table) === 'meal_items') {
          return {
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                all: allMealItemsAll,
              })),
            })),
          };
        }

        throw new Error(`Unexpected select table: ${String(table)}`);
      }),
    })),
    insert: vi.fn((table) => {
      if (getTableName(table) === 'meal_items') {
        return {
          values: vi.fn(() => ({
            returning: vi.fn(() => ({
              all: insertedMealItemsAll,
            })),
          })),
        };
      }

      throw new Error(`Unexpected insert table: ${String(table)}`);
    }),
    update: vi.fn((table) => {
      if (getTableName(table) === 'meals') {
        return {
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(() => ({
                get: getUpdatedMeal,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected update table: ${String(table)}`);
    }),
  };
};

const createTxForMealDelete = (
  options: { exists?: boolean; foodIds?: Array<string | null> } = {},
) => {
  const exists = options.exists ?? true;
  const foodIds = options.foodIds ?? ['food-1'];

  return {
    select: vi.fn(() => ({
      from: vi.fn((table) => {
        if (getTableName(table) === 'meals') {
          return {
            innerJoin: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(() => ({
                  get: vi.fn(() => (exists ? { id: 'meal-1' } : undefined)),
                })),
              })),
            })),
          };
        }

        if (getTableName(table) === 'meal_items') {
          return {
            where: vi.fn(() => ({
              all: vi.fn(() => foodIds.map((foodId) => ({ foodId }))),
            })),
          };
        }

        throw new Error(`Unexpected select table: ${String(table)}`);
      }),
    })),
    delete: vi.fn((table) => {
      if (getTableName(table) === 'meal_items' || getTableName(table) === 'meals') {
        return {
          where: vi.fn(() => ({
            run: vi.fn(() => ({
              changes: exists ? 1 : 0,
            })),
          })),
        };
      }

      throw new Error(`Unexpected delete table: ${String(table)}`);
    }),
  };
};

const createTxForMealItemPatch = (options: {
  existingFoodId: string | null;
  updatedFoodId: string | null;
}) => {
  const existingItem = {
    id: 'item-1',
    mealId: 'meal-1',
    foodId: options.existingFoodId,
    name: 'Chicken',
    amount: 1,
    unit: 'serving',
    displayQuantity: null,
    displayUnit: null,
    calories: 300,
    protein: 40,
    carbs: 0,
    fat: 10,
    fiber: null,
    sugar: null,
    createdAt: 1,
  };
  const updatedItem = {
    ...existingItem,
    foodId: options.updatedFoodId,
  };

  return {
    select: vi.fn(() => ({
      from: vi.fn((table) => {
        if (getTableName(table) === 'meal_items') {
          return {
            innerJoin: vi.fn(() => ({
              innerJoin: vi.fn(() => ({
                where: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    get: vi.fn(() => existingItem),
                  })),
                })),
              })),
            })),
          };
        }

        if (getTableName(table) === 'foods') {
          return {
            where: vi.fn(() => ({
              all: vi.fn(() =>
                options.updatedFoodId === null ? [] : [{ id: options.updatedFoodId }],
              ),
            })),
          };
        }

        throw new Error(`Unexpected select table: ${String(table)}`);
      }),
    })),
    update: vi.fn((table) => {
      if (getTableName(table) === 'meal_items') {
        return {
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(() => ({
                get: vi.fn(() => updatedItem),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected update table: ${String(table)}`);
    }),
  };
};

describe('nutrition store food usage tracking', () => {
  beforeEach(() => {
    vi.resetModules();
    testState.reset();
    testState.trackFoodUsage.mockResolvedValue(undefined);
    testState.decrementFoodUsage.mockResolvedValue(undefined);
  });

  it('tracks saved-food meal item creation', async () => {
    testState.db.transaction.mockImplementation(
      (callback: (tx: ReturnType<typeof createTxForMealInsert>) => unknown) =>
        callback(
          createTxForMealInsert([
            {
              id: 'item-1',
              mealId: 'meal-1',
              foodId: 'food-1',
              name: 'Chicken',
              amount: 1,
              unit: 'serving',
              displayQuantity: null,
              displayUnit: null,
              calories: 300,
              protein: 40,
              carbs: 0,
              fat: 10,
              fiber: null,
              sugar: null,
              createdAt: 3,
            },
          ]),
        ),
    );

    const { createMealForDate } = await import('./store.js');
    await createMealForDate('user-1', '2026-03-09', {
      name: 'Lunch',
      items: [
        {
          foodId: 'food-1',
          name: 'Chicken',
          amount: 1,
          unit: 'serving',
          calories: 300,
          protein: 40,
          carbs: 0,
          fat: 10,
        },
      ],
    });

    expect(testState.trackFoodUsage).toHaveBeenCalledTimes(1);
    expect(testState.trackFoodUsage).toHaveBeenCalledWith('food-1', 'user-1');
    expect(testState.decrementFoodUsage).not.toHaveBeenCalled();
  });

  it('does not track ad-hoc meal item creation', async () => {
    testState.db.transaction.mockImplementation(
      (callback: (tx: ReturnType<typeof createTxForMealInsert>) => unknown) =>
        callback(
          createTxForMealInsert([
            {
              id: 'item-1',
              mealId: 'meal-1',
              foodId: null,
              name: 'Olive Oil',
              amount: 1,
              unit: 'tbsp',
              displayQuantity: null,
              displayUnit: null,
              calories: 120,
              protein: 0,
              carbs: 0,
              fat: 14,
              fiber: null,
              sugar: null,
              createdAt: 3,
            },
          ]),
        ),
    );

    const { createMealForDate } = await import('./store.js');
    await createMealForDate('user-1', '2026-03-09', {
      name: 'Lunch',
      items: [
        {
          name: 'Olive Oil',
          amount: 1,
          unit: 'tbsp',
          calories: 120,
          protein: 0,
          carbs: 0,
          fat: 14,
        },
      ],
    });

    expect(testState.trackFoodUsage).not.toHaveBeenCalled();
    expect(testState.decrementFoodUsage).not.toHaveBeenCalled();
  });

  it('appends items to an existing meal, refreshes updatedAt, and tracks saved foods', async () => {
    testState.db.transaction.mockImplementation(
      (callback: (tx: ReturnType<typeof createTxForAddMealItems>) => unknown) =>
        callback(
          createTxForAddMealItems({
            updatedAt: 10,
            insertedItems: [
              {
                id: 'item-2',
                mealId: 'meal-1',
                foodId: 'food-2',
                name: 'Rice',
                amount: 1,
                unit: 'cup',
                displayQuantity: null,
                displayUnit: null,
                calories: 200,
                protein: 4,
                carbs: 45,
                fat: 1,
                fiber: null,
                sugar: null,
                createdAt: 4,
              },
              {
                id: 'item-3',
                mealId: 'meal-1',
                foodId: null,
                name: 'Olive Oil',
                amount: 1,
                unit: 'tbsp',
                displayQuantity: null,
                displayUnit: null,
                calories: 120,
                protein: 0,
                carbs: 0,
                fat: 14,
                fiber: null,
                sugar: null,
                createdAt: 5,
              },
            ],
            allMealItems: [
              {
                id: 'item-1',
                mealId: 'meal-1',
                foodId: 'food-1',
                name: 'Chicken',
                amount: 1,
                unit: 'serving',
                displayQuantity: null,
                displayUnit: null,
                calories: 300,
                protein: 40,
                carbs: 0,
                fat: 10,
                fiber: null,
                sugar: null,
                createdAt: 3,
              },
              {
                id: 'item-2',
                mealId: 'meal-1',
                foodId: 'food-2',
                name: 'Rice',
                amount: 1,
                unit: 'cup',
                displayQuantity: null,
                displayUnit: null,
                calories: 200,
                protein: 4,
                carbs: 45,
                fat: 1,
                fiber: null,
                sugar: null,
                createdAt: 4,
              },
              {
                id: 'item-3',
                mealId: 'meal-1',
                foodId: null,
                name: 'Olive Oil',
                amount: 1,
                unit: 'tbsp',
                displayQuantity: null,
                displayUnit: null,
                calories: 120,
                protein: 0,
                carbs: 0,
                fat: 14,
                fiber: null,
                sugar: null,
                createdAt: 5,
              },
            ],
          }),
        ),
    );

    const { addItemsToMeal } = await import('./store.js');
    const updated = await addItemsToMeal('user-1', 'meal-1', [
      {
        foodId: 'food-2',
        name: 'Rice',
        amount: 1,
        unit: 'cup',
        calories: 200,
        protein: 4,
        carbs: 45,
        fat: 1,
      },
      {
        foodId: null,
        name: 'Olive Oil',
        amount: 1,
        unit: 'tbsp',
        calories: 120,
        protein: 0,
        carbs: 0,
        fat: 14,
      },
    ]);

    expect(updated).toBeDefined();
    expect(updated?.meal.updatedAt).toBe(10);
    expect(updated?.items).toHaveLength(3);
    const macroTotals = updated?.items.reduce(
      (totals, item) => ({
        calories: totals.calories + item.calories,
        protein: totals.protein + item.protein,
        carbs: totals.carbs + item.carbs,
        fat: totals.fat + item.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
    expect(macroTotals).toEqual({
      calories: 620,
      protein: 44,
      carbs: 45,
      fat: 25,
    });
    expect(testState.trackFoodUsage).toHaveBeenCalledTimes(1);
    expect(testState.trackFoodUsage).toHaveBeenCalledWith('food-2', 'user-1');
    expect(testState.decrementFoodUsage).not.toHaveBeenCalled();
  });

  it('returns undefined when appending items to a missing meal', async () => {
    testState.db.transaction.mockImplementation(
      (callback: (tx: ReturnType<typeof createTxForAddMealItems>) => unknown) =>
        callback(
          createTxForAddMealItems({
            mealExists: false,
            insertedItems: [],
            allMealItems: [],
          }),
        ),
    );

    const { addItemsToMeal } = await import('./store.js');
    const updated = await addItemsToMeal('user-1', 'missing-meal', [
      {
        name: 'Olive Oil',
        amount: 1,
        unit: 'tbsp',
        calories: 120,
        protein: 0,
        carbs: 0,
        fat: 14,
      },
    ]);

    expect(updated).toBeUndefined();
    expect(testState.trackFoodUsage).not.toHaveBeenCalled();
    expect(testState.decrementFoodUsage).not.toHaveBeenCalled();
  });

  it('logs and continues when creation tracking fails', async () => {
    testState.db.transaction.mockImplementation(
      (callback: (tx: ReturnType<typeof createTxForMealInsert>) => unknown) =>
        callback(
          createTxForMealInsert([
            {
              id: 'item-1',
              mealId: 'meal-1',
              foodId: 'food-1',
              name: 'Chicken',
              amount: 1,
              unit: 'serving',
              displayQuantity: null,
              displayUnit: null,
              calories: 300,
              protein: 40,
              carbs: 0,
              fat: 10,
              fiber: null,
              sugar: null,
              createdAt: 3,
            },
          ]),
        ),
    );
    testState.trackFoodUsage.mockRejectedValueOnce(new Error('transient failure'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { createMealForDate } = await import('./store.js');
    const result = await createMealForDate('user-1', '2026-03-09', {
      name: 'Lunch',
      items: [
        {
          foodId: 'food-1',
          name: 'Chicken',
          amount: 1,
          unit: 'serving',
          calories: 300,
          protein: 40,
          carbs: 0,
          fat: 10,
        },
      ],
    });

    expect(result.meal).toMatchObject({ id: 'meal-1', name: 'Lunch' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('decrements food usage when deleting a meal', async () => {
    testState.db.transaction.mockImplementation(
      (callback: (tx: ReturnType<typeof createTxForMealDelete>) => unknown) =>
        callback(
          createTxForMealDelete({
            foodIds: ['food-1'],
          }),
        ),
    );

    const { deleteMealForDate } = await import('./store.js');
    const deleted = await deleteMealForDate('user-1', '2026-03-09', 'meal-1');

    expect(deleted).toBe(true);
    expect(testState.decrementFoodUsage).toHaveBeenCalledTimes(1);
    expect(testState.decrementFoodUsage).toHaveBeenCalledWith('food-1', 'user-1');
    expect(testState.trackFoodUsage).not.toHaveBeenCalled();
  });

  it('does not decrement usage when deleting a meal that does not exist', async () => {
    testState.db.transaction.mockImplementation(
      (callback: (tx: ReturnType<typeof createTxForMealDelete>) => unknown) =>
        callback(
          createTxForMealDelete({
            exists: false,
          }),
        ),
    );

    const { deleteMealForDate } = await import('./store.js');
    const deleted = await deleteMealForDate('user-1', '2026-03-09', 'meal-1');

    expect(deleted).toBe(false);
    expect(testState.decrementFoodUsage).not.toHaveBeenCalled();
    expect(testState.trackFoodUsage).not.toHaveBeenCalled();
  });

  it('decrements only tracked foods when deleting a meal with mixed item types', async () => {
    testState.db.transaction.mockImplementation(
      (callback: (tx: ReturnType<typeof createTxForMealDelete>) => unknown) =>
        callback(
          createTxForMealDelete({
            foodIds: ['food-1', null, 'food-2'],
          }),
        ),
    );

    const { deleteMealForDate } = await import('./store.js');
    const deleted = await deleteMealForDate('user-1', '2026-03-09', 'meal-1');

    expect(deleted).toBe(true);
    expect(testState.decrementFoodUsage).toHaveBeenCalledTimes(2);
    expect(testState.decrementFoodUsage).toHaveBeenNthCalledWith(1, 'food-1', 'user-1');
    expect(testState.decrementFoodUsage).toHaveBeenNthCalledWith(2, 'food-2', 'user-1');
    expect(testState.trackFoodUsage).not.toHaveBeenCalled();
  });

  it('swaps food usage when updating a meal item food reference', async () => {
    testState.db.transaction.mockImplementation(
      (callback: (tx: ReturnType<typeof createTxForMealItemPatch>) => unknown) =>
        callback(
          createTxForMealItemPatch({
            existingFoodId: 'food-1',
            updatedFoodId: 'food-2',
          }),
        ),
    );

    const { patchMealItemById } = await import('./store.js');
    const updated = await patchMealItemById('user-1', 'meal-1', 'item-1', {
      foodId: 'food-2',
    });

    expect(updated).toMatchObject({
      id: 'item-1',
      foodId: 'food-2',
    });
    expect(testState.decrementFoodUsage).toHaveBeenCalledTimes(1);
    expect(testState.decrementFoodUsage).toHaveBeenCalledWith('food-1', 'user-1');
    expect(testState.trackFoodUsage).toHaveBeenCalledTimes(1);
    expect(testState.trackFoodUsage).toHaveBeenCalledWith('food-2', 'user-1');
  });

  it('decrements usage when clearing a tracked meal item food reference', async () => {
    testState.db.transaction.mockImplementation(
      (callback: (tx: ReturnType<typeof createTxForMealItemPatch>) => unknown) =>
        callback(
          createTxForMealItemPatch({
            existingFoodId: 'food-1',
            updatedFoodId: null,
          }),
        ),
    );

    const { patchMealItemById } = await import('./store.js');
    const updated = await patchMealItemById('user-1', 'meal-1', 'item-1', {
      foodId: null,
    });

    expect(updated).toMatchObject({
      id: 'item-1',
      foodId: null,
    });
    expect(testState.decrementFoodUsage).toHaveBeenCalledTimes(1);
    expect(testState.decrementFoodUsage).toHaveBeenCalledWith('food-1', 'user-1');
    expect(testState.trackFoodUsage).not.toHaveBeenCalled();
  });

  it('increments usage when attaching a tracked meal item food reference', async () => {
    testState.db.transaction.mockImplementation(
      (callback: (tx: ReturnType<typeof createTxForMealItemPatch>) => unknown) =>
        callback(
          createTxForMealItemPatch({
            existingFoodId: null,
            updatedFoodId: 'food-2',
          }),
        ),
    );

    const { patchMealItemById } = await import('./store.js');
    const updated = await patchMealItemById('user-1', 'meal-1', 'item-1', {
      foodId: 'food-2',
    });

    expect(updated).toMatchObject({
      id: 'item-1',
      foodId: 'food-2',
    });
    expect(testState.decrementFoodUsage).not.toHaveBeenCalled();
    expect(testState.trackFoodUsage).toHaveBeenCalledTimes(1);
    expect(testState.trackFoodUsage).toHaveBeenCalledWith('food-2', 'user-1');
  });
});
