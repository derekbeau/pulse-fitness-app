import { describe, expect, it } from 'vitest';

import { computeEWMA, computeWeightInsights, type WeightEntry } from './ewma';

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

    expect(insights.periodChange).toBeCloseTo(0.07);
    expect(insights.direction).toBe('stable');
  });
});
