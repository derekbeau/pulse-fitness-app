import { describe, expect, it } from 'vitest';

import {
  createScheduledWorkoutInputSchema,
  type CreateScheduledWorkoutInput,
  type ReorderScheduledWorkoutInput,
  scheduledWorkoutDetailSchema,
  type ScheduledWorkoutDetail,
  scheduledWorkoutListItemSchema,
  scheduledWorkoutQueryParamsSchema,
  scheduledWorkoutSchema,
  swapScheduledWorkoutExerciseInputSchema,
  type SwapScheduledWorkoutExerciseInput,
  type ScheduledWorkout,
  type ScheduledWorkoutListItem,
  type ScheduledWorkoutQueryParams,
  type UpdateScheduledWorkoutExercisesInput,
  type UpdateScheduledWorkoutExerciseSetsInput,
  type UpdateScheduledWorkoutExerciseNotesInput,
  reorderScheduledWorkoutInputSchema,
  updateScheduledWorkoutExercisesInputSchema,
  updateScheduledWorkoutExerciseSetsInputSchema,
  updateScheduledWorkoutExerciseNotesInputSchema,
  type UpdateScheduledWorkoutInput,
  updateScheduledWorkoutInputSchema,
} from './scheduled-workouts';

describe('scheduledWorkoutSchema', () => {
  it('parses a persisted scheduled workout record', () => {
    const payload = scheduledWorkoutSchema.parse({
      id: 'schedule-1',
      userId: 'user-1',
      templateId: 'template-1',
      date: '2026-03-12',
      sessionId: null,
      createdAt: 1,
      updatedAt: 2,
    });

    const scheduledWorkout: ScheduledWorkout = payload;

    expect(scheduledWorkout).toEqual({
      id: 'schedule-1',
      userId: 'user-1',
      templateId: 'template-1',
      date: '2026-03-12',
      sessionId: null,
      createdAt: 1,
      updatedAt: 2,
    });
  });
});

describe('scheduledWorkoutDetailSchema', () => {
  it('parses snapshot exercises with marker fields', () => {
    const payload = scheduledWorkoutDetailSchema.parse({
      id: 'schedule-1',
      userId: 'user-1',
      templateId: 'template-1',
      date: '2026-03-12',
      sessionId: null,
      createdAt: 1,
      updatedAt: 2,
      exercises: [
        {
          exerciseId: 'exercise-1',
          exerciseName: 'Back Squat',
          section: 'main',
          orderIndex: 0,
          programmingNotes: 'Keep reps crisp',
          agentNotes: null,
          agentNotesMeta: null,
          templateCues: ['Brace'],
          supersetGroup: null,
          tempo: '3010',
          restSeconds: 90,
          sets: [
            {
              setNumber: 1,
              repsMin: 8,
              repsMax: 10,
              reps: null,
              targetWeight: null,
              targetWeightMin: null,
              targetWeightMax: null,
              targetSeconds: null,
              targetDistance: null,
            },
          ],
        },
      ],
      templateDrift: null,
      staleExercises: [],
      templateDeleted: false,
    });

    const scheduledWorkout: ScheduledWorkoutDetail = payload;

    expect(scheduledWorkout).toMatchObject({
      id: 'schedule-1',
      exercises: [
        {
          exerciseId: 'exercise-1',
          section: 'main',
          orderIndex: 0,
          programmingNotes: 'Keep reps crisp',
          templateCues: ['Brace'],
        },
      ],
      templateDrift: null,
      staleExercises: [],
      templateDeleted: false,
    });
  });

  it('trims and nulls blank note strings', () => {
    const payload = scheduledWorkoutDetailSchema.parse({
      id: 'schedule-2',
      userId: 'user-1',
      templateId: 'template-1',
      date: '2026-03-13',
      sessionId: null,
      createdAt: 1,
      updatedAt: 2,
      exercises: [
        {
          exerciseId: 'exercise-1',
          exerciseName: 'Back Squat',
          section: 'main',
          orderIndex: 0,
          programmingNotes: '   ',
          agentNotes: '  push harder  ',
          agentNotesMeta: {
            author: 'agent',
            generatedAt: '2026-03-12T10:00:00.000Z',
            scheduledDateAtGeneration: '2026-03-13',
            stale: false,
          },
          templateCues: null,
          supersetGroup: null,
          tempo: null,
          restSeconds: null,
          sets: [],
        },
      ],
      templateDrift: null,
      staleExercises: [],
      templateDeleted: false,
    });

    expect(payload.exercises[0]).toMatchObject({
      programmingNotes: null,
      agentNotes: 'push harder',
    });
  });
});

