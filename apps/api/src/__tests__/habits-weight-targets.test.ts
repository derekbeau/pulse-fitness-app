import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type StoredUser = {
  id: string;
  username: string;
  name: string | null;
  passwordHash: string;
};

type StoredAgentToken = {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  lastUsedAt: number | null;
  createdAt: number;
};

type StoredWeightEntry = {
  id: string;
  userId: string;
  date: string;
  weight: number;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
};

type StoredNutritionTarget = {
  id: string;
  userId: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  effectiveDate: string;
  createdAt: number;
  updatedAt: number;
};

type AuthSession = {
  token: string;
  user: {
    id: string;
    username: string;
    name: string | null;
  };
};

type AgentTokenResponse = {
  id: string;
  name: string;
  token: string;
};

const testState = vi.hoisted(() => {
  const users = new Map<string, StoredUser>();
  const agentTokens = new Map<string, StoredAgentToken>();
  const weightEntries = new Map<string, StoredWeightEntry>();
  const nutritionTargets = new Map<string, StoredNutritionTarget>();
  let idCounter = 1;
  let createdAtCounter = 1_700_000_000_000;

  return {
    users,
    agentTokens,
    weightEntries,
    nutritionTargets,
    reset() {
      users.clear();
      agentTokens.clear();
      weightEntries.clear();
      nutritionTargets.clear();
      idCounter = 1;
      createdAtCounter = 1_700_000_000_000;
    },
    nextId(prefix: string) {
      const id = `${prefix}-${idCounter}`;
      idCounter += 1;
      return id;
    },
    nextCreatedAt() {
      const createdAt = createdAtCounter;
      createdAtCounter += 1;
      return createdAt;
    },
  };
});

const getWeightEntryKey = (userId: string, date: string) => `${userId}:${date}`;
const getNutritionTargetKey = (userId: string, effectiveDate: string) =>
  `${userId}:${effectiveDate}`;
const withoutUserId = <T extends { userId: string }>(value: T) => {
  const { userId, ...rest } = value;
  void userId;

  return rest;
};

const getTodayDate = () => {
  return new Date().toISOString().slice(0, 10);
};

vi.mock('../routes/auth/store.js', () => ({
  createUser: vi.fn(
    async ({
      id,
      username,
      name,
      passwordHash,
    }: {
      id: string;
      username: string;
      name?: string;
      passwordHash: string;
    }) => {
      testState.users.set(username, {
        id,
        username,
        name: name ?? null,
        passwordHash,
      });

      return {
        id,
        username,
        name: name ?? null,
      };
    },
  ),
  findUserByUsername: vi.fn(async (username: string) => testState.users.get(username)),
}));

vi.mock('../routes/agent-tokens/store.js', () => ({
  createAgentToken: vi.fn(
    async ({
      id,
      userId,
      name,
      tokenHash,
    }: {
      id: string;
      userId: string;
      name: string;
      tokenHash: string;
    }) => {
      testState.agentTokens.set(id, {
        id,
        userId,
        name,
        tokenHash,
        lastUsedAt: null,
        createdAt: testState.nextCreatedAt(),
      });

      return { id, name };
    },
  ),
  listAgentTokens: vi.fn(async (userId: string) =>
    [...testState.agentTokens.values()]
      .filter((token) => token.userId === userId)
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(({ id, name, lastUsedAt, createdAt }) => ({
        id,
        name,
        lastUsedAt,
        createdAt,
      })),
  ),
  deleteAgentToken: vi.fn(async (id: string, userId: string) => {
    const token = testState.agentTokens.get(id);
    if (!token || token.userId !== userId) {
      return false;
    }

    testState.agentTokens.delete(id);
    return true;
  }),
}));

