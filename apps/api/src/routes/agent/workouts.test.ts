import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { createExercise, findVisibleExerciseByName } from '../exercises/store.js';
import {
  createWorkoutSession,
  findWorkoutSessionById,
  updateWorkoutSession,
} from '../workout-sessions/store.js';
import {
  createWorkoutTemplate,
  findWorkoutTemplateById,
  updateWorkoutTemplate,
} from '../workout-templates/store.js';

vi.mock('../exercises/store.js', () => ({
  createExercise: vi.fn(),
  deleteOwnedExercise: vi.fn(),
  findExerciseLastPerformance: vi.fn(),
  findExerciseOwnership: vi.fn(),
  findVisibleExerciseById: vi.fn(),
  findVisibleExerciseByName: vi.fn(),
  listExerciseFilters: vi.fn(),
  listExercises: vi.fn(),
  updateOwnedExercise: vi.fn(),
}));

vi.mock('../workout-templates/store.js', () => ({
  allTemplateExercisesAccessible: vi.fn(),
  createWorkoutTemplate: vi.fn(),
  deleteWorkoutTemplate: vi.fn(),
  findWorkoutTemplateById: vi.fn(),
  listWorkoutTemplates: vi.fn(),
  updateWorkoutTemplate: vi.fn(),
}));

