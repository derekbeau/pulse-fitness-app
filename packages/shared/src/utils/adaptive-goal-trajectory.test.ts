import { describe, expect, it } from 'vitest';

import type { AdaptiveGoal, AdaptiveGoalRevision } from '../schemas/adaptive-nutrition.js';
import {
  adaptiveGoalCompletionReviewSchema,
  adaptiveGoalTrajectoryForecastSchema,
  adaptiveGoalTrajectoryPointSchema,
  adaptiveGoalTrajectoryRateSchema,
  adaptiveGoalTrajectorySchema,
  adaptiveGoalTrajectoryTimeInRangeSchema,
  adaptiveGoalWeeklyContributionSchema,
} from '../schemas/goal-trajectory.js';
import { addCalendarDays, calendarDaysBetween, type TrendWeightPoint } from './adaptive-tdee.js';
import {
  ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS,
  calculateAdaptiveGoalTrajectory,
} from './adaptive-goal-trajectory.js';
import { calculatePercentageRateTimelineWeeks } from './adaptive-setup-projection.js';

const goal = (overrides: Partial<AdaptiveGoal> = {}): AdaptiveGoal => ({
  id: 'goal-1',
  userId: 'user-1',
  programId: 'program-1',
  type: 'lose',
  status: 'active',
  startTrendWeightKg: 100,
  startScaleWeightKg: 100.2,
  finalTrendWeightKg: null,
  targetWeightKg: 90,
  maintenanceCenterKg: null,
  goalRatePctPerWeek: -0.5,
  startedLocalDate: '2026-01-01',
  endedLocalDate: null,
  endedReason: null,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const revision = (overrides: Partial<AdaptiveGoalRevision> = {}): AdaptiveGoalRevision => ({
  id: 'revision-1',
  goalId: 'goal-1',
  userId: 'user-1',
  sequence: 1,
  targetWeightKg: 90,
  maintenanceCenterKg: null,
  goalRatePctPerWeek: -0.5,
  previousTargetWeightKg: 90,
  previousCenterKg: null,
  previousRatePctPerWeek: -0.5,
  reason: 'created',
  effectiveLocalDate: '2026-01-01',
  createdAt: 1,
  ...overrides,
});

const dailyPoints = ({
  start = '2026-01-01',
  days = 29,
  initial = 100,
  kgPerWeek = -0.5,
  observedEvery = 7,
}: {
  start?: string;
  days?: number;
  initial?: number;
  kgPerWeek?: number;
  observedEvery?: number;
} = {}): TrendWeightPoint[] =>
  Array.from({ length: days }, (_, index) => ({
    date: addCalendarDays(start, index),
    weightKg: initial + (kgPerWeek * index) / 7,
    trendWeightKg: initial + (kgPerWeek * index) / 7,
    sourceEntryId: index % observedEvery === 0 ? `weight-${index}` : null,
    interpolated: index % observedEvery !== 0,
  }));

const calculate = (
  overrides: Partial<Parameters<typeof calculateAdaptiveGoalTrajectory>[0]> = {},
) =>
  calculateAdaptiveGoalTrajectory({
    goal: goal(),
    revisions: [revision()],
    strategyAsOfDate: '2026-01-29',
    evidenceThroughDate: '2026-01-29',
    lookbackDays: 21,
    trendPoints: dailyPoints(),
    latestScale: { id: 'weight-28', date: '2026-01-29', weightKg: 98 },
    completionAllowed: false,
    ...overrides,
  });

describe('calculateAdaptiveGoalTrajectory', () => {
  it.each([
    ['lose', -0.5, 90, 'near_selected'],
    ['lose', -0.25, 90, 'slower_than_selected'],
    ['lose', -0.8, 90, 'faster_than_selected'],
    ['gain', 0.2, 108, 'near_selected'],
    ['gain', 0.08, 108, 'slower_than_selected'],
    ['gain', 0.4, 108, 'faster_than_selected'],
  ] as const)(
    'classifies %s pace from dated model points at %s kg/week',
    (type, actualRate, targetWeightKg, expected) => {
      const gain = type === 'gain';
      const result = calculate({
        goal: goal({
          type,
          targetWeightKg,
          goalRatePctPerWeek: gain ? 0.25 : -0.5,
        }),
        revisions: [
          revision({
            targetWeightKg,
            goalRatePctPerWeek: gain ? 0.25 : -0.5,
            previousTargetWeightKg: targetWeightKg,
            previousRatePctPerWeek: gain ? 0.25 : -0.5,
          }),
        ],
        trendPoints: dailyPoints({ kgPerWeek: actualRate }),
        latestScale: {
          id: 'weight-28',
          date: '2026-01-29',
          weightKg: 100 + actualRate * 4,
        },
      });
      expect(result.summary.kind).toBe('weight_change');
      if (result.summary.kind !== 'weight_change') return;
      expect(result.actualRate.kgPerWeek).toBeCloseTo(actualRate, 8);
      expect(result.summary.paceState).toBe(expected);
      expect(result.forecast?.status).toBe('available');
      if (result.forecast?.status === 'available') {
        const { projectedStartDate, projectedCenterDate, projectedEndDate } = result.forecast;
        expect(projectedStartDate).not.toBeNull();
        expect(projectedCenterDate).not.toBeNull();
        expect(projectedEndDate).not.toBeNull();
        if (!projectedStartDate || !projectedCenterDate || !projectedEndDate) {
          throw new Error('Available forecasts require start, center, and end dates');
        }
        expect(projectedStartDate < projectedCenterDate).toBe(true);
        expect(projectedCenterDate < projectedEndDate).toBe(true);
        expect(calendarDaysBetween(projectedStartDate, projectedCenterDate)).toBeGreaterThanOrEqual(
          7,
        );
        expect(calendarDaysBetween(projectedCenterDate, projectedEndDate)).toBeGreaterThanOrEqual(
          7,
        );
        const corridorPoint = result.forecast.points[1];
        expect(corridorPoint).toBeDefined();
        if (corridorPoint) {
          expect(
            gain
              ? corridorPoint.fasterTrendWeightKg > corridorPoint.slowerTrendWeightKg
              : corridorPoint.fasterTrendWeightKg < corridorPoint.slowerTrendWeightKg,
          ).toBe(true);
        }
        const startPoint = result.forecast.points.find(
          (point) => point.date === result.forecast?.projectedStartDate,
        );
        const endPoint = result.forecast.points.find(
          (point) => point.date === result.forecast?.projectedEndDate,
        );
        expect(startPoint?.fasterTrendWeightKg).toBeCloseTo(targetWeightKg, 8);
        expect(endPoint?.slowerTrendWeightKg).toBeCloseTo(targetWeightKg, 8);
      }
    },
  );

  it('uses dated regression rather than array indexes for an irregular sparse lookback', () => {
    const points = dailyPoints().filter((_, index) => [0, 1, 7, 14, 20, 28].includes(index));
    const result = calculate({ trendPoints: points });
    expect(result.actualRate.kgPerWeek).toBeCloseTo(-0.5, 8);
    expect(result.actualRate.spanDays).toBe(14);
  });

  it('uses the same compounded percentage timeline as setup for planned ETA comparisons', () => {
    const result = calculate();
    expect(result.forecast?.status).toBe('available');
    const plannedWeeks = calculatePercentageRateTimelineWeeks({
      type: 'lose',
      currentWeightKg: 100,
      targetWeightKg: 90,
      ratePctPerWeek: -0.5,
    });
    const plannedDate = addCalendarDays('2026-01-01', Math.ceil(plannedWeeks * 7));
    expect(result.forecast?.etaChangeFromGoalStartDays).toBe(
      result.forecast?.projectedCenterDate
        ? Math.round(
            (Date.parse(`${result.forecast.projectedCenterDate}T00:00:00Z`) -
              Date.parse(`${plannedDate}T00:00:00Z`)) /
              86_400_000,
          )
        : null,
    );
  });

  it('reports ETA movement against the latest effective goal revision', () => {
    const second = revision({
      id: 'revision-2',
      sequence: 2,
      targetWeightKg: 88,
      goalRatePctPerWeek: -0.4,
      previousTargetWeightKg: 90,
      previousRatePctPerWeek: -0.5,
      effectiveLocalDate: '2026-01-15',
      createdAt: 2,
    });
    const result = calculate({ revisions: [revision(), second] });
    expect(result.forecast?.status).toBe('available');
    const revisionTrendPoint = dailyPoints()[14];
    expect(revisionTrendPoint).toBeDefined();
    if (!revisionTrendPoint) throw new Error('Expected a trend point on the revision date');
    const revisionTrendWeight = revisionTrendPoint.trendWeightKg;
    const revisionPlanWeeks = calculatePercentageRateTimelineWeeks({
      type: 'lose',
      currentWeightKg: revisionTrendWeight,
      targetWeightKg: 88,
      ratePctPerWeek: -0.4,
    });
    const revisionPlanDate = addCalendarDays('2026-01-15', Math.ceil(revisionPlanWeeks * 7));
    expect(result.forecast?.etaChangeFromLatestRevisionDays).toBe(
      result.forecast?.projectedCenterDate
        ? calendarDaysBetween(revisionPlanDate, result.forecast.projectedCenterDate)
        : null,
    );
    expect(result.forecast?.etaChangeFromLatestRevisionDays).not.toBeNull();
  });

  it.each([{ kgPerWeek: 0.2, expected: 'MOVING_AWAY' }])(
    'does not fabricate an ETA for $expected',
    ({ kgPerWeek, expected }) => {
      const result = calculate({ trendPoints: dailyPoints({ kgPerWeek }) });
      expect(result.forecast).toMatchObject({
        status: 'unavailable',
        unavailableReason: expected,
        projectedCenterDate: null,
        points: [],
      });
    },
  );

  it('keeps a supported flat rate factual while withholding its ETA', () => {
    const result = calculate({ trendPoints: dailyPoints({ kgPerWeek: 0 }) });
    expect(result.actualRate).toMatchObject({
      status: 'available',
      kgPerWeek: 0,
      unavailableReason: null,
      confidence: 'supported',
    });
    expect(result.summary).toMatchObject({ paceState: 'flat' });
    expect(result.forecast).toMatchObject({
      status: 'unavailable',
      unavailableReason: 'RATE_TOO_SMALL',
      projectedCenterDate: null,
      points: [],
    });
  });

  it('keeps a limited measured rate visible without fabricating an ETA', () => {
    const startPoint = dailyPoints()[21];
    const endPoint = dailyPoints()[28];
    expect(startPoint).toBeDefined();
    expect(endPoint).toBeDefined();
    if (!startPoint || !endPoint) throw new Error('Expected limited-rate boundary points');
    const limitedPoints = [
      {
        ...startPoint,
        sourceEntryId: 'limited-start',
        interpolated: false,
      },
      {
        ...endPoint,
        sourceEntryId: 'limited-end',
        interpolated: false,
      },
    ];
    const result = calculate({ actualRateTrendPoints: limitedPoints });
    expect(result.actualRate).toMatchObject({
      status: 'available',
      confidence: 'limited',
      observedWeightCount: 2,
      spanDays: 7,
    });
    expect(result.forecast).toMatchObject({
      status: 'unavailable',
      unavailableReason: 'LIMITED_TREND_CONFIDENCE',
      points: [],
    });
  });

  it.each([
    {
      reason: 'INSUFFICIENT_TREND' as const,
      points: dailyPoints().slice(-1),
      blockReason: null,
    },
    {
      reason: 'INSUFFICIENT_OBSERVED_WEIGHT' as const,
      points: dailyPoints()
        .slice(-8)
        .map((point) => ({ ...point, sourceEntryId: null, interpolated: true })),
      blockReason: null,
    },
    {
      reason: 'STALE_WEIGHT' as const,
      points: dailyPoints()
        .slice(-21)
        .map((point, index) => ({
          ...point,
          sourceEntryId: index < 2 ? `stale-${index}` : null,
          interpolated: index >= 2,
        })),
      blockReason: null,
    },
    {
      reason: 'SUSPECT_WEIGHT_DATA' as const,
      points: dailyPoints(),
      blockReason: 'SUSPECT_WEIGHT_DATA' as const,
    },
  ])('preserves the $reason forecast reason instead of relabeling it limited', (fixture) => {
    const result = calculate({
      actualRateTrendPoints: fixture.points,
      actualRateBlockReason: fixture.blockReason,
    });
    expect(result.actualRate).toMatchObject({
      status: 'unavailable',
      unavailableReason: fixture.reason,
      kgPerWeek: null,
    });
    expect(result.forecast).toMatchObject({
      status: 'unavailable',
      unavailableReason: fixture.reason,
      points: [],
    });
  });

  it('does not let an opposite pre-goal trend drive the selected goal pace', () => {
    const preGoal = dailyPoints({
      start: '2026-01-01',
      days: 14,
      initial: 90,
      kgPerWeek: 3.5,
      observedEvery: 3,
    });
    const goalPeriod = dailyPoints({
      start: '2026-01-15',
      days: 15,
      initial: 97,
      kgPerWeek: -0.5,
      observedEvery: 3,
    });
    const result = calculate({
      goal: goal({ startedLocalDate: '2026-01-15', startTrendWeightKg: 97 }),
      revisions: [revision({ effectiveLocalDate: '2026-01-15' })],
      trendPoints: [...preGoal, ...goalPeriod],
      actualRateTrendPoints: [...preGoal, ...goalPeriod],
      latestScale: { id: 'goal-weight', date: '2026-01-29', weightKg: 96 },
    });

    expect(result.actualRate).toMatchObject({
      status: 'available',
      startDate: '2026-01-15',
      endDate: '2026-01-29',
      kgPerWeek: -0.5,
      observedWeightCount: 5,
    });
    expect(result.summary).toMatchObject({ paceState: 'near_selected' });
  });

  it('marks unsupported completed weeks as null rather than zero', () => {
    const result = calculate({
      trendPoints: dailyPoints({ observedEvery: 14 }),
    });
    expect(
      result.weeklyContributions.some((week) => week.direction === 'insufficient_evidence'),
    ).toBe(true);
    for (const week of result.weeklyContributions.filter(
      (candidate) => candidate.direction === 'insufficient_evidence',
    )) {
      expect(week.movementTowardTargetKg).toBeNull();
      expect(week.reasonCode).toBe('INSUFFICIENT_WEEKLY_EVIDENCE');
    }
  });

  it('uses the revision effective on each completed week without resetting the start', () => {
    const second = revision({
      id: 'revision-2',
      sequence: 2,
      targetWeightKg: 88,
      previousTargetWeightKg: 90,
      effectiveLocalDate: '2026-01-15',
      createdAt: 2,
    });
    const result = calculate({ revisions: [revision(), second] });
    expect(result.activeRevision.id).toBe('revision-2');
    expect(result.summary.startTrendWeightKg).toBe(100);
    expect(result.summary.kind).toBe('weight_change');
    if (result.summary.kind !== 'weight_change') return;
    expect(result.summary.targetWeightKg).toBe(88);
    expect(result.weeklyContributions.at(-1)?.remainingDistanceKg).toBeGreaterThan(9);
  });

  it.each([
    [79.2, 'near_edge'],
    [80, 'within'],
    [80.8, 'near_edge'],
    [79.19, 'below'],
    [80.81, 'above'],
  ] as const)('classifies maintenance %.2f kg as %s with inclusive bounds', (current, status) => {
    const points = dailyPoints({ initial: current, kgPerWeek: 0 });
    const result = calculate({
      goal: goal({
        type: 'maintain',
        startTrendWeightKg: 80,
        startScaleWeightKg: 80,
        targetWeightKg: null,
        maintenanceCenterKg: 80,
        goalRatePctPerWeek: 0,
      }),
      revisions: [
        revision({
          targetWeightKg: null,
          maintenanceCenterKg: 80,
          goalRatePctPerWeek: 0,
          previousTargetWeightKg: null,
          previousCenterKg: 80,
          previousRatePctPerWeek: 0,
        }),
      ],
      trendPoints: points,
      latestScale: { id: 'weight-28', date: '2026-01-29', weightKg: current },
    });
    expect(result.summary.kind).toBe('maintenance');
    if (result.summary.kind !== 'maintenance') return;
    expect(result.summary.rangeRadiusKg).toBe(0.8);
    expect(result.summary.rangeStatus).toBe(status);
    expect(result.summary.correctionPolicy).toBe('review_only_no_automatic_change');
    expect(result.forecast).toBeNull();
    expect(result.weeklyContributions).toEqual([]);
  });

  it('uses each historical maintenance revision and the selected time-in-range interval', () => {
    const points = dailyPoints({ initial: 80, kgPerWeek: 0 });
    const maintenanceGoal = goal({
      type: 'maintain',
      startTrendWeightKg: 80,
      startScaleWeightKg: 80,
      targetWeightKg: null,
      maintenanceCenterKg: 82,
      goalRatePctPerWeek: 0,
    });
    const revisions = [
      revision({
        targetWeightKg: null,
        maintenanceCenterKg: 80,
        goalRatePctPerWeek: 0,
        previousTargetWeightKg: null,
        previousCenterKg: 80,
        previousRatePctPerWeek: 0,
      }),
      revision({
        id: 'revision-2',
        sequence: 2,
        targetWeightKg: null,
        maintenanceCenterKg: 82,
        goalRatePctPerWeek: 0,
        previousTargetWeightKg: null,
        previousCenterKg: 80,
        previousRatePctPerWeek: 0,
        effectiveLocalDate: '2026-01-22',
        createdAt: 2,
      }),
    ];
    const all = calculate({
      goal: maintenanceGoal,
      revisions,
      trendPoints: points,
      timeInRangeStartDate: '2026-01-01',
      timeInRangeTrendPoints: points,
    });
    const recent = calculate({
      goal: maintenanceGoal,
      revisions,
      trendPoints: points,
      timeInRangeStartDate: '2026-01-22',
      timeInRangeTrendPoints: points.filter((point) => point.date >= '2026-01-22'),
    });
    expect(all.summary.kind).toBe('maintenance');
    expect(recent.summary.kind).toBe('maintenance');
    if (all.summary.kind !== 'maintenance' || recent.summary.kind !== 'maintenance') return;
    expect(all.summary.timeInRange).toMatchObject({
      intervalStartDate: '2026-01-01',
      modeledDays: 29,
      daysWithinRange: 21,
    });
    expect(recent.summary.timeInRange).toMatchObject({
      intervalStartDate: '2026-01-22',
      modeledDays: 8,
      daysWithinRange: 0,
      timeInRangeFraction: 0,
    });
  });

  it('does not fabricate a reversed maintenance interval on the goal start day', () => {
    const result = calculate({
      goal: goal({
        type: 'maintain',
        startTrendWeightKg: 80,
        startScaleWeightKg: 80,
        targetWeightKg: null,
        maintenanceCenterKg: 80,
        goalRatePctPerWeek: 0,
        startedLocalDate: '2026-01-29',
      }),
      revisions: [
        revision({
          targetWeightKg: null,
          maintenanceCenterKg: 80,
          goalRatePctPerWeek: 0,
          previousTargetWeightKg: null,
          previousCenterKg: 80,
          previousRatePctPerWeek: 0,
          effectiveLocalDate: '2026-01-29',
        }),
      ],
      strategyAsOfDate: '2026-01-29',
      evidenceThroughDate: '2026-01-28',
      trendPoints: [],
      timeInRangeStartDate: '2026-01-29',
      timeInRangeTrendPoints: [],
      latestScale: null,
    });
    expect(result.summary.kind).toBe('maintenance');
    if (result.summary.kind !== 'maintenance') return;
    expect(result.summary.timeInRange).toEqual({
      intervalStartDate: null,
      intervalEndDate: null,
      modeledDays: 0,
      daysWithinRange: 0,
      timeInRangeFraction: null,
      evidenceStatus: 'insufficient_evidence',
    });
  });

  it('distinguishes trend-reached review from display-only scale crossing', () => {
    const trendReached = calculate({
      trendPoints: dailyPoints({ initial: 91, kgPerWeek: -0.25 }),
      latestScale: { id: 'weight-28', date: '2026-01-29', weightKg: 91 },
    });
    expect(trendReached.completionReview).toMatchObject({
      trendTargetStatus: 'reached',
      scaleTargetStatus: 'not_reached',
      completionReviewRequired: true,
      completionAllowed: false,
    });

    const scaleOnly = calculate({
      trendPoints: dailyPoints({ initial: 92, kgPerWeek: -0.25 }),
      latestScale: { id: 'weight-28', date: '2026-01-29', weightKg: 89.9 },
    });
    expect(scaleOnly.completionReview).toMatchObject({
      trendTargetStatus: 'not_reached',
      scaleTargetStatus: 'reached',
      completionReviewRequired: false,
      reasonCode: 'SCALE_ONLY_REACHED',
    });
  });

  it('does not request goal completion from an unsupported model trend', () => {
    const result = calculate({
      trendPoints: dailyPoints({ initial: 91, kgPerWeek: -0.25 }),
      latestScale: { id: 'weight-28', date: '2026-01-29', weightKg: 91 },
      completionAllowed: true,
      completionTrendSupported: false,
    });
    expect(result.completionReview).toMatchObject({
      trendTargetStatus: 'unavailable',
      completionReviewRequired: false,
      completionAllowed: false,
      reasonCode: 'INSUFFICIENT_TREND',
    });
  });

  it('clamps a loss overshoot to complete without inventing negative remaining distance', () => {
    const result = calculate({
      trendPoints: dailyPoints({ initial: 91, kgPerWeek: -0.8 }),
      latestScale: { id: 'weight-28', date: '2026-01-29', weightKg: 87.8 },
      completionTrendSupported: true,
    });
    expect(result.summary).toMatchObject({
      kind: 'weight_change',
      completedChangeKg: 10,
      remainingChangeKg: 0,
      percentComplete: 100,
      paceState: 'reached',
    });
    expect(result.forecast).toMatchObject({ status: 'reached', projectedWeeks: 0 });
    expect(
      result.weeklyContributions.filter((week) => week.direction !== 'insufficient_evidence').at(-1)
        ?.remainingDistanceKg,
    ).toBe(0);
  });

  it('clamps a gain overshoot weekly remaining distance to zero', () => {
    const result = calculate({
      goal: goal({
        type: 'gain',
        targetWeightKg: 101,
        goalRatePctPerWeek: 0.25,
      }),
      revisions: [
        revision({
          targetWeightKg: 101,
          goalRatePctPerWeek: 0.25,
          previousTargetWeightKg: 101,
          previousRatePctPerWeek: 0.25,
        }),
      ],
      trendPoints: dailyPoints({ initial: 100, kgPerWeek: 0.8 }),
      latestScale: { id: 'gain-28', date: '2026-01-29', weightKg: 103.2 },
      completionTrendSupported: true,
    });
    expect(
      result.weeklyContributions.filter((week) => week.direction !== 'insufficient_evidence').at(-1)
        ?.remainingDistanceKg,
    ).toBe(0);
  });

  it('exports named tested constants for the Pulse maintenance and evidence policy', () => {
    expect(ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS).toMatchObject({
      weeklyContributionDays: 7,
      minimumObservedWeightsPerSupportedWeek: 1,
      maintenanceMinimumRadiusKg: 0.68,
      maintenanceRadiusFraction: 0.01,
      maintenanceCorrectionPolicy: 'review_only_no_automatic_change',
    });
  });
});

describe('goal trajectory strict state schemas', () => {
  it('rejects a fabricated zero movement for an evidence-free week', () => {
    expect(
      adaptiveGoalWeeklyContributionSchema.safeParse({
        periodStartDate: '2026-01-01',
        periodEndDate: '2026-01-07',
        startTrendWeightKg: 100,
        endTrendWeightKg: 100,
        movementTowardTargetKg: 0,
        direction: 'insufficient_evidence',
        observedWeightCount: 0,
        remainingDistanceKg: 10,
        reasonCode: 'INSUFFICIENT_WEEKLY_EVIDENCE',
      }).success,
    ).toBe(false);
  });

  it('rejects unavailable forecasts that retain date precision or unknown keys', () => {
    expect(
      adaptiveGoalTrajectoryForecastSchema.safeParse({
        status: 'unavailable',
        basis: 'none',
        projectedStartDate: null,
        projectedCenterDate: '2026-03-01',
        projectedEndDate: null,
        projectedWeeks: null,
        etaChangeFromGoalStartDays: null,
        etaChangeFromLatestRevisionDays: null,
        unavailableReason: 'INSUFFICIENT_TREND',
        explanationCode: 'NO_RELIABLE_ETA',
        points: [],
        surprise: true,
      }).success,
    ).toBe(false);
  });

  it('rejects Product Trend Weight point states with fabricated precision', () => {
    const point = {
      date: '2026-01-10',
      trendWeightKg: 99,
      scaleWeightKg: 99,
      sourceEntryId: 'weight-1',
      evidenceState: 'scale_only',
      observationCount: 1,
      spanDays: 0,
      gapFromPreviousDays: null,
      corrected: false,
      adaptiveStrategyTrendWeightKg: null,
      goalRevisionId: 'revision-1',
      revisionSequence: 1,
      targetWeightKg: 90,
      maintenanceCenterKg: null,
      maintenanceLowerKg: null,
      maintenanceUpperKg: null,
      section: 'historical',
    };
    expect(adaptiveGoalTrajectoryPointSchema.safeParse(point).success).toBe(false);
  });

  it('rejects an unavailable rate that omits its reason or claims supported confidence', () => {
    const value = {
      lookbackDays: 21,
      kgPerWeek: null,
      pctPerWeek: null,
      startDate: null,
      endDate: null,
      trendPointCount: 0,
      observedWeightCount: 0,
      spanDays: 0,
      confidence: 'supported',
      status: 'unavailable',
      unavailableReason: null,
    };
    expect(adaptiveGoalTrajectoryRateSchema.safeParse(value).success).toBe(false);
  });

  it('rejects contradictory completion consent and reversed maintenance intervals', () => {
    expect(
      adaptiveGoalCompletionReviewSchema.safeParse({
        toleranceKg: 0.68,
        trendTargetStatus: 'unavailable',
        scaleTargetStatus: 'not_reached',
        completionReviewRequired: false,
        completionAllowed: true,
        reasonCode: 'INSUFFICIENT_TREND',
      }).success,
    ).toBe(false);
    expect(
      adaptiveGoalTrajectoryTimeInRangeSchema.safeParse({
        intervalStartDate: '2026-01-29',
        intervalEndDate: '2026-01-28',
        modeledDays: 1,
        daysWithinRange: 1,
        timeInRangeFraction: 1,
        evidenceStatus: 'supported',
      }).success,
    ).toBe(false);
  });

  it('rejects future or out-of-goal current evidence and annotations', () => {
    const calculation = calculate();
    const envelope = {
      algorithmVersion: 'adaptive-tdee-v1' as const,
      trendSource: 'product_trend_weight_v1' as const,
      strategyTrendSource: 'adaptive_model_trend' as const,
      productTrend: {
        currentTrendWeightKg: calculation.summary.currentTrendWeightKg,
        currentTrendDate: calculation.summary.currentTrendDate,
        state: 'sufficient' as const,
      },
      timeZone: 'America/Detroit',
      isHistorical: false,
      goal: goal(),
      activeRevision: calculation.activeRevision,
      range: { preset: 'all' as const, startDate: '2026-01-01', endDate: '2026-01-29' },
      strategyAsOfDate: '2026-01-29',
      evidenceThroughDate: '2026-01-29',
      currentTrendDate: calculation.summary.currentTrendDate,
      summary: calculation.summary,
      actualRate: calculation.actualRate,
      forecast: calculation.forecast,
      context: {
        calorieTargetKcal: null,
        calorieTargetEffectiveDate: null,
        adaptiveExpenditureKcal: 2500,
        expenditureSourceCheckInId: null,
        expenditureSourceInputFingerprint: null,
      },
      trendPoints: dailyPoints().map((point, index, points) => ({
        date: point.date,
        trendWeightKg: point.trendWeightKg,
        scaleWeightKg: point.weightKg,
        sourceEntryId: point.sourceEntryId ?? `modeled-${index}`,
        evidenceState: 'sufficient' as const,
        observationCount: index + 3,
        spanDays: index + 14,
        gapFromPreviousDays: index === 0 ? null : 1,
        corrected: false,
        adaptiveStrategyTrendWeightKg: point.trendWeightKg,
        goalRevisionId: 'revision-1',
        revisionSequence: 1,
        targetWeightKg: 90,
        maintenanceCenterKg: null,
        maintenanceLowerKg: null,
        maintenanceUpperKg: null,
        section: index === points.length - 1 ? ('current' as const) : ('historical' as const),
      })),
      weeklyContributions: calculation.weeklyContributions,
      annotations: [
        {
          id: 'goal-start',
          date: '2026-01-01',
          kind: 'goal_started' as const,
          label: 'Goal started',
          goalRevisionId: 'revision-1',
          revisionSequence: 1,
          checkInId: null,
        },
      ],
      completionReview: calculation.completionReview,
    };
    expect(adaptiveGoalTrajectorySchema.safeParse(envelope).success).toBe(true);
    expect(
      adaptiveGoalTrajectorySchema.safeParse({
        ...envelope,
        strategyAsOfDate: '2026-01-28',
      }).success,
    ).toBe(false);
    expect(
      adaptiveGoalTrajectorySchema.safeParse({
        ...envelope,
        annotations: [{ ...envelope.annotations[0], date: '2025-12-31' }],
      }).success,
    ).toBe(false);
    expect(
      adaptiveGoalTrajectorySchema.safeParse({
        ...envelope,
        trendPoints: envelope.trendPoints.map((point) =>
          point.section === 'current' ? { ...point, date: '2026-01-28' } : point,
        ),
      }).success,
    ).toBe(false);

    const strategyEvent = {
      ...envelope.trendPoints[14],
      trendWeightKg: null,
      scaleWeightKg: null,
      sourceEntryId: null,
      evidenceState: 'strategy_event' as const,
      observationCount: 0,
      spanDays: 0,
      gapFromPreviousDays: null,
      adaptiveStrategyTrendWeightKg: null,
      section: 'historical' as const,
    };
    expect(
      adaptiveGoalTrajectorySchema.safeParse({
        ...envelope,
        trendPoints: envelope.trendPoints.map((point, index) =>
          index === 14 ? strategyEvent : point,
        ),
      }).success,
    ).toBe(true);
    expect(
      adaptiveGoalTrajectoryPointSchema.safeParse({
        ...strategyEvent,
        trendWeightKg: 98,
      }).success,
    ).toBe(false);
  });
});
