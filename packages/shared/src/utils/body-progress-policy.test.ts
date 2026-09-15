import { describe, expect, it } from 'vitest';

import {
  BODY_PROGRESS_ANALYTICS_CONSTANTS,
  bodyProgressAnalyticsSchema,
  bodyProgressSignalSchema,
  type BodyProgressPoint,
  type BodyProgressSegment,
  type BodyProgressStrengthEvidence,
} from '../index.js';
import { analyzeBodyProgressSegments, buildBodyProgressSignal } from './body-progress-policy.js';

const point = (
  date: string,
  canonicalMm: number,
  overrides: Partial<BodyProgressPoint> = {},
): BodyProgressPoint => ({
  checkInId: `check-in-${date}`,
  measurementId: `waist-${date}`,
  date,
  checkInVersion: 1,
  site: 'waist_iliac_crest_nhanes',
  laterality: 'none',
  canonicalMm,
  readingsMm: [canonicalMm - 2, canonicalMm + 2, null],
  unitAtEntry: 'cm',
  quality: 'replicated',
  protocolId: 'waist_iliac_crest_nhanes',
  protocolVersion: 'body-circumference-v1',
  source: 'user',
  sourceId: null,
  corrected: false,
  correctedAt: null,
  correctionReason: null,
  createdAt: Date.parse(`${date}T12:00:00Z`),
  updatedAt: Date.parse(`${date}T12:00:00Z`),
  ...overrides,
});

const strength = (
  state: BodyProgressStrengthEvidence['state'] = 'unavailable',
): BodyProgressStrengthEvidence => ({
  state,
  confidence: state === 'unavailable' ? 'unavailable' : 'supported',
  sourceContract: 'workout-progression-v1',
  sourceDates: state === 'unavailable' ? [] : ['2026-08-20'],
  recommendationIds: state === 'unavailable' ? [] : ['recommendation-1'],
  sourceFingerprints: state === 'unavailable' ? [] : ['a'.repeat(64)],
  reason:
    state === 'unavailable'
      ? 'No current server-owned progression decisions were available.'
      : `Progression decisions were ${state}.`,
});

const supportedSegment = (
  site: BodyProgressSegment['site'],
  direction: BodyProgressSegment['analysis']['direction'],
): BodyProgressSegment => {
  const laterality = ['upper_arm_midpoint_flexed', 'thigh_midpoint'].includes(site)
    ? 'right'
    : 'none';
  const points = [
    point('2026-07-01', 800, { site, laterality, protocolId: site }),
    point('2026-07-15', 800, { site, laterality, protocolId: site }),
    point('2026-08-01', 800, { site, laterality, protocolId: site }),
  ];
  return {
    id: `${site}:${laterality}:body-circumference-v1`,
    site,
    laterality,
    protocolVersion: 'body-circumference-v1',
    noiseFloorMm: BODY_PROGRESS_ANALYTICS_CONSTANTS.noiseFloorMm[site],
    points,
    rawDelta: {
      fromCheckInId: 'check-in-2026-07-01',
      fromDate: '2026-07-01',
      fromCanonicalMm: 800,
      toCheckInId: 'check-in-2026-08-01',
      toDate: '2026-08-01',
      toCanonicalMm: 800,
      deltaMm: 0,
    },
    analysis: {
      state: 'supported',
      direction,
      compatiblePointCount: 3,
      independentlySpacedPointCount: 3,
      elapsedDays: 31,
      latestAgeDays: 1,
      freshnessLimitDays: 21,
      slopeMmPerDay: direction === 'up' ? 1 : direction === 'down' ? -1 : 0,
      fittedTotalChangeMm: direction === 'up' ? 31 : direction === 'down' ? -31 : 0,
      reasonCodes: [],
    },
    qualityStates: ['replicated'],
  };
};

