import { describe, expect, it } from 'vitest';

import { formatDisplayServing } from '@/features/nutrition/lib/nutrition-utils';

describe('formatDisplayServing', () => {
  it('prefers display quantity and unit when both are present', () => {
    expect(
      formatDisplayServing({
        amount: 0.69,
        unit: 'serving',
        displayQuantity: 5.5,
        displayUnit: 'oz',
      }),
    ).toBe('5.5 oz');
  });

  it('falls back to amount and unit when display quantity is missing', () => {
    expect(
      formatDisplayServing({
        amount: 0.69,
        unit: 'serving',
        displayQuantity: null,
        displayUnit: 'oz',
      }),
    ).toBe('0.69 serving');
  });

  it('falls back to amount and unit when display unit is missing', () => {
    expect(
      formatDisplayServing({
        amount: 2,
        unit: 'servings',
        displayQuantity: 3,
        displayUnit: null,
      }),
    ).toBe('2 servings');
  });

  it('formats numbers without trailing zeros', () => {
    expect(
      formatDisplayServing({
        amount: 1,
        unit: 'serving',
        displayQuantity: 2,
        displayUnit: 'scoops',
      }),
    ).toBe('2 scoops');
  });
});
