import { describe, expect, it } from 'vitest';

import { nutritionKeys, nutritionQueryKeys } from './keys';

describe('nutritionKeys.weekSummary', () => {
  it('exposes day and daily accessors for the same cache key', () => {
    expect(nutritionKeys.day('2026-03-09')).toEqual(['nutrition', 'day', '2026-03-09']);
    expect(nutritionKeys.daily('2026-03-09')).toEqual(['nutrition', 'day', '2026-03-09']);
  });
  it('normalizes date keys to the Monday for the containing week', () => {
    expect(nutritionQueryKeys.weekSummary('2026-03-03')).toEqual([
      'nutrition',
      'week-summary',
      '2026-03-02',
    ]);
    expect(nutritionQueryKeys.weekSummary('2026-03-08')).toEqual([
      'nutrition',
      'week-summary',
      '2026-03-02',
    ]);
  });

  it('accepts ISO timestamps and normalizes to the same week boundary', () => {
    expect(nutritionQueryKeys.weekSummary('2026-03-05T12:00:00.000Z')).toEqual([
      'nutrition',
      'week-summary',
      '2026-03-02',
    ]);
  });
});