vi.mock('../middleware/store.js', () => ({
  findAgentTokenByHash: vi.fn(async (tokenHash: string) => {
    const token = [...testState.agentTokens.values()].find(
      (candidate) => candidate.tokenHash === tokenHash,
    );

    return token ? { id: token.id, userId: token.userId } : undefined;
  }),
  updateAgentTokenLastUsedAt: vi.fn(async (id: string, lastUsedAt = Date.now()) => {
    const token = testState.agentTokens.get(id);
    if (!token) {
      throw new Error('Failed to update agent token last used timestamp');
    }

    token.lastUsedAt = lastUsedAt;
  }),
}));

vi.mock('../routes/weight/store.js', () => ({
  findBodyWeightEntryByDate: vi.fn(async (userId: string, date: string) => {
    const entry = testState.weightEntries.get(getWeightEntryKey(userId, date)) ?? null;

    return entry ? withoutUserId(entry) : null;
  }),
  upsertBodyWeightEntry: vi.fn(
    async (userId: string, input: { date: string; weight: number; notes?: string }) => {
      const key = getWeightEntryKey(userId, input.date);
      const existingEntry = testState.weightEntries.get(key);

      if (existingEntry) {
        existingEntry.weight = input.weight;
        existingEntry.notes = input.notes ?? null;
        existingEntry.updatedAt = Date.now();

        return withoutUserId(existingEntry);
      }

      const entry: StoredWeightEntry = {
        id: testState.nextId('weight'),
        userId,
        date: input.date,
        weight: input.weight,
        notes: input.notes ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      testState.weightEntries.set(key, entry);

      return withoutUserId(entry);
    },
  ),
  listBodyWeightEntries: vi.fn(async (userId: string, query: { from?: string; to?: string }) =>
    [...testState.weightEntries.values()]
      .filter((entry) => {
        if (entry.userId !== userId) {
          return false;
        }

        if (query.from && entry.date < query.from) {
          return false;
        }

        if (query.to && entry.date > query.to) {
          return false;
        }

        return true;
      })
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((entry) => withoutUserId(entry)),
  ),
  getLatestBodyWeightEntry: vi.fn(async (userId: string) => {
    const entry =
      [...testState.weightEntries.values()]
        .filter((candidate) => candidate.userId === userId)
        .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;

    return entry ? withoutUserId(entry) : null;
  }),
}));

vi.mock('../routes/nutrition-targets/store.js', () => ({
  upsertNutritionTarget: vi.fn(
    async (
      userId: string,
      input: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        effectiveDate: string;
      },
    ) => {
      const key = getNutritionTargetKey(userId, input.effectiveDate);
      const existingTarget = testState.nutritionTargets.get(key);

      if (existingTarget) {
        existingTarget.calories = input.calories;
        existingTarget.protein = input.protein;
        existingTarget.carbs = input.carbs;
        existingTarget.fat = input.fat;
        existingTarget.updatedAt = Date.now();

        return withoutUserId(existingTarget);
      }

      const target: StoredNutritionTarget = {
        id: testState.nextId('target'),
        userId,
        calories: input.calories,
        protein: input.protein,
        carbs: input.carbs,
        fat: input.fat,
        effectiveDate: input.effectiveDate,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      testState.nutritionTargets.set(key, target);

      return withoutUserId(target);
    },
  ),
  getCurrentNutritionTarget: vi.fn(async (userId: string) => {
    const target =
      [...testState.nutritionTargets.values()]
        .filter(
          (candidate) => candidate.userId === userId && candidate.effectiveDate <= getTodayDate(),
        )
        .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate))[0] ?? null;

    return target ? withoutUserId(target) : null;
  }),
  listNutritionTargets: vi.fn(async (userId: string) =>
    [...testState.nutritionTargets.values()]
      .filter((target) => target.userId === userId)
      .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate))
      .map((target) => withoutUserId(target)),
  ),
}));

const createAuthorizationHeader = (token: string, scheme: 'Bearer' | 'AgentToken' = 'Bearer') => ({
  authorization: `${scheme} ${token}`,
});

const createTestApp = async () => {
  process.env.JWT_SECRET = 'integration-test-jwt-secret';

  vi.resetModules();

  const { buildServer } = await import('../index.js');
  const app = buildServer();
  await app.ready();

  return { app };
};

