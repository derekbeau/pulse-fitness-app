import { describe, expect, it } from 'vitest';

import {
  formatCalories,
  formatGrams,
  formatPercent,
  formatServing,
  formatTrendChange,
  formatWeight,
} from '@/lib/format-utils';

describe('format-utils', () => {
  it('formats calories as rounded whole numbers', () => {
    expect(formatCalories(899.88)).toBe('900');
  });

  it('formats calories with unit suffix', () => {
    expect(formatCalories(500, 'cal')).toBe('500 cal');
    expect(formatCalories(500, 'kcal')).toBe('500 kcal');
  });

  it('formats grams as rounded whole numbers with unit', () => {
    expect(formatGrams(83.958)).toBe('84g');
    expect(formatGrams(31.7)).toBe('32g');
  });

  it('formats weight with one decimal place', () => {
    expect(formatWeight(182.45)).toBe('182.5');
  });

  it('formats percentages as rounded whole numbers', () => {
    expect(formatPercent(73.6)).toBe('74%');
  });

  it('formats trend changes with one decimal place', () => {
    expect(formatTrendChange(2.34)).toBe('2.3');
  });

  it('formats serving values with up to two decimals', () => {
    expect(formatServing(1.5)).toBe('1.5');
    expect(formatServing(2.0)).toBe('2');
  });
});
