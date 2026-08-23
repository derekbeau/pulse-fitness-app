import { describe, expect, it } from 'vitest';

import {
  dataQualityCalendarQuerySchema,
  dataQualityCalendarSchema,
  type DataQualityCalendar,
} from './data-quality-calendar.js';

const day = (date: string): DataQualityCalendar['days'][number] => ({
  date,
  isToday: false,
  nutrition: {
    qualityState: 'no_records',
    evidenceState: 'missing',
    logId: null,
    explicitStatus: null,
    totals: null,
    mealCount: null,
    itemCount: null,
    statusUpdatedAt: null,
    updatedAt: null,
    reasonCodes: [],
    actions: [],
  },
  weight: {
    evidenceState: 'missing',
    entryId: null,
    weight: null,
    unit: null,
    trendWeight: null,
    corrected: false,
    suspect: false,
    stale: false,
    createdAt: null,
    updatedAt: null,
    reasonCodes: [],
    actions: [],
  },
  workouts: [],
  algorithm: {
    state: 'no_program',
    nutritionEvidenceState: 'not_applicable',
    weightEvidenceState: 'not_applicable',
    reasonCodes: [],
    events: [],
  },
  contexts: [],
});

const response = (): DataQualityCalendar => ({
  range: { startDate: '2026-03-07', endDate: '2026-03-09' },
  timeZone: 'America/Detroit',
  days: [day('2026-03-07'), day('2026-03-08'), day('2026-03-09')],
  summary: {
    nutrition: { complete: 0, partial: 0, unknown: 0, missing: 3, pending: 0, excluded: 0 },
    weight: { logged: 0, missing: 3, pending: 0, excluded: 0, corrected: 0 },
    workout: { planned: 0, active: 0, completed: 0, cancelled: 0, corrected: 0 },
    algorithm: { learning: 0, updating: 0, holding: 0, pendingReview: 0 },
    contextDays: 0,
  },
});

describe('dataQualityCalendarQuerySchema', () => {
  it('accepts a bounded DST-spanning range and supported IANA zone', () => {
    expect(
      dataQualityCalendarQuerySchema.parse({
        start: '2026-03-07',
        end: '2026-03-09',
        timeZone: 'America/Detroit',
      }),
    ).toEqual({
      start: '2026-03-07',
      end: '2026-03-09',
      timeZone: 'America/Detroit',
    });
    expect(
      dataQualityCalendarQuerySchema.parse({
        start: '2026-08-01',
        end: '2026-08-01',
        timeZone: 'UTC',
      }).timeZone,
    ).toBe('UTC');
  });

  it('rejects reversed, oversized, invalid-zone, and unknown-field queries', () => {
    expect(() =>
      dataQualityCalendarQuerySchema.parse({ start: '2026-08-02', end: '2026-08-01' }),
    ).toThrow(/start must be on or before end/);
    expect(() =>
      dataQualityCalendarQuerySchema.parse({ start: '2026-01-01', end: '2026-02-12' }),
    ).toThrow(/limited to 42 days/);
    expect(() =>
      dataQualityCalendarQuerySchema.parse({
        start: '2026-08-01',
        end: '2026-08-02',
        timeZone: 'Detroit',
      }),
    ).toThrow(/valid IANA/);
    expect(() =>
      dataQualityCalendarQuerySchema.parse({
        start: '2026-08-01',
        end: '2026-08-02',
        extra: true,
      }),
    ).toThrow();
  });
});

describe('dataQualityCalendarSchema', () => {
  const firstDay = (value: ReturnType<typeof response>) => {
    const day = value.days[0];
    if (!day) throw new Error('Expected a calendar day fixture');
    return day;
  };

  it('parses one strict day for every literal local date', () => {
    expect(dataQualityCalendarSchema.parse(response())).toEqual(response());
  });

  it('rejects fabricated nutrition and partial weight source precision', () => {
    const withMissingCalories = response();
    firstDay(withMissingCalories).nutrition.totals = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    };
    expect(() => dataQualityCalendarSchema.parse(withMissingCalories)).toThrow(
      /missing nutrition day cannot include numeric totals/i,
    );

    const withPartialWeight = response();
    firstDay(withPartialWeight).weight.entryId = 'weight-1';
    expect(() => dataQualityCalendarSchema.parse(withPartialWeight)).toThrow(
      /Weight source fields must be all present or all absent/,
    );
  });

  it('rejects suspected partial without an explicit complete source status', () => {
    const value = response();
    const day = firstDay(value);
    day.nutrition = {
      ...day.nutrition,
      qualityState: 'suspected_partial',
      evidenceState: 'excluded',
      logId: 'nutrition-1',
      explicitStatus: 'partial',
      totals: { calories: 900, protein: 50, carbs: 90, fat: 20 },
      mealCount: 2,
      itemCount: 4,
      updatedAt: 10,
    };
    expect(() => dataQualityCalendarSchema.parse(value)).toThrow(
      /Only an explicitly complete day can be flagged as suspected partial/,
    );
  });

  it('rejects duplicate, missing, or out-of-range calendar days', () => {
    const duplicate = response();
    duplicate.days[2] = day('2026-03-08');
    expect(() => dataQualityCalendarSchema.parse(duplicate)).toThrow(/unique and inside/);

    const incomplete = response();
    incomplete.days.pop();
    expect(() => dataQualityCalendarSchema.parse(incomplete)).toThrow(/one day for every/);
  });
});
