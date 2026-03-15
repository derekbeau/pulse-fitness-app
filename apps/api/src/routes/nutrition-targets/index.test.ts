import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { findAgentTokenByHash, updateAgentTokenLastUsedAt } from '../../middleware/store.js';

import { getCurrentNutritionTarget, listNutritionTargets, upsertNutritionTarget } from './store.js';

vi.mock('./store.js', () => ({
  getCurrentNutritionTarget: vi.fn(),
  listNutritionTargets: vi.fn(),
  upsertNutritionTarget: vi.fn(),
}));

vi.mock('../../middleware/store.js', () => ({
  findAgentTokenByHash: vi.fn(),
  updateAgentTokenLastUsedAt: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

const expectRequestValidationError = (
  response: { json(): unknown },
  method: string,
  url: string,
) => {
  expect(response.json()).toMatchObject({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: {
        method,
        url,
      },
    },
  });
};

describe('nutrition target routes', () => {
  beforeEach(() => {
    vi.mocked(getCurrentNutritionTarget).mockReset();
    vi.mocked(listNutritionTargets).mockReset();
    vi.mocked(upsertNutritionTarget).mockReset();
    vi.mocked(findAgentTokenByHash).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockResolvedValue(undefined);
    process.env.JWT_SECRET = 'test-nutrition-target-route-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('upserts a nutrition target for the authenticated user', async () => {
    vi.mocked(upsertNutritionTarget).mockResolvedValue({
      id: 'target-1',
      calories: 2200,
      protein: 180,
      carbs: 250,
      fat: 70,
      effectiveDate: '2026-03-07',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/nutrition-targets',
        headers: createAuthorizationHeader(authToken),
        payload: {
          calories: 2200,
          protein: 180,
          carbs: 250,
          fat: 70,
          effectiveDate: '2026-03-07',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          id: 'target-1',
          calories: 2200,
          protein: 180,
          carbs: 250,
          fat: 70,
          effectiveDate: '2026-03-07',
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
        },
      });
      expect(vi.mocked(upsertNutritionTarget)).toHaveBeenCalledWith('user-1', {
        calories: 2200,
        protein: 180,
        carbs: 250,
        fat: 70,
        effectiveDate: '2026-03-07',
      });
    } finally {
      await app.close();
    }
  });

  it('rejects invalid target payloads', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/nutrition-targets',
        headers: createAuthorizationHeader(authToken),
        payload: {
          calories: -1,
          protein: 180,
          carbs: 250,
          fat: 70,
          effectiveDate: '03-07-2026',
        },
      });

      expect(response.statusCode).toBe(400);
      expectRequestValidationError(response, 'POST', '/api/v1/nutrition-targets');
      expect(vi.mocked(upsertNutritionTarget)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns the current target for an authenticated agent token and supports empty state', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-agent-1',
    });
    vi.mocked(getCurrentNutritionTarget)
      .mockResolvedValueOnce({
        id: 'target-2',
        calories: 2250,
        protein: 185,
        carbs: 240,
        fat: 72,
        effectiveDate: '2026-03-07',
        createdAt: 1_700_000_100_000,
        updatedAt: 1_700_000_100_000,
      })
      .mockResolvedValueOnce(null);

    const app = buildServer();

    try {
      await app.ready();
      const token = 'plain-agent-token';
      const [currentResponse, emptyResponse] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition-targets/current',
          headers: {
            authorization: `AgentToken ${token}`,
          },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition-targets/current',
          headers: {
            authorization: `AgentToken ${token}`,
          },
        }),
      ]);

      expect(currentResponse.statusCode).toBe(200);
      expect(currentResponse.json()).toEqual({
        data: {
          id: 'target-2',
          calories: 2250,
          protein: 185,
          carbs: 240,
          fat: 72,
          effectiveDate: '2026-03-07',
          createdAt: 1_700_000_100_000,
          updatedAt: 1_700_000_100_000,
        },
      });
      expect(emptyResponse.statusCode).toBe(200);
      expect(emptyResponse.json()).toEqual({
        data: null,
      });
      expect(vi.mocked(findAgentTokenByHash)).toHaveBeenCalledWith(
        createHash('sha256').update(token).digest('hex'),
      );
      expect(vi.mocked(updateAgentTokenLastUsedAt)).toHaveBeenCalledWith('agent-token-1');
      expect(vi.mocked(getCurrentNutritionTarget)).toHaveBeenNthCalledWith(1, 'user-agent-1');
      expect(vi.mocked(getCurrentNutritionTarget)).toHaveBeenNthCalledWith(2, 'user-agent-1');
    } finally {
      await app.close();
    }
  });

  it('lists target history in descending effective date order', async () => {
    vi.mocked(listNutritionTargets).mockResolvedValue([
      {
        id: 'target-2',
        calories: 2250,
        protein: 185,
        carbs: 240,
        fat: 72,
        effectiveDate: '2026-03-07',
        createdAt: 1_700_000_100_000,
        updatedAt: 1_700_000_100_000,
      },
      {
        id: 'target-1',
        calories: 2200,
        protein: 180,
        carbs: 250,
        fat: 70,
        effectiveDate: '2026-02-01',
        createdAt: 1_699_000_000_000,
        updatedAt: 1_699_000_000_000,
      },
    ]);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/nutrition-targets',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: [
          {
            id: 'target-2',
            calories: 2250,
            protein: 185,
            carbs: 240,
            fat: 72,
            effectiveDate: '2026-03-07',
            createdAt: 1_700_000_100_000,
            updatedAt: 1_700_000_100_000,
          },
          {
            id: 'target-1',
            calories: 2200,
            protein: 180,
            carbs: 250,
            fat: 70,
            effectiveDate: '2026-02-01',
            createdAt: 1_699_000_000_000,
            updatedAt: 1_699_000_000_000,
          },
        ],
      });
      expect(vi.mocked(listNutritionTargets)).toHaveBeenCalledWith('user-1');
    } finally {
      await app.close();
    }
  });

  it('requires authentication for the route group', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/nutrition-targets',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(vi.mocked(listNutritionTargets)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