describe('scheduledWorkoutListItemSchema', () => {
  it('parses a range-query result with template metadata', () => {
    const payload = scheduledWorkoutListItemSchema.parse({
      id: 'schedule-1',
      date: '2026-03-12',
      templateId: 'template-1',
      templateName: ' Upper Push ',
      templateTrackingTypes: ['weight_reps', 'seconds_only'],
      sessionId: 'session-1',
      createdAt: 1,
    });

    const scheduledWorkout: ScheduledWorkoutListItem = payload;

    expect(scheduledWorkout).toEqual({
      id: 'schedule-1',
      date: '2026-03-12',
      templateId: 'template-1',
      templateName: 'Upper Push',
      templateTrackingTypes: ['weight_reps', 'seconds_only'],
      sessionId: 'session-1',
      createdAt: 1,
    });
  });

  it('allows list items that omit templateTrackingTypes', () => {
    const payload = scheduledWorkoutListItemSchema.parse({
      id: 'schedule-2',
      date: '2026-03-13',
      templateId: 'template-2',
      templateName: 'Lower Body',
      sessionId: null,
      createdAt: 2,
    });

    const scheduledWorkout: ScheduledWorkoutListItem = payload;

    expect(scheduledWorkout).toEqual({
      id: 'schedule-2',
      date: '2026-03-13',
      templateId: 'template-2',
      templateName: 'Lower Body',
      sessionId: null,
      createdAt: 2,
    });
  });
});

describe('createScheduledWorkoutInputSchema', () => {
  it('normalizes the template id and accepts valid date input', () => {
    const payload = createScheduledWorkoutInputSchema.parse({
      templateId: ' template-1 ',
      date: '2026-03-12',
    });

    const typedPayload: CreateScheduledWorkoutInput = payload;

    expect(typedPayload).toEqual({
      templateId: 'template-1',
      date: '2026-03-12',
    });
  });
});

describe('updateScheduledWorkoutInputSchema', () => {
  it('accepts partial updates for date changes', () => {
    const payload: UpdateScheduledWorkoutInput = updateScheduledWorkoutInputSchema.parse({
      date: '2026-03-13',
    });

    expect(payload).toEqual({
      date: '2026-03-13',
    });
  });

  it('rejects empty update payloads', () => {
    expect(() => updateScheduledWorkoutInputSchema.parse({})).toThrow();
  });
});

describe('scheduledWorkoutQueryParamsSchema', () => {
  it('accepts an ordered date range and infers the query type', () => {
    const payload = scheduledWorkoutQueryParamsSchema.parse({
      from: '2026-03-10',
      to: '2026-03-16',
    });

    const query: ScheduledWorkoutQueryParams = payload;

    expect(query).toEqual({
      from: '2026-03-10',
      to: '2026-03-16',
    });
  });

  it('rejects inverted date ranges', () => {
    expect(() =>
      scheduledWorkoutQueryParamsSchema.parse({
        from: '2026-03-16',
        to: '2026-03-10',
      }),
    ).toThrow();
  });
});

describe('updateScheduledWorkoutExerciseNotesInputSchema', () => {
  it('accepts batched exercise note updates and normalizes note strings', () => {
    const payload: UpdateScheduledWorkoutExerciseNotesInput =
      updateScheduledWorkoutExerciseNotesInputSchema.parse({
        notes: [
          {
            exerciseId: 'exercise-1',
            agentNotes: '  Keep first set easy  ',
          },
          {
            exerciseId: 'exercise-2',
            agentNotes: null,
          },
        ],
      });

    expect(payload).toEqual({
      notes: [
        {
          exerciseId: 'exercise-1',
          agentNotes: 'Keep first set easy',
        },
        {
          exerciseId: 'exercise-2',
          agentNotes: null,
        },
      ],
    });
  });

  it('rejects empty exercise note batches', () => {
    expect(() =>
      updateScheduledWorkoutExerciseNotesInputSchema.parse({
        notes: [],
      }),
    ).toThrow();
  });
});

