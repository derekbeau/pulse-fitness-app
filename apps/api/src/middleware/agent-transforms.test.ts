import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createExercise,
  findExerciseDedupCandidates,
  findVisibleExerciseByName,
} from '../routes/exercises/store.js';
import { createFood, findFoodByName } from '../routes/foods/store.js';
import { agentRequestTransform, parseRepsInput } from './agent-transforms.js';

vi.mock('../routes/exercises/store.js', () => ({
  createExercise: vi.fn(),
  findVisibleExerciseByName: vi.fn(),
  findExerciseDedupCandidates: vi.fn(),
}));

vi.mock('../routes/foods/store.js', () => ({
  createFood: vi.fn(),
  findFoodByName: vi.fn(),
}));

const buildTestApp = async () => {
  const app = Fastify();

  app.addHook('onRequest', async (request) => {
    request.authType = request.headers['x-auth-type'] === 'jwt' ? 'jwt' : 'agent-token';
    request.userId = 'user-1';
  });

  app.post(
    '/transform',
    {
      preHandler: agentRequestTransform,
    },
    async (request) => ({
      data: request.body,
    }),
  );

  await app.ready();

  return app;
};

const buildExercise = (
  overrides?: Partial<Awaited<ReturnType<typeof findVisibleExerciseByName>>>,
) =>
  ({
    id: 'exercise-1',
    userId: 'user-1',
    name: 'Bench Press',
    muscleGroups: [],
    equipment: '',
    category: 'compound',
    trackingType: 'weight_reps',
    tags: [],
    formCues: [],
    instructions: null,
    coachingNotes: null,
    relatedExerciseIds: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }) as Awaited<ReturnType<typeof findVisibleExerciseByName>>;

describe('parseRepsInput', () => {
  it('expands single and range shorthand', () => {
    expect(parseRepsInput('8')).toEqual({ repsMin: 8, repsMax: 8 });
    expect(parseRepsInput('8-10')).toEqual({ repsMin: 8, repsMax: 10 });
    expect(parseRepsInput(12)).toEqual({ repsMin: 12, repsMax: 12 });
  });
});

describe('agentRequestTransform', () => {
  beforeEach(() => {
    vi.mocked(createExercise).mockReset();
    vi.mocked(findExerciseDedupCandidates).mockReset();
    vi.mocked(findVisibleExerciseByName).mockReset();
    vi.mocked(createFood).mockReset();
    vi.mocked(findFoodByName).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes through non-agent requests without modification', async () => {
    const app = await buildTestApp();

    try {
      const payload = {
        exerciseName: 'Bench Press',
        items: [{ foodName: 'Chicken Breast', quantity: 1, unit: 'serving' }],
      };

      const response = await app.inject({
        method: 'POST',
        url: '/transform',
        headers: {
          'x-auth-type': 'jwt',
        },
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ data: payload });
      expect(vi.mocked(findVisibleExerciseByName)).not.toHaveBeenCalled();
      expect(vi.mocked(findFoodByName)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('resolves exerciseName to exerciseId before the handler', async () => {
    vi.mocked(findVisibleExerciseByName).mockResolvedValue(buildExercise());

    const app = await buildTestApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/transform',
        payload: {
          exerciseName: 'Bench Press',
          setNumber: 1,
          reps: 8,
          weight: 185,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          exerciseName: 'Bench Press',
          exerciseId: 'exercise-1',
          setNumber: 1,
          reps: 8,
          weight: 185,
        },
      });
    } finally {
      await app.close();
    }
  });

  it('auto-creates an exercise when a name cannot be resolved', async () => {
    vi.mocked(findVisibleExerciseByName)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    vi.mocked(findExerciseDedupCandidates).mockResolvedValue([]);
    vi.mocked(createExercise).mockResolvedValue({
      id: 'exercise-new',
      userId: 'user-1',
      name: 'Landmine Press',
      category: 'compound',
      trackingType: 'weight_reps',
      muscleGroups: [],
      equipment: '',
      instructions: null,
      coachingNotes: null,
      relatedExerciseIds: [],
      tags: [],
      formCues: [],
      createdAt: 1,
      updatedAt: 1,
    });

    const app = await buildTestApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/transform',
        payload: {
          exerciseName: 'Landmine Press',
          setNumber: 1,
          reps: 8,
          weight: 95,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          exerciseName: 'Landmine Press',
          exerciseId: 'exercise-new',
          setNumber: 1,
          reps: 8,
          weight: 95,
        },
      });
      expect(vi.mocked(createExercise)).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('resolves food names for meal item arrays', async () => {
    vi.mocked(findFoodByName).mockResolvedValue({
      id: 'food-1',
      name: 'Chicken Breast',
      brand: null,
      servingSize: 'serving',
      calories: 120,
      protein: 25,
      carbs: 0,
      fat: 2,
    });

    const app = await buildTestApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/transform',
        payload: {
          items: [{ foodName: 'Chicken Breast', quantity: 1, unit: 'serving' }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          items: [
            {
              foodName: 'Chicken Breast',
              foodId: 'food-1',
              name: 'Chicken Breast',
              quantity: 1,
              amount: 1,
              unit: 'serving',
              calories: 120,
              protein: 25,
              carbs: 0,
              fat: 2,
            },
          ],
        },
      });
    } finally {
      await app.close();
    }
  });

  it('expands reps shorthand and resolves exercise names in nested template sections', async () => {
    vi.mocked(findVisibleExerciseByName).mockResolvedValue(buildExercise());

    const app = await buildTestApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/transform',
        payload: {
          sections: [
            {
              name: 'Main',
              exercises: [{ name: 'Bench Press', sets: 3, reps: '8-10' }],
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          sections: [
            {
              name: 'Main',
              exercises: [
                {
                  name: 'Bench Press',
                  exerciseId: 'exercise-1',
                  sets: 3,
                  reps: '8-10',
                  repsMin: 8,
                  repsMax: 10,
                },
              ],
            },
          ],
        },
      });
    } finally {
      await app.close();
    }
  });
});
