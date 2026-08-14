import { describe, expect, it } from 'vitest';

import {
  formatAdaptiveDifference,
  formatAdaptiveWeight,
  formatAdaptiveWeightChange,
} from './format-adaptive-nutrition';

describe('adaptive nutrition formatting', () => {
  it('converts canonical kilograms only at the display boundary', () => {
    expect(formatAdaptiveWeight(81.6466266, 'lbs')).toBe('180 lbs');
    expect(formatAdaptiveWeight(81.6466266, 'kg')).toBe('81.6 kg');
    expect(formatAdaptiveWeightChange(-0.45359237, 'lbs')).toBe('−1 lbs/week');
    expect(formatAdaptiveWeightChange(-0.45359237, 'kg')).toBe('−0.5 kg/week');
  });

  it('formats signed differences without inventing a baseline', () => {
    expect(formatAdaptiveDifference(2450, 2400, 'kcal')).toBe('+50 kcal');
    expect(formatAdaptiveDifference(2350, 2400, 'kcal')).toBe('−50 kcal');
    expect(formatAdaptiveDifference(2400, null, 'kcal')).toBe('New');
  });
});
