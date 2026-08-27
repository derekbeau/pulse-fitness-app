import { describe, expect, it } from 'vitest';

import { proteinFloorProgressSchema } from '../schemas/protein-floor.js';
import { calculateProteinFloorProgress } from './protein-floor.js';

describe('calculateProteinFloorProgress', () => {
  it.each([
    {
      name: 'zero logged',
      actualProteinGrams: 0,
      proteinFloorGrams: 190,
      state: 'below_floor',
      remainingToFloorGrams: 190,
      amountAboveFloorGrams: 0,
    },
    {
      name: 'one gram below',
      actualProteinGrams: 189,
      proteinFloorGrams: 190,
      state: 'below_floor',
      remainingToFloorGrams: 1,
      amountAboveFloorGrams: 0,
    },
    {
      name: 'exactly met',
      actualProteinGrams: 190,
      proteinFloorGrams: 190,
      state: 'floor_met',
      remainingToFloorGrams: 0,
      amountAboveFloorGrams: 0,
    },
    {
      name: 'one gram above',
      actualProteinGrams: 191,
      proteinFloorGrams: 190,
      state: 'floor_met',
      remainingToFloorGrams: 0,
      amountAboveFloorGrams: 1,
    },
    {
      name: 'materially above',
      actualProteinGrams: 225,
      proteinFloorGrams: 190,
      state: 'floor_met',
      remainingToFloorGrams: 0,
      amountAboveFloorGrams: 35,
    },
    {
      name: 'decimal below boundary',
      actualProteinGrams: 189.999,
      proteinFloorGrams: 190,
      state: 'below_floor',
      remainingToFloorGrams: 190 - 189.999,
      amountAboveFloorGrams: 0,
    },
    {
      name: 'decimal above boundary',
      actualProteinGrams: 190.001,
      proteinFloorGrams: 190,
      state: 'floor_met',
      remainingToFloorGrams: 0,
      amountAboveFloorGrams: 190.001 - 190,
    },
  ])('returns exact floor facts for $name', (row) => {
    const expected = {
      actualProteinGrams: row.actualProteinGrams,
      proteinFloorGrams: row.proteinFloorGrams,
      state: row.state,
      remainingToFloorGrams: row.remainingToFloorGrams,
      amountAboveFloorGrams: row.amountAboveFloorGrams,
    };
    expect(
      calculateProteinFloorProgress({ ...expected, isFinal: true, canEvaluate: true }),
    ).toEqual({
      ...expected,
      isFinal: true,
    });
  });

  it.each([null, 0])('treats a %s floor as unavailable', (proteinFloorGrams) => {
    expect(
      calculateProteinFloorProgress({
        actualProteinGrams: 42,
        proteinFloorGrams,
        isFinal: false,
        canEvaluate: true,
      }),
    ).toEqual({
      actualProteinGrams: 42,
      proteinFloorGrams,
      remainingToFloorGrams: null,
      amountAboveFloorGrams: null,
      state: 'unavailable',
      isFinal: false,
    });
  });

  it('treats missing actual evidence as unavailable without inventing zero intake', () => {
    expect(
      calculateProteinFloorProgress({
        actualProteinGrams: null,
        proteinFloorGrams: 190,
        isFinal: false,
        canEvaluate: true,
      }),
    ).toEqual({
      actualProteinGrams: null,
      proteinFloorGrams: 190,
      remainingToFloorGrams: null,
      amountAboveFloorGrams: null,
      state: 'unavailable',
      isFinal: false,
    });
  });

  it.each([
    { actualProteinGrams: -1, proteinFloorGrams: 190, isFinal: false, canEvaluate: true },
    { actualProteinGrams: Number.NaN, proteinFloorGrams: 190, isFinal: false, canEvaluate: true },
    {
      actualProteinGrams: Number.NEGATIVE_INFINITY,
      proteinFloorGrams: 190,
      isFinal: false,
      canEvaluate: true,
    },
    { actualProteinGrams: 20, proteinFloorGrams: -1, isFinal: false, canEvaluate: true },
    {
      actualProteinGrams: 20,
      proteinFloorGrams: Number.POSITIVE_INFINITY,
      isFinal: false,
      canEvaluate: true,
    },
    {
      actualProteinGrams: 20,
      proteinFloorGrams: Number.NEGATIVE_INFINITY,
      isFinal: false,
      canEvaluate: true,
    },
  ])('rejects malformed input %#', (input) => {
    expect(() => calculateProteinFloorProgress(input)).toThrow(RangeError);
  });
});

describe('proteinFloorProgressSchema', () => {
  const valid = calculateProteinFloorProgress({
    actualProteinGrams: 170,
    proteinFloorGrams: 190,
    isFinal: true,
    canEvaluate: true,
  });

  it('keeps future evidence visible but unavailable for evaluation', () => {
    expect(
      calculateProteinFloorProgress({
        actualProteinGrams: 190,
        proteinFloorGrams: 180,
        isFinal: false,
        canEvaluate: false,
      }),
    ).toEqual({
      actualProteinGrams: 190,
      proteinFloorGrams: 180,
      remainingToFloorGrams: null,
      amountAboveFloorGrams: null,
      state: 'unavailable',
      isFinal: false,
    });
  });

  it('parses a strict internally consistent fact', () => {
    expect(proteinFloorProgressSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['negative remaining', { remainingToFloorGrams: -1 }],
    ['contradictory state', { state: 'floor_met' }],
    ['incorrect remaining', { remainingToFloorGrams: 19 }],
    ['simultaneous remaining and above', { amountAboveFloorGrams: 1 }],
    ['unavailable with progress', { state: 'unavailable' }],
    ['unknown field', { extra: true }],
  ])('rejects %s', (_name, change) => {
    expect(() => proteinFloorProgressSchema.parse({ ...valid, ...change })).toThrow();
  });
});
