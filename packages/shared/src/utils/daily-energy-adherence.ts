import type {
  DailyEnergyAdherenceState,
  DailyEnergyDataState,
  DailyEnergyReasonCode,
} from '../schemas/daily-energy-adherence.js';
import type { NutritionLogStatus } from '../schemas/nutrition.js';

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const roundCalories = (value: number | null): number | null =>
  value === null ? null : Math.round(value);

export interface DailyEnergyAdherenceCalculationInput {
  localDate: string;
  todayLocalDate: string;
  nutritionStatus: NutritionLogStatus | null;
  intakeKcal: number | null;
  targetKcal: number | null;
  expenditureKcal: number | null;
}

export interface DailyEnergyAdherenceCalculation {
  dataState: DailyEnergyDataState;
  intakeKcal: number | null;
  targetKcal: number | null;
  expenditureKcal: number | null;
  intakeMinusTargetKcal: number | null;
  intakeMinusExpenditureKcal: number | null;
  innerToleranceKcal: number | null;
  outerToleranceKcal: number | null;
  adherence: DailyEnergyAdherenceState | null;
  reasonCodes: DailyEnergyReasonCode[];
}

export function calculateDailyEnergyAdherence(
  input: DailyEnergyAdherenceCalculationInput,
): DailyEnergyAdherenceCalculation {
  const intakeKcal = roundCalories(input.intakeKcal);
  const targetKcal = roundCalories(input.targetKcal);
  const expenditureKcal = roundCalories(input.expenditureKcal);
  const innerToleranceKcal =
    targetKcal === null ? null : Math.round(clamp(targetKcal * 0.05, 100, 150));
  const outerToleranceKcal =
    targetKcal === null ? null : Math.round(clamp(targetKcal * 0.1, 250, 400));
  const intakeMinusTargetKcal =
    intakeKcal !== null && targetKcal !== null ? intakeKcal - targetKcal : null;
  const intakeMinusExpenditureKcal =
    intakeKcal !== null && expenditureKcal !== null ? intakeKcal - expenditureKcal : null;
  const reasonCodes: DailyEnergyReasonCode[] = [];
  let dataState: DailyEnergyDataState;

  if (input.localDate > input.todayLocalDate) {
    dataState = 'future';
    reasonCodes.push('FUTURE_DATE_NOT_GRADED');
  } else if (input.localDate === input.todayLocalDate) {
    if (input.nutritionStatus === 'complete') {
      dataState = 'pending_cutoff';
      reasonCodes.push('COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF');
    } else {
      dataState = 'in_progress';
      reasonCodes.push('CURRENT_DAY_IN_PROGRESS');
    }
  } else if (input.nutritionStatus === null) {
    dataState = 'missing';
    reasonCodes.push('MISSING_NUTRITION_NOT_GRADED');
  } else if (input.nutritionStatus === 'partial') {
    dataState = 'partial';
    reasonCodes.push('PARTIAL_NUTRITION_NOT_GRADED');
  } else if (input.nutritionStatus === 'unknown') {
    dataState = 'unknown';
    reasonCodes.push('UNKNOWN_NUTRITION_NOT_GRADED');
  } else if (targetKcal === null) {
    dataState = 'unavailable';
  } else {
    dataState = 'gradeable';
  }

  if (targetKcal === null) reasonCodes.push('NO_ACCEPTED_TARGET');
  if (expenditureKcal === null) reasonCodes.push('NO_ACCEPTED_EXPENDITURE');

  let adherence: DailyEnergyAdherenceState | null = null;
  if (
    dataState === 'gradeable' &&
    intakeMinusTargetKcal !== null &&
    innerToleranceKcal !== null &&
    outerToleranceKcal !== null
  ) {
    const absoluteDifference = Math.abs(intakeMinusTargetKcal);
    adherence =
      absoluteDifference <= innerToleranceKcal
        ? 'on_target'
        : absoluteDifference <= outerToleranceKcal
          ? 'near_target'
          : 'off_target';
  }

  return {
    dataState,
    intakeKcal,
    targetKcal,
    expenditureKcal,
    intakeMinusTargetKcal,
    intakeMinusExpenditureKcal,
    innerToleranceKcal,
    outerToleranceKcal,
    adherence,
    reasonCodes,
  };
}
