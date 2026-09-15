import { describe, expect, it } from 'vitest';

import {
  convertCircumferenceFromMm,
  convertCircumferenceToMm,
  isCanonicalCircumferenceMm,
} from './circumference-unit.js';

describe('circumference conversion', () => {
  it('rounds once into canonical integer millimetres for cm and inches', () => {
    expect(convertCircumferenceToMm(81.3, 'cm')).toBe(813);
    expect(convertCircumferenceToMm(32, 'in')).toBe(813);
    expect(convertCircumferenceFromMm(813, 'cm')).toBe(81.3);
    expect(convertCircumferenceFromMm(813, 'in')).toBe(32);
  });

  it('accepts inclusive canonical bounds and rejects invalid precision and range', () => {
    expect(convertCircumferenceToMm(20, 'cm')).toBe(200);
    expect(convertCircumferenceToMm(300, 'cm')).toBe(3000);
    expect(isCanonicalCircumferenceMm(200)).toBe(true);
    expect(isCanonicalCircumferenceMm(3000)).toBe(true);
    expect(() => convertCircumferenceToMm(19.9, 'cm')).toThrow(/between 20 and 300 cm/);
    expect(() => convertCircumferenceToMm(300.1, 'cm')).toThrow(/between 20 and 300 cm/);
    expect(() => convertCircumferenceToMm(81.25, 'cm')).toThrow(/one decimal/);
    expect(() => convertCircumferenceToMm(Number.NaN, 'cm')).toThrow();
    expect(() => convertCircumferenceToMm(Number.POSITIVE_INFINITY, 'in')).toThrow();
  });
});
