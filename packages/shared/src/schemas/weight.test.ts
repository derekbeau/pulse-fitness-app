import { describe, expect, it } from 'vitest';

import {
  type BodyWeightEntry,
  type CreateWeightInput,
  type DeleteWeightResult,
  type PatchWeightInput,
  type WeightQueryParams,
  bodyWeightEntrySchema,
  createWeightInputSchema,
  deleteWeightResultSchema,
  patchWeightInputSchema,
  trendWeightAnalyticsSchema,
  trendWeightGoalSchema,
  trendWeightPointSchema,
  trendWeightQuerySchema,
  weightQueryParamsSchema,
} from './weight';

describe('createWeightInputSchema', () => {
  it('parses a valid payload and normalizes blank notes', () => {
    const payload = createWeightInputSchema.parse({
      date: '2026-03-07',
      weight: 182.4,
      unit: 'lbs',
      notes: '   ',
    });

    expect(payload).toEqual({
      date: '2026-03-07',
      weight: 182.4,
      unit: 'lbs',
      notes: undefined,
    });
  });

  it('rejects non-positive weights', () => {
    expect(() =>
      createWeightInputSchema.parse({
        date: '2026-03-07',
        weight: 0,
      }),
    ).toThrow();
  });

  it('rejects implausibly large weights', () => {
    expect(() =>
      createWeightInputSchema.parse({
        date: '2026-03-07',
        weight: 1_501,
      }),
    ).toThrow();
  });

  it('infers the CreateWeightInput type from the schema', () => {
    const payload: CreateWeightInput = {
      date: '2026-03-07',
      weight: 181.2,
      notes: 'Fasted',
    };

    expect(payload.notes).toBe('Fasted');
  });
});

