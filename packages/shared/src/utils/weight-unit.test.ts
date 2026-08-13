import { describe, expect, it } from 'vitest';

import {
  convertWeightFromKg,
  convertWeightToKg,
  formatWeight,
  isCanonicalBodyWeight,
} from './weight-unit';

describe('weight-unit utils', () => {
  it('formats pounds with unit label', () => {
    expect(formatWeight(180, 'lbs')).toBe('180 lbs');
  });

  it('formats kilograms with unit label', () => {
    expect(formatWeight(81.6, 'kg')).toBe('81.6 kg');
  });

  it('uses the exact canonical pounds conversion in both directions', () => {
    expect(convertWeightToKg(180, 'lbs')).toBe(81.6466266);
    expect(convertWeightFromKg(81.6466266, 'lbs')).toBeCloseTo(180, 12);
    expect(convertWeightToKg(80, 'kg')).toBe(80);
  });

  it('enforces canonical kg bounds', () => {
    expect(isCanonicalBodyWeight(25)).toBe(true);
    expect(isCanonicalBodyWeight(350)).toBe(true);
    expect(isCanonicalBodyWeight(24.99)).toBe(false);
    expect(isCanonicalBodyWeight(350.01)).toBe(false);
  });
});