describe('swapScheduledWorkoutExerciseInputSchema', () => {
  it('accepts swap payloads with optional carry-over flags', () => {
    const payload: SwapScheduledWorkoutExerciseInput =
      swapScheduledWorkoutExerciseInputSchema.parse({
        fromExerciseId: 'exercise-1',
        toExerciseId: ' exercise-2 ',
        carryOverProgrammingNotes: true,
        preserveSets: false,
      });

    expect(payload).toEqual({
      fromExerciseId: 'exercise-1',
      toExerciseId: 'exercise-2',
      carryOverProgrammingNotes: true,
      preserveSets: false,
    });
  });

  it('allows remove-style swaps with a null target exercise id', () => {
    const payload: SwapScheduledWorkoutExerciseInput =
      swapScheduledWorkoutExerciseInputSchema.parse({
        fromExerciseId: 'exercise-1',
        toExerciseId: null,
      });

    expect(payload).toEqual({
      fromExerciseId: 'exercise-1',
      toExerciseId: null,
    });
  });
});

describe('reorderScheduledWorkoutInputSchema', () => {
  it('parses valid reorder payloads', () => {
    const payload: ReorderScheduledWorkoutInput = reorderScheduledWorkoutInputSchema.parse({
      order: ['de111111-1111-4111-8111-111111111111', 'de222222-2222-4222-8222-222222222222'],
    });

    expect(payload).toEqual({
      order: ['de111111-1111-4111-8111-111111111111', 'de222222-2222-4222-8222-222222222222'],
    });
  });

  it('rejects empty order arrays', () => {
    expect(() =>
      reorderScheduledWorkoutInputSchema.parse({
        order: [],
      }),
    ).toThrow();
  });

  it('rejects order entries that are not UUIDs', () => {
    expect(() =>
      reorderScheduledWorkoutInputSchema.parse({
        order: ['exercise-1'],
      }),
    ).toThrow();
  });
});

describe('updateScheduledWorkoutExercisesInputSchema', () => {
  it('parses partial exercise metadata updates', () => {
    const payload: UpdateScheduledWorkoutExercisesInput =
      updateScheduledWorkoutExercisesInputSchema.parse({
        updates: [
          {
            exerciseId: 'de111111-1111-4111-8111-111111111111',
            supersetGroup: 'A',
            section: 'main',
          },
          {
            exerciseId: 'de222222-2222-4222-8222-222222222222',
            restSeconds: 75,
            programmingNotes: null,
          },
        ],
      });

    expect(payload).toEqual({
      updates: [
        {
          exerciseId: 'de111111-1111-4111-8111-111111111111',
          supersetGroup: 'A',
          section: 'main',
        },
        {
          exerciseId: 'de222222-2222-4222-8222-222222222222',
          restSeconds: 75,
          programmingNotes: null,
        },
      ],
    });
  });

  it('rejects unknown fields inside update items', () => {
    expect(() =>
      updateScheduledWorkoutExercisesInputSchema.parse({
        updates: [
          {
            exerciseId: 'de111111-1111-4111-8111-111111111111',
            unknown: 'value',
          },
        ],
      }),
    ).toThrow();
  });
});

describe('updateScheduledWorkoutExerciseSetsInputSchema', () => {
  it('parses mixed target updates and remove operations', () => {
    const payload: UpdateScheduledWorkoutExerciseSetsInput =
      updateScheduledWorkoutExerciseSetsInputSchema.parse({
        exerciseId: 'de111111-1111-4111-8111-111111111111',
        sets: [
          {
            setNumber: 1,
            targetSeconds: 720,
            repsMin: 8,
            repsMax: 10,
          },
          {
            setNumber: 2,
            remove: true,
          },
        ],
      });

    expect(payload).toEqual({
      exerciseId: 'de111111-1111-4111-8111-111111111111',
      sets: [
        {
          setNumber: 1,
          targetSeconds: 720,
          repsMin: 8,
          repsMax: 10,
        },
        {
          setNumber: 2,
          remove: true,
        },
      ],
    });
  });

  it('rejects remove operations combined with target fields', () => {
    expect(() =>
      updateScheduledWorkoutExerciseSetsInputSchema.parse({
        exerciseId: 'de111111-1111-4111-8111-111111111111',
        sets: [
          {
            setNumber: 2,
            remove: true,
            targetSeconds: 600,
          },
        ],
      }),
    ).toThrow('remove cannot be combined with target fields');
  });

  it('rejects empty set update payloads', () => {
    expect(() =>
      updateScheduledWorkoutExerciseSetsInputSchema.parse({
        exerciseId: 'de111111-1111-4111-8111-111111111111',
        sets: [],
      }),
    ).toThrow();
  });
});
