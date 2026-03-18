import { describe, expect, it } from 'vitest';

import {
  formatSetSummary,
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
});
