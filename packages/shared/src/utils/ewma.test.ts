import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  calculateCanonicalTrendWeightCurrent,
  calculateCanonicalTrendWeightDeltas,
  calculateCanonicalTrendWeightSeries,
  computeEWMA,
  computeWeightInsights,
  type CanonicalTrendWeightInput,
  type WeightEntry,
} from './ewma';

const canonicalEntry = (
  date: string,
  weightKg: number,
  overrides: Partial<CanonicalTrendWeightInput> = {},
): CanonicalTrendWeightInput => ({
  id: `weight-${date}`,
  date,
  weightKg,
  createdAt: Date.parse(`${date}T12:00:00.000Z`),
  updatedAt: Date.parse(`${date}T12:00:00.000Z`),
  ...overrides,
});

describe('computeEWMA', () => {
  it('returns trend equal to scale for a single entry', () => {
    const entries: WeightEntry[] = [{ date: '2026-01-01', weight: 180 }];

    const result = computeEWMA(entries);

    expect(result).toEqual([{ date: '2026-01-01', scale: 180, trend: 180 }]);
  });

  it('smooths multiple entries', () => {
    const entries: WeightEntry[] = [
      { date: '2026-01-01', weight: 180 },
      { date: '2026-01-02', weight: 185 },
      { date: '2026-01-03', weight: 175 },
    ];

    const result = computeEWMA(entries, { alpha: 0.2 });

    expect(result[0].trend).toBe(180);
    expect(result[1].trend).toBeCloseTo(181);
    expect(result[2].trend).toBeCloseTo(179.8);
    expect(result[1].trend).not.toBe(result[1].scale);
    expect(result[2].trend).not.toBe(result[2].scale);
  });

  it('matches raw values when alpha is 1.0', () => {
    const entries: WeightEntry[] = [
      { date: '2026-01-01', weight: 180 },
      { date: '2026-01-02', weight: 185 },
      { date: '2026-01-03', weight: 175 },
    ];

    const result = computeEWMA(entries, { alpha: 1.0 });

    expect(result.map((entry) => entry.trend)).toEqual([180, 185, 175]);
  });

  it('keeps trend at the first value when alpha is 0.0', () => {
    const entries: WeightEntry[] = [
      { date: '2026-01-01', weight: 180 },
      { date: '2026-01-02', weight: 185 },
      { date: '2026-01-03', weight: 175 },
    ];

    const result = computeEWMA(entries, { alpha: 0.0 });

    expect(result.map((entry) => entry.trend)).toEqual([180, 180, 180]);
  });

  it('carries forward trend across date gaps without creating missing entries', () => {
    const entries: WeightEntry[] = [
      { date: '2026-01-01', weight: 180 },
      { date: '2026-01-05', weight: 184 },
    ];

    const result = computeEWMA(entries, { alpha: 0.25 });

    expect(result).toHaveLength(2);
    expect(result[0].trend).toBe(180);
    expect(result[1].trend).toBeCloseTo(181);
  });
});

describe('computeWeightInsights', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-04T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes average, change, and direction for a lookback period', () => {
    const ewmaResults = [
      { date: '2026-01-01', scale: 180, trend: 180 },
      { date: '2026-01-02', scale: 181, trend: 180.4 },
      { date: '2026-01-03', scale: 182, trend: 180.9 },
      { date: '2026-01-04', scale: 183, trend: 181.5 },
    ];

    const insights = computeWeightInsights(ewmaResults, 3);

    expect(insights.avgWeight).toBeCloseTo((180.4 + 180.9 + 181.5) / 3);
    expect(insights.periodChange).toBeCloseTo(181.5 - 180.4);
    expect(insights.direction).toBe('up');
  });

  it('returns stable when change magnitude is below 0.1 pounds', () => {
    const ewmaResults = [
      { date: '2026-01-01', scale: 180, trend: 180 },
      { date: '2026-01-02', scale: 180.2, trend: 180.04 },
      { date: '2026-01-03', scale: 180.1, trend: 180.07 },
    ];

    const insights = computeWeightInsights(ewmaResults, 3);

    expect(insights.periodChange).toBeCloseTo(0.03);
    expect(insights.direction).toBe('stable');
  });

  it('returns zeroed insights when no entries fall within the requested period', () => {
    const ewmaResults = [
      { date: '2026-01-01', scale: 180, trend: 180 },
      { date: '2026-01-02', scale: 181, trend: 180.4 },
      { date: '2026-01-03', scale: 182, trend: 180.9 },
    ];

    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
    const insights = computeWeightInsights(ewmaResults, 7);

    expect(insights).toEqual({
      avgWeight: 0,
      periodChange: 0,
      direction: 'stable',
    });
  });
});

