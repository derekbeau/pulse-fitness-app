import { describe, expect, it } from 'vitest';

import {
  createScheduledWorkoutInputSchema,
  type CreateScheduledWorkoutInput,
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

describe('scheduledWorkoutListItemSchema', () => {
  it('parses a range-query result with template metadata', () => {
    const payload = scheduledWorkoutListItemSchema.parse({
      id: 'schedule-1',
      date: '2026-03-12',
      templateId: 'template-1',
      templateName: ' Upper Push ',
      sessionId: 'session-1',
      createdAt: 1,
    });

    const scheduledWorkout: ScheduledWorkoutListItem = payload;

    expect(scheduledWorkout).toEqual({
      id: 'schedule-1',
      date: '2026-03-12',
      templateId: 'template-1',
      templateName: 'Upper Push',
      sessionId: 'session-1',
      createdAt: 1,
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
  it('accepts partial updates for date or template changes', () => {
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