describe('Body Progress segment policy', () => {
  it('returns exact raw deltas after two points but withholds direction before all gates', () => {
    const [segment] = analyzeBodyProgressSegments({
      points: [point('2026-07-01', 820), point('2026-07-29', 800)],
      cadenceDays: 14,
      asOfDate: '2026-07-29',
    });
    expect(segment?.rawDelta).toMatchObject({
      fromDate: '2026-07-01',
      fromCanonicalMm: 820,
      toDate: '2026-07-29',
      toCanonicalMm: 800,
      deltaMm: -20,
    });
    expect(segment?.analysis).toMatchObject({
      state: 'insufficient',
      direction: 'unavailable',
      elapsedDays: 28,
    });
  });

  it('keeps close readings in history without allowing them to manufacture readiness', () => {
    const [segment] = analyzeBodyProgressSegments({
      points: [point('2026-07-01', 820), point('2026-07-05', 810), point('2026-07-29', 800)],
      cadenceDays: 14,
      asOfDate: '2026-07-29',
    });
    expect(segment?.points).toHaveLength(3);
    expect(segment?.analysis).toMatchObject({
      independentlySpacedPointCount: 2,
      state: 'insufficient',
      direction: 'unavailable',
    });
    expect(segment?.analysis.reasonCodes).toContain('CHECK_INS_TOO_CLOSE');
  });

  it('uses dated OLS without interpolation and applies the exact site noise floor', () => {
    const [down] = analyzeBodyProgressSegments({
      points: [point('2026-07-01', 850), point('2026-07-14', 845), point('2026-07-29', 820)],
      cadenceDays: 14,
      asOfDate: '2026-07-29',
    });
    expect(down?.analysis).toMatchObject({
      state: 'supported',
      direction: 'down',
      elapsedDays: 28,
      compatiblePointCount: 3,
    });
    expect(down?.analysis.fittedTotalChangeMm).toBeLessThan(-20);

    const [stable] = analyzeBodyProgressSegments({
      points: [point('2026-07-01', 850), point('2026-07-14', 843), point('2026-07-29', 838)],
      cadenceDays: 14,
      asOfDate: '2026-07-29',
    });
    expect(stable?.noiseFloorMm).toBe(20);
    expect(stable?.analysis.direction).toBe('stable_within_measurement_noise');
  });

  it('starts a new segment for an exact protocol-version change', () => {
    const segments = analyzeBodyProgressSegments({
      points: [
        point('2026-07-01', 850),
        point('2026-07-15', 845),
        point('2026-08-01', 840, { protocolVersion: 'body-circumference-v2' }),
      ],
      cadenceDays: 14,
      asOfDate: '2026-08-01',
    });
    expect(segments).toHaveLength(2);
    expect(segments.map((segment) => segment.protocolVersion)).toEqual([
      'body-circumference-v1',
      'body-circumference-v2',
    ]);
    expect(segments.every((segment) => segment.analysis.direction === 'unavailable')).toBe(true);
  });

  it('preserves high variance and blocks direction under the frozen policy', () => {
    const [segment] = analyzeBodyProgressSegments({
      points: [
        point('2026-07-01', 850),
        point('2026-07-15', 840, { quality: 'high_variance', readingsMm: [820, 850, 870] }),
        point('2026-08-01', 820),
      ],
      cadenceDays: 14,
      asOfDate: '2026-08-01',
    });
    expect(segment?.points[1]?.quality).toBe('high_variance');
    expect(segment?.analysis).toMatchObject({ state: 'high_variance', direction: 'unavailable' });
  });

  it.each([
    'single_reading',
    'needs_third_reading',
    'replicated',
    'replicated_with_tiebreaker',
    'high_variance',
  ] as const)('preserves the source quality state %s without reclassification', (quality) => {
    const [segment] = analyzeBodyProgressSegments({
      points: [point('2026-07-01', 850, { quality })],
      cadenceDays: 14,
      asOfDate: '2026-07-01',
    });
    expect(segment?.points[0]?.quality).toBe(quality);
    expect(segment?.qualityStates).toEqual([quality]);
  });

  it('segments identical sites by laterality instead of mixing their values', () => {
    const segments = analyzeBodyProgressSegments({
      points: [
        point('2026-07-01', 350, {
          site: 'upper_arm_midpoint_flexed',
          laterality: 'left',
          protocolId: 'upper_arm_midpoint_flexed',
        }),
        point('2026-07-01', 360, {
          site: 'upper_arm_midpoint_flexed',
          laterality: 'right',
          protocolId: 'upper_arm_midpoint_flexed',
        }),
      ],
      cadenceDays: 14,
      asOfDate: '2026-07-01',
    });
    expect(segments.map((segment) => segment.laterality)).toEqual(['left', 'right']);
    expect(segments.every((segment) => segment.points.length === 1)).toBe(true);
  });

  it('evaluates cadence freshness server-side and never invents a missing cadence', () => {
    const points = [point('2026-06-01', 850), point('2026-06-15', 840), point('2026-07-01', 820)];
    expect(
      analyzeBodyProgressSegments({ points, cadenceDays: 14, asOfDate: '2026-08-01' })[0]?.analysis
        .state,
    ).toBe('stale');
    expect(
      analyzeBodyProgressSegments({ points, cadenceDays: null, asOfDate: '2026-07-01' })[0]
        ?.analysis.state,
    ).toBe('freshness_unresolved');
  });
});

