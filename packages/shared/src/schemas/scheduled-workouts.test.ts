import { describe, expect, it } from 'vitest';

import {
  createScheduledWorkoutInputSchema,
  type CreateScheduledWorkoutInput,
  scheduledWorkoutDetailSchema,
  type ScheduledWorkoutDetail,
  scheduledWorkoutListItemSchema,
  scheduledWorkoutQueryParamsSchema,
  scheduledWorkoutSchema,
  type ScheduledWorkout,
  type ScheduledWorkoutListItem,
  type ScheduledWorkoutQueryParams,
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
          section: 'main',
          orderIndex: 0,
          programmingNotes: '   ',
          agentNotes: '  push harder  ',
          agentNotesMeta: {
            author: 'agent',
            generatedAt: '2026-03-12T10:00:00.000Z',
            scheduledDateAtGeneration: '2026-03-13',
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