const registerAndLogin = async (app: FastifyInstance, suffix: string): Promise<AuthSession> => {
  const username = `user-${suffix}`;
  const password = `password-${suffix}-123`;

  const registerResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      username,
      password,
      name: `User ${suffix.toUpperCase()}`,
    },
  });

  expect(registerResponse.statusCode).toBe(201);

  const loginResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      username,
      password,
    },
  });

  expect(loginResponse.statusCode).toBe(200);

  return (loginResponse.json() as { data: AuthSession }).data;
};

const createAgentToken = async (
  app: FastifyInstance,
  token: string,
  name: string,
): Promise<AgentTokenResponse> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/agent-tokens',
    headers: createAuthorizationHeader(token),
    payload: {
      name,
    },
  });

  expect(response.statusCode).toBe(201);

  return (response.json() as { data: AgentTokenResponse }).data;
};

const waitForClockTick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 5));
};

describe('weight and nutrition target integration', () => {
  beforeEach(() => {
    testState.reset();
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    vi.useRealTimers();
    vi.resetModules();
  });

  it('logs weight, supports range and latest reads, and scopes results per user', async () => {
    const { app } = await createTestApp();

    try {
      const userA = await registerAndLogin(app, 'a');
      const userB = await registerAndLogin(app, 'b');
      const agentToken = await createAgentToken(app, userA.token, 'Scale bot');

      const firstEntryResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/weight',
        headers: createAuthorizationHeader(userA.token),
        payload: {
          date: '2026-03-01',
          weight: 183.2,
          notes: 'Fasted',
        },
      });

      expect(firstEntryResponse.statusCode).toBe(201);

      const secondEntryResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/weight',
        headers: createAuthorizationHeader(agentToken.token, 'AgentToken'),
        payload: {
          date: '2026-03-05',
          weight: 181.4,
          notes: 'After cardio',
        },
      });

      expect(secondEntryResponse.statusCode).toBe(201);

      const userAListResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/weight?from=2026-03-01&to=2026-03-05',
        headers: createAuthorizationHeader(userA.token),
      });

      expect(userAListResponse.statusCode).toBe(200);
      expect(userAListResponse.json()).toEqual({
        data: [
          expect.objectContaining({
            date: '2026-03-01',
            notes: 'Fasted',
            weight: 183.2,
          }),
          expect.objectContaining({
            date: '2026-03-05',
            notes: 'After cardio',
            weight: 181.4,
          }),
        ],
      });

      const latestResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/weight/latest',
        headers: createAuthorizationHeader(agentToken.token, 'AgentToken'),
      });

      expect(latestResponse.statusCode).toBe(200);
      expect(latestResponse.json()).toEqual({
        data: expect.objectContaining({
          date: '2026-03-05',
          notes: 'After cardio',
          weight: 181.4,
        }),
      });

      const userBListResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/weight?from=2026-03-01&to=2026-03-05',
        headers: createAuthorizationHeader(userB.token),
      });

      expect(userBListResponse.statusCode).toBe(200);
      expect(userBListResponse.json()).toEqual({
        data: [],
      });

      const userBLatestResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/weight/latest',
        headers: createAuthorizationHeader(userB.token),
      });

      expect(userBLatestResponse.statusCode).toBe(200);
      expect(userBLatestResponse.json()).toEqual({
        data: null,
      });

      const storedToken = [...testState.agentTokens.values()].find(
        (candidate) => candidate.id === agentToken.id,
      );

      expect(storedToken?.tokenHash).toBe(
        createHash('sha256').update(agentToken.token).digest('hex'),
      );
      expect(storedToken?.lastUsedAt).not.toBeNull();
    } finally {
      await app.close();
    }
  });

  it('upserts weight entries by user and date without leaking across users', async () => {
    const { app } = await createTestApp();

    try {
      const userA = await registerAndLogin(app, 'weight-upsert-a');
      const userB = await registerAndLogin(app, 'weight-upsert-b');

      const initialResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/weight',
        headers: createAuthorizationHeader(userA.token),
        payload: {
          date: '2026-03-07',
          weight: 182.3,
          notes: 'Morning',
        },
      });

      expect(initialResponse.statusCode).toBe(201);
      const initialEntry = (
        initialResponse.json() as {
          data: {
            id: string;
            createdAt: number;
            updatedAt: number;
          };
        }
      ).data;

      await waitForClockTick();

      const updatedResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/weight',
        headers: createAuthorizationHeader(userA.token),
        payload: {
          date: '2026-03-07',
          weight: 181.8,
          notes: 'Evening',
        },
      });

      expect(updatedResponse.statusCode).toBe(200);
      const updatedEntry = (
        updatedResponse.json() as {
          data: {
            id: string;
            createdAt: number;
            updatedAt: number;
            weight: number;
            notes: string | null;
          };
        }
      ).data;

      expect(updatedEntry.id).toBe(initialEntry.id);
      expect(updatedEntry.createdAt).toBe(initialEntry.createdAt);
      expect(updatedEntry.updatedAt).toBeGreaterThan(initialEntry.updatedAt);
      expect(updatedEntry.weight).toBe(181.8);
      expect(updatedEntry.notes).toBe('Evening');

      const userBResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/weight',
        headers: createAuthorizationHeader(userB.token),
        payload: {
          date: '2026-03-07',
          weight: 190.4,
          notes: 'Separate user',
        },
      });

      expect(userBResponse.statusCode).toBe(201);
      expect((userBResponse.json() as { data: { id: string } }).data.id).not.toBe(initialEntry.id);

      const userAListResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/weight',
        headers: createAuthorizationHeader(userA.token),
      });

      expect(userAListResponse.statusCode).toBe(200);
      expect(userAListResponse.json()).toEqual({
        data: [
          expect.objectContaining({
            date: '2026-03-07',
            notes: 'Evening',
            weight: 181.8,
          }),
        ],
      });

      const userBListResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/weight',
        headers: createAuthorizationHeader(userB.token),
      });

      expect(userBListResponse.statusCode).toBe(200);
      expect(userBListResponse.json()).toEqual({
        data: [
          expect.objectContaining({
            date: '2026-03-07',
            notes: 'Separate user',
            weight: 190.4,
          }),
        ],
      });
    } finally {
      await app.close();
    }
  });

  it('returns the current nutrition target based on the latest effective date on or before today', async () => {
    const { app } = await createTestApp();

    try {
      const userA = await registerAndLogin(app, 'targets-a');
      const userB = await registerAndLogin(app, 'targets-b');

      for (const payload of [
        {
          calories: 2200,
          protein: 180,
          carbs: 240,
          fat: 70,
          effectiveDate: '2026-01-15',
        },
        {
          calories: 2250,
          protein: 185,
          carbs: 235,
          fat: 72,
          effectiveDate: '2026-03-07',
        },
        {
          calories: 2300,
          protein: 190,
          carbs: 250,
          fat: 74,
          effectiveDate: '2099-01-01',
        },
      ]) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/nutrition-targets',
          headers: createAuthorizationHeader(userA.token),
          payload,
        });

        expect(response.statusCode).toBe(200);
      }

      const userBTargetResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/nutrition-targets',
        headers: createAuthorizationHeader(userB.token),
        payload: {
          calories: 2600,
          protein: 170,
          carbs: 320,
          fat: 80,
          effectiveDate: '2026-03-06',
        },
      });

      expect(userBTargetResponse.statusCode).toBe(200);

      const userACurrentResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/nutrition-targets/current',
        headers: createAuthorizationHeader(userA.token),
      });

      expect(userACurrentResponse.statusCode).toBe(200);
      expect(userACurrentResponse.json()).toEqual({
        data: expect.objectContaining({
          calories: 2250,
          carbs: 235,
          effectiveDate: '2026-03-07',
          fat: 72,
          protein: 185,
        }),
      });

      const userAHistoryResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/nutrition-targets',
        headers: createAuthorizationHeader(userA.token),
      });

      expect(userAHistoryResponse.statusCode).toBe(200);
      expect(userAHistoryResponse.json()).toEqual({
        data: [
          expect.objectContaining({ effectiveDate: '2099-01-01' }),
          expect.objectContaining({ effectiveDate: '2026-03-07' }),
          expect.objectContaining({ effectiveDate: '2026-01-15' }),
        ],
      });

      const userBCurrentResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/nutrition-targets/current',
        headers: createAuthorizationHeader(userB.token),
      });

      expect(userBCurrentResponse.statusCode).toBe(200);
      expect(userBCurrentResponse.json()).toEqual({
        data: expect.objectContaining({
          calories: 2600,
          effectiveDate: '2026-03-06',
          protein: 170,
        }),
      });

      const userBHistoryResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/nutrition-targets',
        headers: createAuthorizationHeader(userB.token),
      });

      expect(userBHistoryResponse.statusCode).toBe(200);
      expect(userBHistoryResponse.json()).toEqual({
        data: [expect.objectContaining({ effectiveDate: '2026-03-06' })],
      });
    } finally {
      await app.close();
    }
  });

  it('upserts nutrition targets by user and effective date without crossing user boundaries', async () => {
    const { app } = await createTestApp();

    try {
      const userA = await registerAndLogin(app, 'targets-upsert-a');
      const userB = await registerAndLogin(app, 'targets-upsert-b');

      const initialResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/nutrition-targets',
        headers: createAuthorizationHeader(userA.token),
        payload: {
          calories: 2200,
          protein: 180,
          carbs: 250,
          fat: 70,
          effectiveDate: '2026-03-07',
        },
      });

      expect(initialResponse.statusCode).toBe(200);
      const initialTarget = (
        initialResponse.json() as {
          data: {
            id: string;
            createdAt: number;
            updatedAt: number;
          };
        }
      ).data;

      await waitForClockTick();

      const updatedResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/nutrition-targets',
        headers: createAuthorizationHeader(userA.token),
        payload: {
          calories: 2275,
          protein: 190,
          carbs: 245,
          fat: 73,
          effectiveDate: '2026-03-07',
        },
      });

      expect(updatedResponse.statusCode).toBe(200);
      const updatedTarget = (
        updatedResponse.json() as {
          data: {
            id: string;
            createdAt: number;
            updatedAt: number;
            calories: number;
            protein: number;
          };
        }
      ).data;

      expect(updatedTarget.id).toBe(initialTarget.id);
      expect(updatedTarget.createdAt).toBe(initialTarget.createdAt);
      expect(updatedTarget.updatedAt).toBeGreaterThan(initialTarget.updatedAt);
      expect(updatedTarget.calories).toBe(2275);
      expect(updatedTarget.protein).toBe(190);

      const userBResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/nutrition-targets',
        headers: createAuthorizationHeader(userB.token),
        payload: {
          calories: 2600,
          protein: 175,
          carbs: 310,
          fat: 78,
          effectiveDate: '2026-03-07',
        },
      });

      expect(userBResponse.statusCode).toBe(200);
      expect((userBResponse.json() as { data: { id: string } }).data.id).not.toBe(initialTarget.id);

      const userAHistoryResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/nutrition-targets',
        headers: createAuthorizationHeader(userA.token),
      });

      expect(userAHistoryResponse.statusCode).toBe(200);
      expect(userAHistoryResponse.json()).toEqual({
        data: [
          expect.objectContaining({
            calories: 2275,
            effectiveDate: '2026-03-07',
            protein: 190,
          }),
        ],
      });

      const userBHistoryResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/nutrition-targets',
        headers: createAuthorizationHeader(userB.token),
      });

      expect(userBHistoryResponse.statusCode).toBe(200);
      expect(userBHistoryResponse.json()).toEqual({
        data: [
          expect.objectContaining({
            calories: 2600,
            effectiveDate: '2026-03-07',
            protein: 175,
          }),
        ],
      });
    } finally {
      await app.close();
    }
  });
});
