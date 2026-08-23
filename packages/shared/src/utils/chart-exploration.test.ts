import { describe, expect, it } from 'vitest';

import {
  addChartCalendarDays,
  aggregateChartNumericPoints,
  chartCoordinateDateKey,
  chartDateCoordinate,
  chartDateKeyInTimeZone,
  resolveChartDateRange,
} from './chart-exploration.js';

describe('chart exploration dates and ranges', () => {
  it.each([
    '2026-01-01',
    '2026-03-07',
    '2026-03-08',
    '2026-03-09',
    '2026-10-31',
    '2026-11-01',
    '2026-11-02',
    '2026-12-31',
  ])('round-trips the literal calendar key %s through a UTC chart coordinate', (date) => {
    expect(chartCoordinateDateKey(chartDateCoordinate(date))).toBe(date);
  });

  it('rejects malformed and impossible dates', () => {
    expect(() => chartDateCoordinate('2026-02-30')).toThrow(/invalid chart calendar date/i);
    expect(() => chartDateCoordinate('08/22/2026')).toThrow(/invalid chart date key/i);
  });

  it('derives reference dates from the requested IANA zone across the date line', () => {
    const instant = new Date('2026-08-22T08:30:00Z');
    expect(chartDateKeyInTimeZone(instant, 'America/Detroit')).toBe('2026-08-22');
    expect(chartDateKeyInTimeZone(instant, 'Pacific/Kiritimati')).toBe('2026-08-22');
    expect(chartDateKeyInTimeZone(instant, 'Etc/GMT+12')).toBe('2026-08-21');
  });

  it('resolves every named range as an inclusive window ending on the reference date', () => {
    expect(resolveChartDateRange({ preset: '1w', referenceDate: '2026-08-22' })).toEqual({
      preset: '1w',
      startDate: '2026-08-16',
      endDate: '2026-08-22',
      calendarDays: 7,
    });
    expect(resolveChartDateRange({ preset: '1m', referenceDate: '2026-08-22' }).startDate).toBe(
      '2026-07-24',
    );
    expect(resolveChartDateRange({ preset: '3m', referenceDate: '2026-08-22' }).calendarDays).toBe(
      90,
    );
    expect(resolveChartDateRange({ preset: '6m', referenceDate: '2026-08-22' }).calendarDays).toBe(
      180,
    );
    expect(resolveChartDateRange({ preset: '1y', referenceDate: '2026-08-22' }).calendarDays).toBe(
      365,
    );
  });

  it('requires explicit boundaries for All and Custom', () => {
    expect(
      resolveChartDateRange({
        preset: 'all',
        referenceDate: '2026-08-22',
        earliestDate: '2025-12-03',
      }),
    ).toEqual({
      preset: 'all',
      startDate: '2025-12-03',
      endDate: '2026-08-22',
      calendarDays: 263,
    });
    expect(
      resolveChartDateRange({
        preset: 'custom',
        referenceDate: '2026-08-22',
        customRange: { startDate: '2026-08-01', endDate: '2026-08-22' },
      }),
    ).toMatchObject({ startDate: '2026-08-01', endDate: '2026-08-22', calendarDays: 22 });
    expect(() => resolveChartDateRange({ preset: 'all', referenceDate: '2026-08-22' })).toThrow(
      /earliest date/i,
    );
  });

  it('adds date-only days through Detroit DST without changing the literal calendar sequence', () => {
    expect(addChartCalendarDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addChartCalendarDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addChartCalendarDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addChartCalendarDays('2026-11-01', 1)).toBe('2026-11-02');
  });
});

describe('explicit chart aggregation', () => {
  const points = [
    { date: '2026-08-03', value: 10 },
    { date: '2026-08-04', value: null },
    { date: '2026-08-09', value: 20 },
    { date: '2026-08-10', value: 5 },
  ];

  it.each([
    ['sum', 30],
    ['mean', 15],
    ['last', 20],
    ['count', 2],
  ] as const)(
    'applies the requested weekly %s semantics without treating null as zero',
    (strategy, value) => {
      const [first] = aggregateChartNumericPoints({ points, interval: 'weekly', strategy });
      expect(first).toMatchObject({
        periodStart: '2026-08-03',
        periodEnd: '2026-08-09',
        totalRecordCount: 3,
        validObservationCount: 2,
        value,
      });
    },
  );

  it('returns an explicit min/max band only when requested', () => {
    expect(
      aggregateChartNumericPoints({ points, interval: 'monthly', strategy: 'min_max' }),
    ).toEqual([
      {
        periodStart: '2026-08-03',
        periodEnd: '2026-08-10',
        totalRecordCount: 4,
        validObservationCount: 3,
        value: null,
        minimum: 5,
        maximum: 20,
      },
    ]);
  });

  it('keeps an empty bucket unavailable for numeric strategies', () => {
    expect(
      aggregateChartNumericPoints({
        points: [{ date: '2026-08-22', value: null }],
        interval: 'daily',
        strategy: 'mean',
      })[0],
    ).toMatchObject({ validObservationCount: 0, value: null, minimum: null, maximum: null });
  });
});
