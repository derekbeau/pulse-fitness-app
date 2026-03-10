import { describe, expect, it } from 'vitest';

import { formatWeight, getWeightLabel } from './weight-unit.js';

describe('weight unit utils', () => {
  it('formats pounds', () => {
    expect(formatWeight(180, 'lbs')).toBe('180 lbs');
  });

  it('formats kilograms', () => {
    expect(formatWeight(81.6, 'kg')).toBe('81.6 kg');
  });

  it('returns the unit label', () => {
    expect(getWeightLabel('lbs')).toBe('lbs');
    expect(getWeightLabel('kg')).toBe('kg');
  });
});
