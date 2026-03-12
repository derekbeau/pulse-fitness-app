import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared in-memory state (hoisted so mocks can reference it)
// ---------------------------------------------------------------------------

type StoredUser = { id: string; username: string; passwordHash: string };
type StoredAgentToken = {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  lastUsedAt: number | null;
};
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
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
};
type StoredExercise = {
  id: string;
  userId: string;
  name: string;
  category: string;
  trackingType?: string;
  tags?: string[];
  formCues?: string[];
  muscleGroups: string[];
  equipment: string;
  instructions: string | null;
  createdAt: number;
  updatedAt: number;
};
type StoredWorkoutTemplate = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  tags: string[];
  sections: Array<{ type: string; exercises: unknown[] }>;
  createdAt: number;
  updatedAt: number;
};
type StoredWorkoutSession = {
  id: string;
  userId: string;
  templateId: string | null;
  name: string;
  date: string;
  status: string;
  startedAt: number;
  completedAt: number | null;
  duration: number | null;
  feedback: string | null;
  notes: string | null;
  sets: unknown[];
};

const testState = vi.hoisted(() => {
  const users = new Map<string, StoredUser>();
  const agentTokens = new Map<string, StoredAgentToken>();
  const foods = new Map<string, StoredFood>();
  const exercises = new Map<string, StoredExercise>();
  const workoutTemplates = new Map<string, StoredWorkoutTemplate>();
  const workoutSessions = new Map<string, StoredWorkoutSession>();

  return {
    users,
    agentTokens,
    foods,
    exercises,
    workoutTemplates,
    workoutSessions,
    reset() {
      users.clear();
      agentTokens.clear();
      foods.clear();
      exercises.clear();
      workoutTemplates.clear();
      workoutSessions.clear();
    },
  };
});

// ---------------------------------------------------------------------------
// Store mocks
// ---------------------------------------------------------------------------

vi.mock('../routes/auth/store.js', () => ({
  createUser: vi.fn(
    async ({
      id,
      username,
      passwordHash,
    }: {
      id: string;
      username: string;
      passwordHash: string;
    }) => {
      testState.users.set(id, { id, username, passwordHash });
      return { id, username, name: null };
    },
  ),
  ensureStarterHabitsForUser: vi.fn(async () => undefined),
  findUserByUsername: vi.fn(async (username: string) =>
    [...testState.users.values()].find((u) => u.username === username),
  ),
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
      testState.agentTokens.set(id, { id, userId, name, tokenHash, lastUsedAt: null });
      return { id, name };
    },
  ),
  listAgentTokens: vi.fn(async () => []),
  deleteAgentToken: vi.fn(async (id: string) => {
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
  findUserAuthById: vi.fn(async (userId: string) => {
    const user = [...testState.users.values()].find((candidate) => candidate.id === userId);
    return user ? { id: user.id } : undefined;
  }),
  updateAgentTokenLastUsedAt: vi.fn(async (id: string) => {
    const token = testState.agentTokens.get(id);
    if (token) {
      token.lastUsedAt = Date.now();
    }
  }),
}));

vi.mock('../routes/agent/store.js', () => ({
  searchFoodsByName: vi.fn(async (userId: string, query: string | undefined, limit: number) => {
    const userFoods = [...testState.foods.values()].filter((f) => f.userId === userId);
    const filtered = query
      ? userFoods.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
      : userFoods;
    return filtered.slice(0, limit).map(({ id, name, brand, servingSize, calories, protein, carbs, fat }) => ({
      id,
      name,
      brand,
      servingSize,
      calories,
      protein,
      carbs,
      fat,
    }));
  }),
  findFoodByName: vi.fn(async (userId: string, foodName: string) => {
    const userFoods = [...testState.foods.values()].filter((f) => f.userId === userId);
    const match = userFoods.find((f) => f.name.toLowerCase() === foodName.trim().toLowerCase());
    if (!match) return undefined;
    const { id, name, brand, servingSize, calories, protein, carbs, fat } = match;
    return { id, name, brand, servingSize, calories, protein, carbs, fat };
  }),
}));