describe('Trend Weight schemas', () => {
  it('defaults the analytics range and rejects unknown query fields', () => {
    expect(trendWeightQuerySchema.parse({ timeZone: 'America/Detroit' })).toEqual({
      range: '1m',
      timeZone: 'America/Detroit',
    });
    expect(() => trendWeightQuerySchema.parse({})).toThrow();
    expect(() => trendWeightQuerySchema.parse({ timeZone: 'not/a-zone' })).toThrow();
    expect(() =>
      trendWeightQuerySchema.parse({ range: '1m', timeZone: 'UTC', days: 30 }),
    ).toThrow();
  });

  it('rejects fabricated precision in a no-data response', () => {
    const base = {
      range: { preset: '1m', startDate: '2026-07-21', endDate: '2026-08-19' },
      timeZone: 'America/Detroit',
      isHistorical: true,
      unit: 'lbs',
      algorithm: {
        version: 'trend-weight-v1',
        windowDays: 30,
        alpha: 0.1,
        interpolation: 'none',
        minimumObservations: 2,
      },
      current: {
        latestScale: null,
        trendWeight: null,
        trendDate: null,
        scaleTrendDifference: null,
        ratePerWeek: null,
        rateEffectiveDate: null,
        state: 'no_data',
        evidence: { observationCount: 0, spanDays: 0, latestAgeDays: null },
      },
      deltas: [7, 14, 30, 90].map((requestedDays) => ({
        requestedDays,
        status: 'unavailable',
        value: null,
        fromAsOfDate: '2026-01-01',
        fromTrendDate: null,
        toTrendDate: null,
        reasonCode: 'NO_CURRENT_TREND',
      })),
      points: [],
      markers: [],
      goal: null,
      explanation: {
        headline: 'No data.',
        detail: 'No data.',
        lag: 'No data.',
        confidence: 'No data.',
        facts: {
          confidenceReason: 'NO_MEASUREMENTS',
          scaleTrendRelation: 'unavailable',
          paceDirection: 'unavailable',
          paceFreshness: 'unavailable',
          goalComparison: 'no_goal',
        },
      },
      policy: {
        productTrend: 'trend-weight-v1',
        trajectory: 'product_trend_weight',
        coaching: 'product_trend_weight',
        goalEta: 'adaptive_model_trend',
        goalCompletion: 'adaptive_model_trend',
        maintenanceRange: 'adaptive_model_trend',
        celebrations: 'adaptive_model_trend',
        adaptiveTdee: 'adaptive_model_trend',
        measurementHistory: 'scale_weight',
        explanation: 'Explicit model policy.',
      },
      sourceFingerprint: 'a'.repeat(64),
    };
    expect(trendWeightAnalyticsSchema.parse(base).current.trendWeight).toBeNull();
    expect(() =>
      trendWeightAnalyticsSchema.parse({
        ...base,
        current: { ...base.current, trendWeight: 180 },
      }),
    ).toThrow();
    expect(() =>
      trendWeightAnalyticsSchema.parse({
        ...base,
        current: {
          ...base.current,
          scaleTrendDifference: 2,
          ratePerWeek: 0.5,
          rateEffectiveDate: '2026-08-19',
        },
      }),
    ).toThrow();
    expect(() =>
      trendWeightAnalyticsSchema.parse({
        ...base,
        points: [
          {
            sourceEntryId: 'fabricated',
            date: '2026-08-19',
            scaleWeight: 180,
            trendWeight: null,
            scaleTrendDifference: null,
            state: 'scale_only',
            observationCount: 1,
            spanDays: 0,
            gapFromPreviousDays: null,
            startsNewTrendSegment: false,
            corrected: false,
            annotation: null,
          },
        ],
      }),
    ).toThrow();
    expect(() => trendWeightAnalyticsSchema.parse({ ...base, unexpected: true })).toThrow();
    expect(() =>
      trendWeightAnalyticsSchema.parse({
        ...base,
        deltas: base.deltas.map((delta, index) =>
          index === 0 ? { ...delta, requestedDays: 14 } : delta,
        ),
      }),
    ).toThrow();
    expect(() =>
      trendWeightAnalyticsSchema.parse({
        ...base,
        deltas: base.deltas.map((delta, index) => (index === 0 ? { ...delta, value: 1 } : delta)),
      }),
    ).toThrow();
    expect(() =>
      trendWeightAnalyticsSchema.parse({
        ...base,
        current: {
          ...base.current,
          latestScale: {
            id: 'impossible',
            date: '2026-08-19',
            weight: 180,
            unit: 'lbs',
            notes: null,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      }),
    ).toThrow();

    const expiredStale = {
      ...base,
      current: {
        ...base.current,
        latestScale: {
          id: 'old-scale',
          date: '2026-07-11',
          weight: 181,
          unit: 'lbs',
          notes: null,
          createdAt: 1,
          updatedAt: 1,
        },
        state: 'stale',
        evidence: { observationCount: 0, spanDays: 0, latestAgeDays: 39 },
      },
    };
    expect(trendWeightAnalyticsSchema.parse(expiredStale).current).toMatchObject({
      state: 'stale',
      trendWeight: null,
      evidence: { observationCount: 0, latestAgeDays: 39 },
    });
    for (const latestAgeDays of [8, 29]) {
      expect(
        trendWeightAnalyticsSchema.parse({
          ...expiredStale,
          current: {
            ...expiredStale.current,
            latestScale: {
              ...expiredStale.current.latestScale,
              date: latestAgeDays === 8 ? '2026-08-11' : '2026-07-21',
            },
            evidence: { observationCount: 1, spanDays: 0, latestAgeDays },
          },
          points: [
            {
              sourceEntryId: 'old-scale',
              date: latestAgeDays === 8 ? '2026-08-11' : '2026-07-21',
              scaleWeight: 181,
              trendWeight: null,
              scaleTrendDifference: null,
              state: 'scale_only',
              observationCount: 1,
              spanDays: 0,
              gapFromPreviousDays: null,
              startsNewTrendSegment: false,
              corrected: false,
              annotation: null,
            },
          ],
        }).current.evidence.latestAgeDays,
      ).toBe(latestAgeDays);
    }
    expect(() =>
      trendWeightAnalyticsSchema.parse({
        ...expiredStale,
        current: {
          ...expiredStale.current,
          state: 'scale_only',
          evidence: { observationCount: 1, spanDays: 0, latestAgeDays: 8 },
        },
      }),
    ).toThrow();

    const recentPoint = {
      sourceEntryId: 'recent-scale',
      date: '2026-08-19',
      scaleWeight: 180,
      trendWeight: null,
      scaleTrendDifference: null,
      state: 'scale_only',
      observationCount: 1,
      spanDays: 0,
      gapFromPreviousDays: 49,
      startsNewTrendSegment: true,
      corrected: false,
      annotation: null,
    } as const;
    expect(
      trendWeightAnalyticsSchema.parse({
        ...base,
        range: { preset: '3m', startDate: '2026-05-22', endDate: '2026-08-19' },
        current: {
          ...base.current,
          latestScale: {
            id: 'recent-scale',
            date: '2026-08-19',
            weight: 180,
            unit: 'lbs',
            notes: null,
            createdAt: 2,
            updatedAt: 2,
          },
          state: 'scale_only',
          evidence: { observationCount: 1, spanDays: 0, latestAgeDays: 0 },
        },
        points: [
          {
            ...recentPoint,
            sourceEntryId: 'old-scale',
            date: '2026-07-01',
            scaleWeight: 181,
            gapFromPreviousDays: null,
            startsNewTrendSegment: false,
          },
          recentPoint,
        ],
      }).points,
    ).toHaveLength(2);
  });

  it('enforces loss, gain, and maintenance goal signs and fields', () => {
    const loss = {
      id: 'goal-loss',
      type: 'lose',
      targetWeight: 170,
      maintenanceCenter: null,
      maintenanceLower: null,
      maintenanceUpper: null,
      desiredRatePerWeek: -0.8,
      actualRatePerWeek: -0.7,
      paceState: 'inside_goal_band',
      maintenanceBandState: 'not_applicable',
      explanation: 'Inside the selected loss pace band.',
    };
    expect(trendWeightGoalSchema.parse(loss)).toEqual(loss);
    expect(
      trendWeightGoalSchema.parse({
        ...loss,
        id: 'goal-gain',
        type: 'gain',
        desiredRatePerWeek: 0.4,
      }),
    ).toMatchObject({ type: 'gain', desiredRatePerWeek: 0.4 });
    expect(
      trendWeightGoalSchema.parse({
        ...loss,
        id: 'goal-maintain',
        type: 'maintain',
        targetWeight: null,
        maintenanceCenter: 180,
        maintenanceLower: 176,
        maintenanceUpper: 184,
        desiredRatePerWeek: 0,
        maintenanceBandState: 'inside_maintenance_band',
      }),
    ).toMatchObject({ type: 'maintain', desiredRatePerWeek: 0 });
    expect(() => trendWeightGoalSchema.parse({ ...loss, desiredRatePerWeek: 0.8 })).toThrow();
    expect(() =>
      trendWeightGoalSchema.parse({
        ...loss,
        type: 'maintain',
        desiredRatePerWeek: 0,
      }),
    ).toThrow();
    expect(() => trendWeightGoalSchema.parse({ ...loss, targetWeight: null })).toThrow();
    expect(() => trendWeightGoalSchema.parse({ ...loss, maintenanceLower: 168 })).toThrow();
    expect(() =>
      trendWeightGoalSchema.parse({
        ...loss,
        type: 'maintain',
        targetWeight: null,
        maintenanceCenter: 180,
        maintenanceLower: 184,
        maintenanceUpper: 176,
        desiredRatePerWeek: 0,
        maintenanceBandState: 'inside_maintenance_band',
      }),
    ).toThrow();
  });

  it('rejects point and current states that contradict their evidence', () => {
    const point = {
      sourceEntryId: 'weight-1',
      date: '2026-08-19',
      scaleWeight: 180,
      trendWeight: null,
      scaleTrendDifference: null,
      state: 'scale_only',
      observationCount: 1,
      spanDays: 0,
      gapFromPreviousDays: null,
      startsNewTrendSegment: false,
      corrected: false,
      annotation: null,
    } as const;
    expect(trendWeightPointSchema.parse(point)).toEqual(point);
    expect(() =>
      trendWeightPointSchema.parse({
        ...point,
        trendWeight: 180,
        scaleTrendDifference: 0,
      }),
    ).toThrow();
    expect(() =>
      trendWeightPointSchema.parse({
        ...point,
        state: 'sufficient',
        trendWeight: 180,
        scaleTrendDifference: 0,
        observationCount: 2,
        spanDays: 1,
      }),
    ).toThrow();
  });
});

describe('bodyWeightEntrySchema', () => {
  it('parses a persisted body weight entry', () => {
    const entry = bodyWeightEntrySchema.parse({
      id: 'entry-1',
      date: '2026-03-07',
      weight: 182.4,
      unit: 'lbs',
      notes: null,
      createdAt: 1,
      updatedAt: 2,
    });

    expect(entry).toEqual({
      id: 'entry-1',
      date: '2026-03-07',
      weight: 182.4,
      unit: 'lbs',
      notes: null,
      createdAt: 1,
      updatedAt: 2,
    });
  });

  it('validates explicit lb and kg writes after canonical conversion', () => {
    expect(
      createWeightInputSchema.parse({ date: '2026-03-07', weight: 55.2, unit: 'lbs' }),
    ).toMatchObject({ unit: 'lbs' });
    expect(
      createWeightInputSchema.parse({ date: '2026-03-07', weight: 350, unit: 'kg' }),
    ).toMatchObject({ unit: 'kg' });
    expect(() =>
      createWeightInputSchema.parse({ date: '2026-03-07', weight: 55, unit: 'lbs' }),
    ).toThrow();
    expect(() =>
      createWeightInputSchema.parse({ date: '2026-03-07', weight: 351, unit: 'kg' }),
    ).toThrow();
  });

  it('infers the BodyWeightEntry type from the schema', () => {
    const entry: BodyWeightEntry = {
      id: 'entry-1',
      date: '2026-03-07',
      weight: 182.4,
      unit: 'lbs',
      notes: null,
      createdAt: 1,
      updatedAt: 2,
    };

    expect(entry.notes).toBeNull();
  });
});

describe('patchWeightInputSchema', () => {
  it('accepts a valid single-field patch', () => {
    const payload: PatchWeightInput = patchWeightInputSchema.parse({
      weight: 180.5,
    });

    expect(payload).toEqual({
      weight: 180.5,
    });
  });

  it('accepts a valid multi-field patch', () => {
    const payload = patchWeightInputSchema.parse({
      weight: 179.9,
      notes: '  feeling good  ',
    });

    expect(payload).toEqual({
      weight: 179.9,
      notes: 'feeling good',
    });
  });

  it('allows null notes to explicitly clear an existing note', () => {
    const payload = patchWeightInputSchema.parse({
      notes: null,
    });

    expect(payload).toEqual({
      notes: null,
    });
  });

  it('rejects blank notes when no other patch fields are provided', () => {
    expect(() =>
      patchWeightInputSchema.parse({
        notes: '   ',
      }),
    ).toThrow();
  });

  it('rejects an empty patch payload', () => {
    expect(() => patchWeightInputSchema.parse({})).toThrow();
  });

  it('rejects invalid field values', () => {
    expect(() =>
      patchWeightInputSchema.parse({
        weight: -1,
      }),
    ).toThrow();
  });
});

describe('weightQueryParamsSchema', () => {
  it('parses a valid date range', () => {
    const params = weightQueryParamsSchema.parse({
      from: '2026-03-01',
      to: '2026-03-07',
    });

    expect(params).toEqual({
      from: '2026-03-01',
      to: '2026-03-07',
    });
  });

  it('rejects a reversed date range', () => {
    expect(() =>
      weightQueryParamsSchema.parse({
        from: '2026-03-08',
        to: '2026-03-07',
      }),
    ).toThrow();
  });

  it('parses an integer days query value from string input', () => {
    const params = weightQueryParamsSchema.parse({
      days: '30',
    });

    expect(params).toEqual({
      days: 30,
    });
  });

  it('rejects non-positive days', () => {
    expect(() =>
      weightQueryParamsSchema.parse({
        days: 0,
      }),
    ).toThrow();
  });

  it('rejects combined from and days params', () => {
    expect(() =>
      weightQueryParamsSchema.parse({
        from: '2026-03-01',
        days: 30,
      }),
    ).toThrow();
  });

  it('parses pagination params from string input', () => {
    const params = weightQueryParamsSchema.parse({
      page: '2',
      limit: '25',
    });

    expect(params).toEqual({
      page: 2,
      limit: 25,
    });
  });

  it('infers the WeightQueryParams type from the schema', () => {
    const params: WeightQueryParams = {
      to: '2026-03-07',
      days: 30,
    };

    expect(params.to).toBe('2026-03-07');
    expect(params.days).toBe(30);
  });
});

describe('deleteWeightResultSchema', () => {
  it('parses the expected delete response payload', () => {
    const result = deleteWeightResultSchema.parse({
      deleted: true,
      id: 'weight-1',
    });

    expect(result).toEqual({
      deleted: true,
      id: 'weight-1',
    });
  });

  it('infers the DeleteWeightResult type from the schema', () => {
    const result: DeleteWeightResult = {
      deleted: true,
      id: 'weight-1',
    };

    expect(result.deleted).toBe(true);
  });
});
