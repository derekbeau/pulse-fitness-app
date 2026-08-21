import type { AdaptiveGoal, AdaptiveGoalRevision } from '../schemas/adaptive-nutrition.js';
import {
  adaptiveGoalCompletionReviewSchema,
  adaptiveGoalTrajectoryForecastSchema,
  adaptiveGoalTrajectoryRateSchema,
  adaptiveGoalTrajectorySummarySchema,
  adaptiveGoalWeeklyContributionSchema,
  type AdaptiveGoalTrajectoryForecast,
  type AdaptiveGoalTrajectoryRate,
  type AdaptiveGoalWeeklyContribution,
} from '../schemas/goal-trajectory.js';
import {
  ADAPTIVE_TDEE_CONSTANTS,
  addCalendarDays,
  calendarDaysBetween,
  type TrendWeightPoint,
} from './adaptive-tdee.js';
import { calculatePercentageRateTimelineWeeks } from './adaptive-setup-projection.js';
import {
  ADAPTIVE_GOAL_PROGRESS_CONSTANTS,
  calculateAdaptiveGoalProjectionRange,
} from './adaptive-goal-progress.js';

export const ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS = Object.freeze({
  actualRateMinimumObservedWeights: 2,
  actualRateMinimumSpanDays: 7,
  actualRateFlatKgPerWeek: ADAPTIVE_GOAL_PROGRESS_CONSTANTS.flatRateKgPerWeek,
  onPaceMinimumFraction: ADAPTIVE_GOAL_PROGRESS_CONSTANTS.onTrackMinimumFraction,
  onPaceMaximumFraction: ADAPTIVE_GOAL_PROGRESS_CONSTANTS.aheadMinimumFraction,
  weeklyContributionDays: 7,
  minimumObservedWeightsPerSupportedWeek: 1,
  maintenanceMinimumRadiusKg: ADAPTIVE_GOAL_PROGRESS_CONSTANTS.maintenanceMinimumRadiusKg,
  maintenanceRadiusFraction: ADAPTIVE_GOAL_PROGRESS_CONSTANTS.maintenanceRadiusFraction,
  maintenanceNearEdgeFraction: ADAPTIVE_GOAL_PROGRESS_CONSTANTS.maintenanceNearEdgeFraction,
  maintenanceCorrectionPolicy: 'review_only_no_automatic_change' as const,
});

type LatestScale = { id: string; date: string; weightKg: number } | null;

export type AdaptiveGoalTrajectoryCalculationInput = {
  goal: AdaptiveGoal;
  revisions: readonly AdaptiveGoalRevision[];
  strategyAsOfDate: string;
  evidenceThroughDate: string;
  lookbackDays: 14 | 21 | 28;
  trendPoints: readonly TrendWeightPoint[];
  actualRateTrendPoints?: readonly TrendWeightPoint[];
  currentTrendPoint?: TrendWeightPoint | null;
  actualRateBlockReason?: 'SUSPECT_WEIGHT_DATA' | null;
  timeInRangeStartDate?: string;
  timeInRangeTrendPoints?: readonly TrendWeightPoint[];
  latestScale: LatestScale;
  completionAllowed: boolean;
  completionTrendSupported?: boolean;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const round = (value: number) => Number(value.toFixed(8));

const activeRevisionOn = (
  revisions: readonly AdaptiveGoalRevision[],
  date: string,
): AdaptiveGoalRevision => {
  const revision = [...revisions]
    .filter((candidate) => candidate.effectiveLocalDate <= date)
    .sort((left, right) => left.sequence - right.sequence)
    .at(-1);
  if (!revision) throw new Error(`No goal revision is effective on ${date}`);
  return revision;
};

const trendAtOrBefore = (points: readonly TrendWeightPoint[], date: string) =>
  [...points].reverse().find((point) => point.date <= date) ?? null;

const datedSlopeKgPerWeek = (points: readonly TrendWeightPoint[]) => {
  const first = points[0];
  if (!first || points.length < 2) return null;
  const xs = points.map((point) => calendarDaysBetween(first.date, point.date));
  const ys = points.map((point) => point.trendWeightKg);
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < points.length; index += 1) {
    const xDelta = (xs[index] ?? 0) - xMean;
    numerator += xDelta * ((ys[index] ?? 0) - yMean);
    denominator += xDelta * xDelta;
  }
  return denominator === 0 ? null : (numerator / denominator) * 7;
};