vi.mock('../routes/foods/store.js', () => ({
  createFood: vi.fn(async (input: StoredFood) => {
    const food = {
      ...input,
      lastUsedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    testState.foods.set(food.id, food);
    return food;
  }),
  deleteFood: vi.fn(),
  listFoods: vi.fn(async () => []),
  updateFood: vi.fn(),
  updateFoodLastUsedAt: vi.fn(async (id: string) => {
    const food = testState.foods.get(id);
    if (food) {
      food.lastUsedAt = Date.now();
    }
  }),
}));

vi.mock('../routes/nutrition/store.js', () => ({
  createMealForDate: vi.fn(
    async (
      userId: string,
      date: string,
      input: {
        name: string;
        time: string | null | undefined;
        items: Array<{
          foodId: string;
          name: string;
          amount: number;
          unit: string | null | undefined;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
        }>;
      },
    ) => {
      const mealId = `meal-${Date.now()}`;
      const logId = `log-${date}-${userId}`;
      const meal = {
        id: mealId,
        nutritionLogId: logId,
        name: input.name,
        time: input.time ?? null,
        notes: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const items = input.items.map((item, idx) => ({
        id: `item-${mealId}-${idx}`,
        mealId,
        foodId: item.foodId,
        name: item.name,
        amount: item.amount,
        unit: item.unit ?? null,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        fiber: null,
        sugar: null,
        createdAt: Date.now(),
      }));
      return { meal, items };
    },
  ),
  deleteMealForDate: vi.fn(),
  getDailyNutritionForDate: vi.fn(async () => null),
  getDailyNutritionSummaryForDate: vi.fn(async () => ({ calories: 0, protein: 0, carbs: 0, fat: 0 })),
}));

vi.mock('../routes/exercises/store.js', () => ({
  createExercise: vi.fn(
    async (input: {
      id: string;
      userId: string;
      name: string;
      category: string;
      trackingType?: string;
      tags?: string[];
      formCues?: string[];
      muscleGroups?: string[];
      equipment?: string;
      instructions?: string | null;
    }) => {
      const exercise: StoredExercise = {
        id: input.id,
        userId: input.userId,
        name: input.name,
        category: input.category,
        trackingType: input.trackingType ?? 'weight_reps',
        tags: input.tags ?? [],
        formCues: input.formCues ?? [],
        muscleGroups: input.muscleGroups ?? [],
        equipment: input.equipment ?? '',
        instructions: input.instructions ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      testState.exercises.set(input.id, exercise);
      return exercise;
    },
  ),
  deleteOwnedExercise: vi.fn(),
  findExerciseDedupCandidates: vi.fn(async () => []),
  findExerciseLastPerformance: vi.fn(),
  findExerciseOwnership: vi.fn(),
  findVisibleExerciseById: vi.fn(),
  findVisibleExerciseByName: vi.fn(async ({ name, userId }: { name: string; userId: string }) => {
    const match = [...testState.exercises.values()].find(
      (e) => e.userId === userId && e.name.toLowerCase() === name.toLowerCase(),
    );
    return match ?? null;
  }),
  listExerciseFilters: vi.fn(),
  listExercises: vi.fn(
    async ({
      userId,
      q,
      page,
      limit,
    }: {
      userId: string;
      q?: string;
      page: number;
      limit: number;
    }) => {
      const visible = [...testState.exercises.values()].filter((exercise) => exercise.userId === userId);
      const filtered = q
        ? visible.filter((exercise) => exercise.name.toLowerCase().includes(q.toLowerCase()))
        : visible;

      return {
        data: filtered.slice(0, limit),
        meta: {
          page,
          limit,
          total: filtered.length,
        },
      };
    },
  ),
  updateOwnedExercise: vi.fn(
    async ({ id, userId, changes }: { id: string; userId: string; changes: Record<string, unknown> }) => {
      const exercise = testState.exercises.get(id);
      if (!exercise || exercise.userId !== userId) {
        return undefined;
      }

      Object.assign(exercise, changes, { updatedAt: Date.now() });
      return exercise;
    },
  ),
}));

vi.mock('../routes/workout-templates/store.js', () => ({
  allTemplateExercisesAccessible: vi.fn(),
  createWorkoutTemplate: vi.fn(
    async ({
      id,
      userId,
      input,
    }: {
      id: string;
      userId: string;
      input: {
        name: string;
        description: string | null;
        tags: string[];
        sections: Array<{ type: string; exercises: unknown[] }>;
      };
    }) => {
      const template: StoredWorkoutTemplate = {
        id,
        userId,
        name: input.name,
        description: input.description,
        tags: input.tags,
        sections: input.sections,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      testState.workoutTemplates.set(id, template);
      return template;
    },
  ),
  deleteWorkoutTemplate: vi.fn(),
  findWorkoutTemplateById: vi.fn(async (id: string, userId: string) => {
    const template = testState.workoutTemplates.get(id);
    return template && template.userId === userId ? template : undefined;
  }),
  listWorkoutTemplates: vi.fn(async () => []),
  updateWorkoutTemplate: vi.fn(
    async ({
      id,
      userId,
      input,
    }: {
      id: string;
      userId: string;
      input: {
        name: string;
        description: string | null;
        tags: string[];
        sections: Array<{ type: string; exercises: unknown[] }>;
      };
    }) => {
      const existing = testState.workoutTemplates.get(id);
      if (!existing || existing.userId !== userId) {
        return undefined;
      }

      const updated: StoredWorkoutTemplate = {
        ...existing,
        name: input.name,
        description: input.description,
        tags: input.tags,
        sections: input.sections,
        updatedAt: Date.now(),
      };

      testState.workoutTemplates.set(id, updated);
      return updated;
    },
  ),
}));

vi.mock('../routes/workout-sessions/store.js', () => ({
  allSessionExercisesAccessible: vi.fn(),
  batchUpsertSessionSets: vi.fn(),
  createSessionSet: vi.fn(),
  createWorkoutSession: vi.fn(
    async ({
      id,
      userId,
      input,
    }: {
      id: string;
      userId: string;
      input: {
        templateId: string | null;
        name: string;
        date: string;
        status: string;
        startedAt: number;
        completedAt: number | null;
        duration: number | null;
        feedback: string | null;
        notes: string | null;
        sets: unknown[];
      };
    }) => {
      const session: StoredWorkoutSession = { id, userId, ...input };
      testState.workoutSessions.set(id, session);
      return { ...session, createdAt: Date.now(), updatedAt: Date.now() };
    },
  ),
  deleteWorkoutSession: vi.fn(),
  findWorkoutSessionAccess: vi.fn(),
  findWorkoutSessionById: vi.fn(async (id: string, userId: string) => {
    const session = testState.workoutSessions.get(id);
    return session && session.userId === userId ? { ...session, sets: [], createdAt: Date.now(), updatedAt: Date.now() } : undefined;
  }),
  listSessionSetGroups: vi.fn(),
  SessionSetNotFoundError: class extends Error {},
  listWorkoutSessions: vi.fn(async () => []),
  saveCompletedSessionAsTemplate: vi.fn(),
  updateSessionSet: vi.fn(),
  updateWorkoutSession: vi.fn(
    async ({
      id,
      userId,
      input,
    }: {
      id: string;
      userId: string;
      input: Record<string, unknown>;
    }) => {
      const session = testState.workoutSessions.get(id);
      if (!session || session.userId !== userId) return undefined;
      Object.assign(session, input);
      return { ...session, createdAt: Date.now(), updatedAt: Date.now() };
    },
  ),
}));

vi.mock('../routes/agent/context-store.js', () => ({
  findAgentContextUser: vi.fn(async () => ({ name: 'Derek' })),
  getAgentContextTodayNutrition: vi.fn(async () => ({
    actual: { calories: 800, protein: 60, carbs: 90, fat: 30 },
    target: { calories: 2000, protein: 150, carbs: 200, fat: 70 },
    meals: [],
  })),
  getAgentContextWeight: vi.fn(async () => ({ current: 180, trend7d: -1.5 })),
  listAgentContextHabits: vi.fn(async () => [
    { name: 'Morning run', trackingType: 'boolean', streak: 3, todayCompleted: true },
  ]),
  listAgentContextRecentWorkouts: vi.fn(async () => [
    { id: 'session-1', name: 'Push Day', date: '2026-03-08', completedAt: 1741478400000, exercises: [] },
  ]),
  listAgentContextScheduledWorkouts: vi.fn(async () => [
    { date: '2026-03-10', templateName: 'Pull Day' },
  ]),
}));

vi.mock('../routes/habit-entries/store.js', () => ({
  findHabitEntryByHabitAndDate: vi.fn(async () => null),
  listHabitEntriesByDateRange: vi.fn(async () => []),
  upsertHabitEntry: vi.fn(async (input: Record<string, unknown>) => ({
    id: 'entry-1',
    habitId: input.habitId,
    userId: input.userId,
    date: input.date,
    completed: input.completed ?? false,
    value: input.value ?? null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })),
}));

vi.mock('../routes/habits/store.js', () => ({
  createHabit: vi.fn(),
  deleteHabit: vi.fn(),
  findHabitById: vi.fn(async (id: string, userId: string) => ({
    id,
    userId,
    name: 'Morning run',
    trackingType: 'boolean',
    active: true,
    sortOrder: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })),
  listActiveHabits: vi.fn(async () => []),
  listHabits: vi.fn(async () => []),
  updateHabit: vi.fn(),
}));

vi.mock('../routes/weight/store.js', () => ({
  findBodyWeightEntryByDate: vi.fn(async () => null),
  listBodyWeightEntries: vi.fn(async () => []),
  upsertBodyWeightEntry: vi.fn(async (_userId: string, input: Record<string, unknown>) => ({
    id: 'weight-1',
    userId: _userId,
    date: input.date,
    weight: input.weight,
    notes: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const createTestApp = async () => {
  process.env.JWT_SECRET = 'agent-integration-test-secret';
  vi.resetModules();
  const { buildServer } = await import('../index.js');
  const app = buildServer();
  await app.ready();
  return app;
};

const PLAIN_TOKEN = 'f'.repeat(64);
const PLAIN_TOKEN_HASH = createHash('sha256').update(PLAIN_TOKEN).digest('hex');

/** Insert an agent token into the in-memory state and return the plain token. */
const seedAgentToken = (userId: string, tokenId = 'token-1'): string => {
  testState.agentTokens.set(tokenId, {
    id: tokenId,
    userId,
    name: 'Test token',
    tokenHash: PLAIN_TOKEN_HASH,
    lastUsedAt: null,
  });
  return PLAIN_TOKEN;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agent integration', () => {
  beforeEach(() => {
    testState.reset();
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  // -------------------------------------------------------------------------
  // Auth tests
  // -------------------------------------------------------------------------

  describe('agent auth', () => {
    it('accepts a valid AgentToken and returns data', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/ping',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ data: { userId: 'user-1' } });
      } finally {
        await app.close();
      }
    });

    it('returns 401 for an invalid agent token', async () => {
      const app = await createTestApp();

      try {
        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/ping',
          headers: { authorization: 'AgentToken invalid-token' },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      } finally {
        await app.close();
      }
    });

    it('returns 401 when Authorization header is missing', async () => {
      const app = await createTestApp();

      try {
        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/ping',
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      } finally {
        await app.close();
      }
    });

    it('returns 401 for a revoked (deleted) token', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');
        // Revoke by removing from in-memory state
        testState.agentTokens.delete('token-1');

        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/ping',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      } finally {
        await app.close();
      }
    });

    it('also accepts a valid Bearer JWT on agent routes', async () => {
      const app = await createTestApp();

      try {
        const jwtToken = app.jwt.sign({ userId: 'user-1' });

        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/ping',
          headers: { authorization: `Bearer ${jwtToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ data: { userId: 'user-1' } });
      } finally {
        await app.close();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Meal logging tests
  // -------------------------------------------------------------------------

  describe('agent meal logging', () => {
    it('creates a food via POST /api/agent/foods', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/foods',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
          payload: {
            name: 'Chicken Breast',
            servingSize: '100 g',
            calories: 165,
            protein: 31,
            carbs: 0,
            fat: 3.6,
          },
        });

        expect(response.statusCode).toBe(201);

        const body = response.json() as { data: { id: string; name: string; calories: number } };
        expect(body.data.name).toBe('Chicken Breast');
        expect(body.data.calories).toBe(165);

        // Food was stored in in-memory state
        const stored = [...testState.foods.values()].find((f) => f.userId === 'user-1');
        expect(stored?.name).toBe('Chicken Breast');
      } finally {
        await app.close();
      }
    });

    it('returns 400 for invalid food creation payloads', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/foods',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
          payload: {
            name: 'Chicken Breast',
            protein: 31,
            carbs: 0,
            fat: 3.6,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid food payload' },
        });
      } finally {
        await app.close();
      }
    });

    it('searches foods via GET /api/agent/foods/search', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        // Seed a food directly into state
        testState.foods.set('food-1', {
          id: 'food-1',
          userId: 'user-1',
          name: 'Chicken Breast',
          brand: null,
          servingSize: '100 g',
          servingGrams: null,
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
        });

        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/foods/search?q=chicken',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
        });

        expect(response.statusCode).toBe(200);

        const body = response.json() as { data: Array<{ name: string }> };
        expect(body.data).toHaveLength(1);
        expect(body.data[0].name).toBe('Chicken Breast');
      } finally {
        await app.close();
      }
    });

    it('logs a meal with food name resolution and returns calculated macros', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        // Seed a food so findFoodByName can resolve it
        testState.foods.set('food-chicken', {
          id: 'food-chicken',
          userId: 'user-1',
          name: 'Chicken Breast',
          brand: null,
          servingSize: '100 g',
          servingGrams: null,
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
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/meals',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
          payload: {
            name: 'Lunch',
            date: '2026-03-09',
            time: '12:00',
            items: [{ foodName: 'Chicken Breast', quantity: 2, unit: 'serving' }],
          },
        });

        expect(response.statusCode).toBe(201);

        const body = response.json() as {
          data: {
            meal: { name: string; date: string };
            macros: { calories: number; protein: number; carbs: number; fat: number };
            items: Array<{ name: string; amount: number }>;
          };
        };

        expect(body.data.meal.name).toBe('Lunch');
        expect(body.data.meal.date).toBe('2026-03-09');
        // 2 servings × 165 cal each
        expect(body.data.macros.calories).toBe(330);
        expect(body.data.macros.protein).toBe(62);
        expect(body.data.items).toHaveLength(1);
        expect(body.data.items[0].name).toBe('Chicken Breast');
        expect(body.data.items[0].amount).toBe(2);

        const foodsStore = await import('../routes/foods/store.js');
        expect(vi.mocked(foodsStore.updateFoodLastUsedAt)).toHaveBeenCalledWith(
          'food-chicken',
          'user-1',
        );
        expect(testState.foods.get('food-chicken')?.lastUsedAt).toBeTypeOf('number');
      } finally {
        await app.close();
      }
    });

    it('returns 400 for invalid meal payloads', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/meals',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
          payload: {
            name: 'Lunch',
            date: '2026-03-09',
            time: '12:00',
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid meal payload' },
        });
      } finally {
        await app.close();
      }
    });

    it('returns 422 when a food name cannot be resolved', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/meals',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
          payload: {
            name: 'Lunch',
            date: '2026-03-09',
            time: '12:00',
            items: [{ foodName: 'Unknown Food XYZ', quantity: 1 }],
          },
        });

        expect(response.statusCode).toBe(422);

        const body = response.json() as { error: { code: string; message: string } };
        expect(body.error.code).toBe('UNRESOLVED_FOODS');
        expect(body.error.message).toContain('Unknown Food XYZ');
      } finally {
        await app.close();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Workout tests
  // -------------------------------------------------------------------------

  describe('agent workout management', () => {
    it('creates a workout template and auto-creates missing exercises', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/workout-templates',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
          payload: {
            name: 'Push Day',
            sections: [
              {
                name: 'Main',
                exercises: [
                  { name: 'Bench Press', sets: 3, reps: 8 },
                  { name: 'Overhead Press', sets: 3, reps: 10 },
                ],
              },
            ],
          },
        });

        expect(response.statusCode).toBe(201);

        const body = response.json() as {
          data: {
            template: { name: string };
            newExercises: Array<{ id: string; name: string; possibleDuplicates: string[] }>;
          };
        };
        expect(body.data.template.name).toBe('Push Day');
        expect(body.data.newExercises).toHaveLength(2);
        expect(body.data.newExercises[0].possibleDuplicates).toEqual([]);

        // Both exercises should have been auto-created
        const createdExercises = [...testState.exercises.values()].filter(
          (e) => e.userId === 'user-1',
        );
        expect(createdExercises.map((e) => e.name).sort()).toEqual(
          ['Bench Press', 'Overhead Press'].sort(),
        );
      } finally {
        await app.close();
      }
    });

    it('creates a workout session', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/workout-sessions',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
          payload: {
            name: 'Push Day Session',
          },
        });

        expect(response.statusCode).toBe(201);

        const body = response.json() as { data: { name: string; status: string } };
        expect(body.data.name).toBe('Push Day Session');
        expect(body.data.status).toBe('in-progress');

        expect(testState.workoutSessions.size).toBe(1);
      } finally {
        await app.close();
      }
    });

    it('updates an existing workout template via PUT /api/agent/workout-templates/:id', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        testState.workoutTemplates.set('template-1', {
          id: 'template-1',
          userId: 'user-1',
          name: 'Pull Day',
          description: null,
          tags: [],
          sections: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        const response = await app.inject({
          method: 'PUT',
          url: '/api/agent/workout-templates/template-1',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
          payload: {
            name: 'Pull Day Updated',
            sections: [
              {
                name: 'Main',
                exercises: [{ name: 'Barbell Row', sets: 4, reps: 8 }],
              },
            ],
          },
        });

        expect(response.statusCode).toBe(200);

        const body = response.json() as {
          data: {
            template: { id: string; name: string };
            newExercises: Array<{ id: string; name: string; possibleDuplicates: string[] }>;
          };
        };
        expect(body.data.template.id).toBe('template-1');
        expect(body.data.template.name).toBe('Pull Day Updated');
        expect(body.data.newExercises).toHaveLength(1);
        expect(body.data.newExercises[0]).toEqual({
          id: expect.any(String),
          name: 'Barbell Row',
          possibleDuplicates: [],
        });
      } finally {
        await app.close();
      }
    });

    it('patches a workout session with set data', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        // Seed a session
        testState.workoutSessions.set('session-1', {
          id: 'session-1',
          userId: 'user-1',
          templateId: null,
          name: 'Push Day',
          date: '2026-03-09',
          status: 'in-progress',
          startedAt: 1_741_478_400_000,
          completedAt: null,
          duration: null,
          feedback: null,
          notes: null,
          sets: [],
        });

        // Seed the exercise so name resolves without auto-create
        testState.exercises.set('exercise-bench', {
          id: 'exercise-bench',
          userId: 'user-1',
          name: 'Bench Press',
          category: 'compound',
          muscleGroups: ['Chest'],
          equipment: 'Barbell',
          instructions: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/agent/workout-sessions/session-1',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
          payload: {
            status: 'completed',
            sets: [{ exerciseName: 'Bench Press', setNumber: 1, weight: 135, reps: 8 }],
          },
        });

        expect(response.statusCode).toBe(200);

        const body = response.json() as { data: { status: string } };
        expect(body.data.status).toBe('completed');
      } finally {
        await app.close();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Exercise tests
  // -------------------------------------------------------------------------

  describe('agent exercises', () => {
    it('creates an exercise via POST /api/agent/exercises', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/exercises',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
          payload: {
            name: 'Dumbbell Curl',
            category: 'isolation',
            muscleGroups: ['Biceps'],
            equipment: 'Dumbbell',
          },
        });

        expect(response.statusCode).toBe(201);

        const body = response.json() as {
          data: {
            created: boolean;
            exercise: { name: string; category: string; muscleGroups: string[]; equipment: string };
          };
        };
        expect(body.data.created).toBe(true);
        expect(body.data.exercise.name).toBe('Dumbbell Curl');
        expect(body.data.exercise.category).toBe('isolation');
        expect(body.data.exercise.muscleGroups).toEqual(['Biceps']);
        expect(body.data.exercise.equipment).toBe('Dumbbell');
      } finally {
        await app.close();
      }
    });

    it('searches exercises via GET /api/agent/exercises/search', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        testState.exercises.set('exercise-curl', {
          id: 'exercise-curl',
          userId: 'user-1',
          name: 'Dumbbell Curl',
          category: 'isolation',
          muscleGroups: ['Biceps'],
          equipment: 'Dumbbell',
          instructions: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/exercises/search?q=curl&limit=5',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
        });

        expect(response.statusCode).toBe(200);

        const body = response.json() as {
          data: Array<{ name: string; category: string; muscleGroups: string[]; equipment: string }>;
        };
        expect(body.data).toHaveLength(1);
        expect(body.data[0].name).toBe('Dumbbell Curl');
        expect(body.data[0].category).toBe('isolation');
      } finally {
        await app.close();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Daily tests
  // -------------------------------------------------------------------------

  describe('agent daily endpoints', () => {
    it('creates a weight entry via POST /api/agent/weight', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/weight',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
          payload: {
            date: '2026-03-09',
            weight: 180.5,
          },
        });

        expect(response.statusCode).toBe(201);

        const body = response.json() as { data: { date: string; weight: number } };
        expect(body.data.date).toBe('2026-03-09');
        expect(body.data.weight).toBe(180.5);
      } finally {
        await app.close();
      }
    });

    it('returns active habits via GET /api/agent/habits', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/habits',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ data: [] });
      } finally {
        await app.close();
      }
    });

    it('upserts a habit entry via PATCH /api/agent/habits/:id/entries', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/agent/habits/habit-1/entries',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
          payload: {
            date: '2026-03-09',
            completed: true,
          },
        });

        expect(response.statusCode).toBe(201);

        const body = response.json() as {
          data: { habitId: string; date: string; completed: boolean };
        };
        expect(body.data.habitId).toBe('habit-1');
        expect(body.data.date).toBe('2026-03-09');
        expect(body.data.completed).toBe(true);
      } finally {
        await app.close();
      }
    });

    it('returns nutrition summary via GET /api/agent/nutrition/:date/summary', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/nutrition/2026-03-09/summary',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
        });

        expect(response.statusCode).toBe(200);

        const body = response.json() as {
          data: {
            summary: { calories: number; protein: number; carbs: number; fat: number };
            meals: unknown[];
          };
        };
        expect(body.data.summary).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
        expect(body.data.meals).toEqual([]);
      } finally {
        await app.close();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Context tests
  // -------------------------------------------------------------------------

  describe('agent context endpoint', () => {
    it('returns a comprehensive context snapshot with all sections populated', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/context',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
        });

        expect(response.statusCode).toBe(200);

        const body = response.json() as {
          data: {
            user: { name: string | null };
            recentWorkouts: unknown[];
            todayNutrition: {
              actual: { calories: number };
              target: { calories: number };
              meals: unknown[];
            };
            weight: { current: number; trend7d: number };
            habits: Array<{ name: string; streak: number; todayCompleted: boolean }>;
            scheduledWorkouts: Array<{ date: string; templateName: string }>;
          };
        };

        expect(body.data.user.name).toBe('Derek');
        expect(body.data.recentWorkouts).toHaveLength(1);
        expect(body.data.recentWorkouts[0]).toMatchObject({ name: 'Push Day' });
        expect(body.data.todayNutrition.actual.calories).toBe(800);
        expect(body.data.todayNutrition.target.calories).toBe(2000);
        expect(body.data.weight.current).toBe(180);
        expect(body.data.weight.trend7d).toBe(-1.5);
        expect(body.data.habits).toHaveLength(1);
        expect(body.data.habits[0].name).toBe('Morning run');
        expect(body.data.habits[0].todayCompleted).toBe(true);
        expect(body.data.scheduledWorkouts).toHaveLength(1);
        expect(body.data.scheduledWorkouts[0].templateName).toBe('Pull Day');
      } finally {
        await app.close();
      }
    });

    it('also accepts a Bearer JWT on the context endpoint', async () => {
      const app = await createTestApp();

      try {
        const jwtToken = app.jwt.sign({ userId: 'user-1' });

        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/context',
          headers: { authorization: `Bearer ${jwtToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toHaveProperty('data.user');
      } finally {
        await app.close();
      }
    });
  });

  // -------------------------------------------------------------------------
  // lastUsedAt test
  // -------------------------------------------------------------------------

  describe('token lastUsedAt', () => {
    it('updates lastUsedAt on the agent token after a successful request', async () => {
      const app = await createTestApp();

      try {
        seedAgentToken('user-1');

        const before = testState.agentTokens.get('token-1');
        expect(before?.lastUsedAt).toBeNull();

        await app.inject({
          method: 'GET',
          url: '/api/agent/ping',
          headers: { authorization: `AgentToken ${PLAIN_TOKEN}` },
        });

        const after = testState.agentTokens.get('token-1');
        expect(after?.lastUsedAt).toBeTypeOf('number');
      } finally {
        await app.close();
      }
    });
  });
});
