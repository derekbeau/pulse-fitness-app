import { describe, expect, it } from 'vitest';

import {
  createHabitInputSchema,
  habitSchema,
  type Habit,
  type ReorderHabitsInput,
  reorderHabitsInputSchema,
  type UpdateHabitInput,
  updateHabitInputSchema,
} from './habits';

describe('createHabitInputSchema', () => {
  it('parses boolean habits without target or unit', () => {
    const payload = createHabitInputSchema.parse({
      name: ' Supplements ',
      emoji: ' 💊 ',
      trackingType: 'boolean',
    });

    expect(payload).toEqual({
      name: 'Supplements',
      emoji: '💊',
      trackingType: 'boolean',
    });
  });

  it('requires target and unit for numeric and time habits', () => {
    expect(() =>
      createHabitInputSchema.parse({
        name: 'Water',
        trackingType: 'numeric',
      }),
    ).toThrow();

    expect(() =>
      createHabitInputSchema.parse({
        name: 'Sleep',
        trackingType: 'time',
        target: 8,
      }),
    ).toThrow();
  });

  it('rejects target and unit for boolean habits', () => {
    expect(() =>
      createHabitInputSchema.parse({
        name: 'Meditate',
        trackingType: 'boolean',
        target: 1,
        unit: 'session',
      }),
    ).toThrow();
  });
});

describe('updateHabitInputSchema', () => {
  it('accepts partial updates', () => {
    const payload = updateHabitInputSchema.parse({
      unit: ' hours ',
      active: false,
    });

    expect(payload).toEqual({
      active: false,
      unit: 'hours',
    });
  });

  it('rejects empty update payloads', () => {
    expect(() => updateHabitInputSchema.parse({})).toThrow();
  });

  it('infers the UpdateHabitInput type from the schema', () => {
    const payload: UpdateHabitInput = {
      name: 'Walk',
      trackingType: 'numeric',
    };

    expect(payload.name).toBe('Walk');
  });
});

describe('reorderHabitsInputSchema', () => {
  it('accepts a valid reorder payload', () => {
    const payload = reorderHabitsInputSchema.parse({
      items: [
        { id: 'habit-1', sortOrder: 0 },
        { id: 'habit-2', sortOrder: 1 },
      ],
    });

    expect(payload.items).toHaveLength(2);
  });

  it('rejects duplicate habit ids', () => {
    expect(() =>
      reorderHabitsInputSchema.parse({
        items: [
          { id: 'habit-1', sortOrder: 0 },
          { id: 'habit-1', sortOrder: 1 },
        ],
      }),
    ).toThrow();
  });

  it('infers the ReorderHabitsInput type from the schema', () => {
    const payload: ReorderHabitsInput = {
      items: [{ id: 'habit-1', sortOrder: 2 }],
    };

    expect(payload.items[0]?.sortOrder).toBe(2);
  });
});

describe('habitSchema', () => {
  it('parses persisted habit records', () => {
    const payload = habitSchema.parse({
      id: 'habit-1',
      userId: 'user-1',
      name: 'Water',
      emoji: '💧',
      trackingType: 'numeric',
      target: 8,
      unit: 'glasses',
      sortOrder: 0,
      active: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
    });

    expect(payload.name).toBe('Water');
  });

  it('infers the Habit type from the schema', () => {
    const payload: Habit = {
      id: 'habit-1',
      userId: 'user-1',
      name: 'Supplements',
      emoji: null,
      trackingType: 'boolean',
      target: null,
      unit: null,
      sortOrder: 1,
      active: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    };

    expect(payload.active).toBe(true);
  });
});
