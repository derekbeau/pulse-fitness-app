import { describe, expect, it } from 'vitest';

import { nutritionKeys } from './keys';

describe('nutritionKeys.weekSummary', () => {
  it('normalizes date keys to the Monday for the containing week', () => {
    expect(nutritionKeys.weekSummary('2026-03-03')).toEqual([
      'nutrition',
      'week-summary',
      '2026-03-02',
    ]);
    expect(nutritionKeys.weekSummary('2026-03-08')).toEqual([
      'nutrition',
      'week-summary',
      '2026-03-02',
    ]);
  });

  it('accepts ISO timestamps and normalizes to the same week boundary', () => {
    expect(nutritionKeys.weekSummary('2026-03-05T12:00:00.000Z')).toEqual([
      'nutrition',
      'week-summary',
      '2026-03-02',
    ]);
  });
});
