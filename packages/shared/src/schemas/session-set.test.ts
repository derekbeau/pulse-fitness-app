import { describe, expect, it } from 'vitest';

import {
  batchUpsertSetsSchema,
  createSetSchema,
  type CreateSetInput,
  type UpdateSetInput,
  updateSetSchema,
} from './session-set';

describe('createSetSchema', () => {
  it('parses valid create input and applies defaults', () => {
    const payload = createSetSchema.parse({
      exerciseId: ' global-bench-press ',
      setNumber: 2,
    });

    const typedPayload: CreateSetInput = payload;

    expect(typedPayload).toEqual({
      exerciseId: 'global-bench-press',
      setNumber: 2,
      weight: null,
      reps: null,
      seconds: null,
      distance: null,
      section: null,
    });
  });
});

describe('updateSetSchema', () => {
  it('accepts partial set updates', () => {
    const payload = updateSetSchema.parse({
      reps: 8,
      seconds: 30,
      completed: true,
      notes: '  Smooth tempo  ',
    });

    const typedPayload: UpdateSetInput = payload;

    expect(typedPayload).toEqual({
      reps: 8,
      seconds: 30,
      completed: true,
      notes: 'Smooth tempo',
    });
  });

  it('rejects negative seconds and distance', () => {
    expect(() => updateSetSchema.parse({ seconds: -1 })).toThrow();
    expect(() => updateSetSchema.parse({ distance: -0.1 })).toThrow();
  });

  it('rejects empty updates', () => {
    expect(() => updateSetSchema.parse({})).toThrow();
  });

  it('rejects completed and skipped being true simultaneously', () => {
    expect(() =>
      updateSetSchema.parse({
        completed: true,
        skipped: true,
      }),
    ).toThrow();
  });
});

describe('batchUpsertSetsSchema', () => {
  it('accepts mixed create and update rows', () => {
    const payload = batchUpsertSetsSchema.parse({
      sets: [
        {
          id: 'set-1',
          exerciseId: 'global-bench-press',
          setNumber: 1,
          weight: 185,
          reps: 8,
          seconds: 45,
          distance: 0.25,
          section: 'main',
        },
        {
          exerciseId: 'user-1-lat-pulldown',
          setNumber: 2,
        },
      ],
    });

    expect(payload).toEqual({
      sets: [
        {
          id: 'set-1',
          exerciseId: 'global-bench-press',
          setNumber: 1,
          weight: 185,
          reps: 8,
          seconds: 45,
          distance: 0.25,
          section: 'main',
        },
        {
          exerciseId: 'user-1-lat-pulldown',
          setNumber: 2,
          weight: null,
          reps: null,
          seconds: null,
          distance: null,
          section: null,
        },
      ],
    });
  });
});