const calculateActualRate = (
  input: AdaptiveGoalTrajectoryCalculationInput,
  currentTrend: TrendWeightPoint | null,
): AdaptiveGoalTrajectoryRate => {
  const lookbackStart = addCalendarDays(input.evidenceThroughDate, -(input.lookbackDays - 1));
  const ratePoints = input.actualRateTrendPoints ?? input.trendPoints;
  const points = ratePoints.filter(
    (point) =>
      point.date >= input.goal.startedLocalDate &&
      point.date >= lookbackStart &&
      point.date <= input.evidenceThroughDate,
  );
  const observedWeightCount = points.filter((point) => !point.interpolated).length;
  const first = points[0];
  const last = points.at(-1);
  const spanDays = first && last ? calendarDaysBetween(first.date, last.date) : 0;
  const latestObserved = [...ratePoints]
    .reverse()
    .find(
      (point) =>
        !point.interpolated &&
        point.date >= input.goal.startedLocalDate &&
        point.date <= input.evidenceThroughDate,
    );
  const latestAgeDays = latestObserved
    ? calendarDaysBetween(latestObserved.date, input.evidenceThroughDate)
    : null;
  const stale =
    latestAgeDays !== null && latestAgeDays > ADAPTIVE_TDEE_CONSTANTS.maximumWeightAgeDays;
  let unavailableReason: AdaptiveGoalTrajectoryRate['unavailableReason'] = null;
  if (input.actualRateBlockReason) {
    unavailableReason = input.actualRateBlockReason;
  } else if (
    !currentTrend ||
    points.length < 2 ||
    spanDays < ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.actualRateMinimumSpanDays
  ) {
    unavailableReason = 'INSUFFICIENT_TREND';
  } else if (
    observedWeightCount < ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.actualRateMinimumObservedWeights
  ) {
    unavailableReason = 'INSUFFICIENT_OBSERVED_WEIGHT';
  } else if (stale) {
    unavailableReason = 'STALE_WEIGHT';
  }
  const kgPerWeek = unavailableReason ? null : datedSlopeKgPerWeek(points);
  const availableKgPerWeek = unavailableReason ? null : kgPerWeek;
  const confidence = stale
    ? 'stale'
    : unavailableReason
      ? 'insufficient'
      : observedWeightCount >= 3 && spanDays >= Math.min(input.lookbackDays - 1, 14)
        ? 'supported'
        : 'limited';
  return adaptiveGoalTrajectoryRateSchema.parse({
    lookbackDays: input.lookbackDays,
    kgPerWeek: availableKgPerWeek === null ? null : round(availableKgPerWeek),
    pctPerWeek:
      availableKgPerWeek === null || currentTrend === null
        ? null
        : round((availableKgPerWeek / currentTrend.trendWeightKg) * 100),
    startDate: unavailableReason ? null : (first?.date ?? null),
    endDate: unavailableReason ? null : (last?.date ?? null),
    trendPointCount: points.length,
    observedWeightCount,
    spanDays,
    confidence,
    status: unavailableReason ? 'unavailable' : 'available',
    unavailableReason,
  });
};

const weightChangeTowardTarget = (type: 'lose' | 'gain', start: number, end: number) =>
  type === 'lose' ? start - end : end - start;

const targetReached = (
  type: 'lose' | 'gain',
  weightKg: number,
  targetWeightKg: number,
  toleranceKg: number,
) =>
  type === 'lose'
    ? weightKg <= targetWeightKg + toleranceKg
    : weightKg >= targetWeightKg - toleranceKg;

const selectedProjectionCenterDate = (input: {
  type: 'lose' | 'gain';
  currentWeightKg: number;
  targetWeightKg: number;
  ratePctPerWeek: number;
  date: string;
}) => {
  const weeks = calculatePercentageRateTimelineWeeks(input);
  return addCalendarDays(input.date, Math.ceil(weeks * 7));
};

