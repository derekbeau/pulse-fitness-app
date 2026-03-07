import { describe, expect, it } from 'vitest';

import {
  type CreateWeightInput,
  type WeightQueryParams,
  createWeightInputSchema,
  weightQueryParamsSchema,
} from './weight';

describe('createWeightInputSchema', () => {
  it('parses a valid payload and normalizes blank notes', () => {
    const payload = createWeightInputSchema.parse({
      date: '2026-03-07',
      weight: 182.4,
      notes: '   ',
    });

    expect(payload).toEqual({
      date: '2026-03-07',
      weight: 182.4,
      notes: undefined,
    });
  });

  it('rejects non-positive weights', () => {
    expect(() =>
      createWeightInputSchema.parse({
        date: '2026-03-07',
        weight: 0,
      }),
    ).toThrow();
  });

  it('infers the CreateWeightInput type from the schema', () => {
    const payload: CreateWeightInput = {
      date: '2026-03-07',
      weight: 181.2,
      notes: 'Fasted',
    };

    expect(payload.notes).toBe('Fasted');
  });
});

describe('weightQueryParamsSchema', () => {
  it('parses a valid date range', () => {
    const params = weightQueryParamsSchema.parse({
      from: '2026-03-01',
      to: '2026-03-07',
    });

    expect(params).toEqual({
      from: '2026-03-01',
      to: '2026-03-07',
    });
  });

  it('rejects a reversed date range', () => {
    expect(() =>
      weightQueryParamsSchema.parse({
        from: '2026-03-08',
        to: '2026-03-07',
      }),
    ).toThrow();
  });

  it('infers the WeightQueryParams type from the schema', () => {
    const params: WeightQueryParams = {
      from: '2026-03-01',
      to: '2026-03-07',
    };

    expect(params.to).toBe('2026-03-07');
  });
});
