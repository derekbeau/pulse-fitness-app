import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { createFood } from '../foods/store.js';

import { searchFoodsByName } from './store.js';

vi.mock('./store.js', () => ({
  searchFoodsByName: vi.fn(),
  findFoodByName: vi.fn(),
}));

vi.mock('../foods/store.js', () => ({
  createFood: vi.fn(),
  deleteFood: vi.fn(),
  listFoods: vi.fn(),
  updateFood: vi.fn(),
  updateFoodLastUsedAt: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

const agentFood = {
  id: 'food-1',
  name: 'Chicken Breast',
  brand: null,
  servingSize: '100 g',
  servingGrams: 100,
  calories: 165,
  protein: 31,
  carbs: 0,
  fat: 3.6,
  fiber: null,
  sugar: null,
  verified: false,
  source: null,
  notes: null,
  lastUsedAt: null,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  userId: 'user-1',
};

describe('agent foods routes', () => {
  beforeEach(() => {
    vi.mocked(searchFoodsByName).mockReset();
    vi.mocked(createFood).mockReset();
    process.env.JWT_SECRET = 'test-agent-foods-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  describe('GET /api/agent/foods/search', () => {
    it('returns 401 without auth', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/foods/search',
        });

        expect(response.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    });

    it('returns food search results sorted by recency', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const searchResults = [
          { id: 'food-1', name: 'Chicken Breast', brand: null, servingSize: '100 g', calories: 165, protein: 31, carbs: 0, fat: 3.6 },
          { id: 'food-2', name: 'Chicken Thigh', brand: null, servingSize: null, calories: 209, protein: 26, carbs: 0, fat: 11 },
        ];
        vi.mocked(searchFoodsByName).mockResolvedValue(searchResults);

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/foods/search?q=chicken&limit=5',
          headers: createAuthorizationHeader(token),
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ data: searchResults });
        expect(vi.mocked(searchFoodsByName)).toHaveBeenCalledWith('user-1', 'chicken', 5);
      } finally {
        await app.close();
      }
    });

    it('returns all foods when no query provided', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(searchFoodsByName).mockResolvedValue([]);

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/foods/search',
          headers: createAuthorizationHeader(token),
        });

        expect(response.statusCode).toBe(200);
        expect(vi.mocked(searchFoodsByName)).toHaveBeenCalledWith('user-1', undefined, 10);
      } finally {
        await app.close();
      }
    });
  });

  describe('POST /api/agent/foods', () => {
    it('returns 401 without auth', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/foods',
          body: { name: 'Egg', calories: 70, protein: 6, carbs: 0.5, fat: 5 },
        });

        expect(response.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    });

    it('creates a food and returns 201', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(createFood).mockResolvedValue(agentFood);

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/foods',
          headers: createAuthorizationHeader(token),
          body: {
            name: 'Chicken Breast',
            servingSize: '100 g',
            calories: 165,
            protein: 31,
            carbs: 0,
            fat: 3.6,
          },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toEqual({
          data: {
            id: 'food-1',
            name: 'Chicken Breast',
            brand: null,
            servingSize: '100 g',
            calories: 165,
            protein: 31,
            carbs: 0,
            fat: 3.6,
          },
        });
        expect(vi.mocked(createFood)).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-1',
            name: 'Chicken Breast',
            servingSize: '100 g',
            calories: 165,
            protein: 31,
            carbs: 0,
            fat: 3.6,
            verified: false,
          }),
        );
      } finally {
        await app.close();
      }
    });

    it('returns 400 for invalid payload', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/foods',
          headers: createAuthorizationHeader(token),
          body: { name: 'Missing macros' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid food payload' },
        });
      } finally {
        await app.close();
      }
    });
  });
});