const buildForecastPoints = (input: {
  strategyAsOfDate: string;
  currentWeightKg: number;
  targetWeightKg: number;
  projectedStartDate: string;
  projectedCenterDate: string;
  projectedEndDate: string;
}) => {
  const totalDays = calendarDaysBetween(input.strategyAsOfDate, input.projectedEndDate);
  const direction = Math.sign(input.targetWeightKg - input.currentWeightKg);
  const valueAt = (durationDays: number, days: number) => {
    if (durationDays <= 0) return input.targetWeightKg;
    const raw =
      input.currentWeightKg +
      ((input.targetWeightKg - input.currentWeightKg) * days) / durationDays;
    return direction < 0
      ? Math.max(input.targetWeightKg, raw)
      : Math.min(input.targetWeightKg, raw);
  };
  const centerDays = calendarDaysBetween(input.strategyAsOfDate, input.projectedCenterDate);
  const fasterDays = calendarDaysBetween(input.strategyAsOfDate, input.projectedStartDate);
  const slowerDays = calendarDaysBetween(input.strategyAsOfDate, input.projectedEndDate);
  const dates = [
    input.strategyAsOfDate,
    input.projectedStartDate,
    input.projectedCenterDate,
    input.projectedEndDate,
  ];
  for (let day = 7; day < totalDays; day += 7)
    dates.push(addCalendarDays(input.strategyAsOfDate, day));
  return [...new Set(dates)].sort().map((date) => {
    const days = calendarDaysBetween(input.strategyAsOfDate, date);
    return {
      date,
      expectedTrendWeightKg: round(valueAt(centerDays, days)),
      fasterTrendWeightKg: round(valueAt(fasterDays, days)),
      slowerTrendWeightKg: round(valueAt(slowerDays, days)),
    };
  });
};

