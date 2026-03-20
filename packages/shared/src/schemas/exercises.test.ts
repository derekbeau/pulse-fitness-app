import { describe, expect, it } from 'vitest';

import {
  createExerciseInputSchema,
  exerciseHistoryWithRelatedSchema,
  exerciseLastPerformanceQuerySchema,
  exerciseTrackingTypeSchema,
  exerciseLastPerformanceSchema,
  exerciseQueryParamsSchema,
  exerciseSchema,
  type CreateExerciseInput,
  type Exercise,
  type ExerciseHistoryWithRelated,
  type ExerciseCategory,
  type ExerciseLastPerformance,
  type ExerciseLastPerformanceQuery,
  type ExerciseQueryParams,
  type ExerciseTrackingType,
  type UpdateExerciseInput,
  updateExerciseInputSchema,
} from './exercises';

describe('exerciseSchema', () => {
  it('parses a valid exercise payload', () => {
    const payload = exerciseSchema.parse({
      id: 'exercise-1',
      userId: null,
      name: ' Incline Dumbbell Press ',
      muscleGroups: ['chest', 'front delts', 'triceps'],
      equipment: ' dumbbells ',
      category: 'compound',
      trackingType: 'bodyweight_reps',
      tags: ['push', 'upper-body'],
      formCues: ['chest up', 'drive through heels'],
      instructions: ' Drive feet into the floor. ',
      coachingNotes: ' Keep a slight arch and avoid shoulder shrugging. ',
      relatedExerciseIds: ['exercise-2'],
      createdAt: 1,
      updatedAt: 2,
    });

    expect(payload).toEqual({
      id: 'exercise-1',
      userId: null,
      name: 'Incline Dumbbell Press',
      muscleGroups: ['chest', 'front delts', 'triceps'],
      equipment: 'dumbbells',
      category: 'compound',
      trackingType: 'bodyweight_reps',
      tags: ['push', 'upper-body'],
      formCues: ['chest up', 'drive through heels'],
      instructions: 'Drive feet into the floor.',
      coachingNotes: ' Keep a slight arch and avoid shoulder shrugging. ',
      relatedExerciseIds: ['exercise-2'],
      createdAt: 1,
      updatedAt: 2,
    });
  });

  it('defaults trackingType to weight_reps when omitted', () => {
    const payload = exerciseSchema.parse({
      id: 'exercise-1',
      userId: null,
      name: 'Bench Press',
      muscleGroups: ['chest', 'triceps'],
      equipment: 'barbell',
      category: 'compound',
      instructions: null,
      createdAt: 1,
      updatedAt: 2,
    });

    expect(payload.trackingType).toBe('weight_reps');
    expect(payload.tags).toEqual([]);
    expect(payload.formCues).toEqual([]);
    expect(payload.coachingNotes).toBeNull();
    expect(payload.relatedExerciseIds).toEqual([]);
  });

  it('rejects invalid categories', () => {
    expect(() =>
      exerciseSchema.parse({
        id: 'exercise-1',
        userId: 'user-1',
        name: 'Lat Pulldown',
        muscleGroups: [],
        equipment: 'cable',
        category: 'strength',
        trackingType: 'invalid',
        tags: [],
        formCues: [],
        instructions: null,
        coachingNotes: null,
        relatedExerciseIds: [],
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toThrow();
  });

  it('allows empty muscle groups on API payloads for agent-created placeholders', () => {
    const payload = exerciseSchema.parse({
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
      createdAt: 1,
      updatedAt: 2,
    });

    expect(payload.muscleGroups).toEqual([]);
  });

  it('infers the Exercise type from the schema', () => {
    const category: ExerciseCategory = 'mobility';
    const payload: Exercise = {
      id: 'exercise-2',
      userId: 'user-1',
      name: 'Couch Stretch',
      muscleGroups: ['hip flexors', 'quads'],
      equipment: 'bodyweight',
      category,
      trackingType: 'reps_only',
      tags: ['mobility'],
      formCues: ['slow and controlled'],
      instructions: null,
      coachingNotes: null,
      relatedExerciseIds: [],
      createdAt: 10,
      updatedAt: 10,
    };

    expect(payload.category).toBe('mobility');
  });
});

describe('createExerciseInputSchema', () => {
  it('normalizes trimmed strings and defaults empty instructions to null', () => {
    const payload = createExerciseInputSchema.parse({
      name: ' Romanian Deadlift ',
      muscleGroups: ['hamstrings', 'glutes'],
      equipment: ' barbell ',
      category: 'compound',
      trackingType: 'cardio',
      tags: ['hinge'],
      formCues: ['hips back'],
      instructions: '   ',
    });

    expect(payload).toEqual({
      name: 'Romanian Deadlift',
      muscleGroups: ['hamstrings', 'glutes'],
      equipment: 'barbell',
      category: 'compound',
      trackingType: 'cardio',
      tags: ['hinge'],
      formCues: ['hips back'],
      instructions: null,
      coachingNotes: null,
      relatedExerciseIds: [],
      force: false,
    });
  });

  it('defaults tags and formCues to empty arrays when omitted', () => {
    const payload = createExerciseInputSchema.parse({
      name: 'Air Bike',
      muscleGroups: ['conditioning'],
      equipment: 'air bike',
      category: 'cardio',
    });

    expect(payload.tags).toEqual([]);
    expect(payload.formCues).toEqual([]);
  });

  it('infers the CreateExerciseInput type from the schema', () => {
    const payload: CreateExerciseInput = {
      name: 'Air Bike',
      muscleGroups: ['conditioning'],
      equipment: 'air bike',
      category: 'cardio',
      trackingType: 'cardio',
      tags: ['conditioning'],
      formCues: ['steady pace'],
      instructions: null,
      coachingNotes: null,
      relatedExerciseIds: [],
      force: false,
    };

    expect(payload.category).toBe('cardio');
  });

  it('accepts exerciseName alias and applies agent-compatible defaults', () => {
    const payload = createExerciseInputSchema.parse({
      exerciseName: ' Landmine Press ',
      coachingNotes: ' Keep ribs stacked. ',
    });

    expect(payload).toEqual({
      name: 'Landmine Press',
      category: 'compound',
      trackingType: 'weight_reps',
      muscleGroups: [],
      equipment: '',
      tags: [],
      formCues: [],
      instructions: null,
      coachingNotes: 'Keep ribs stacked.',
      relatedExerciseIds: [],
      force: false,
    });
  });

  it('requires name or exerciseName', () => {
    expect(() => createExerciseInputSchema.parse({ category: 'compound' })).toThrow();
  });

  it('rejects relatedExerciseIds beyond the limit', () => {
    const relatedExerciseIds = Array.from({ length: 21 }, (_, index) => `exercise-${index}`);

    expect(() =>
      createExerciseInputSchema.parse({
        name: 'Air Bike',
        muscleGroups: ['conditioning'],
        equipment: 'air bike',
        category: 'cardio',
        relatedExerciseIds,
      }),
    ).toThrow();
  });
});

describe('updateExerciseInputSchema', () => {
  it('requires at least one field and allows clearing instructions', () => {
    expect(() => updateExerciseInputSchema.parse({})).toThrow();

    const payload = updateExerciseInputSchema.parse({
      instructions: '   ',
    });

    expect(payload).toEqual({
      instructions: null,
    });
  });

  it('infers the UpdateExerciseInput type from the schema', () => {
    const payload: UpdateExerciseInput = {
      equipment: 'cable',
      trackingType: 'weight_seconds',
      tags: ['back'],
      formCues: ['lead with elbows'],
      coachingNotes: 'Do not swing the torso.',
      relatedExerciseIds: ['exercise-3'],
    };

    expect(payload.equipment).toBe('cable');
  });
});

describe('exerciseTrackingTypeSchema', () => {
  it('accepts declared tracking types and rejects unsupported values', () => {
    const validType: ExerciseTrackingType = exerciseTrackingTypeSchema.parse('bodyweight_reps');
    expect(validType).toBe('bodyweight_reps');
    expect(() => exerciseTrackingTypeSchema.parse('strength')).toThrow();
  });
});

describe('exerciseQueryParamsSchema', () => {
  it('applies defaults and trims optional filters', () => {
    const payload = exerciseQueryParamsSchema.parse({
      q: '  row  ',
      muscleGroup: ' lats ',
      equipment: ' cable machine ',
    });

    expect(payload).toEqual({
      q: 'row',
      muscleGroup: 'lats',
      equipment: 'cable machine',
      category: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('rejects invalid pagination and infers the ExerciseQueryParams type', () => {
    expect(() => exerciseQueryParamsSchema.parse({ page: 0 })).toThrow();

    const payload: ExerciseQueryParams = {
      q: 'press',
      category: 'compound',
      page: 2,
      limit: 10,
    };

    expect(payload.limit).toBe(10);
  });
});

describe('exerciseLastPerformanceSchema', () => {
  it('parses latest exercise performance payload', () => {
    const payload: ExerciseLastPerformance = exerciseLastPerformanceSchema.parse({
      sessionId: 'session-22',
      date: '2026-03-08',
      sets: [
        {
          setNumber: 1,
          reps: 10,
          weight: 60,
        },
        {
          setNumber: 2,
          reps: 8,
          weight: null,
        },
      ],
    });

    expect(payload).toEqual({
      sessionId: 'session-22',
      date: '2026-03-08',
      sets: [
        {
          setNumber: 1,
          reps: 10,
          weight: 60,
        },
        {
          setNumber: 2,
          reps: 8,
          weight: null,
        },
      ],
    });
  });

  it('rejects invalid set ordering fields', () => {
    expect(() =>
      exerciseLastPerformanceSchema.parse({
        sessionId: 'session-22',
        date: '2026-03-08',
        sets: [
          {
            setNumber: 0,
            reps: 8,
            weight: 50,
          },
        ],
      }),
    ).toThrow();
  });
});

describe('exerciseLastPerformanceQuerySchema', () => {
  it('defaults includeRelated to false and limit to 3', () => {
    const payload: ExerciseLastPerformanceQuery = exerciseLastPerformanceQuerySchema.parse({});

    expect(payload).toEqual({
      includeRelated: false,
      limit: 3,
    });
  });

  it('coerces includeRelated and limit query string values', () => {
    const payload = exerciseLastPerformanceQuerySchema.parse({
      includeRelated: 'true',
      limit: '5',
    });

    expect(payload.includeRelated).toBe(true);
    expect(payload.limit).toBe(5);
  });

  it('enforces a maximum limit of 10', () => {
    expect(() =>
      exerciseLastPerformanceQuerySchema.parse({
        limit: 11,
      }),
    ).toThrow();
  });
});

describe('exerciseHistoryWithRelatedSchema', () => {
  it('parses exact and related history payload', () => {
    const payload: ExerciseHistoryWithRelated = exerciseHistoryWithRelatedSchema.parse({
      history: {
        sessionId: 'session-22',
        date: '2026-03-08',
        sets: [
          {
            setNumber: 1,
            reps: 10,
            weight: 60,
          },
        ],
      },
      related: [
        {
          exerciseId: 'incline-bench',
          exerciseName: 'Incline Bench Press',
          trackingType: 'weight_reps',
          history: null,
        },
      ],
    });

    expect(payload.related[0]).toEqual({
      exerciseId: 'incline-bench',
      exerciseName: 'Incline Bench Press',
      trackingType: 'weight_reps',
      history: null,
    });
  });
});
