import {
  adaptiveGoalProgressSchema,
  adaptiveGoalRevisionSchema,
  adaptiveGoalSchema,
  type AdaptiveConfidenceLabel,
  type AdaptiveGoal,
  type AdaptiveGoalProgress,
  type AdaptiveGoalProjection,
  type AdaptiveGoalRevision,
} from '../schemas/adaptive-nutrition.js';
import { addCalendarDays, calculateRegressionSlope } from './adaptive-tdee.js';

export const ADAPTIVE_GOAL_PROGRESS_CONSTANTS = Object.freeze({
  maximumFreshWeightAgeDays: 7,
  minimumActualRateKgPerWeek: 0.01,
  flatRateKgPerWeek: 0.01,
  maintenanceMinimumRadiusKg: 0.68,
  maintenanceRadiusFraction: 0.01,
  maintenanceNearEdgeFraction: 0.8,
  desiredProjectionUncertaintyFraction: 0.1,
  actualProjectionUncertaintyFraction: 0.2,
  minimumProjectionUncertaintyDays: 7,
  onTrackMinimumFraction: 0.75,
  aheadMinimumFraction: 1.1,
});

export interface AdaptiveGoalTrendPoint {
  date: string;
  trendWeightKg: number;
}

export interface AdaptiveGoalProgressInput {
  goal: AdaptiveGoal;
  revision: AdaptiveGoalRevision;
  currentLocalDate: string;
  currentTrendWeightKg: number | null;
  latestScaleWeightKg: number | null;
  latestWeightAgeDays: number | null;
  confidence: AdaptiveConfidenceLabel | null;
  trendPoints: AdaptiveGoalTrendPoint[];
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

const unavailableProjection = (
  basis: AdaptiveGoalProjection['basis'],
  unavailableReason: NonNullable<AdaptiveGoalProjection['unavailableReason']>,
): AdaptiveGoalProjection => ({
  basis,
  weeks: null,
  projectedStartDate: null,
  projectedEndDate: null,
  unavailableReason,
});

export const calculateAdaptiveGoalProjectionRange = (
  basis: AdaptiveGoalProjection['basis'],
  currentLocalDate: string,
  remainingDistanceKg: number,
  rateKgPerWeek: number,
): AdaptiveGoalProjection => {
  const weeks = rateKgPerWeek === 0 ? 0 : remainingDistanceKg / Math.abs(rateKgPerWeek);
  const centerDays = Math.ceil(weeks * 7);
  const uncertaintyFraction =
    basis === 'desired'
      ? ADAPTIVE_GOAL_PROGRESS_CONSTANTS.desiredProjectionUncertaintyFraction
      : ADAPTIVE_GOAL_PROGRESS_CONSTANTS.actualProjectionUncertaintyFraction;
  const uncertaintyDays = Math.max(
    ADAPTIVE_GOAL_PROGRESS_CONSTANTS.minimumProjectionUncertaintyDays,
    Math.ceil(centerDays * uncertaintyFraction),
  );
  return {
    basis,
    weeks,
    projectedStartDate: addCalendarDays(
      currentLocalDate,
      Math.max(0, centerDays - uncertaintyDays),
    ),
    projectedEndDate: addCalendarDays(currentLocalDate, centerDays + uncertaintyDays),
    unavailableReason: null,
  };
};

const calculateActualRate = (points: readonly AdaptiveGoalTrendPoint[]): number | null => {
  if (points.length < 2) return null;
  return calculateRegressionSlope(points.map((point) => point.trendWeightKg)) * 7;
};

const directionForRate = (rate: number | null) => {
  if (rate === null) return 'insufficient_data' as const;
  if (Math.abs(rate) < ADAPTIVE_GOAL_PROGRESS_CONSTANTS.flatRateKgPerWeek) {
    return 'flat' as const;
  }
  return rate > 0 ? ('rising' as const) : ('falling' as const);
};

export function calculateAdaptiveGoalProgress(
  rawInput: AdaptiveGoalProgressInput,
): AdaptiveGoalProgress {
  const goal = adaptiveGoalSchema.parse(rawInput.goal);
  const revision = adaptiveGoalRevisionSchema.parse(rawInput.revision);
  if (revision.goalId !== goal.id || revision.userId !== goal.userId) {
    throw new Error('Goal revision does not belong to the goal');
  }

  const currentTrendWeightKg = rawInput.currentTrendWeightKg;
  const stale =
    rawInput.latestWeightAgeDays !== null &&
    rawInput.latestWeightAgeDays > ADAPTIVE_GOAL_PROGRESS_CONSTANTS.maximumFreshWeightAgeDays;
  const trendFreshness = currentTrendWeightKg === null ? 'missing' : stale ? 'stale' : 'fresh';
  const provenance =
    currentTrendWeightKg !== null
      ? stale
        ? 'stale_trend'
        : 'valid_trend'
      : rawInput.latestScaleWeightKg !== null
        ? 'scale_only'
        : 'no_usable_weight';
  const actualRateKgPerWeek = calculateActualRate(rawInput.trendPoints);
  const base = {
    goalId: goal.id,
    goalRevisionId: revision.id,
    revisionSequence: revision.sequence,
    startedLocalDate: goal.startedLocalDate,
    currentLocalDate: rawInput.currentLocalDate,
    currentTrendWeightKg,
    latestScaleWeightKg: rawInput.latestScaleWeightKg,
    actualRateKgPerWeek,
    trendFreshness,
    confidence: rawInput.confidence,
    provenance,
  } as const;

  if (goal.type === 'maintain') {
    const centerWeightKg = revision.maintenanceCenterKg;
    if (centerWeightKg === null) throw new Error('Maintenance goal requires a center weight');
    const rangeRadiusKg = Math.max(
      ADAPTIVE_GOAL_PROGRESS_CONSTANTS.maintenanceMinimumRadiusKg,
      centerWeightKg * ADAPTIVE_GOAL_PROGRESS_CONSTANTS.maintenanceRadiusFraction,
    );
    const rangeLowerKg = centerWeightKg - rangeRadiusKg;
    const rangeUpperKg = centerWeightKg + rangeRadiusKg;
    const signedDistanceFromCenterKg =
      currentTrendWeightKg === null ? null : currentTrendWeightKg - centerWeightKg;
    const absoluteDistance =
      signedDistanceFromCenterKg === null ? null : Math.abs(signedDistanceFromCenterKg);
    const rangeStatus =
      signedDistanceFromCenterKg === null
        ? ('insufficient_data' as const)
        : signedDistanceFromCenterKg < -rangeRadiusKg
          ? ('below' as const)
          : signedDistanceFromCenterKg > rangeRadiusKg
            ? ('above' as const)
            : absoluteDistance !== null &&
                absoluteDistance >=
                  rangeRadiusKg * ADAPTIVE_GOAL_PROGRESS_CONSTANTS.maintenanceNearEdgeFraction
              ? ('near_edge' as const)
              : ('within' as const);
    const observedPoints = rawInput.trendPoints.filter(
      (point) => point.date >= goal.startedLocalDate && point.date <= rawInput.currentLocalDate,
    );
    return adaptiveGoalProgressSchema.parse({
      kind: 'maintenance',
      ...base,
      type: goal.type,
      centerWeightKg,
      signedDistanceFromCenterKg,
      rangeRadiusKg,
      rangeLowerKg,
      rangeUpperKg,
      rangeStatus,
      daysWithinRange: observedPoints.filter(
        (point) => point.trendWeightKg >= rangeLowerKg && point.trendWeightKg <= rangeUpperKg,
      ).length,
      observedDays: observedPoints.length,
      trendDirection: directionForRate(actualRateKgPerWeek),
    });
  }

  const targetWeightKg = revision.targetWeightKg;
  if (targetWeightKg === null) throw new Error('Weight-change goal requires a target weight');
  const totalDistanceKg = Math.abs(targetWeightKg - goal.startTrendWeightKg);
  const completedDistanceKg =
    currentTrendWeightKg === null
      ? null
      : clamp(
          goal.type === 'lose'
            ? goal.startTrendWeightKg - currentTrendWeightKg
            : currentTrendWeightKg - goal.startTrendWeightKg,
          0,
          totalDistanceKg,
        );
  const remainingDistanceKg =
    completedDistanceKg === null ? null : Math.max(totalDistanceKg - completedDistanceKg, 0);
  const percentComplete =
    completedDistanceKg === null
      ? null
      : totalDistanceKg === 0
        ? 100
        : clamp((completedDistanceKg / totalDistanceKg) * 100, 0, 100);
  const desiredRateKgPerWeek =
    currentTrendWeightKg === null
      ? null
      : currentTrendWeightKg * (revision.goalRatePctPerWeek / 100);
  const towardGoal =
    actualRateKgPerWeek !== null &&
    (goal.type === 'lose' ? actualRateKgPerWeek < 0 : actualRateKgPerWeek > 0);
  const flat =
    actualRateKgPerWeek !== null &&
    Math.abs(actualRateKgPerWeek) < ADAPTIVE_GOAL_PROGRESS_CONSTANTS.flatRateKgPerWeek;
  const trajectory =
    actualRateKgPerWeek === null
      ? ('insufficient_data' as const)
      : flat
        ? ('flat' as const)
        : towardGoal
          ? ('toward_goal' as const)
          : ('away_from_goal' as const);
  let status: 'on_track' | 'ahead' | 'behind' | 'moving_away' | 'reached' | 'insufficient_data';
  if (remainingDistanceKg === 0) status = 'reached';
  else if (trajectory === 'insufficient_data') status = 'insufficient_data';
  else if (trajectory === 'away_from_goal') status = 'moving_away';
  else if (trajectory === 'flat' || desiredRateKgPerWeek === null) status = 'behind';
  else {
    const paceFraction = Math.abs(actualRateKgPerWeek ?? 0) / Math.abs(desiredRateKgPerWeek);
    status =
      paceFraction >= ADAPTIVE_GOAL_PROGRESS_CONSTANTS.aheadMinimumFraction
        ? 'ahead'
        : paceFraction >= ADAPTIVE_GOAL_PROGRESS_CONSTANTS.onTrackMinimumFraction
          ? 'on_track'
          : 'behind';
  }

  const desiredProjection =
    remainingDistanceKg === null || desiredRateKgPerWeek === null
      ? unavailableProjection('desired', 'INSUFFICIENT_TREND')
      : calculateAdaptiveGoalProjectionRange(
          'desired',
          rawInput.currentLocalDate,
          remainingDistanceKg,
          desiredRateKgPerWeek,
        );
  let actualProjection: AdaptiveGoalProjection;
  if (actualRateKgPerWeek === null) {
    actualProjection = unavailableProjection('actual', 'INSUFFICIENT_TREND');
  } else if (stale) {
    actualProjection = unavailableProjection('actual', 'STALE_WEIGHT');
  } else if (!towardGoal && !flat) {
    actualProjection = unavailableProjection('actual', 'MOVING_AWAY');
  } else if (
    flat ||
    Math.abs(actualRateKgPerWeek) < ADAPTIVE_GOAL_PROGRESS_CONSTANTS.minimumActualRateKgPerWeek
  ) {
    actualProjection = unavailableProjection('actual', 'RATE_TOO_SMALL');
  } else if (rawInput.confidence === null || rawInput.confidence === 'Developing') {
    actualProjection = unavailableProjection('actual', 'LOW_CONFIDENCE');
  } else if (remainingDistanceKg === null) {
    actualProjection = unavailableProjection('actual', 'INSUFFICIENT_TREND');
  } else {
    actualProjection = calculateAdaptiveGoalProjectionRange(
      'actual',
      rawInput.currentLocalDate,
      remainingDistanceKg,
      actualRateKgPerWeek,
    );
  }

  return adaptiveGoalProgressSchema.parse({
    kind: 'weight_change',
    ...base,
    type: goal.type,
    startTrendWeightKg: goal.startTrendWeightKg,
    targetWeightKg,
    totalDistanceKg,
    completedDistanceKg,
    remainingDistanceKg,
    percentComplete,
    desiredRatePctPerWeek: revision.goalRatePctPerWeek,
    desiredRateKgPerWeek,
    trajectory,
    status,
    desiredProjection,
    actualProjection,
  });
}