const calculateForecast = (input: {
  calculation: AdaptiveGoalTrajectoryCalculationInput;
  currentTrend: TrendWeightPoint | null;
  activeRevision: AdaptiveGoalRevision;
  actualRate: AdaptiveGoalTrajectoryRate;
  reached: boolean;
}): AdaptiveGoalTrajectoryForecast => {
  const { calculation, currentTrend, activeRevision, actualRate } = input;
  if (input.reached) {
    return adaptiveGoalTrajectoryForecastSchema.parse({
      status: 'reached',
      basis: 'none',
      projectedStartDate: null,
      projectedCenterDate: null,
      projectedEndDate: null,
      projectedWeeks: 0,
      etaChangeFromGoalStartDays: null,
      etaChangeFromLatestRevisionDays: null,
      unavailableReason: null,
      explanationCode: 'TARGET_REACHED',
      points: [],
    });
  }
  const type = calculation.goal.type;
  const targetWeightKg = activeRevision.targetWeightKg;
  const rate = actualRate.kgPerWeek;
  const unavailableReason =
    !currentTrend || targetWeightKg === null
      ? 'INSUFFICIENT_TREND'
      : actualRate.status === 'unavailable'
        ? actualRate.unavailableReason
        : actualRate.confidence !== 'supported'
          ? 'LIMITED_TREND_CONFIDENCE'
          : rate === null
            ? 'INSUFFICIENT_TREND'
            : Math.abs(rate) < ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.actualRateFlatKgPerWeek
              ? 'RATE_TOO_SMALL'
              : Math.sign(rate) !== Math.sign(targetWeightKg - currentTrend.trendWeightKg)
                ? 'MOVING_AWAY'
                : null;
  if (unavailableReason) {
    return adaptiveGoalTrajectoryForecastSchema.parse({
      status: 'unavailable',
      basis: 'none',
      projectedStartDate: null,
      projectedCenterDate: null,
      projectedEndDate: null,
      projectedWeeks: null,
      etaChangeFromGoalStartDays: null,
      etaChangeFromLatestRevisionDays: null,
      unavailableReason,
      explanationCode: 'NO_RELIABLE_ETA',
      points: [],
    });
  }
  if (
    currentTrend === null ||
    targetWeightKg === null ||
    rate === null ||
    (type !== 'lose' && type !== 'gain')
  ) {
    throw new Error(
      'Available weight-change forecast requires a trend, target, rate, and direction',
    );
  }
  const remainingDistanceKg = Math.abs(targetWeightKg - currentTrend.trendWeightKg);
  const projectionRange = calculateAdaptiveGoalProjectionRange(
    'actual',
    calculation.strategyAsOfDate,
    remainingDistanceKg,
    rate,
  );
  const projectedWeeks = projectionRange.weeks;
  const projectedStartDate = projectionRange.projectedStartDate;
  const projectedCenterDate = addCalendarDays(
    calculation.strategyAsOfDate,
    Math.ceil((projectedWeeks ?? 0) * 7),
  );
  const projectedEndDate = projectionRange.projectedEndDate;
  if (projectedWeeks === null || projectedStartDate === null || projectedEndDate === null) {
    throw new Error('Available goal projection requires a complete date range');
  }
  const firstRevision = [...calculation.revisions].sort(
    (left, right) => left.sequence - right.sequence,
  )[0];
  if (!firstRevision?.targetWeightKg)
    throw new Error('Weight-change goal requires an initial target');
  const startPlannedDate = selectedProjectionCenterDate({
    type,
    currentWeightKg: calculation.goal.startTrendWeightKg,
    targetWeightKg: firstRevision.targetWeightKg,
    ratePctPerWeek: firstRevision.goalRatePctPerWeek,
    date: calculation.goal.startedLocalDate,
  });
  const revisionTrend = trendAtOrBefore(calculation.trendPoints, activeRevision.effectiveLocalDate);
  const revisionPlannedDate = selectedProjectionCenterDate({
    type,
    currentWeightKg: revisionTrend?.trendWeightKg ?? calculation.goal.startTrendWeightKg,
    targetWeightKg,
    ratePctPerWeek: activeRevision.goalRatePctPerWeek,
    date: activeRevision.effectiveLocalDate,
  });
  const etaChangeFromGoalStartDays = calendarDaysBetween(startPlannedDate, projectedCenterDate);
  const etaChangeFromLatestRevisionDays = calendarDaysBetween(
    revisionPlannedDate,
    projectedCenterDate,
  );
  return adaptiveGoalTrajectoryForecastSchema.parse({
    status: 'available',
    basis: 'actual_rate',
    projectedStartDate,
    projectedCenterDate,
    projectedEndDate,
    projectedWeeks: round(projectedWeeks),
    etaChangeFromGoalStartDays,
    etaChangeFromLatestRevisionDays,
    unavailableReason: null,
    explanationCode:
      etaChangeFromGoalStartDays > 1
        ? 'ETA_LATER'
        : etaChangeFromGoalStartDays < -1
          ? 'ETA_EARLIER'
          : 'ETA_UNCHANGED',
    points: buildForecastPoints({
      strategyAsOfDate: calculation.strategyAsOfDate,
      currentWeightKg: currentTrend.trendWeightKg,
      targetWeightKg,
      projectedStartDate,
      projectedCenterDate,
      projectedEndDate,
    }),
  });
};

