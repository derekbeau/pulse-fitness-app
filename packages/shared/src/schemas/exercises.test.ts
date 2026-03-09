import { describe, expect, it } from 'vitest';

import {
  createExerciseInputSchema,
  exerciseLastPerformanceSchema,
  exerciseQueryParamsSchema,
  exerciseSchema,
  type CreateExerciseInput,
  type Exercise,
  type ExerciseCategory,
  type ExerciseLastPerformance,
  type ExerciseQueryParams,
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
      instructions: ' Drive feet into the floor. ',
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
      instructions: 'Drive feet into the floor.',
      createdAt: 1,
      updatedAt: 2,
    });
  });

  it('rejects invalid categories and empty muscle group arrays', () => {
    expect(() =>
      exerciseSchema.parse({
        id: 'exercise-1',
        userId: 'user-1',
        name: 'Lat Pulldown',
        muscleGroups: [],
        equipment: 'cable',
        category: 'strength',
        instructions: null,
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toThrow();
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
      instructions: null,
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
      instructions: '   ',
    });

    expect(payload).toEqual({
      name: 'Romanian Deadlift',
      muscleGroups: ['hamstrings', 'glutes'],
      equipment: 'barbell',
      category: 'compound',
      instructions: null,
    });
  });

  it('infers the CreateExerciseInput type from the schema', () => {
    const payload: CreateExerciseInput = {
      name: 'Air Bike',
      muscleGroups: ['conditioning'],
      equipment: 'air bike',
      category: 'cardio',
      instructions: null,
    };

    expect(payload.category).toBe('cardio');
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
    };

    expect(payload.equipment).toBe('cable');
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
