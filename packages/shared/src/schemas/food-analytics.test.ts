import { describe, expect, it } from 'vitest';

import {
  foodAnalyticsDetailQuerySchema,
  foodAnalyticsObservedPortionSchema,
  foodAnalyticsQuerySchema,
  foodAnalyticsRangeResultSchema,
} from './food-analytics.js';

describe('food analytics schemas', () => {
  it('defaults bounded list and detail queries and rejects unknown fields', () => {
    expect(foodAnalyticsQuerySchema.parse({})).toEqual({
      range: '30d',
      sort: 'most_used',
      usage: 'any',
      verification: 'any',
      review: 'any',
      grams: 'any',
      page: 1,
      limit: 25,
    });
    expect(foodAnalyticsDetailQuerySchema.parse({})).toEqual({
      range: '30d',
      occurrencePage: 1,
      occurrenceLimit: 25,
    });
    expect(() => foodAnalyticsQuerySchema.parse({ extra: true })).toThrow();
    expect(() => foodAnalyticsQuerySchema.parse({ limit: 101 })).toThrow();
    expect(() => foodAnalyticsDetailQuerySchema.parse({ occurrenceLimit: 101 })).toThrow();
  });

  it('accepts every Intl-supported time zone and rejects invalid identifiers', () => {
    expect(foodAnalyticsQuerySchema.parse({ timeZone: 'UTC' }).timeZone).toBe('UTC');
    expect(foodAnalyticsQuerySchema.parse({ timeZone: 'America/Detroit' }).timeZone).toBe(
      'America/Detroit',
    );
    expect(() => foodAnalyticsQuerySchema.parse({ timeZone: 'Detroit' })).toThrow();
  });

  it('rejects contradictory portion and range precision', () => {
    expect(() =>
      foodAnalyticsObservedPortionSchema.parse({
        state: 'none',
        unit: 'g',
        medianQuantity: 100,
        recentQuantity: 100,
        recentLocalDate: '2026-08-25',
        evidenceCount: 1,
      }),
    ).toThrow();
    expect(() =>
      foodAnalyticsObservedPortionSchema.parse({
        state: 'compatible',
        unit: null,
        medianQuantity: null,
        recentQuantity: null,
        recentLocalDate: null,
        evidenceCount: 2,
      }),
    ).toThrow();
    expect(() =>
      foodAnalyticsRangeResultSchema.parse({
        kind: '30d',
        startDate: '2026-07-27',
        endDate: '2026-08-25',
        calendarDays: null,
        timeZone: 'UTC',
        timeZoneSource: 'request',
        isHistorical: false,
      }),
    ).toThrow();
  });

  it('normalizes repeated query tags without accepting empty tags', () => {
    expect(foodAnalyticsQuerySchema.parse({ tags: ' Protein,protein, Breakfast ' }).tags).toEqual([
      'protein',
      'breakfast',
    ]);
    expect(foodAnalyticsQuerySchema.parse({ tags: '  ' }).tags).toBeUndefined();
  });
});
