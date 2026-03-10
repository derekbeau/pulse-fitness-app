import { describe, expect, it } from 'vitest';

import { formatWeight, getWeightLabel } from './weight-unit';

describe('weight-unit utils', () => {
  it('formats pounds with unit label', () => {
    expect(formatWeight(180, 'lbs')).toBe('180 lbs');
  });

  it('formats kilograms with unit label', () => {
    expect(formatWeight(81.6, 'kg')).toBe('81.6 kg');
  });

  it('returns the correct unit label', () => {
    expect(getWeightLabel('lbs')).toBe('lbs');
    expect(getWeightLabel('kg')).toBe('kg');
  });
});
