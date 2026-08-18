import type {
  EnergyBalanceAggregation,
  EnergyBalanceExplanation,
  EnergyBalancePoint,
  EnergyBalanceRange,
  EnergyBalanceRangePreset,
  EnergyBalanceReasonCode,
  EnergyBalanceSummary,
} from '../schemas/energy-balance.js';
import { ADAPTIVE_TDEE_CONSTANTS, addCalendarDays, calendarDaysBetween } from './adaptive-tdee.js';

const RANGE_DAYS: Record<Exclude<EnergyBalanceRangePreset, 'all'>, number> = {
  '1w': 7,
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
};

const NEAR_BALANCE_KCAL = 25;
const RECONCILIATION_TOLERANCE_KG = 0.1;

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

const average = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

const roundForTransport = (value: number): number => Math.round(value * 10_000) / 10_000;

type ModeledEnergyBalancePoint = EnergyBalancePoint & { intakeKcal: number };
type TargetMatchedEnergyBalancePoint = ModeledEnergyBalancePoint & { targetKcal: number };
type ExpenditureMatchedEnergyBalancePoint = ModeledEnergyBalancePoint & {
  expenditureKcal: number;
};
type TrendEnergyBalancePoint = EnergyBalancePoint & { trendWeightKg: number };

export function resolveEnergyBalanceAggregation(
  preset: EnergyBalanceRangePreset,
  requested: EnergyBalanceAggregation | 'auto',
): EnergyBalanceAggregation {
  if (requested !== 'auto') return requested;
  if (preset === '1w' || preset === '1m') return 'daily';
  if (preset === '3m' || preset === '6m') return 'weekly';
  return 'monthly';
}

export function resolveEnergyBalanceRange(input: {
  preset: EnergyBalanceRangePreset;
  endDate: string;
  firstAvailableDate: string;
  aggregation: EnergyBalanceAggregation | 'auto';
}): EnergyBalanceRange {
  const startDate =
    input.preset === 'all'
      ? input.firstAvailableDate > input.endDate
        ? input.endDate
        : input.firstAvailableDate
      : addCalendarDays(input.endDate, -(RANGE_DAYS[input.preset] - 1));

  return {
    preset: input.preset,
    startDate,
    endDate: input.endDate,
    aggregation: resolveEnergyBalanceAggregation(input.preset, input.aggregation),
    calendarDays: calendarDaysBetween(startDate, input.endDate) + 1,
  };
}

const getMonday = (date: string) => {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addCalendarDays(date, -((day + 6) % 7));
};

const getPeriodKey = (date: string, aggregation: EnergyBalanceAggregation) => {
  if (aggregation === 'daily') return date;
  if (aggregation === 'weekly') return getMonday(date);
  return `${date.slice(0, 7)}-01`;
};

const aggregatePointGroup = (points: readonly EnergyBalancePoint[]): EnergyBalancePoint => {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) throw new Error('Energy balance aggregation requires at least one point');

  const modeled = points.filter(
    (point): point is ModeledEnergyBalancePoint =>
      point.includedInBalance && point.intakeKcal !== null,
  );
  const latestTrend = [...points].reverse().find((point) => point.trendWeightKg !== null);
  const statuses = unique(points.map((point) => point.nutritionStatus));
  const sourceStatuses = unique(
    points
      .map((point) => point.sourceNutritionStatus)
      .filter((status): status is NonNullable<typeof status> => status !== null),
  );
  const statePoint = last;
  const expenditurePoint = [...points].reverse().find((point) => point.expenditureKcal !== null);

  return {
    periodStart: first.periodStart,
    periodEnd: last.periodEnd,
    nutritionStatus: statuses.length === 1 ? (statuses[0] ?? 'mixed') : 'mixed',
    sourceNutritionStatus: sourceStatuses.length === 1 ? (sourceStatuses[0] ?? null) : null,
    nutritionLogIds: unique(points.flatMap((point) => point.nutritionLogIds)),
    loggedIntakeKcal: average(
      points
        .map((point) => point.loggedIntakeKcal)
        .filter((value): value is number => value !== null),
    ),
    intakeKcal: average(modeled.map((point) => point.intakeKcal)),
    includedInBalance: modeled.length > 0,
    completeNutritionDays: points.reduce((sum, point) => sum + point.completeNutritionDays, 0),
    partialNutritionDays: points.reduce((sum, point) => sum + point.partialNutritionDays, 0),
    unknownNutritionDays: points.reduce((sum, point) => sum + point.unknownNutritionDays, 0),
    missingNutritionDays: points.reduce((sum, point) => sum + point.missingNutritionDays, 0),
    excludedNutritionDays: points.reduce((sum, point) => sum + point.excludedNutritionDays, 0),
    targetKcal: average(
      points.map((point) => point.targetKcal).filter((value): value is number => value !== null),
    ),
    targetIds: unique(points.flatMap((point) => point.targetIds)),
    expenditureKcal: average(
      points
        .map((point) => point.expenditureKcal)
        .filter((value): value is number => value !== null),
    ),
    trendWeightKg: latestTrend?.trendWeightKg ?? null,
    goalType: statePoint.goalType,
    state: statePoint.state,
    calculationState: statePoint.calculationState,
    calculationReasonCodes: unique(points.flatMap((point) => point.calculationReasonCodes)),
    reasonCodes: unique(points.flatMap((point) => point.reasonCodes)),
    expenditureSourceCheckInId: expenditurePoint?.expenditureSourceCheckInId ?? null,
    expenditureSourceInputFingerprint: expenditurePoint?.expenditureSourceInputFingerprint ?? null,
    stateSourceCheckInId: statePoint.stateSourceCheckInId,
    stateSourceInputFingerprint: statePoint.stateSourceInputFingerprint,
    sourceCheckInIds: unique(points.flatMap((point) => point.sourceCheckInIds)),
    sourceInputFingerprints: unique(points.flatMap((point) => point.sourceInputFingerprints)),
    goalRevisionIds: unique(points.flatMap((point) => point.goalRevisionIds)),
  };
};

