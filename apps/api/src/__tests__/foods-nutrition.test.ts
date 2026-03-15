import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type StoredFood = {
  id: string;
  userId: string;
  name: string;
  brand: string | null;
  servingSize: string | null;
  servingGrams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  verified: boolean;
  source: string | null;
  notes: string | null;
  usageCount: number;
  tags: string[];
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type StoredNutritionLog = {
  id: string;
  userId: string;
  date: string;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
};

type StoredMeal = {
  id: string;
  nutritionLogId: string;
  name: string;
  time: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
};

type StoredMealItem = {
  id: string;
  mealId: string;
  foodId: string | null;
  name: string;
  amount: number;
  unit: string;
  displayQuantity: number | null;
  displayUnit: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  createdAt: number;
};

const testState = vi.hoisted(() => {
  const foods = new Map<string, StoredFood>();
  const nutritionLogs = new Map<string, StoredNutritionLog>();
  const meals = new Map<string, StoredMeal>();
  const mealItems = new Map<string, StoredMealItem>();
  let idCounter = 1;
  let timestampCounter = 1_700_000_000_000;

  return {
    foods,
    nutritionLogs,
    meals,
    mealItems,
    reset() {
      foods.clear();
      nutritionLogs.clear();
      meals.clear();
      mealItems.clear();
      idCounter = 1;
      timestampCounter = 1_700_000_000_000;
    },
    nextId(prefix: string) {
      const id = `${prefix}-${idCounter}`;
      idCounter += 1;
      return id;
    },
    nextTimestamp() {
      const timestamp = timestampCounter;
      timestampCounter += 1;
      return timestamp;
    },
  };
});

const getLogKey = (userId: string, date: string) => `${userId}:${date}`;

const sortFoods = (foods: StoredFood[], sort: 'name' | 'popular' | 'recent') => {
  const byName = (left: StoredFood, right: StoredFood) => {
    const nameCompare = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    if (nameCompare !== 0) {
      return nameCompare;
    }

    return (left.brand ?? '').localeCompare(right.brand ?? '', undefined, {
      sensitivity: 'base',
    });
  };

  if (sort === 'popular') {
    return [...foods].sort((left, right) => {
      if (left.usageCount !== right.usageCount) {
        return right.usageCount - left.usageCount;
      }

      return byName(left, right);
    });
  }

  if (sort === 'recent') {
    return [...foods].sort((left, right) => {
      const leftNull = left.lastUsedAt === null ? 1 : 0;
      const rightNull = right.lastUsedAt === null ? 1 : 0;

      if (leftNull !== rightNull) {
        return leftNull - rightNull;
      }

      if (left.lastUsedAt !== right.lastUsedAt) {
        return (right.lastUsedAt ?? 0) - (left.lastUsedAt ?? 0);
      }

      return byName(left, right);
    });
  }

  return [...foods].sort(byName);
};

const incrementFoodUsageInState = (foodId: string, userId: string, lastUsedAt = Date.now()) => {
  const existing = testState.foods.get(foodId);
  if (!existing || existing.userId !== userId) {
    throw new Error('Failed to update food last used timestamp');
  }

  testState.foods.set(foodId, {
    ...existing,
    lastUsedAt,
    usageCount: existing.usageCount + 1,
  });
};

const decrementFoodUsageInState = (foodId: string, userId: string) => {
  const existing = testState.foods.get(foodId);
  if (!existing || existing.userId !== userId) {
    throw new Error('Failed to decrement food usage count');
  }

  testState.foods.set(foodId, {
    ...existing,
    usageCount: Math.max(0, existing.usageCount - 1),
  });
};

vi.mock('../routes/foods/store.js', () => ({
  createFood: vi.fn(
    async (
      input: Omit<StoredFood, 'createdAt' | 'updatedAt' | 'lastUsedAt' | 'usageCount' | 'tags'> & {
        createdAt?: number;
        updatedAt?: number;
        lastUsedAt?: number | null;
        usageCount?: number;
        tags?: string[];
      },
    ) => {
      const now = testState.nextTimestamp();
      const food: StoredFood = {
        ...input,
        brand: input.brand ?? null,
        servingSize: input.servingSize ?? null,
        servingGrams: input.servingGrams ?? null,
        fiber: input.fiber ?? null,
        sugar: input.sugar ?? null,
        source: input.source ?? null,
        notes: input.notes ?? null,
        usageCount: input.usageCount ?? 0,
        tags: input.tags ?? [],
        lastUsedAt: input.lastUsedAt ?? null,
        createdAt: input.createdAt ?? now,
        updatedAt: input.updatedAt ?? now,
      };

      testState.foods.set(food.id, food);
      return food;
    },
  ),
  listFoods: vi.fn(
    async (
      userId: string,
      query: {
        q?: string;
        sort: 'name' | 'popular' | 'recent';
        page: number;
        limit: number;
      },
    ) => {
      const normalizedQuery = query.q?.toLowerCase();
      const filtered = [...testState.foods.values()].filter((food) => {
        if (food.userId !== userId) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        return (
          food.name.toLowerCase().includes(normalizedQuery) ||
          (food.brand ?? '').toLowerCase().includes(normalizedQuery)
        );
      });

      const sorted = sortFoods(filtered, query.sort);
      const offset = (query.page - 1) * query.limit;

      return {
        foods: sorted.slice(offset, offset + query.limit),
        total: sorted.length,
      };
    },
  ),
  updateFood: vi.fn(async (id: string, userId: string, updates: Partial<StoredFood>) => {
    const existing = testState.foods.get(id);
    if (!existing || existing.userId !== userId) {
      return undefined;
    }

    const updated: StoredFood = {
      ...existing,
      ...updates,
      brand: 'brand' in updates ? (updates.brand ?? null) : existing.brand,
      servingSize: 'servingSize' in updates ? (updates.servingSize ?? null) : existing.servingSize,
      servingGrams:
        'servingGrams' in updates ? (updates.servingGrams ?? null) : existing.servingGrams,
      fiber: 'fiber' in updates ? (updates.fiber ?? null) : existing.fiber,
      sugar: 'sugar' in updates ? (updates.sugar ?? null) : existing.sugar,
      source: 'source' in updates ? (updates.source ?? null) : existing.source,
      notes: 'notes' in updates ? (updates.notes ?? null) : existing.notes,
      updatedAt: Date.now(),
    };

    testState.foods.set(id, updated);
    return updated;
  }),
  deleteFood: vi.fn(async (id: string, userId: string) => {
    const existing = testState.foods.get(id);
    if (!existing || existing.userId !== userId) {
      return false;
    }

    testState.foods.delete(id);
    return true;
  }),
  trackFoodUsage: vi.fn(async (foodId: string, userId: string, lastUsedAt = Date.now()) => {
    incrementFoodUsageInState(foodId, userId, lastUsedAt);
  }),
  decrementFoodUsage: vi.fn(async (foodId: string, userId: string) => {
    decrementFoodUsageInState(foodId, userId);
  }),
}));

vi.mock('../routes/nutrition/store.js', () => ({
  createMealForDate: vi.fn(
    async (
      userId: string,
      date: string,
      input: {
        name: string;
        time?: string;
        notes?: string;
        items: Array<{
          foodId?: string;
          name: string;
          amount: number;
          unit: string;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
        }>;
      },
    ) => {
      const logKey = getLogKey(userId, date);
      let log = testState.nutritionLogs.get(logKey);

      if (!log) {
        const now = testState.nextTimestamp();
        log = {
          id: testState.nextId('log'),
          userId,
          date,
          notes: null,
          createdAt: now,
          updatedAt: now,
        };
        testState.nutritionLogs.set(logKey, log);
      }

      const now = testState.nextTimestamp();
      const meal: StoredMeal = {
        id: testState.nextId('meal'),
        nutritionLogId: log.id,
        name: input.name,
        time: input.time ?? null,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };
      testState.meals.set(meal.id, meal);

      const items = input.items.map((item) => {
        const createdAt = testState.nextTimestamp();
        const createdItem: StoredMealItem = {
          id: testState.nextId('meal-item'),
          mealId: meal.id,
          foodId: item.foodId ?? null,
          name: item.name,
          amount: item.amount,
          unit: item.unit,
          displayQuantity: null,
          displayUnit: null,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          fiber: null,
          sugar: null,
          createdAt,
        };
        testState.mealItems.set(createdItem.id, createdItem);
        return createdItem;
      });

      return { meal, items };
    },
  ),
  getDailyNutritionForDate: vi.fn(async (userId: string, date: string) => {
    const log = testState.nutritionLogs.get(getLogKey(userId, date));
    if (!log) {
      return null;
    }

    const dayMeals = [...testState.meals.values()]
      .filter((meal) => meal.nutritionLogId === log.id)
      .sort((left, right) => left.createdAt - right.createdAt);

    return {
      log,
      meals: dayMeals.map((meal) => ({
        meal,
        items: [...testState.mealItems.values()]
          .filter((item) => item.mealId === meal.id)
          .sort((left, right) => left.createdAt - right.createdAt),
      })),
    };
  }),
  getDailyNutritionSummaryForDate: vi.fn(async (userId: string, date: string) => {
    const log = testState.nutritionLogs.get(getLogKey(userId, date));

    if (!log) {
      return {
        date,
        meals: 0,
        actual: {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
        target: null,
      };
    }

    const dayMeals = [...testState.meals.values()].filter((meal) => meal.nutritionLogId === log.id);
    const dayMealIds = new Set(dayMeals.map((meal) => meal.id));
    const items = [...testState.mealItems.values()].filter((item) => dayMealIds.has(item.mealId));

    return {
      date,
      meals: dayMeals.length,
      actual: {
        calories: items.reduce((total, item) => total + item.calories, 0),
        protein: items.reduce((total, item) => total + item.protein, 0),
        carbs: items.reduce((total, item) => total + item.carbs, 0),
        fat: items.reduce((total, item) => total + item.fat, 0),
      },
      target: null,
    };
  }),
  deleteMealForDate: vi.fn(async (userId: string, date: string, mealId: string) => {
    const log = testState.nutritionLogs.get(getLogKey(userId, date));
    if (!log) {
      return false;
    }

    const meal = testState.meals.get(mealId);
    if (!meal || meal.nutritionLogId !== log.id) {
      return false;
    }

    const deletedItems = [...testState.mealItems.values()].filter((item) => item.mealId === mealId);

    testState.meals.delete(mealId);

    for (const item of [...testState.mealItems.values()]) {
      if (item.mealId === mealId) {
        testState.mealItems.delete(item.id);
      }
    }

    deletedItems.forEach((item) => {
      if (item.foodId) {
        decrementFoodUsageInState(item.foodId, userId);
      }
    });

    return true;
  }),
  findMealForDate: vi.fn(),
  findMealItemForDate: vi.fn(),
  findMealById: vi.fn(),
  findMealItemById: vi.fn(),
  patchMealById: vi.fn(),
  patchMealItemById: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

const parseData = <T>(response: { json: () => unknown }) => {
  return (response.json() as { data: T }).data;
};

const createTestApp = async () => {
  process.env.JWT_SECRET = 'integration-test-jwt-secret';

  vi.resetModules();

  const { buildServer } = await import('../index.js');
  const app = buildServer();
  await app.ready();

  return { app };
};

const createFoodViaApi = async (
  app: FastifyInstance,
  token: string,
  payload: {
    name: string;
    brand?: string;
    servingSize: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  },
) => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/foods',
    headers: createAuthorizationHeader(token),
    payload,
  });

  expect(response.statusCode).toBe(201);
  return parseData<StoredFood>(response);
};

const createMealViaApi = async (
  app: FastifyInstance,
  token: string,
  date: string,
  payload: {
    name: string;
    time?: string;
    items: Array<{
      foodId?: string;
      name: string;
      amount: number;
      unit: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }>;
  },
) => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/nutrition/${date}/meals`,
    headers: createAuthorizationHeader(token),
    payload,
  });

  expect(response.statusCode).toBe(201);
  return parseData<{ meal: StoredMeal; items: StoredMealItem[] }>(response);
};

describe('foods and nutrition integration', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-01T00:00:00.000Z'));
    testState.reset();
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    vi.useRealTimers();
    vi.resetModules();
  });

  it('covers foods CRUD, search, deletion, and recency sorting', async () => {
    const { app } = await createTestApp();

    try {
      const userToken = app.jwt.sign(
        { sub: 'user-a', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const otherUserToken = app.jwt.sign(
        { sub: 'user-b', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );

      const yogurt = await createFoodViaApi(app, userToken, {
        name: 'Greek Yogurt',
        brand: 'Fage',
        servingSize: '170 g',
        calories: 90,
        protein: 18,
        carbs: 5,
        fat: 0,
      });

      const almonds = await createFoodViaApi(app, userToken, {
        name: 'Almonds',
        brand: 'Blue Diamond',
        servingSize: '28 g',
        calories: 170,
        protein: 6,
        carbs: 6,
        fat: 15,
      });

      const nameSearchResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/foods?q=yogurt',
        headers: createAuthorizationHeader(userToken),
      });

      expect(nameSearchResponse.statusCode).toBe(200);
      const nameSearchFoods = parseData<StoredFood[]>(nameSearchResponse);
      expect(nameSearchFoods.map((food) => food.id)).toEqual([yogurt.id]);

      const brandSearchResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/foods?q=diamond',
        headers: createAuthorizationHeader(userToken),
      });

      expect(brandSearchResponse.statusCode).toBe(200);
      const brandSearchFoods = parseData<StoredFood[]>(brandSearchResponse);
      expect(brandSearchFoods.map((food) => food.id)).toEqual([almonds.id]);

      const updateResponse = await app.inject({
        method: 'PUT',
        url: `/api/v1/foods/${yogurt.id}`,
        headers: createAuthorizationHeader(userToken),
        payload: {
          protein: 20,
          servingSize: '200 g',
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      expect(parseData<StoredFood>(updateResponse)).toEqual(
        expect.objectContaining({
          id: yogurt.id,
          protein: 20,
          servingSize: '200 g',
        }),
      );

      await createMealViaApi(app, userToken, '2026-03-09', {
        name: 'Breakfast',
        items: [
          {
            foodId: yogurt.id,
            name: 'Greek Yogurt',
            amount: 1,
            unit: 'cup',
            calories: 90,
            protein: 20,
            carbs: 5,
            fat: 0,
          },
        ],
      });

      vi.advanceTimersByTime(5);
      await createMealViaApi(app, userToken, '2026-03-09', {
        name: 'Snack',
        items: [
          {
            foodId: almonds.id,
            name: 'Almonds',
            amount: 1,
            unit: 'oz',
            calories: 170,
            protein: 6,
            carbs: 6,
            fat: 15,
          },
        ],
      });

      const recentResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/foods?sort=recent',
        headers: createAuthorizationHeader(userToken),
      });

      expect(recentResponse.statusCode).toBe(200);
      const recentFoods = parseData<StoredFood[]>(recentResponse);
      expect(recentFoods.map((food) => food.id)).toEqual([almonds.id, yogurt.id]);
      expect((recentFoods[0]?.lastUsedAt ?? 0) - (recentFoods[1]?.lastUsedAt ?? 0)).toBeGreaterThan(
        0,
      );

      const popularResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/foods?sort=popular',
        headers: createAuthorizationHeader(userToken),
      });
      expect(popularResponse.statusCode).toBe(200);
      const popularFoods = parseData<StoredFood[]>(popularResponse);
      expect(popularFoods[0]?.usageCount).toBeGreaterThanOrEqual(popularFoods[1]?.usageCount ?? 0);

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/v1/foods/${yogurt.id}`,
        headers: createAuthorizationHeader(userToken),
      });

      expect(deleteResponse.statusCode).toBe(200);
      expect(parseData<{ success: true }>(deleteResponse)).toEqual({ success: true });

      const deletedFoodSearchResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/foods?q=yogurt',
        headers: createAuthorizationHeader(userToken),
      });

      expect(deletedFoodSearchResponse.statusCode).toBe(200);
      expect(parseData<StoredFood[]>(deletedFoodSearchResponse)).toEqual([]);

      const otherUserSearchResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/foods?q=almonds',
        headers: createAuthorizationHeader(otherUserToken),
      });

      expect(otherUserSearchResponse.statusCode).toBe(200);
      expect(parseData<StoredFood[]>(otherUserSearchResponse)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('creates daily nutrition with multiple meals and deletes a meal with nested items', async () => {
    const { app } = await createTestApp();

    try {
      const userToken = app.jwt.sign(
        { sub: 'user-a', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const date = '2026-03-10';

      const breakfast = await createMealViaApi(app, userToken, date, {
        name: 'Breakfast',
        time: '08:00',
        items: [
          {
            name: 'Oatmeal',
            amount: 1,
            unit: 'bowl',
            calories: 300,
            protein: 10,
            carbs: 54,
            fat: 6,
          },
        ],
      });

      const lunch = await createMealViaApi(app, userToken, date, {
        name: 'Lunch',
        time: '12:30',
        items: [
          {
            name: 'Chicken Rice Bowl',
            amount: 1,
            unit: 'plate',
            calories: 640,
            protein: 42,
            carbs: 68,
            fat: 22,
          },
        ],
      });

      const dinner = await createMealViaApi(app, userToken, date, {
        name: 'Dinner',
        time: '18:45',
        items: [
          {
            name: 'Salmon',
            amount: 6,
            unit: 'oz',
            calories: 350,
            protein: 38,
            carbs: 0,
            fat: 20,
          },
        ],
      });

      const dailyResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/nutrition/${date}`,
        headers: createAuthorizationHeader(userToken),
      });

      expect(dailyResponse.statusCode).toBe(200);
      const dailyData = parseData<{
        log: StoredNutritionLog;
        meals: Array<{ meal: StoredMeal; items: StoredMealItem[] }>;
      }>(dailyResponse);
      expect(dailyData.log.date).toBe(date);
      expect(dailyData.meals).toHaveLength(3);
      expect(dailyData.meals.map((entry) => entry.meal.name)).toEqual([
        breakfast.meal.name,
        lunch.meal.name,
        dinner.meal.name,
      ]);
      expect(dailyData.meals.every((entry) => entry.items.length === 1)).toBe(true);

      const deleteMealResponse = await app.inject({
        method: 'DELETE',
        url: `/api/v1/nutrition/${date}/meals/${lunch.meal.id}`,
        headers: createAuthorizationHeader(userToken),
      });

      expect(deleteMealResponse.statusCode).toBe(200);
      expect(parseData<{ success: true }>(deleteMealResponse)).toEqual({ success: true });

      const afterDeleteResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/nutrition/${date}`,
        headers: createAuthorizationHeader(userToken),
      });

      expect(afterDeleteResponse.statusCode).toBe(200);
      const afterDeleteData = parseData<{
        log: StoredNutritionLog;
        meals: Array<{ meal: StoredMeal; items: StoredMealItem[] }>;
      }>(afterDeleteResponse);
      expect(afterDeleteData.meals).toHaveLength(2);
      expect(afterDeleteData.meals.map((entry) => entry.meal.name)).toEqual([
        'Breakfast',
        'Dinner',
      ]);
      expect(
        afterDeleteData.meals.flatMap((entry) => entry.items).map((item) => item.mealId),
      ).not.toContain(lunch.meal.id);
    } finally {
      await app.close();
    }
  });

  it('returns summary totals from meal items and zeros for an empty day', async () => {
    const { app } = await createTestApp();

    try {
      const userToken = app.jwt.sign(
        { sub: 'user-a', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const date = '2026-03-11';

      await createMealViaApi(app, userToken, date, {
        name: 'Lunch',
        items: [
          {
            name: 'Turkey Sandwich',
            amount: 1,
            unit: 'serving',
            calories: 420,
            protein: 32,
            carbs: 38,
            fat: 14,
          },
          {
            name: 'Apple',
            amount: 1,
            unit: 'medium',
            calories: 95,
            protein: 0,
            carbs: 25,
            fat: 0,
          },
        ],
      });

      await createMealViaApi(app, userToken, date, {
        name: 'Dinner',
        items: [
          {
            name: 'Steak',
            amount: 8,
            unit: 'oz',
            calories: 560,
            protein: 52,
            carbs: 0,
            fat: 36,
          },
        ],
      });

      const summaryResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/nutrition/${date}/summary`,
        headers: createAuthorizationHeader(userToken),
      });

      expect(summaryResponse.statusCode).toBe(200);
      expect(parseData(summaryResponse)).toEqual({
        date,
        meals: 2,
        actual: {
          calories: 1_075,
          protein: 84,
          carbs: 63,
          fat: 50,
        },
        target: null,
      });

      const emptySummaryResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/nutrition/2026-03-12/summary',
        headers: createAuthorizationHeader(userToken),
      });

      expect(emptySummaryResponse.statusCode).toBe(200);
      expect(parseData(emptySummaryResponse)).toEqual({
        date: '2026-03-12',
        meals: 0,
        actual: {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
        target: null,
      });
    } finally {
      await app.close();
    }
  });

  it('advances lastUsedAt when the same food is used in a newer meal', async () => {
    const { app } = await createTestApp();

    try {
      const userToken = app.jwt.sign(
        { sub: 'user-a', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );

      const eggs = await createFoodViaApi(app, userToken, {
        name: 'Eggs',
        brand: 'Farm Fresh',
        servingSize: '2 large',
        calories: 140,
        protein: 12,
        carbs: 1,
        fat: 10,
      });

      await createMealViaApi(app, userToken, '2026-03-13', {
        name: 'Breakfast',
        items: [
          {
            foodId: eggs.id,
            name: 'Eggs',
            amount: 1,
            unit: 'serving',
            calories: 140,
            protein: 12,
            carbs: 1,
            fat: 10,
          },
        ],
      });

      const afterFirstUseResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/foods?q=eggs&sort=recent',
        headers: createAuthorizationHeader(userToken),
      });

      expect(afterFirstUseResponse.statusCode).toBe(200);
      const firstUseFood = parseData<StoredFood[]>(afterFirstUseResponse)[0];
      expect(firstUseFood?.lastUsedAt).not.toBeNull();

      vi.advanceTimersByTime(5);
      await createMealViaApi(app, userToken, '2026-03-14', {
        name: 'Breakfast',
        items: [
          {
            foodId: eggs.id,
            name: 'Eggs',
            amount: 1,
            unit: 'serving',
            calories: 140,
            protein: 12,
            carbs: 1,
            fat: 10,
          },
        ],
      });

      const afterSecondUseResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/foods?q=eggs&sort=recent',
        headers: createAuthorizationHeader(userToken),
      });

      expect(afterSecondUseResponse.statusCode).toBe(200);
      const secondUseFood = parseData<StoredFood[]>(afterSecondUseResponse)[0];
      expect((secondUseFood?.lastUsedAt ?? 0) - (firstUseFood?.lastUsedAt ?? 0)).toBeGreaterThan(0);
      expect(secondUseFood?.usageCount).toBe(2);
    } finally {
      await app.close();
    }
  });
});
