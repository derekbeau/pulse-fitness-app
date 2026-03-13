import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import {
  allRelatedExercisesOwned,
  createExercise,
  findExerciseDedupCandidates,
  findExerciseOwnership,
  listExercises,
  updateOwnedExercise,
} from '../exercises/store.js';

vi.mock('../exercises/store.js', () => ({
  allRelatedExercisesOwned: vi.fn(),
  createExercise: vi.fn(),
  deleteOwnedExercise: vi.fn(),
  findExerciseDedupCandidates: vi.fn(),
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
    vi.mocked(allRelatedExercisesOwned).mockReset();
    vi.mocked(findExerciseDedupCandidates).mockReset();
    vi.mocked(findExerciseOwnership).mockReset();
    vi.mocked(listExercises).mockReset();
    vi.mocked(updateOwnedExercise).mockReset();
    vi.mocked(allRelatedExercisesOwned).mockResolvedValue(true);
    process.env.JWT_SECRET = 'test-agent-exercises-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  describe('POST /api/agent/exercises', () => {
    it('creates an exercise when no dedup candidates are found', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findExerciseDedupCandidates).mockResolvedValue([]);
        vi.mocked(createExercise).mockResolvedValue({
          id: 'exercise-1',
          userId: 'user-1',
          name: 'Dumbbell Row',
          category: 'compound',
          trackingType: 'weight_reps',
          tags: [],
          formCues: [],
          muscleGroups: [],
          equipment: '',
          instructions: null,
          coachingNotes: null,
          relatedExerciseIds: [],
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
            created: true,
            exercise: {
              id: 'exercise-1',
              name: 'Dumbbell Row',
              category: 'compound',
              trackingType: 'weight_reps',
              muscleGroups: [],
              equipment: '',
              instructions: null,
              coachingNotes: null,
              relatedExerciseIds: [],
              tags: [],
              formCues: [],
            },
          },
        });

        expect(vi.mocked(createExercise)).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-1',
            name: 'Dumbbell Row',
            category: 'compound',
            trackingType: 'weight_reps',
            muscleGroups: [],
            equipment: '',
            instructions: null,
            coachingNotes: null,
            relatedExerciseIds: [],
          }),
        );
      } finally {
        await app.close();
      }
    });

    it('returns candidates without creating for an exact duplicate name', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findExerciseDedupCandidates).mockResolvedValue([
          {
            id: 'exercise-existing',
            name: 'Dumbbell Row',
            similarity: 1,
          },
        ]);

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/exercises',
          headers: createAuthorizationHeader(token),
          body: {
            name: 'Dumbbell Row',
          },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          data: {
            created: false,
            candidates: [
              {
                id: 'exercise-existing',
                name: 'Dumbbell Row',
                similarity: 1,
              },
            ],
          },
        });
        expect(vi.mocked(createExercise)).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it('creates when force is true despite duplicate candidates', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findExerciseDedupCandidates).mockResolvedValue([
          {
            id: 'exercise-existing',
            name: 'Dumbbell Row',
            similarity: 1,
          },
        ]);
        vi.mocked(createExercise).mockResolvedValue({
          id: 'exercise-2',
          userId: 'user-1',
          name: 'Dumbbell Row',
          category: 'compound',
          trackingType: 'weight_reps',
          tags: [],
          formCues: [],
          muscleGroups: [],
          equipment: '',
          instructions: null,
          coachingNotes: null,
          relatedExerciseIds: [],
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
            force: true,
          },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toEqual({
          data: {
            created: true,
            exercise: {
              id: 'exercise-2',
              name: 'Dumbbell Row',
              category: 'compound',
              trackingType: 'weight_reps',
              muscleGroups: [],
              equipment: '',
              instructions: null,
              coachingNotes: null,
              relatedExerciseIds: [],
              tags: [],
              formCues: [],
            },
          },
        });
        expect(vi.mocked(createExercise)).toHaveBeenCalledTimes(1);
      } finally {
        await app.close();
      }
    });

    it('rejects relatedExerciseIds when ownership validation fails', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findExerciseDedupCandidates).mockResolvedValue([]);
        vi.mocked(allRelatedExercisesOwned).mockResolvedValue(false);

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/exercises',
          headers: createAuthorizationHeader(token),
          body: {
            name: 'Dumbbell Row',
            relatedExerciseIds: ['exercise-missing'],
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'relatedExerciseIds must reference existing user-owned exercises',
          },
        });
        expect(vi.mocked(createExercise)).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });
  });

  describe('PATCH /api/agent/exercises/:id', () => {
    it('updates exercise metadata for a user-owned exercise', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findExerciseOwnership).mockResolvedValue({
          id: 'exercise-1',
          userId: 'user-1',
        });
        vi.mocked(updateOwnedExercise).mockResolvedValue({
          id: 'exercise-1',
          userId: 'user-1',
          name: 'Chest Supported Row',
          category: 'isolation',
          trackingType: 'reps_only',
          tags: ['pull'],
          formCues: ['elbow to hip'],
          muscleGroups: ['Back'],
          equipment: 'Dumbbell',
          instructions: 'Pull toward hip.',
          coachingNotes: null,
          relatedExerciseIds: [],
          createdAt: 1,
          updatedAt: 2,
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/agent/exercises/exercise-1',
          headers: createAuthorizationHeader(token),
          body: {
            name: 'Chest Supported Row',
            category: 'isolation',
            trackingType: 'reps_only',
            muscleGroups: ['Back'],
            equipment: 'Dumbbell',
            instructions: 'Pull toward hip.',
            formCues: ['elbow to hip'],
            tags: ['pull'],
          },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          data: {
            id: 'exercise-1',
            userId: 'user-1',
            name: 'Chest Supported Row',
            category: 'isolation',
            trackingType: 'reps_only',
            tags: ['pull'],
            formCues: ['elbow to hip'],
            muscleGroups: ['Back'],
            equipment: 'Dumbbell',
            instructions: 'Pull toward hip.',
            coachingNotes: null,
            relatedExerciseIds: [],
            createdAt: 1,
            updatedAt: 2,
          },
        });
        expect(vi.mocked(updateOwnedExercise)).toHaveBeenCalledWith({
          id: 'exercise-1',
          userId: 'user-1',
          changes: {
            name: 'Chest Supported Row',
            category: 'isolation',
            trackingType: 'reps_only',
            muscleGroups: ['Back'],
            equipment: 'Dumbbell',
            instructions: 'Pull toward hip.',
            formCues: ['elbow to hip'],
            tags: ['pull'],
          },
        });
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
              coachingNotes: null,
              relatedExerciseIds: [],
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
