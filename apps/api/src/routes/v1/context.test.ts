import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { findAgentTokenByHash, findUserAuthById, updateAgentTokenLastUsedAt } from '../../middleware/store.js';
import {
  findAgentContextUser,
  getAgentContextTodayNutrition,
  getAgentContextWeight,
  listAgentContextHabits,
  listAgentContextRecentWorkouts,
  listAgentContextScheduledWorkouts,
} from '../agent/context-store.js';

vi.mock('../../middleware/store.js', () => ({
  findAgentTokenByHash: vi.fn(),
  findUserAuthById: vi.fn(),
  updateAgentTokenLastUsedAt: vi.fn(),
}));

vi.mock('../agent/context-store.js', () => ({
  findAgentContextUser: vi.fn(),
  getAgentContextTodayNutrition: vi.fn(),
  getAgentContextWeight: vi.fn(),
  listAgentContextHabits: vi.fn(),
  listAgentContextRecentWorkouts: vi.fn(),
  listAgentContextScheduledWorkouts: vi.fn(),
}));

const createAuthorizationHeader = (token: string, scheme: 'Bearer' | 'AgentToken' = 'Bearer') => ({
  authorization: `${scheme} ${token}`,
});

describe('v1 context routes', () => {
  beforeEach(() => {
    vi.mocked(findAgentTokenByHash).mockReset();
    vi.mocked(findUserAuthById).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockReset();
    vi.mocked(findAgentContextUser).mockReset();
    vi.mocked(getAgentContextTodayNutrition).mockReset();
    vi.mocked(getAgentContextWeight).mockReset();
    vi.mocked(listAgentContextHabits).mockReset();
    vi.mocked(listAgentContextRecentWorkouts).mockReset();
    vi.mocked(listAgentContextScheduledWorkouts).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockResolvedValue(undefined);
    process.env.JWT_SECRET = 'test-context-route-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('returns context for agent-token requests and 404s legacy /api/agent/context', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-1',
    });
    vi.mocked(findAgentContextUser).mockResolvedValue({ name: 'Derek' });
    vi.mocked(listAgentContextRecentWorkouts).mockResolvedValue([]);
    vi.mocked(getAgentContextTodayNutrition).mockResolvedValue({
      actual: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      target: { calories: 2200, protein: 180, carbs: 250, fat: 70 },
      meals: [],
    });
    vi.mocked(getAgentContextWeight).mockResolvedValue({ current: 180, trend7d: -1.2 });
    vi.mocked(listAgentContextHabits).mockResolvedValue([]);
    vi.mocked(listAgentContextScheduledWorkouts).mockResolvedValue([]);

    const app = buildServer();

    try {
      await app.ready();
      const [contextResponse, legacyResponse] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/context',
          headers: createAuthorizationHeader('plain-agent-token', 'AgentToken'),
        }),
        app.inject({
          method: 'GET',
          url: '/api/agent/context',
          headers: createAuthorizationHeader('plain-agent-token', 'AgentToken'),
        }),
      ]);

      expect(contextResponse.statusCode).toBe(200);
      expect(contextResponse.json()).toEqual({
        data: {
          user: { name: 'Derek' },
          recentWorkouts: [],
          todayNutrition: {
            actual: { calories: 0, protein: 0, carbs: 0, fat: 0 },
            target: { calories: 2200, protein: 180, carbs: 250, fat: 70 },
            meals: [],
          },
          weight: { current: 180, trend7d: -1.2 },
          habits: [],
          scheduledWorkouts: [],
        },
      });
      expect(legacyResponse.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('rejects JWT requests to /api/v1/context', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const token = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/context',
        headers: createAuthorizationHeader(token),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: {
          code: 'FORBIDDEN',
          message: 'Context is only available for agent tokens',
        },
      });
    } finally {
      await app.close();
    }
  });
});