describe('Body Progress signal policy', () => {
  const waistStable = supportedSegment(
    'waist_iliac_crest_nhanes',
    'stable_within_measurement_noise',
  );
  const waistUp = supportedSegment('waist_iliac_crest_nhanes', 'up');
  const waistDown = supportedSegment('waist_iliac_crest_nhanes', 'down');
  const chestUp = supportedSegment('chest_nipple_line_relaxed', 'up');
  const chestStable = supportedSegment(
    'chest_nipple_line_relaxed',
    'stable_within_measurement_noise',
  );
  const base = {
    asOfDate: '2026-08-02',
    cadenceDays: 14,
    goal: { type: 'gain' as const, maintenanceBandState: 'not_applicable' as const },
    weight: { state: 'sufficient' as const, direction: 'up' as const },
    segments: [waistStable, chestUp],
    strength: strength('improving'),
  };

  it.each([
    ['favorable_gain_signal', base],
    ['possible_fat_gain_signal', { ...base, segments: [waistUp, chestUp] }],
    [
      'possible_recomp_signal',
      {
        ...base,
        goal: { type: 'unset' as const, maintenanceBandState: null },
        weight: { state: 'sufficient' as const, direction: 'stable' as const },
      },
    ],
    [
      'favorable_loss_signal',
      {
        ...base,
        goal: { type: 'lose' as const, maintenanceBandState: 'not_applicable' as const },
        weight: { state: 'sufficient' as const, direction: 'down' as const },
        segments: [waistDown],
        strength: strength('unavailable'),
      },
    ],
    [
      'maintenance_signal',
      {
        ...base,
        goal: {
          type: 'maintain' as const,
          maintenanceBandState: 'inside_maintenance_band' as const,
        },
        weight: { state: 'sufficient' as const, direction: 'stable' as const },
        segments: [waistStable, chestStable],
        strength: strength('stable'),
      },
    ],
    [
      'mixed_signal',
      { ...base, weight: { state: 'sufficient' as const, direction: 'down' as const } },
    ],
    ['stale', { ...base, weight: { state: 'stale' as const, direction: 'unavailable' as const } }],
    [
      'insufficient_data',
      { ...base, weight: { state: 'developing' as const, direction: 'up' as const } },
    ],
  ] as const)('returns the complete deterministic enum state %s', (expected, input) => {
    expect(buildBodyProgressSignal(input).state).toBe(expected);
  });

  it('preserves structural unavailable inputs and rejects false tissue certainty', () => {
    const signal = buildBodyProgressSignal({
      ...base,
      segments: [waistStable],
      strength: strength('unavailable'),
    });
    expect(signal.unavailableInputs).toEqual(
      expect.arrayContaining(['muscular_circumference', 'strength']),
    );
    expect(() =>
      bodyProgressSignalSchema.parse({
        ...signal,
        headline: 'You gained 4 lb of muscle.',
      }),
    ).toThrow(/cannot claim measured tissue change/i);
  });

  it('classifies waist-up gain evidence exclusively as contradictory', () => {
    const signal = buildBodyProgressSignal({
      ...base,
      segments: [waistUp, chestUp],
    });
    expect(signal.state).toBe('possible_fat_gain_signal');
    expect(signal.contradictoryFacts.map((item) => item.code)).toContain('WAIST_UP');
    expect(signal.supportingFacts.map((item) => item.code)).not.toContain('WAIST_UP');
  });

  it('keeps the response schema strict and constants versioned', () => {
    expect(() => bodyProgressAnalyticsSchema.parse({ unexpected: 'expanded response' })).toThrow();
    expect(BODY_PROGRESS_ANALYTICS_CONSTANTS.noiseFloorMm).toEqual({
      waist_iliac_crest_nhanes: 20,
      chest_nipple_line_relaxed: 10,
      hips_maximum: 10,
      upper_arm_midpoint_flexed: 10,
      thigh_midpoint: 10,
    });
  });
});