describe('canonical Trend Weight v1', () => {
  it('uses only the inclusive trailing 30 calendar days and no interpolation', () => {
    const entries = [
      canonicalEntry('2026-07-19', 120),
      canonicalEntry('2026-07-20', 100),
      canonicalEntry('2026-08-10', 101),
      canonicalEntry('2026-08-18', 110),
    ];

    const current = calculateCanonicalTrendWeightCurrent(entries, '2026-08-18');

    expect(current.trendWeightKg).toBeCloseTo(101.09);
    expect(current.evidence).toEqual({
      observationCount: 3,
      spanDays: 29,
      latestAgeDays: 0,
    });
  });

  it('is range invariant on overlapping dates', () => {
    const entries = Array.from({ length: 100 }, (_, index) =>
      canonicalEntry(
        new Date(Date.UTC(2026, 4, 11 + index)).toISOString().slice(0, 10),
        80 + Math.sin(index / 3),
      ),
    );

    const oneMonth = calculateCanonicalTrendWeightSeries(entries, '2026-07-20', '2026-08-18');
    const all = calculateCanonicalTrendWeightSeries(entries, '2026-05-11', '2026-08-18');
    const allByDate = new Map(all.map((point) => [point.date, point]));

    for (const point of oneMonth) {
      expect(point.trendWeightKg).toBe(allByDate.get(point.date)?.trendWeightKg);
      expect(point.observationCount).toBe(allByDate.get(point.date)?.observationCount);
    }
  });

  it('keeps a transient scale spike visible while smoothing the trend', () => {
    const entries = Array.from({ length: 20 }, (_, index) =>
      canonicalEntry(
        new Date(Date.UTC(2026, 7, index + 1)).toISOString().slice(0, 10),
        index === 19 ? 90 : 80,
      ),
    );

    const current = calculateCanonicalTrendWeightCurrent(entries, '2026-08-20');

    expect(current.latestScale?.weightKg).toBe(90);
    expect(current.trendWeightKg).toBeCloseTo(81);
    expect(current.scaleTrendDifferenceKg).toBeCloseTo(9);
    expect(current.state).toBe('sufficient');
  });

  it('returns honest scale-only and stale states without fabricated precision', () => {
    expect(
      calculateCanonicalTrendWeightCurrent([canonicalEntry('2026-08-18', 82)], '2026-08-18'),
    ).toMatchObject({ trendWeightKg: null, rateKgPerWeek: null, state: 'scale_only' });
    expect(
      calculateCanonicalTrendWeightCurrent(
        [canonicalEntry('2026-07-01', 82), canonicalEntry('2026-07-02', 81)],
        '2026-08-18',
      ),
    ).toMatchObject({ trendWeightKg: null, state: 'stale' });

    const staleEntries = [
      canonicalEntry('2026-07-20', 82),
      canonicalEntry('2026-07-21', 81),
      canonicalEntry('2026-07-22', 80),
    ];
    expect(calculateCanonicalTrendWeightCurrent(staleEntries, '2026-08-01')).toMatchObject({
      trendWeightKg: expect.any(Number),
      rateKgPerWeek: null,
      state: 'stale',
    });
    expect(calculateCanonicalTrendWeightDeltas(staleEntries, '2026-08-01')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'unavailable',
          valueKg: null,
          reasonCode: 'STALE_CURRENT_TREND',
        }),
      ]),
    );
  });

  it('reports dated supported and unavailable deltas', () => {
    const entries = Array.from({ length: 60 }, (_, index) =>
      canonicalEntry(
        new Date(Date.UTC(2026, 5, 20 + index)).toISOString().slice(0, 10),
        100 - index * 0.1,
      ),
    );
    const deltas = calculateCanonicalTrendWeightDeltas(entries, '2026-08-18');

    expect(deltas.map((delta) => delta.status)).toEqual([
      'supported',
      'supported',
      'supported',
      'unavailable',
    ]);
    expect(deltas[0]).toMatchObject({
      requestedDays: 7,
      fromAsOfDate: '2026-08-11',
      fromTrendDate: '2026-08-11',
      toTrendDate: '2026-08-18',
    });
    expect(deltas[3]?.reasonCode).toBe('NO_PRIOR_TREND');
  });

  it('rejects duplicate dates so persistence remains the deterministic authority', () => {
    expect(() =>
      calculateCanonicalTrendWeightCurrent(
        [canonicalEntry('2026-08-18', 80), canonicalEntry('2026-08-18', 81, { id: 'other' })],
        '2026-08-18',
      ),
    ).toThrow(/duplicate date/);
  });
});