export function aggregateEnergyBalancePoints(
  points: readonly EnergyBalancePoint[],
  aggregation: EnergyBalanceAggregation,
): EnergyBalancePoint[] {
  if (aggregation === 'daily') return [...points];
  const groups = new Map<string, EnergyBalancePoint[]>();
  for (const point of points) {
    const key = getPeriodKey(point.periodStart, aggregation);
    const group = groups.get(key) ?? [];
    group.push(point);
    groups.set(key, group);
  }
  return [...groups.values()].map(aggregatePointGroup);
}

const balanceReason = (value: number, axis: 'TARGET' | 'EXPENDITURE'): EnergyBalanceReasonCode => {
  const prefix = Math.abs(value) < NEAR_BALANCE_KCAL ? 'NEAR' : value > 0 ? 'ABOVE' : 'BELOW';
  return `INTAKE_${prefix}_${axis}` as EnergyBalanceReasonCode;
};

export function summarizeEnergyBalance(input: {
  points: readonly EnergyBalancePoint[];
  calendarDays: number;
  rangePreset: EnergyBalanceRangePreset;
}): EnergyBalanceSummary {
  const included = input.points.filter(
    (point): point is ModeledEnergyBalancePoint =>
      point.includedInBalance && point.intakeKcal !== null,
  );
  const targetMatched = included.filter(
    (point): point is TargetMatchedEnergyBalancePoint => point.targetKcal !== null,
  );
  const expenditureMatched = included.filter(
    (point): point is ExpenditureMatchedEnergyBalancePoint => point.expenditureKcal !== null,
  );
  const targetValues = input.points
    .map((point) => point.targetKcal)
    .filter((value): value is number => value !== null);
  const expenditureValues = input.points
    .map((point) => point.expenditureKcal)
    .filter((value): value is number => value !== null);
  const intakeMinusTarget = targetMatched.map((point) => point.intakeKcal - point.targetKcal);
  const trendPoints = input.points.filter(
    (point): point is TrendEnergyBalancePoint => point.trendWeightKg !== null,
  );
  const firstTrend = trendPoints[0];
  const lastTrend = trendPoints.at(-1);
  const hasObservedInterval =
    firstTrend !== undefined &&
    lastTrend !== undefined &&
    firstTrend.periodStart !== lastTrend.periodStart;
  const observed = hasObservedInterval ? lastTrend.trendWeightKg - firstTrend.trendWeightKg : null;
  // A Trend Weight change from A to B spans the half-open date interval [A, B).
  // Intake on B occurs after the observation ending at B and must not contribute.
  const reconciliationPoints = hasObservedInterval
    ? expenditureMatched.filter(
        (point) =>
          point.periodStart >= firstTrend.periodStart && point.periodStart < lastTrend.periodStart,
      )
    : [];
  const reconciliationDifferences = reconciliationPoints.map(
    (point) => point.intakeKcal - point.expenditureKcal,
  );
  const intakeMinusExpenditure = expenditureMatched.map(
    (point) => point.intakeKcal - point.expenditureKcal,
  );
  const predicted =
    reconciliationPoints.length === 0
      ? null
      : reconciliationDifferences.reduce((sum, value) => sum + value, 0) /
        ADAPTIVE_TDEE_CONSTANTS.energyDensityKcalPerKg;
  const observedIntervalDays = hasObservedInterval
    ? calendarDaysBetween(firstTrend.periodStart, lastTrend.periodStart)
    : 0;
  const reconciliationDates = new Set(reconciliationPoints.map((point) => point.periodStart));
  const reconciliationComparable =
    observed !== null &&
    predicted !== null &&
    reconciliationPoints.length === observedIntervalDays &&
    reconciliationDates.size === observedIntervalDays;

  const reasonCodes: EnergyBalanceReasonCode[] = [];
  if (included.length === 0) reasonCodes.push('NO_COMPLETE_NUTRITION');
  if (targetMatched.length === 0) reasonCodes.push('NO_TARGET_DATA');
  if (expenditureValues.length === 0) reasonCodes.push('NO_EXPENDITURE_DATA');
  if (observed === null) reasonCodes.push('INSUFFICIENT_TREND_DATA');
  if (input.rangePreset === '1w') reasonCodes.push('SHORT_WINDOW_NOISY');
  if (observed !== null && predicted !== null && !reconciliationComparable) {
    reasonCodes.push('INCOMPLETE_RECONCILIATION_COVERAGE');
  }

  const averageTargetDifference = average(intakeMinusTarget);
  const averageExpenditureDifference = average(intakeMinusExpenditure);
  if (averageTargetDifference !== null) {
    reasonCodes.push(balanceReason(averageTargetDifference, 'TARGET'));
  }
  if (averageExpenditureDifference !== null) {
    reasonCodes.push(balanceReason(averageExpenditureDifference, 'EXPENDITURE'));
  }
  if (reconciliationComparable && observed !== null && predicted !== null) {
    reasonCodes.push(
      Math.abs(observed - predicted) <= RECONCILIATION_TOLERANCE_KG
        ? 'PREDICTION_OBSERVED_ALIGNED'
        : 'PREDICTION_OBSERVED_DIVERGED',
    );
  }

  return {
    averageIntakeKcal: average(included.map((point) => point.intakeKcal)),
    averageExpenditureKcal: average(expenditureValues),
    averageTargetKcal: average(targetValues),
    averageIntakeMinusTargetKcal: averageTargetDifference,
    intakeTargetComparableDays: targetMatched.length,
    averageIntakeMinusExpenditureKcal: averageExpenditureDifference,
    intakeExpenditureComparableDays: expenditureMatched.length,
    completeNutritionDays: included.length,
    excludedNutritionDays: input.points.length - included.length,
    coverageRatio: input.calendarDays === 0 ? 0 : included.length / input.calendarDays,
    predictedWeightChangeKg: predicted === null ? null : roundForTransport(predicted),
    predictedModeledDays: reconciliationPoints.length,
    observedTrendWeightChangeKg: observed === null ? null : roundForTransport(observed),
    observedTrendStartDate: hasObservedInterval ? firstTrend.periodStart : null,
    observedTrendEndDate: hasObservedInterval ? lastTrend.periodStart : null,
    reconciliationComparable,
    reasonCodes: unique(reasonCodes),
  };
}

const phraseDifference = (value: number | null, noun: string) => {
  if (value === null) return `not enough matched data to compare with ${noun}`;
  if (Math.abs(value) < NEAR_BALANCE_KCAL) return `near ${noun}`;
  return `${Math.abs(Math.round(value))} kcal ${value > 0 ? 'above' : 'below'} ${noun}`;
};

export function explainEnergyBalance(summary: EnergyBalanceSummary): EnergyBalanceExplanation {
  if (summary.averageIntakeKcal === null) {
    return {
      headline: 'Complete nutrition days will unlock your energy balance',
      detail:
        'Partial, unknown, missing, and cutoff-excluded days stay visible, but they are never treated as zero or used in the calculation.',
      reasonCodes: summary.reasonCodes,
    };
  }

  return {
    headline: `Your logged intake averaged ${Math.round(summary.averageIntakeKcal)} kcal`,
    detail: `Across matched complete days, that was ${phraseDifference(summary.averageIntakeMinusTargetKcal, 'target')} and ${phraseDifference(summary.averageIntakeMinusExpenditureKcal, 'expenditure')}. Missing days are not estimated.`,
    reasonCodes: summary.reasonCodes,
  };
}
