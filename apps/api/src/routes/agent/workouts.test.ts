import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import {
  createExercise,
  findExerciseDedupCandidates,
  findVisibleExerciseByName,
  updateOwnedExercise,
} from '../exercises/store.js';
import {
  createScheduledWorkout,
  linkTodayScheduledWorkoutToSession,
  listScheduledWorkouts,
} from '../scheduled-workouts/store.js';
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
import { templateBelongsToUser } from '../workout-templates/template-access.js';

vi.mock('../exercises/store.js', () => ({
  createExercise: vi.fn(),
  deleteOwnedExercise: vi.fn(),
  findExerciseLastPerformance: vi.fn(),
  findExerciseDedupCandidates: vi.fn(),
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

vi.mock('../scheduled-workouts/store.js', () => ({
  createScheduledWorkout: vi.fn(),
  linkTodayScheduledWorkoutToSession: vi.fn(),
  listScheduledWorkouts: vi.fn(),
}));

vi.mock('../workout-templates/template-access.js', () => ({
  templateBelongsToUser: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

describe('agent workouts routes', () => {
  const startedAt = 1_700_000_000_000;
  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(createExercise).mockReset();
    vi.mocked(findExerciseDedupCandidates).mockReset();
    vi.mocked(findVisibleExerciseByName).mockReset();
    vi.mocked(updateOwnedExercise).mockReset();
    vi.mocked(createWorkoutTemplate).mockReset();
    vi.mocked(findWorkoutTemplateById).mockReset();
    vi.mocked(updateWorkoutTemplate).mockReset();
    vi.mocked(createWorkoutSession).mockReset();
    vi.mocked(findWorkoutSessionById).mockReset();
    vi.mocked(updateWorkoutSession).mockReset();
    vi.mocked(createScheduledWorkout).mockReset();
    vi.mocked(linkTodayScheduledWorkoutToSession).mockReset();
    vi.mocked(listScheduledWorkouts).mockReset();
    vi.mocked(templateBelongsToUser).mockReset();
    process.env.JWT_SECRET = 'test-agent-workouts-secret';
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(startedAt);
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    dateNowSpy.mockRestore();
  });

  describe('scheduled workout endpoints', () => {
    it('creates a scheduled workout for an accessible template', async () => {
      const app = buildServer();

      try {
        await app.ready();
        vi.mocked(templateBelongsToUser).mockResolvedValue(true);
        vi.mocked(createScheduledWorkout).mockResolvedValue({
          id: 'schedule-1',
          userId: 'user-1',
          templateId: 'template-1',
          date: '2026-03-12',
          sessionId: null,
          createdAt: 1,
          updatedAt: 1,
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/scheduled-workouts',
          headers: createAuthorizationHeader(token),
          body: {
            templateId: 'template-1',
            date: '2026-03-12',
          },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toEqual({
          data: {
            id: 'schedule-1',
            userId: 'user-1',
            templateId: 'template-1',
            date: '2026-03-12',
            sessionId: null,
            createdAt: 1,
            updatedAt: 1,
          },
        });
      } finally {
        await app.close();
      }
    });

    it('lists scheduled workouts within a date range', async () => {
      const app = buildServer();

      try {
        await app.ready();
        vi.mocked(listScheduledWorkouts).mockResolvedValue([
          {
            id: 'schedule-1',
            date: '2026-03-12',
            templateId: 'template-1',
            templateName: 'Upper Push',
            sessionId: null,
            createdAt: 1,
          },
        ]);

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'GET',
          url: '/api/agent/scheduled-workouts?from=2026-03-10&to=2026-03-16',
          headers: createAuthorizationHeader(token),
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          data: [
            {
              id: 'schedule-1',
              date: '2026-03-12',
              templateId: 'template-1',
              templateName: 'Upper Push',
              sessionId: null,
              createdAt: 1,
            },
          ],
        });
        expect(vi.mocked(listScheduledWorkouts)).toHaveBeenCalledWith({
          userId: 'user-1',
          from: '2026-03-10',
          to: '2026-03-16',
        });
      } finally {
        await app.close();
      }
    });
  });

  describe('POST /api/agent/workout-templates', () => {
    it('creates missing exercises and persists a template', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findVisibleExerciseByName).mockResolvedValue(undefined);
        vi.mocked(findExerciseDedupCandidates).mockResolvedValue([]);
        vi.mocked(createExercise).mockResolvedValue({
          id: 'exercise-1',
          userId: 'user-1',
          name: 'Bench Press',
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
                exercises: [
                  {
                    name: 'Bench Press',
                    sets: 4,
                    reps: 8,
                    restSeconds: 120,
                    tags: ['rehab', 'core'],
                    cues: ['this week stay at RPE 7', 'brace before each rep'],
                    formCues: ['chest up', 'drive through heels'],
                  },
                ],
              },
            ],
          },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toEqual({
          data: {
            template: {
              id: 'template-1',
              userId: 'user-1',
              name: 'Push Day',
              description: null,
              tags: [],
              sections: [],
              createdAt: 1,
              updatedAt: 1,
            },
            newExercises: [
              {
                id: 'exercise-1',
                name: 'Bench Press',
                possibleDuplicates: [],
              },
            ],
          },
        });
        expect(vi.mocked(createExercise)).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-1',
            name: 'Bench Press',
            muscleGroups: [],
            equipment: '',
            tags: ['rehab', 'core'],
            formCues: ['chest up', 'drive through heels', 'brace before each rep'],
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
                      cues: ['this week stay at RPE 7'],
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

    it('returns dedup hints for newly created exercises', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findVisibleExerciseByName).mockResolvedValue(undefined);
        vi.mocked(findExerciseDedupCandidates).mockResolvedValue([
          {
            id: 'exercise-existing-1',
            name: 'Bench Press',
            similarity: 0.83,
          },
        ]);
        vi.mocked(createExercise).mockResolvedValue({
          id: 'exercise-2',
          userId: 'user-1',
          name: 'Incline Bench Press',
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
        vi.mocked(createWorkoutTemplate).mockResolvedValue({
          id: 'template-2',
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
                exercises: [{ name: 'Incline Bench Press', sets: 4, reps: 8 }],
              },
            ],
          },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toEqual({
          data: {
            template: {
              id: 'template-2',
              userId: 'user-1',
              name: 'Push Day',
              description: null,
              tags: [],
              sections: [],
              createdAt: 1,
              updatedAt: 1,
            },
            newExercises: [
              {
                id: 'exercise-2',
                name: 'Incline Bench Press',
                possibleDuplicates: ['exercise-existing-1'],
              },
            ],
          },
        });
      } finally {
        await app.close();
      }
    });

    it('merges durable cues into existing owned exercises and keeps situational cues on template rows', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findVisibleExerciseByName).mockResolvedValue({
          id: 'exercise-1',
          userId: 'user-1',
          name: 'Bench Press',
          category: 'compound',
          trackingType: 'weight_reps',
          tags: [],
          formCues: ['keep elbows stacked'],
          muscleGroups: ['Chest'],
          equipment: 'Barbell',
          instructions: null,
          coachingNotes: null,
          relatedExerciseIds: [],
          createdAt: 1,
          updatedAt: 1,
        });
        vi.mocked(updateOwnedExercise).mockResolvedValue({
          id: 'exercise-1',
          userId: 'user-1',
          name: 'Bench Press',
          category: 'compound',
          trackingType: 'weight_reps',
          tags: [],
          formCues: ['keep elbows stacked', 'drive through heels'],
          muscleGroups: ['Chest'],
          equipment: 'Barbell',
          instructions: null,
          coachingNotes: null,
          relatedExerciseIds: [],
          createdAt: 1,
          updatedAt: 2,
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
                exercises: [
                  {
                    name: 'Bench Press',
                    sets: 3,
                    reps: 8,
                    cues: ['this week keep RPE 7', 'drive through heels'],
                  },
                ],
              },
            ],
          },
        });

        expect(response.statusCode).toBe(201);
        expect(vi.mocked(createExercise)).not.toHaveBeenCalled();
        expect(vi.mocked(updateOwnedExercise)).toHaveBeenCalledWith({
          id: 'exercise-1',
          userId: 'user-1',
          changes: {
            formCues: ['keep elbows stacked', 'drive through heels'],
          },
        });
        expect(vi.mocked(createWorkoutTemplate)).toHaveBeenCalledWith(
          expect.objectContaining({
            input: expect.objectContaining({
              sections: [
                {
                  type: 'main',
                  exercises: [
                    expect.objectContaining({
                      exerciseId: 'exercise-1',
                      cues: ['this week keep RPE 7'],
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
            trackingType: 'weight_reps',
            tags: [],
            formCues: [],
            muscleGroups: ['Chest'],
            equipment: 'Dumbbell',
            instructions: null,
            coachingNotes: null,
            relatedExerciseIds: [],
            createdAt: 1,
            updatedAt: 1,
          })
          .mockResolvedValueOnce({
            id: 'exercise-2',
            userId: 'user-1',
            name: 'Lateral Raise',
            category: 'isolation',
            trackingType: 'weight_reps',
            tags: [],
            formCues: [],
            muscleGroups: ['Shoulders'],
            equipment: 'Dumbbell',
            instructions: null,
            coachingNotes: null,
            relatedExerciseIds: [],
            createdAt: 1,
            updatedAt: 1,
          });
        vi.mocked(findExerciseDedupCandidates).mockResolvedValue([]);

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
                  {
                    name: 'Incline Press',
                    sets: 3,
                    reps: 10,
                    formCues: ['brace before press'],
                    cues: ['this week keep RPE 6'],
                  },
                  { name: 'Lateral Raise', sets: 3, reps: 15 },
                ],
              },
            ],
          },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          data: {
            template: {
              id: 'template-1',
              userId: 'user-1',
              name: 'Upper A',
              description: null,
              tags: [],
              sections: [],
              createdAt: 1,
              updatedAt: 2,
            },
            newExercises: [],
          },
        });
        expect(vi.mocked(updateWorkoutTemplate)).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'template-1',
            userId: 'user-1',
            input: expect.objectContaining({
              name: 'Upper A',
              sections: [
                {
                  type: 'main',
                  exercises: [
                    expect.objectContaining({
                      exerciseId: 'exercise-1',
                      cues: ['this week keep RPE 6'],
                    }),
                    expect.objectContaining({
                      exerciseId: 'exercise-2',
                      cues: [],
                    }),
                  ],
                },
              ],
            }),
          }),
        );
        expect(vi.mocked(updateOwnedExercise)).toHaveBeenCalledWith({
          id: 'exercise-1',
          userId: 'user-1',
          changes: { formCues: ['brace before press'] },
        });
      } finally {
        await app.close();
      }
    });

    it('does not wipe existing exercise form cues when template update only sends situational cues', async () => {
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

        vi.mocked(findVisibleExerciseByName).mockResolvedValue({
          id: 'exercise-1',
          userId: 'user-1',
          name: 'Squat',
          category: 'compound',
          trackingType: 'weight_reps',
          tags: [],
          formCues: ['brace hard', 'drive knees out'],
          muscleGroups: ['Quads'],
          equipment: 'Barbell',
          instructions: null,
          coachingNotes: null,
          relatedExerciseIds: [],
          createdAt: 1,
          updatedAt: 1,
        });

        vi.mocked(updateWorkoutTemplate).mockResolvedValue({
          id: 'template-1',
          userId: 'user-1',
          name: 'Leg A',
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
            name: 'Leg A',
            sections: [
              {
                name: 'Main',
                exercises: [{ name: 'Squat', sets: 3, reps: 5, cues: ['week 2 keep RPE 6'] }],
              },
            ],
          },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          data: {
            template: {
              id: 'template-1',
              userId: 'user-1',
              name: 'Leg A',
              description: null,
              tags: [],
              sections: [],
              createdAt: 1,
              updatedAt: 2,
            },
            newExercises: [],
          },
        });
        expect(vi.mocked(updateOwnedExercise)).not.toHaveBeenCalled();
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
          timeSegments: [],
          feedback: null,
          notes: null,
          sets: [],
          createdAt: 1,
          updatedAt: 1,
        });
        vi.mocked(linkTodayScheduledWorkoutToSession).mockResolvedValue(true);

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
        expect(vi.mocked(linkTodayScheduledWorkoutToSession)).toHaveBeenCalledWith({
          userId: 'user-1',
          templateId: 'template-1',
          date: '2023-11-14',
          sessionId: 'session-1',
        });
      } finally {
        await app.close();
      }
    });
  });

  describe('PATCH /api/agent/workout-sessions/:id', () => {
    it('adds exercises to an active session', async () => {
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
          timeSegments: [],
          feedback: null,
          notes: null,
          sets: [
            {
              id: 'set-1',
              exerciseId: 'exercise-bench',
              setNumber: 1,
              weight: 100,
              reps: 8,
              completed: true,
              skipped: false,
              section: 'main',
              notes: null,
              createdAt: 1,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        });

        vi.mocked(findVisibleExerciseByName).mockResolvedValue(undefined);
        vi.mocked(findExerciseDedupCandidates).mockResolvedValue([]);
        vi.mocked(createExercise).mockResolvedValue({
          id: 'exercise-goblet-squat',
          userId: 'user-1',
          name: 'Goblet Squat',
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

        vi.mocked(updateWorkoutSession).mockResolvedValue({
          id: 'session-1',
          userId: 'user-1',
          templateId: null,
          name: 'Upper Session',
          date: '2023-11-14',
          status: 'in-progress',
          startedAt,
          completedAt: null,
          duration: null,
          timeSegments: [],
          feedback: null,
          notes: null,
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
            addExercises: [{ name: 'Goblet Squat', sets: 2, reps: 10, section: 'main' }],
          },
        });

        expect(response.statusCode).toBe(200);
        expect(vi.mocked(updateWorkoutSession)).toHaveBeenCalledWith(
          expect.objectContaining({
            input: expect.objectContaining({
              sets: expect.arrayContaining([
                expect.objectContaining({
                  exerciseId: 'exercise-bench',
                  setNumber: 1,
                  completed: true,
                }),
                expect.objectContaining({
                  exerciseId: 'exercise-goblet-squat',
                  setNumber: 1,
                  reps: 10,
                  completed: false,
                  section: 'main',
                }),
                expect.objectContaining({
                  exerciseId: 'exercise-goblet-squat',
                  setNumber: 2,
                  reps: 10,
                  completed: false,
                  section: 'main',
                }),
              ]),
            }),
          }),
        );
      } finally {
        await app.close();
      }
    });

    it('blocks removing exercises that have logged sets', async () => {
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
          timeSegments: [],
          feedback: null,
          notes: null,
          sets: [
            {
              id: 'set-1',
              exerciseId: 'exercise-bench',
              setNumber: 1,
              weight: 100,
              reps: 8,
              completed: true,
              skipped: false,
              section: 'main',
              notes: null,
              createdAt: 1,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/agent/workout-sessions/session-1',
          headers: createAuthorizationHeader(token),
          body: {
            removeExercises: ['exercise-bench'],
          },
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({
          error: {
            code: 'WORKOUT_SESSION_EXERCISE_HAS_LOGGED_SETS',
            message: 'Cannot remove an exercise with logged sets',
          },
        });
        expect(vi.mocked(updateWorkoutSession)).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it('removes exercises that have no logged sets', async () => {
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
          timeSegments: [],
          feedback: null,
          notes: null,
          sets: [
            {
              id: 'set-1',
              exerciseId: 'exercise-bench',
              setNumber: 1,
              weight: null,
              reps: null,
              completed: false,
              skipped: false,
              section: 'main',
              notes: null,
              createdAt: 1,
            },
            {
              id: 'set-2',
              exerciseId: 'exercise-row',
              setNumber: 1,
              weight: null,
              reps: null,
              completed: false,
              skipped: false,
              section: 'main',
              notes: null,
              createdAt: 2,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        });

        vi.mocked(updateWorkoutSession).mockResolvedValue({
          id: 'session-1',
          userId: 'user-1',
          templateId: null,
          name: 'Upper Session',
          date: '2023-11-14',
          status: 'in-progress',
          startedAt,
          completedAt: null,
          duration: null,
          timeSegments: [],
          feedback: null,
          notes: null,
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
            removeExercises: ['exercise-bench'],
          },
        });

        expect(response.statusCode).toBe(200);
        const updateCall = vi.mocked(updateWorkoutSession).mock.calls.at(0);
        expect(updateCall?.[0].input.sets.map((set) => set.exerciseId)).toEqual(['exercise-row']);
      } finally {
        await app.close();
      }
    });

    it('reorders exercises while preserving logged set data', async () => {
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
          timeSegments: [],
          feedback: null,
          notes: null,
          sets: [
            {
              id: 'set-1',
              exerciseId: 'exercise-bench',
              setNumber: 1,
              weight: 105,
              reps: 7,
              completed: true,
              skipped: false,
              section: 'main',
              notes: null,
              createdAt: 1,
            },
            {
              id: 'set-2',
              exerciseId: 'exercise-row',
              setNumber: 1,
              weight: 85,
              reps: 10,
              completed: true,
              skipped: false,
              section: 'main',
              notes: null,
              createdAt: 2,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        });

        vi.mocked(updateWorkoutSession).mockResolvedValue({
          id: 'session-1',
          userId: 'user-1',
          templateId: null,
          name: 'Upper Session',
          date: '2023-11-14',
          status: 'in-progress',
          startedAt,
          completedAt: null,
          duration: null,
          timeSegments: [],
          feedback: null,
          notes: null,
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
            reorderExercises: ['exercise-row', 'exercise-bench'],
          },
        });

        expect(response.statusCode).toBe(200);
        const updateCall = vi.mocked(updateWorkoutSession).mock.calls.at(0);
        expect(updateCall?.[0].input.sets).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              exerciseId: 'exercise-row',
              orderIndex: 0,
              completed: true,
              weight: 85,
              reps: 10,
            }),
            expect.objectContaining({
              exerciseId: 'exercise-bench',
              orderIndex: 1,
              completed: true,
              weight: 105,
              reps: 7,
            }),
          ]),
        );
      } finally {
        await app.close();
      }
    });

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
          timeSegments: [],
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
            trackingType: 'weight_reps',
            tags: [],
            formCues: [],
            muscleGroups: ['Chest'],
            equipment: 'Barbell',
            instructions: null,
            coachingNotes: null,
            relatedExerciseIds: [],
            createdAt: 1,
            updatedAt: 1,
          })
          .mockResolvedValueOnce(undefined);
        vi.mocked(findExerciseDedupCandidates).mockResolvedValue([]);

        vi.mocked(createExercise).mockResolvedValue({
          id: 'exercise-squat',
          userId: 'user-1',
          name: 'Squat',
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
          timeSegments: [],
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

    it('preserves exercise ordering from the existing session when merging sets', async () => {
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
          timeSegments: [],
          feedback: null,
          notes: null,
          sets: [
            {
              id: 'set-1',
              exerciseId: 'exercise-z',
              setNumber: 1,
              weight: 100,
              reps: 8,
              completed: false,
              skipped: false,
              section: 'main',
              notes: null,
              createdAt: 1,
            },
            {
              id: 'set-2',
              exerciseId: 'exercise-z',
              setNumber: 2,
              weight: 100,
              reps: 8,
              completed: false,
              skipped: false,
              section: 'main',
              notes: null,
              createdAt: 2,
            },
            {
              id: 'set-3',
              exerciseId: 'exercise-a',
              setNumber: 1,
              weight: 50,
              reps: 12,
              completed: false,
              skipped: false,
              section: 'main',
              notes: null,
              createdAt: 3,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        });

        vi.mocked(findVisibleExerciseByName)
          .mockResolvedValueOnce({
            id: 'exercise-z',
            userId: 'user-1',
            name: 'Bench Press',
            category: 'compound',
            trackingType: 'weight_reps',
            tags: [],
            formCues: [],
            muscleGroups: ['Chest'],
            equipment: 'Barbell',
            instructions: null,
            coachingNotes: null,
            relatedExerciseIds: [],
            createdAt: 1,
            updatedAt: 1,
          })
          .mockResolvedValueOnce(undefined);
        vi.mocked(findExerciseDedupCandidates).mockResolvedValue([]);

        vi.mocked(createExercise).mockResolvedValue({
          id: 'exercise-b',
          userId: 'user-1',
          name: 'Squat',
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

        vi.mocked(updateWorkoutSession).mockResolvedValue({
          id: 'session-1',
          userId: 'user-1',
          templateId: null,
          name: 'Upper Session',
          date: '2023-11-14',
          status: 'in-progress',
          startedAt,
          completedAt: null,
          duration: null,
          timeSegments: [],
          feedback: null,
          notes: null,
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
            sets: [
              { exerciseName: 'Bench Press', setNumber: 2, weight: 105, reps: 7 },
              { exerciseName: 'Squat', setNumber: 1, weight: 225, reps: 5 },
            ],
          },
        });

        expect(response.statusCode).toBe(200);

        const updateCall = vi.mocked(updateWorkoutSession).mock.calls.at(0);
        const setKeys = updateCall?.[0].input.sets.map(
          (set) => `${set.exerciseId}:${set.setNumber}`,
        );
        expect(setKeys).toEqual(['exercise-z:1', 'exercise-z:2', 'exercise-a:1', 'exercise-b:1']);
      } finally {
        await app.close();
      }
    });

    it('refreshes completedAt when a completed session is patched as completed again', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findWorkoutSessionById).mockResolvedValue({
          id: 'session-1',
          userId: 'user-1',
          templateId: null,
          name: 'Upper Session',
          date: '2023-11-14',
          status: 'completed',
          startedAt,
          completedAt: startedAt - 10_000,
          duration: 10_000,
          timeSegments: [],
          feedback: null,
          notes: null,
          sets: [],
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
          timeSegments: [],
          feedback: null,
          notes: null,
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
          },
        });

        expect(response.statusCode).toBe(200);

        const updateCall = vi.mocked(updateWorkoutSession).mock.calls.at(0);
        expect(updateCall?.[0].input.completedAt).toBe(startedAt);
        expect(updateCall?.[0].input.duration).toBe(0);
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