vi.mock('../workout-sessions/store.js', () => ({
  allSessionExercisesAccessible: vi.fn(),
  batchUpsertSessionSets: vi.fn(),
  createSessionSet: vi.fn(),
  createWorkoutSession: vi.fn(),
  deleteWorkoutSession: vi.fn(),
  findWorkoutSessionAccess: vi.fn(),
  findWorkoutSessionById: vi.fn(),
  listSessionSetGroups: vi.fn(),
  SessionSetNotFoundError: class extends Error {},
  listWorkoutSessions: vi.fn(),
  saveCompletedSessionAsTemplate: vi.fn(),
  updateSessionSet: vi.fn(),
  updateWorkoutSession: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

describe('agent workouts routes', () => {
  const startedAt = 1_700_000_000_000;
  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(createExercise).mockReset();
    vi.mocked(findVisibleExerciseByName).mockReset();
    vi.mocked(createWorkoutTemplate).mockReset();
    vi.mocked(findWorkoutTemplateById).mockReset();
    vi.mocked(updateWorkoutTemplate).mockReset();
    vi.mocked(createWorkoutSession).mockReset();
    vi.mocked(findWorkoutSessionById).mockReset();
    vi.mocked(updateWorkoutSession).mockReset();
    process.env.JWT_SECRET = 'test-agent-workouts-secret';
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(startedAt);
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    dateNowSpy.mockRestore();
  });

  describe('POST /api/agent/workout-templates', () => {
    it('creates missing exercises and persists a template', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findVisibleExerciseByName).mockResolvedValue(undefined);
        vi.mocked(createExercise).mockResolvedValue({
          id: 'exercise-1',
          userId: 'user-1',
          name: 'Bench Press',
          category: 'compound',
          muscleGroups: ['Chest'],
          equipment: 'Barbell',
          instructions: null,
          createdAt: 1,
          updatedAt: 1,
        });

        vi.mocked(createWorkoutTemplate).mockResolvedValue({
          id: 'template-1',
          userId: 'user-1',
          name: 'Push Day',
          description: null,
          tags: [],
          sections: [],
          createdAt: 1,
          updatedAt: 1,
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/workout-templates',
          headers: createAuthorizationHeader(token),
          body: {
            name: 'Push Day',
            sections: [
              {
                name: 'Main',
                exercises: [{ name: 'Bench Press', sets: 4, reps: 8, restSeconds: 120 }],
              },
            ],
          },
        });

        expect(response.statusCode).toBe(201);
        expect(vi.mocked(createExercise)).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-1',
            name: 'Bench Press',
          }),
        );
        expect(vi.mocked(createWorkoutTemplate)).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-1',
            input: expect.objectContaining({
              name: 'Push Day',
              sections: [
                {
                  type: 'main',
                  exercises: [
                    expect.objectContaining({
                      exerciseId: 'exercise-1',
                      sets: 4,
                      repsMin: 8,
                      repsMax: 8,
                      restSeconds: 120,
                    }),
                  ],
                },
              ],
            }),
          }),
        );
      } finally {
        await app.close();
      }
    });
  });

  describe('PUT /api/agent/workout-templates/:id', () => {
    it('replaces template exercises using resolved exercise names', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findWorkoutTemplateById).mockResolvedValue({
          id: 'template-1',
          userId: 'user-1',
          name: 'Old Template',
          description: null,
          tags: [],
          sections: [],
          createdAt: 1,
          updatedAt: 1,
        });

        vi.mocked(findVisibleExerciseByName)
          .mockResolvedValueOnce({
            id: 'exercise-1',
            userId: 'user-1',
            name: 'Incline Press',
            category: 'compound',
            muscleGroups: ['Chest'],
            equipment: 'Dumbbell',
            instructions: null,
            createdAt: 1,
            updatedAt: 1,
          })
          .mockResolvedValueOnce({
            id: 'exercise-2',
            userId: 'user-1',
            name: 'Lateral Raise',
            category: 'isolation',
            muscleGroups: ['Shoulders'],
            equipment: 'Dumbbell',
            instructions: null,
            createdAt: 1,
            updatedAt: 1,
          });

        vi.mocked(updateWorkoutTemplate).mockResolvedValue({
          id: 'template-1',
          userId: 'user-1',
          name: 'Upper A',
          description: null,
          tags: [],
          sections: [],
          createdAt: 1,
          updatedAt: 2,
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'PUT',
          url: '/api/agent/workout-templates/template-1',
          headers: createAuthorizationHeader(token),
          body: {
            name: 'Upper A',
            sections: [
              {
                name: 'Main',
                exercises: [
                  { name: 'Incline Press', sets: 3, reps: 10 },
                  { name: 'Lateral Raise', sets: 3, reps: 15 },
                ],
              },
            ],
          },
        });

        expect(response.statusCode).toBe(200);
        expect(vi.mocked(updateWorkoutTemplate)).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'template-1',
            userId: 'user-1',
            input: expect.objectContaining({
              name: 'Upper A',
            }),
          }),
        );
      } finally {
        await app.close();
      }
    });
  });

  describe('POST /api/agent/workout-sessions', () => {
    it('starts a session from a template and prebuilds sets', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findWorkoutTemplateById).mockResolvedValue({
          id: 'template-1',
          userId: 'user-1',
          name: 'Leg Day',
          description: null,
          tags: [],
          sections: [
            {
              type: 'warmup',
              exercises: [],
            },
            {
              type: 'main',
              exercises: [
                {
                  id: 'template-exercise-1',
                  exerciseId: 'exercise-squat',
                  exerciseName: 'Squat',
                  sets: 2,
                  repsMin: 5,
                  repsMax: 5,
                  tempo: null,
                  restSeconds: null,
                  supersetGroup: null,
                  notes: null,
                  cues: [],
                },
              ],
            },
            {
              type: 'cooldown',
              exercises: [],
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        });

        vi.mocked(createWorkoutSession).mockResolvedValue({
          id: 'session-1',
          userId: 'user-1',
          templateId: 'template-1',
          name: 'Leg Day',
          date: '2023-11-14',
          status: 'in-progress',
          startedAt,
          completedAt: null,
          duration: null,
          feedback: null,
          notes: null,
          sets: [],
          createdAt: 1,
          updatedAt: 1,
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/workout-sessions',
          headers: createAuthorizationHeader(token),
          body: {
            templateId: 'template-1',
          },
        });

        expect(response.statusCode).toBe(201);
        expect(vi.mocked(createWorkoutSession)).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-1',
            input: expect.objectContaining({
              templateId: 'template-1',
              name: 'Leg Day',
              date: '2023-11-14',
              status: 'in-progress',
              startedAt,
              sets: [
                expect.objectContaining({
                  exerciseId: 'exercise-squat',
                  setNumber: 1,
                  section: 'main',
                }),
                expect.objectContaining({
                  exerciseId: 'exercise-squat',
                  setNumber: 2,
                  section: 'main',
                }),
              ],
            }),
          }),
        );
      } finally {
        await app.close();
      }
    });
  });

  describe('PATCH /api/agent/workout-sessions/:id', () => {
    it('resolves exercise names and upserts sets', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findWorkoutSessionById).mockResolvedValue({
          id: 'session-1',
          userId: 'user-1',
          templateId: null,
          name: 'Upper Session',
          date: '2023-11-14',
          status: 'in-progress',
          startedAt,
          completedAt: null,
          duration: null,
          feedback: null,
          notes: null,
          sets: [
            {
              id: 'set-1',
              exerciseId: 'exercise-bench',
              setNumber: 1,
              weight: 100,
              reps: 8,
              completed: false,
              skipped: false,
              section: 'main',
              notes: null,
              createdAt: 1,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        });

        vi.mocked(findVisibleExerciseByName)
          .mockResolvedValueOnce({
            id: 'exercise-bench',
            userId: 'user-1',
            name: 'Bench Press',
            category: 'compound',
            muscleGroups: ['Chest'],
            equipment: 'Barbell',
            instructions: null,
            createdAt: 1,
            updatedAt: 1,
          })
          .mockResolvedValueOnce(undefined);

        vi.mocked(createExercise).mockResolvedValue({
          id: 'exercise-squat',
          userId: 'user-1',
          name: 'Squat',
          category: 'compound',
          muscleGroups: ['Full Body'],
          equipment: 'Bodyweight',
          instructions: null,
          createdAt: 1,
          updatedAt: 1,
        });

        vi.mocked(updateWorkoutSession).mockResolvedValue({
          id: 'session-1',
          userId: 'user-1',
          templateId: null,
          name: 'Upper Session',
          date: '2023-11-14',
          status: 'completed',
          startedAt,
          completedAt: startedAt,
          duration: 0,
          feedback: null,
          notes: 'Solid session',
          sets: [],
          createdAt: 1,
          updatedAt: 2,
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/agent/workout-sessions/session-1',
          headers: createAuthorizationHeader(token),
          body: {
            status: 'completed',
            notes: 'Solid session',
            sets: [
              { exerciseName: 'Bench Press', setNumber: 1, weight: 105, reps: 7 },
              { exerciseName: 'Squat', setNumber: 1, weight: 225, reps: 5 },
            ],
          },
        });

        expect(response.statusCode).toBe(200);
        expect(vi.mocked(updateWorkoutSession)).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'session-1',
            userId: 'user-1',
            input: expect.objectContaining({
              status: 'completed',
              notes: 'Solid session',
              completedAt: startedAt,
              duration: 0,
              sets: expect.arrayContaining([
                expect.objectContaining({
                  exerciseId: 'exercise-bench',
                  setNumber: 1,
                  weight: 105,
                  reps: 7,
                  completed: true,
                }),
                expect.objectContaining({
                  exerciseId: 'exercise-squat',
                  setNumber: 1,
                  weight: 225,
                  reps: 5,
                  completed: true,
                }),
              ]),
            }),
          }),
        );
      } finally {
        await app.close();
      }
    });

    it('returns 404 when the session does not exist', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findWorkoutSessionById).mockResolvedValue(undefined);

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/agent/workout-sessions/missing',
          headers: createAuthorizationHeader(token),
          body: {
            notes: 'Missing session',
          },
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
          error: {
            code: 'WORKOUT_SESSION_NOT_FOUND',
            message: 'Workout session not found',
          },
        });
      } finally {
        await app.close();
      }
    });
  });
});
