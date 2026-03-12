import { describe, expect, it } from 'vitest';

import {
  createHabitEntryInputSchema,
  habitEntryQueryParamsSchema,
  habitEntrySchema,
  type HabitEntry,
  type HabitEntryQueryParams,
  type UpdateHabitEntryInput,
  updateHabitEntryInputSchema,
} from './habit-entries';

describe('createHabitEntryInputSchema', () => {
  it('parses a valid habit entry payload', () => {
    const payload = createHabitEntryInputSchema.parse({
      date: '2026-03-07',
      completed: true,
      value: 8,
      isOverride: true,
    });

    expect(payload).toEqual({
      date: '2026-03-07',
      completed: true,
      value: 8,
      isOverride: true,
    });
  });

  it('accepts boolean-style entries without a value', () => {
    const payload = createHabitEntryInputSchema.parse({
      date: '2026-03-07',
      completed: false,
    });

    expect(payload.value).toBeUndefined();
  });

  it('rejects malformed dates', () => {
    expect(() =>
      createHabitEntryInputSchema.parse({
        date: '03/07/2026',
        completed: true,
      }),
    ).toThrow();
  });
});

describe('updateHabitEntryInputSchema', () => {
  it('accepts partial updates', () => {
    const payload = updateHabitEntryInputSchema.parse({
      value: 45,
      isOverride: false,
    });

    expect(payload).toEqual({
      value: 45,
      isOverride: false,
    });
  });

  it('rejects empty payloads', () => {
    expect(() => updateHabitEntryInputSchema.parse({})).toThrow();
  });

  it('infers the UpdateHabitEntryInput type from the schema', () => {
    const payload: UpdateHabitEntryInput = {
      completed: true,
    };

    expect(payload.completed).toBe(true);
  });
});

describe('habitEntryQueryParamsSchema', () => {
  it('accepts a valid inclusive date range', () => {
    const payload = habitEntryQueryParamsSchema.parse({
      from: '2026-03-01',
      to: '2026-03-07',
    });

    expect(payload).toEqual({
      from: '2026-03-01',
      to: '2026-03-07',
    });
  });

  it('rejects inverted date ranges', () => {
    expect(() =>
      habitEntryQueryParamsSchema.parse({
        from: '2026-03-08',
        to: '2026-03-07',
      }),
    ).toThrow();
  });

  it('rejects date ranges longer than 366 days', () => {
    expect(() =>
      habitEntryQueryParamsSchema.parse({
        from: '2025-01-01',
        to: '2026-01-03',
      }),
    ).toThrow();
  });

  it('infers the HabitEntryQueryParams type from the schema', () => {
    const payload: HabitEntryQueryParams = {
      from: '2026-03-01',
      to: '2026-03-07',
    };

    expect(payload.to).toBe('2026-03-07');
  });
});

describe('habitEntrySchema', () => {
  it('parses persisted habit entry records', () => {
    const payload = habitEntrySchema.parse({
      id: 'entry-1',
      habitId: 'habit-1',
      userId: 'user-1',
      date: '2026-03-07',
      completed: true,
      value: null,
      isOverride: false,
      createdAt: 1_700_000_000_000,
    });

    expect(payload.completed).toBe(true);
  });

  it('infers the HabitEntry type from the schema', () => {
    const payload: HabitEntry = {
      id: 'entry-1',
      habitId: 'habit-1',
      userId: 'user-1',
      date: '2026-03-07',
      completed: false,
      value: 30,
      isOverride: false,
      createdAt: 1_700_000_000_000,
    };

    expect(payload.value).toBe(30);
  });
});