const calculateWeeklyContributions = (
  input: AdaptiveGoalTrajectoryCalculationInput,
): AdaptiveGoalWeeklyContribution[] => {
  if (input.goal.type === 'maintain') return [];
  const result: AdaptiveGoalWeeklyContribution[] = [];
  for (
    let start = input.goal.startedLocalDate;
    addCalendarDays(start, ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.weeklyContributionDays - 1) <=
    input.evidenceThroughDate;
    start = addCalendarDays(start, ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.weeklyContributionDays)
  ) {
    const end = addCalendarDays(
      start,
      ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.weeklyContributionDays - 1,
    );
    const priorBoundary =
      start === input.goal.startedLocalDate
        ? { trendWeightKg: input.goal.startTrendWeightKg }
        : trendAtOrBefore(input.trendPoints, addCalendarDays(start, -1));
    const endBoundary = input.trendPoints.find((point) => point.date === end) ?? null;
    const bucketPoints = input.trendPoints.filter(
      (point) => point.date >= start && point.date <= end,
    );
    const observations = bucketPoints.filter((point) => !point.interpolated);
    const latestObserved = observations.at(-1);
    const endpointStale = latestObserved
      ? calendarDaysBetween(latestObserved.date, end) > ADAPTIVE_TDEE_CONSTANTS.maximumWeightAgeDays
      : true;
    const supported =
      Boolean(priorBoundary) &&
      Boolean(endBoundary) &&
      observations.length >=
        ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.minimumObservedWeightsPerSupportedWeek &&
      !endpointStale;
    if (!supported || !priorBoundary || !endBoundary) {
      result.push(
        adaptiveGoalWeeklyContributionSchema.parse({
          periodStartDate: start,
          periodEndDate: end,
          startTrendWeightKg: priorBoundary?.trendWeightKg ?? null,
          endTrendWeightKg: endBoundary?.trendWeightKg ?? null,
          movementTowardTargetKg: null,
          direction: 'insufficient_evidence',
          observedWeightCount: observations.length,
          remainingDistanceKg: null,
          reasonCode: 'INSUFFICIENT_WEEKLY_EVIDENCE',
        }),
      );
      continue;
    }
    const revision = activeRevisionOn(input.revisions, end);
    if (revision.targetWeightKg === null) throw new Error('Weight-change revision requires target');
    const movement = weightChangeTowardTarget(
      input.goal.type,
      priorBoundary.trendWeightKg,
      endBoundary.trendWeightKg,
    );
    result.push(
      adaptiveGoalWeeklyContributionSchema.parse({
        periodStartDate: start,
        periodEndDate: end,
        startTrendWeightKg: round(priorBoundary.trendWeightKg),
        endTrendWeightKg: round(endBoundary.trendWeightKg),
        movementTowardTargetKg: round(movement),
        direction:
          Math.abs(movement) < ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.actualRateFlatKgPerWeek
            ? 'neutral'
            : movement > 0
              ? 'toward'
              : 'away',
        observedWeightCount: observations.length,
        remainingDistanceKg: round(
          Math.max(
            0,
            input.goal.type === 'lose'
              ? endBoundary.trendWeightKg - revision.targetWeightKg
              : revision.targetWeightKg - endBoundary.trendWeightKg,
          ),
        ),
        reasonCode: null,
      }),
    );
  }
  return result;
};

