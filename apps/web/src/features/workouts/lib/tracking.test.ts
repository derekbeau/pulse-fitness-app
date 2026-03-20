import { describe, expect, it } from 'vitest';

import {
  formatCompactSets,
  formatMetricNumber,
  formatSetSummary,
  formatTrackingMetricBreakdown,
  getSetSummaryMetricValue,
  getTrackingSummaryMetricLabel,
} from './tracking';

describe('tracking format helpers', () => {
  it('formats weighted rep sets with units and set number', () => {
    expect(
      formatSetSummary(
        {
          reps: 8,
          setNumber: 2,
          weight: 135,
        },
        'weight_reps',
        { includeSetNumber: true, weightUnit: 'lbs' },
      ),
    ).toBe('Set 2: 135 lbs × 8 reps');
  });

  it('formats seconds-only sets with sec suffix', () => {
    expect(
      formatSetSummary(
        {
          reps: 45,
        },
        'seconds_only',
      ),
    ).toBe('45 sec');
  });

  it('formats distance sets with configured distance unit', () => {
    expect(
      formatSetSummary(
        {
          distance: 2.5,
        },
        'distance',
        { weightUnit: 'kg' },
      ),
    ).toBe('2.5 km');
  });

  it('formats cardio sets with time and distance', () => {
    expect(
      formatSetSummary(
        {
          reps: 300,
          distance: 1.2,
        },
        'cardio',
      ),
    ).toBe('300 sec / 1.2 mi');
  });

  it('does not infer seconds from reps for reps-seconds history when fallback is disabled', () => {
    expect(
      formatSetSummary(
        {
          reps: 10,
          seconds: null,
        },
        'reps_seconds',
        { useLegacySecondsFallback: false },
      ),
    ).toBe('10 reps');
  });

  it('uses tracking-aware aggregate labels and values', () => {
    expect(getTrackingSummaryMetricLabel('weight_seconds')).toBe('seconds');
    expect(getTrackingSummaryMetricLabel('distance')).toBe('distance');
    expect(getSetSummaryMetricValue('weight_reps', { reps: 5, weight: 100 })).toBe(500);
    expect(getSetSummaryMetricValue('seconds_only', { reps: 40 })).toBe(40);
  });

  it('formats mixed metric breakdown values consistently', () => {
    expect(
      formatTrackingMetricBreakdown(
        {
          distance: 0.5,
          reps: 12,
          seconds: 120,
          volume: 135,
        },
        'lbs',
      ),
    ).toBe('135 lbs • 12 reps • 120 sec • 0.5 mi');
  });

  it('formats metric numbers without trailing zeros', () => {
    expect(formatMetricNumber(135)).toBe('135');
    expect(formatMetricNumber(135.5)).toBe('135.5');
    expect(formatMetricNumber(135.678)).toBe('135.68');
  });

  it('formats compact weighted sets as weight x reps', () => {
    expect(
      formatCompactSets(
        [
          { reps: 12, weight: 60 },
          { reps: 8, weight: 60 },
        ],
        'weight_reps',
      ),
    ).toBe('60x12, 60x8');
  });

  it('formats compact reps-only sets as rep counts', () => {
    expect(formatCompactSets([{ reps: 10 }, { reps: 8 }, { reps: 8 }], 'reps_only')).toBe(
      '10, 8, 8',
    );
  });

  it('formats compact time sets with seconds suffix', () => {
    expect(formatCompactSets([{ reps: 60 }, { reps: 45 }], 'seconds_only')).toBe('60s, 45s');
  });

  it('formats compact distance sets with configured distance units', () => {
    expect(
      formatCompactSets([{ distance: 4 }, { distance: 2.5 }], 'distance', {
        weightUnit: 'kg',
      }),
    ).toBe('4km, 2.5km');
  });
});
