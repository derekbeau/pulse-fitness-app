import { describe, expect, it } from 'vitest';

import { calculateCanonicalBodyReading } from './body-reading-quality.js';

describe('calculateCanonicalBodyReading', () => {
  it('classifies single and concordant repeated readings', () => {
    expect(calculateCanonicalBodyReading([80], 'cm')).toMatchObject({
      canonicalMm: 800,
      quality: 'single_reading',
      selectedReadingPair: null,
    });
    expect(calculateCanonicalBodyReading([80, 81], 'cm')).toMatchObject({
      canonicalMm: 805,
      quality: 'replicated',
      selectedReadingPair: [1, 2],
    });
    expect(calculateCanonicalBodyReading([30, 30.5], 'in')).toMatchObject({
      canonicalMm: 769,
      quality: 'needs_third_reading',
    });
  });

  it('uses the earliest pair when distances tie', () => {
    expect(calculateCanonicalBodyReading([80, 81, 79], 'cm')).toMatchObject({
      canonicalMm: 805,
      quality: 'replicated_with_tiebreaker',
      selectedReadingPair: [1, 2],
    });
    expect(calculateCanonicalBodyReading([80, 82, 81], 'cm')).toMatchObject({
      selectedReadingPair: [1, 3],
    });
  });

  it('preserves all readings while flagging a span over two centimetres', () => {
    expect(calculateCanonicalBodyReading([80, 82.1, 81], 'cm')).toEqual({
      readingMm: [800, 821, 810],
      canonicalMm: 805,
      quality: 'high_variance',
      selectedReadingPair: [1, 3],
    });
  });
});
