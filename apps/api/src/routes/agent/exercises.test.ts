import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { createExercise, listExercises } from '../exercises/store.js';

vi.mock('../exercises/store.js', () => ({
  createExercise: vi.fn(),
  deleteOwnedExercise: vi.fn(),
  findExerciseLastPerformance: vi.fn(),
  findExerciseOwnership: vi.fn(),
  findVisibleExerciseById: vi.fn(),
  listExerciseFilters: vi.fn(),
  listExercises: vi.fn(),
  updateOwnedExercise: vi.fn(),
  findVisibleExerciseByName: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

describe('agent exercises routes', () => {
  beforeEach(() => {
    vi.mocked(createExercise).mockReset();
    vi.mocked(listExercises).mockReset();
    process.env.JWT_SECRET = 'test-agent-exercises-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  describe('POST /api/agent/exercises', () => {
    it('creates an exercise with defaults when optional fields are omitted', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(createExercise).mockResolvedValue({
          id: 'exercise-1',
          userId: 'user-1',
          name: 'Dumbbell Row',
          category: 'compound',
          trackingType: 'weight_reps',
          tags: [],
          formCues: [],
          muscleGroups: ['Full Body'],
          equipment: 'Bodyweight',
          instructions: null,
          createdAt: 1,
          updatedAt: 1,
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/exercises',
          headers: createAuthorizationHeader(token),
          body: {
            name: 'Dumbbell Row',
          },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toEqual({
          data: {
            id: 'exercise-1',
            name: 'Dumbbell Row',
            category: 'compound',
            muscleGroups: ['Full Body'],
            equipment: 'Bodyweight',
          },
        });

        expect(vi.mocked(createExercise)).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-1',
            name: 'Dumbbell Row',
            category: 'compound',
            trackingType: 'weight_reps',
            muscleGroups: ['Full Body'],
            equipment: 'Bodyweight',
            instructions: null,
          }),
        );
      } finally {
        await app.close();
      }
    });
  });

  describe('GET /api/agent/exercises/search', () => {
    it('returns matching exercises by name', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(listExercises).mockResolvedValue({
          data: [
            {
              id: 'exercise-1',
              userId: null,
              name: 'Barbell Bench Press',
              category: 'compound',
              trackingType: 'weight_reps',
              tags: [],
              formCues: [],
              muscleGroups: ['Chest', 'Triceps'],
              equipment: 'Barbell',
              instructions: null,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          meta: {
            page: 1,
            limit: 10,
            total: 1,
          },
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/exercises/search?q=bench&limit=10',
          headers: createAuthorizationHeader(token),
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          data: [
            {
              id: 'exercise-1',
              name: 'Barbell Bench Press',
              category: 'compound',
              muscleGroups: ['Chest', 'Triceps'],
              equipment: 'Barbell',
            },
          ],
        });

        expect(vi.mocked(listExercises)).toHaveBeenCalledWith({
          userId: 'user-1',
          q: 'bench',
          page: 1,
          limit: 10,
        });
      } finally {
        await app.close();
      }
    });

    it('returns 400 for invalid search query', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/exercises/search',
          headers: createAuthorizationHeader(token),
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid exercise search query',
          },
        });
      } finally {
        await app.close();
      }
    });
  });
});
