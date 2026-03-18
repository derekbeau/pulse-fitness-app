import type { CreateWorkoutSessionInput, SessionSetInput } from '@pulse/shared';
import { describe, expect, it } from 'vitest';

import {
  applyExerciseNotesToSets,
  buildExerciseSectionOrder,
  buildInitialSessionSets,
  reorderSessionSetsByExercise,
} from './session-set-utils.js';

describe('buildInitialSessionSets', () => {
  it('creates default sets from template sections', () => {
    const sets = buildInitialSessionSets([
      {
        type: 'warmup',
        exercises: [{ exerciseId: 'ex-a', sets: 2 }],
      },
      {
        type: 'main',
        exercises: [
          { exerciseId: 'ex-b', sets: null },
          { exerciseId: 'ex-c', sets: 1 },
        ],
      },
    ]);

    expect(sets).toEqual([
      {
        exerciseId: 'ex-a',
        orderIndex: 0,
        setNumber: 1,
        weight: null,
        reps: null,
        completed: false,
        skipped: false,
        section: 'warmup',
        notes: null,
      },
      {
        exerciseId: 'ex-a',
        orderIndex: 0,
        setNumber: 2,
        weight: null,
        reps: null,
        completed: false,
        skipped: false,
        section: 'warmup',
        notes: null,
      },
      {
        exerciseId: 'ex-b',
        orderIndex: 0,
        setNumber: 1,
        weight: null,
        reps: null,
        completed: false,
        skipped: false,
        section: 'main',
        notes: null,
      },
      {
        exerciseId: 'ex-c',
        orderIndex: 1,
        setNumber: 1,
        weight: null,
        reps: null,
        completed: false,
        skipped: false,
        section: 'main',
        notes: null,
      },
    ]);
  });
});

describe('buildExerciseSectionOrder', () => {
  it('tracks earliest order index per exercise', () => {
    const order = buildExerciseSectionOrder([
      {
        exerciseId: 'ex-a',
        orderIndex: 2,
        setNumber: 1,
        weight: null,
        reps: null,
        completed: false,
        skipped: false,
        section: 'main',
        notes: null,
      },
      {
        exerciseId: 'ex-a',
        orderIndex: 1,
        setNumber: 2,
        weight: null,
        reps: null,
        completed: false,
        skipped: false,
        section: 'main',
        notes: null,
      },
      {
        exerciseId: 'ex-b',
        orderIndex: 0,
        setNumber: 1,
        weight: null,
        reps: null,
        completed: false,
        skipped: false,
        section: 'warmup',
        notes: null,
      },
    ] satisfies CreateWorkoutSessionInput['sets']);

    expect(order.get('ex-a')).toEqual({ section: 'main', orderIndex: 1 });
    expect(order.get('ex-b')).toEqual({ section: 'warmup', orderIndex: 0 });
  });
});

describe('reorderSessionSetsByExercise', () => {
  it('reorders within each section and keeps remaining exercises stable', () => {
    const sets = [
      {
        exerciseId: 'w1',
        orderIndex: 0,
        setNumber: 1,
        weight: null,
        reps: null,
        completed: false,
        skipped: false,
        section: 'warmup',
        notes: null,
      },
      {
        exerciseId: 'w2',
        orderIndex: 1,
        setNumber: 1,
        weight: null,
        reps: null,
        completed: false,
        skipped: false,
        section: 'warmup',
        notes: null,
      },
      {
        exerciseId: 'm1',
        orderIndex: 0,
        setNumber: 1,
        weight: null,
        reps: null,
        completed: false,
        skipped: false,
        section: 'main',
        notes: null,
      },
      {
        exerciseId: 'm2',
        orderIndex: 1,
        setNumber: 1,
        weight: null,
        reps: null,
        completed: false,
        skipped: false,
        section: 'main',
        notes: null,
      },
    ] satisfies CreateWorkoutSessionInput['sets'];

    const reordered = reorderSessionSetsByExercise(sets, ['m2', 'w2']);

    expect(reordered.map((set) => `${set.section}:${set.exerciseId}:${set.orderIndex}`)).toEqual([
      'warmup:w1:1',
      'warmup:w2:0',
      'main:m1:1',
      'main:m2:0',
    ]);
  });
});

describe('applyExerciseNotesToSets', () => {
  it('applies notes only to each exercise first set when note is not null', () => {
    const sets = [
      {
        exerciseId: 'ex-a',
        orderIndex: 0,
        setNumber: 2,
        weight: null,
        reps: null,
        completed: false,
        skipped: false,
        section: 'main',
        notes: null,
      },
      {
        exerciseId: 'ex-a',
        orderIndex: 0,
        setNumber: 1,
        weight: null,
        reps: null,
        completed: false,
        skipped: false,
        section: 'main',
        notes: null,
      },
      {
        exerciseId: 'ex-b',
        orderIndex: 1,
        setNumber: 1,
        weight: null,
        reps: null,
        completed: false,
        skipped: false,
        section: 'main',
        notes: null,
      },
    ] satisfies SessionSetInput[];

    const result = applyExerciseNotesToSets({
      sets,
      exerciseNotes: {
        'ex-a': 'Top set first',
        'ex-b': null,
      },
    });

    expect(result[0]?.notes).toBeNull();
    expect(result[1]?.notes).toBe('Top set first');
    expect(result[2]?.notes).toBeNull();
  });
});