export function calculateAdaptiveGoalTrajectory(input: AdaptiveGoalTrajectoryCalculationInput) {
  const revisions = [...input.revisions].sort((left, right) => left.sequence - right.sequence);
  const activeRevision = activeRevisionOn(revisions, input.strategyAsOfDate);
  const currentTrend =
    input.currentTrendPoint === undefined
      ? trendAtOrBefore(input.trendPoints, input.evidenceThroughDate)
      : input.currentTrendPoint;
  const actualRate = calculateActualRate(input, currentTrend);
  const latestScale = input.latestScale
    ? {
        entryId: input.latestScale.id,
        date: input.latestScale.date,
        weightKg: input.latestScale.weightKg,
      }
    : null;
  const toleranceTarget = activeRevision.targetWeightKg;
  const toleranceKg = toleranceTarget
    ? Math.max(
        ADAPTIVE_TDEE_CONSTANTS.goalToleranceAbsoluteKg,
        toleranceTarget * ADAPTIVE_TDEE_CONSTANTS.goalToleranceFraction,
      )
    : ADAPTIVE_TDEE_CONSTANTS.goalToleranceAbsoluteKg;

  if (input.goal.type === 'maintain') {
    const centerWeightKg = activeRevision.maintenanceCenterKg;
    if (centerWeightKg === null) throw new Error('Maintenance revision requires a center');
    const radius = Math.max(
      ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.maintenanceMinimumRadiusKg,
      centerWeightKg * ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.maintenanceRadiusFraction,
    );
    const lower = centerWeightKg - radius;
    const upper = centerWeightKg + radius;
    const distance = currentTrend ? currentTrend.trendWeightKg - centerWeightKg : null;
    const rangeStatus =
      currentTrend === null
        ? 'insufficient_data'
        : currentTrend.trendWeightKg < lower
          ? 'below'
          : currentTrend.trendWeightKg > upper
            ? 'above'
            : Math.abs(currentTrend.trendWeightKg - centerWeightKg) >=
                radius * ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.maintenanceNearEdgeFraction
              ? 'near_edge'
              : 'within';
    const intervalStartDate = input.timeInRangeStartDate ?? input.goal.startedLocalDate;
    const hasCompletedInterval = intervalStartDate <= input.evidenceThroughDate;
    const intervalPoints = (input.timeInRangeTrendPoints ?? input.trendPoints).filter(
      (point) => point.date >= intervalStartDate && point.date <= input.evidenceThroughDate,
    );
    const latestIntervalObservation = [...intervalPoints]
      .reverse()
      .find((point) => !point.interpolated);
    const timeInRangeSupported =
      latestIntervalObservation !== undefined &&
      calendarDaysBetween(latestIntervalObservation.date, input.evidenceThroughDate) <=
        ADAPTIVE_TDEE_CONSTANTS.maximumWeightAgeDays;
    const daysWithinRange = intervalPoints.filter((point) => {
      const revision = activeRevisionOn(revisions, point.date);
      const effectiveCenter = revision.maintenanceCenterKg;
      if (effectiveCenter === null) return false;
      const effectiveRadius = Math.max(
        ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.maintenanceMinimumRadiusKg,
        effectiveCenter * ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.maintenanceRadiusFraction,
      );
      return (
        point.trendWeightKg >= effectiveCenter - effectiveRadius &&
        point.trendWeightKg <= effectiveCenter + effectiveRadius
      );
    }).length;
    const summary = adaptiveGoalTrajectorySummarySchema.parse({
      kind: 'maintenance',
      startTrendWeightKg: input.goal.startTrendWeightKg,
      currentTrendWeightKg: currentTrend?.trendWeightKg ?? null,
      currentTrendDate: currentTrend?.date ?? null,
      latestScale,
      centerWeightKg,
      rangeRadiusKg: round(radius),
      rangeLowerKg: round(lower),
      rangeUpperKg: round(upper),
      signedDistanceFromCenterKg: distance === null ? null : round(distance),
      rangeStatus,
      correctionPolicy: ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.maintenanceCorrectionPolicy,
      timeInRange: {
        intervalStartDate:
          hasCompletedInterval && intervalPoints.length > 0 ? intervalStartDate : null,
        intervalEndDate:
          hasCompletedInterval && intervalPoints.length > 0 ? input.evidenceThroughDate : null,
        modeledDays: intervalPoints.length,
        daysWithinRange,
        timeInRangeFraction:
          !timeInRangeSupported || intervalPoints.length === 0
            ? null
            : round(daysWithinRange / intervalPoints.length),
        evidenceStatus: timeInRangeSupported ? 'supported' : 'insufficient_evidence',
      },
    });
    return {
      activeRevision,
      summary,
      actualRate,
      forecast: null,
      weeklyContributions: [],
      completionReview: adaptiveGoalCompletionReviewSchema.parse({
        toleranceKg,
        trendTargetStatus: 'unavailable',
        scaleTargetStatus: 'unavailable',
        completionReviewRequired: false,
        completionAllowed: false,
        reasonCode: 'MAINTENANCE_NOT_APPLICABLE',
      }),
    };
  }

  const targetWeightKg = activeRevision.targetWeightKg;
  if (targetWeightKg === null) throw new Error('Weight-change revision requires a target');
  const initialRevision = revisions[0];
  if (!initialRevision || initialRevision.targetWeightKg === null) {
    throw new Error('Weight-change goal requires an initial target revision');
  }
  const originalPlannedChangeKg = Math.abs(
    initialRevision.targetWeightKg - input.goal.startTrendWeightKg,
  );
  const totalPlannedChangeKg = Math.abs(targetWeightKg - input.goal.startTrendWeightKg);
  const completedChangeKg = currentTrend
    ? clamp(
        weightChangeTowardTarget(
          input.goal.type,
          input.goal.startTrendWeightKg,
          currentTrend.trendWeightKg,
        ),
        0,
        totalPlannedChangeKg,
      )
    : null;
  const remainingChangeKg =
    completedChangeKg === null ? null : Math.max(0, totalPlannedChangeKg - completedChangeKg);
  const trendReached = currentTrend
    ? targetReached(input.goal.type, currentTrend.trendWeightKg, targetWeightKg, toleranceKg)
    : false;
  const completionTrendSupported = input.completionTrendSupported ?? currentTrend !== null;
  const supportedTrendReached = completionTrendSupported && trendReached;
  const scaleReached = input.latestScale
    ? targetReached(input.goal.type, input.latestScale.weightKg, targetWeightKg, toleranceKg)
    : false;
  const desiredRateKgPerWeek =
    ((currentTrend?.trendWeightKg ?? input.goal.startTrendWeightKg) *
      activeRevision.goalRatePctPerWeek) /
    100;
  const actualKgPerWeek = actualRate.kgPerWeek;
  const paceState = supportedTrendReached
    ? 'reached'
    : actualKgPerWeek === null
      ? 'insufficient_data'
      : Math.abs(actualKgPerWeek) < ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.actualRateFlatKgPerWeek
        ? 'flat'
        : Math.sign(actualKgPerWeek) !== Math.sign(desiredRateKgPerWeek)
          ? 'moving_away'
          : Math.abs(actualKgPerWeek) <
              Math.abs(desiredRateKgPerWeek) *
                ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.onPaceMinimumFraction
            ? 'slower_than_selected'
            : Math.abs(actualKgPerWeek) >
                Math.abs(desiredRateKgPerWeek) *
                  ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.onPaceMaximumFraction
              ? 'faster_than_selected'
              : 'near_selected';
  const summary = adaptiveGoalTrajectorySummarySchema.parse({
    kind: 'weight_change',
    type: input.goal.type,
    startTrendWeightKg: input.goal.startTrendWeightKg,
    currentTrendWeightKg: currentTrend?.trendWeightKg ?? null,
    currentTrendDate: currentTrend?.date ?? null,
    latestScale,
    targetWeightKg,
    originalPlannedChangeKg: round(originalPlannedChangeKg),
    revisionAdjustmentKg: round(totalPlannedChangeKg - originalPlannedChangeKg),
    totalPlannedChangeKg: round(totalPlannedChangeKg),
    completedChangeKg: completedChangeKg === null ? null : round(completedChangeKg),
    remainingChangeKg: remainingChangeKg === null ? null : round(remainingChangeKg),
    percentComplete:
      completedChangeKg === null
        ? null
        : totalPlannedChangeKg === 0
          ? 100
          : round((completedChangeKg / totalPlannedChangeKg) * 100),
    selectedRatePctPerWeek: activeRevision.goalRatePctPerWeek,
    selectedRateKgPerWeek: round(desiredRateKgPerWeek),
    paceState,
  });
  const forecast =
    input.goal.status === 'active'
      ? calculateForecast({
          calculation: input,
          currentTrend,
          activeRevision,
          actualRate,
          reached: supportedTrendReached,
        })
      : null;
  return {
    activeRevision,
    summary,
    actualRate,
    forecast,
    weeklyContributions: calculateWeeklyContributions(input),
    completionReview: adaptiveGoalCompletionReviewSchema.parse({
      toleranceKg: round(toleranceKg),
      trendTargetStatus: completionTrendSupported
        ? trendReached
          ? 'reached'
          : 'not_reached'
        : 'unavailable',
      scaleTargetStatus: input.latestScale
        ? scaleReached
          ? 'reached'
          : 'not_reached'
        : 'unavailable',
      completionReviewRequired: input.goal.status === 'active' && supportedTrendReached,
      completionAllowed:
        input.goal.status === 'active' && supportedTrendReached && input.completionAllowed,
      reasonCode:
        input.goal.status !== 'active'
          ? 'GOAL_CLOSED'
          : supportedTrendReached
            ? 'TREND_REACHED_REVIEW_REQUIRED'
            : scaleReached
              ? 'SCALE_ONLY_REACHED'
              : completionTrendSupported
                ? 'TARGET_NOT_REACHED'
                : 'INSUFFICIENT_TREND',
    }),
  };
}
