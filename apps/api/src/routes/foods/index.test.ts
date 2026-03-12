import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { createFood, deleteFood, findFoodById, listFoods, updateFood } from './store.js';

vi.mock('./store.js', () => ({
  createFood: vi.fn(),
  deleteFood: vi.fn(),
  findFoodById: vi.fn(),
  listFoods: vi.fn(),
  updateFood: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

const buildFood = (
  overrides?: Partial<{
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
    lastUsedAt: number | null;
    createdAt: number;
    updatedAt: number;
  }>,
) => ({
  id: 'food-1',
  userId: 'user-1',
  name: 'Greek Yogurt',
  brand: 'Fage 0%',
  servingSize: '170 g',
  servingGrams: 170,
  calories: 90,
  protein: 18,
  carbs: 5,
  fat: 0,
  fiber: null,
  sugar: 5,
  verified: true,
  source: 'Manufacturer label',
  notes: null,
  lastUsedAt: null,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_001,
  ...overrides,
});

describe('foods routes', () => {
  beforeEach(() => {
    vi.mocked(createFood).mockReset();
    vi.mocked(deleteFood).mockReset();
    vi.mocked(findFoodById).mockReset();
    vi.mocked(listFoods).mockReset();
    vi.mocked(updateFood).mockReset();
    process.env.JWT_SECRET = 'test-foods-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('creates a food for the authenticated user', async () => {
    vi.mocked(createFood).mockImplementation(async (input) => buildFood({ id: input.id }));

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/foods',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: ' Greek Yogurt ',
          brand: ' Fage 0% ',
          servingSize: ' 170 g ',
          calories: 90,
          protein: 18,
          carbs: 5,
          fat: 0,
          verified: true,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        data: buildFood({
          id: (response.json() as { data: { id: string } }).data.id,
        }),
      });
      expect(vi.mocked(createFood)).toHaveBeenCalledWith({
        id: expect.any(String),
        userId: 'user-1',
        name: 'Greek Yogurt',
        brand: 'Fage 0%',
        servingSize: '170 g',
        calories: 90,
        protein: 18,
        carbs: 5,
        fat: 0,
        verified: true,
      });
    } finally {
      await app.close();
    }
  });

  it('lists foods with parsed search, sort, and pagination params', async () => {
    vi.mocked(listFoods).mockResolvedValue({
      foods: [buildFood()],
      total: 3,
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/foods?q=%20yogurt%20&sort=protein&page=2&limit=1',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-cache');
      expect(response.json()).toEqual({
        data: [buildFood()],
        meta: {
          page: 2,
          limit: 1,
          total: 3,
        },
      });
      expect(vi.mocked(listFoods)).toHaveBeenCalledWith('user-1', {
        q: 'yogurt',
        sort: 'protein',
        page: 2,
        limit: 1,
      });
    } finally {
      await app.close();
    }
  });

  it('rejects invalid food payloads and query parameters', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const [createResponse, queryResponse] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/foods',
          headers: createAuthorizationHeader(authToken),
          payload: {
            name: '   ',
            calories: 90,
            protein: 18,
            carbs: 5,
            fat: 0,
          },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/foods?sort=calories&page=0',
          headers: createAuthorizationHeader(authToken),
        }),
      ]);

      expect(createResponse.statusCode).toBe(400);
      expect(createResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid food payload',
        },
      });

      expect(queryResponse.statusCode).toBe(400);
      expect(queryResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid food query parameters',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('requires authentication for all food endpoints', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const requests = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/foods',
          payload: {
            name: 'Greek Yogurt',
            calories: 90,
            protein: 18,
            carbs: 5,
            fat: 0,
          },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/foods',
        }),
        app.inject({
          method: 'PUT',
          url: '/api/v1/foods/food-1',
          payload: {
            notes: 'Updated',
          },
        }),
        app.inject({
          method: 'DELETE',
          url: '/api/v1/foods/food-1',
        }),
        app.inject({
          method: 'PATCH',
          url: '/api/v1/foods/food-1',
          payload: {
            name: 'Updated',
          },
        }),
      ]);

      for (const response of requests) {
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }
    } finally {
      await app.close();
    }
  });

  it('patches foods with partial payloads', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      vi.mocked(findFoodById).mockResolvedValue(buildFood());
      vi.mocked(updateFood)
        .mockResolvedValueOnce(buildFood({ name: 'Lowfat Greek Yogurt' }))
        .mockResolvedValueOnce(buildFood({ protein: 20, carbs: 4, fat: 0, calories: 100 }))
        .mockResolvedValueOnce(buildFood({ name: 'Skyr', calories: 110, protein: 19, notes: 'new' }));

      const nameOnlyResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/foods/food-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: ' Lowfat Greek Yogurt ',
        },
      });

      const macrosOnlyResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/foods/food-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          calories: 100,
          protein: 20,
          carbs: 4,
          fat: 0,
        },
      });

      const multiFieldResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/foods/food-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: 'Skyr',
          calories: 110,
          protein: 19,
          notes: ' new ',
        },
      });

      expect(nameOnlyResponse.statusCode).toBe(200);
      expect(macrosOnlyResponse.statusCode).toBe(200);
      expect(multiFieldResponse.statusCode).toBe(200);
      expect(vi.mocked(findFoodById)).toHaveBeenCalledTimes(3);
      expect(vi.mocked(updateFood)).toHaveBeenNthCalledWith(1, 'food-1', 'user-1', {
        name: 'Lowfat Greek Yogurt',
      });
      expect(vi.mocked(updateFood)).toHaveBeenNthCalledWith(2, 'food-1', 'user-1', {
        calories: 100,
        protein: 20,
        carbs: 4,
        fat: 0,
      });
      expect(vi.mocked(updateFood)).toHaveBeenNthCalledWith(3, 'food-1', 'user-1', {
        name: 'Skyr',
        calories: 110,
        protein: 19,
        notes: 'new',
      });
    } finally {
      await app.close();
    }
  });

  it('returns 404 when patching missing or soft-deleted foods', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      vi.mocked(findFoodById).mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/foods/food-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          notes: 'Updated',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'FOOD_NOT_FOUND',
          message: 'Food not found',
        },
      });
      expect(vi.mocked(updateFood)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rejects empty patch payloads', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/foods/food-1',
        headers: createAuthorizationHeader(authToken),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid food payload',
        },
      });
      expect(vi.mocked(findFoodById)).not.toHaveBeenCalled();
      expect(vi.mocked(updateFood)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('updates and deletes only when the food exists in the authenticated scope', async () => {
    vi.mocked(updateFood)
      .mockResolvedValueOnce(buildFood({ notes: 'Updated note', brand: null }))
      .mockResolvedValueOnce(undefined);
    vi.mocked(deleteFood).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });

      const updateResponse = await app.inject({
        method: 'PUT',
        url: '/api/v1/foods/food-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          notes: ' Updated note ',
          brand: null,
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json()).toEqual({
        data: buildFood({ notes: 'Updated note', brand: null }),
      });
      expect(vi.mocked(updateFood)).toHaveBeenNthCalledWith(1, 'food-1', 'user-1', {
        notes: 'Updated note',
        brand: null,
      });

      const missingUpdateResponse = await app.inject({
        method: 'PUT',
        url: '/api/v1/foods/missing-food',
        headers: createAuthorizationHeader(authToken),
        payload: {
          notes: 'Updated note',
        },
      });

      expect(missingUpdateResponse.statusCode).toBe(404);
      expect(missingUpdateResponse.json()).toEqual({
        error: {
          code: 'FOOD_NOT_FOUND',
          message: 'Food not found',
        },
      });

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: '/api/v1/foods/food-1',
        headers: createAuthorizationHeader(authToken),
      });

      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json()).toEqual({
        data: {
          success: true,
        },
      });
      expect(vi.mocked(deleteFood)).toHaveBeenNthCalledWith(1, 'food-1', 'user-1');

      const missingDeleteResponse = await app.inject({
        method: 'DELETE',
        url: '/api/v1/foods/missing-food',
        headers: createAuthorizationHeader(authToken),
      });

      expect(missingDeleteResponse.statusCode).toBe(404);
      expect(missingDeleteResponse.json()).toEqual({
        error: {
          code: 'FOOD_NOT_FOUND',
          message: 'Food not found',
        },
      });
    } finally {
      await app.close();
    }
  });
});
