import { describe, expect, it } from 'vitest';

import {
  formatTrendWeightAxisDate,
  formatTrendWeightDate,
  trendWeightChartTicks,
  trendWeightCoordinateDateKey,
  trendWeightDateCoordinate,
} from './trend-weight-date';

describe('Trend Weight date-only chart contract', () => {
  it.each(['America/Detroit', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Etc/GMT+12'])(
    'keeps literal date keys stable instead of interpreting them in %s',
    (timeZone) => {
      for (const dateKey of ['2026-07-23', '2026-08-21', '2026-12-31', '2027-01-01']) {
        const coordinate = trendWeightDateCoordinate(dateKey);
        expect(trendWeightCoordinateDateKey(coordinate)).toBe(dateKey);
        expect(formatTrendWeightDate(dateKey)).toBe(
          new Intl.DateTimeFormat('en-US', {
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
            year: 'numeric',
          }).format(coordinate),
        );
      }

      expect(
        new Intl.DateTimeFormat('en-US', {
          day: 'numeric',
          month: 'short',
          timeZone,
        }).format(trendWeightDateCoordinate('2026-08-21')),
      ).toBeTruthy();
      expect(formatTrendWeightAxisDate(trendWeightDateCoordinate('2026-08-21'))).toBe('Aug 21');
    },
  );

  it.each([
    ['spring forward', ['2026-03-07', '2026-03-08', '2026-03-09']],
    ['fall back', ['2026-10-31', '2026-11-01', '2026-11-02']],
  ])('keeps Detroit %s dates on distinct literal calendar days', (_label, dateKeys) => {
    expect(dateKeys.map(trendWeightDateCoordinate).map(trendWeightCoordinateDateKey)).toEqual(
      dateKeys,
    );
  });

  it('always includes the authoritative range endpoints in chart ticks', () => {
    const ticks = trendWeightChartTicks('2026-07-23', '2026-08-21');
    const firstTick = ticks[0];
    const lastTick = ticks.at(-1);
    if (firstTick === undefined || lastTick === undefined) {
      throw new Error('Expected authoritative range endpoint ticks');
    }
    expect(trendWeightCoordinateDateKey(firstTick)).toBe('2026-07-23');
    expect(trendWeightCoordinateDateKey(lastTick)).toBe('2026-08-21');
    expect(ticks).toEqual([...ticks].sort((left, right) => left - right));
  });

  it.each(['2026-02-30', '2026-13-01', 'not-a-date'])('rejects invalid date key %s', (dateKey) => {
    expect(() => trendWeightDateCoordinate(dateKey)).toThrow(RangeError);
  });
});
