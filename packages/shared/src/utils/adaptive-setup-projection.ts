import type { AdaptiveGoalType, AdaptiveReasonCode } from '../schemas/adaptive-nutrition.js';
import type { WeightUnit } from '../schemas/users.js';
import {
  AdaptiveTdeeConfigurationError,
  addCalendarDays,
  allocateMacros,
  calculateGoalCalories,
  type AdaptiveGoalCaloriesResult,
  type AdaptiveMacroResult,
} from './adaptive-tdee.js';
import { convertWeightFromKg, POUNDS_TO_KILOGRAMS } from './weight-unit.js';

export type AdaptiveSetupRateStatus = 'recommended' | 'caution' | 'maintenance' | 'invalid';
export type AdaptiveProteinPreset = 'moderate' | 'recommended' | 'high' | 'custom';
export type AdaptiveFatPreference = 'higher_carb' | 'balanced' | 'higher_fat' | 'custom';

type GoalRateRule = {
  allowedMaximumPct: number;
  allowedMinimumPct: number;
  defaultPct: number;
  presets: ReadonlyArray<{ label: string; valuePct: number }>;
  recommendedMaximumPct: number;
  recommendedMinimumPct: number;
};

export const ADAPTIVE_SETUP_GOAL_RATE_RULES: Readonly<
  Record<Exclude<AdaptiveGoalType, 'maintain'>, GoalRateRule>
> = Object.freeze({
  gain: Object.freeze({
    allowedMaximumPct: 0.5,
    allowedMinimumPct: 0.1,
    defaultPct: 0.25,
    presets: Object.freeze([
      Object.freeze({ label: 'Conservative', valuePct: 0.1 }),
      Object.freeze({ label: 'Standard', valuePct: 0.25 }),
      Object.freeze({ label: 'Faster', valuePct: 0.35 }),
    ]),
    recommendedMaximumPct: 0.35,
    recommendedMinimumPct: 0.1,
  }),
  lose: Object.freeze({
    allowedMaximumPct: 1,
    allowedMinimumPct: 0.1,
    defaultPct: 0.5,
    presets: Object.freeze([
      Object.freeze({ label: 'Gradual', valuePct: 0.25 }),
      Object.freeze({ label: 'Standard', valuePct: 0.5 }),
      Object.freeze({ label: 'Faster', valuePct: 0.75 }),
    ]),
    recommendedMaximumPct: 0.75,
    recommendedMinimumPct: 0.25,
  }),
});

export const ADAPTIVE_SETUP_PROTEIN_MULTIPLIERS = Object.freeze({
  high: 2.2,
  moderate: 1.6,
  recommended: 1.8,
});

export const ADAPTIVE_SETUP_FAT_PREFERENCES: Readonly<
  Record<Exclude<AdaptiveFatPreference, 'custom'>, number>
> = Object.freeze({
  balanced: 30,
  higher_carb: 25,
  higher_fat: 35,
});

export interface AdaptiveSetupRateGuidance {
  allowedMaximumPct: number;
  allowedMinimumPct: number;
  label: 'Conservative' | 'Gradual' | 'Standard' | 'Faster' | 'Maintenance';
  recommendedMaximumPct: number;
  recommendedMinimumPct: number;
  status: AdaptiveSetupRateStatus;
}

export interface AdaptiveSetupProjectionInput {
  baselineTdeeKcal: number;
  calculationLocalDate: string;
  currentWeightKg: number;
  estimatedRmrKcal: number | null;
  fatAllocationPct: number;
  goalRatePctPerWeek: number;
  goalType: AdaptiveGoalType;
  proteinGrams: number;
  systemCalorieFloorKcal: number;
  targetWeightKg: number | null;
  userCalorieFloorKcal: number;
}

export interface AdaptiveSetupTimeline {
  completionLocalDate: string;
  displayWeeks: number;
  fractionalWeeks: number;
}

export interface AdaptiveSetupProjection {
  approximateMonthlyChangeKg: number;
  baselineTdeeKcal: number;
  carbohydrateCaloriesPct: number;
  endingWeightChangeKgPerWeek: number;
  estimatedRmrKcal: number | null;
  fatCaloriesPct: number;
  goal: AdaptiveGoalCaloriesResult;
  macros: AdaptiveMacroResult;
  proteinCaloriesPct: number;
  proteinGramsPerKg: number;
  proteinGramsPerPound: number;
  rateGuidance: AdaptiveSetupRateGuidance;
  rateIsGuardrailLimited: boolean;
  requestedGoalRatePctPerWeek: number;
  startingWeightChangeKgPerWeek: number;
  timeline: AdaptiveSetupTimeline | null;
  totalWeightChangeKg: number;
  warningCodes: Array<AdaptiveReasonCode | 'OUTSIDE_RECOMMENDED_RANGE'>;
}

export function calculateAdaptiveProteinPresets(weightKg: number): {
  high: number;
  moderate: number;
  recommended: number;
} {
  assertPositiveFinite(weightKg, 'Starting weight');
  return {
    high: roundToNearestFive(weightKg * ADAPTIVE_SETUP_PROTEIN_MULTIPLIERS.high),
    moderate: roundToNearestFive(weightKg * ADAPTIVE_SETUP_PROTEIN_MULTIPLIERS.moderate),
    recommended: roundToNearestFive(weightKg * ADAPTIVE_SETUP_PROTEIN_MULTIPLIERS.recommended),
  };
}

export function matchAdaptiveProteinPreset(
  weightKg: number,
  proteinGrams: number,
): AdaptiveProteinPreset {
  const presets = calculateAdaptiveProteinPresets(weightKg);
  if (proteinGrams === presets.moderate) return 'moderate';
  if (proteinGrams === presets.recommended) return 'recommended';
  if (proteinGrams === presets.high) return 'high';
  return 'custom';
}

export function classifyAdaptiveSetupGoalRate(
  goalType: AdaptiveGoalType,
  signedRatePctPerWeek: number,
): AdaptiveSetupRateGuidance {
  if (goalType === 'maintain') {
    return {
      allowedMaximumPct: 0,
      allowedMinimumPct: 0,
      label: 'Maintenance',
      recommendedMaximumPct: 0,
      recommendedMinimumPct: 0,
      status: signedRatePctPerWeek === 0 ? 'maintenance' : 'invalid',
    };
  }

  const rules = ADAPTIVE_SETUP_GOAL_RATE_RULES[goalType];
  const directionIsValid =
    goalType === 'lose' ? signedRatePctPerWeek < 0 : signedRatePctPerWeek > 0;
  const magnitude = Math.abs(signedRatePctPerWeek);
  const inAllowedRange =
    directionIsValid &&
    magnitude >= rules.allowedMinimumPct &&
    magnitude <= rules.allowedMaximumPct;
  const inRecommendedRange =
    inAllowedRange &&
    magnitude >= rules.recommendedMinimumPct &&
    magnitude <= rules.recommendedMaximumPct;

  let label: AdaptiveSetupRateGuidance['label'];
  if (goalType === 'gain') {
    label = magnitude <= 0.15 ? 'Conservative' : magnitude <= 0.3 ? 'Standard' : 'Faster';
  } else {
    label = magnitude <= 0.35 ? 'Gradual' : magnitude <= 0.65 ? 'Standard' : 'Faster';
  }

  return {
    allowedMaximumPct: rules.allowedMaximumPct,
    allowedMinimumPct: rules.allowedMinimumPct,
    label,
    recommendedMaximumPct: rules.recommendedMaximumPct,
    recommendedMinimumPct: rules.recommendedMinimumPct,
    status: !inAllowedRange ? 'invalid' : inRecommendedRange ? 'recommended' : 'caution',
  };
}

export function calculateAdaptiveSetupProjection(
  input: AdaptiveSetupProjectionInput,
): AdaptiveSetupProjection {
  assertPositiveFinite(input.currentWeightKg, 'Starting weight');
  assertPositiveFinite(input.baselineTdeeKcal, 'Baseline TDEE');
  assertPositiveFinite(input.proteinGrams, 'Protein');
  assertPositiveFinite(input.systemCalorieFloorKcal, 'System calorie floor');
  assertPositiveFinite(input.userCalorieFloorKcal, 'User calorie floor');
  if (!Number.isFinite(input.fatAllocationPct)) {
    invalid('Fat allocation must be finite');
  }
  if (input.userCalorieFloorKcal < input.systemCalorieFloorKcal) {
    invalid('User calorie floor cannot be below the system floor');
  }

  const rateGuidance = classifyAdaptiveSetupGoalRate(input.goalType, input.goalRatePctPerWeek);
  if (rateGuidance.status === 'invalid') {
    invalid('Goal rate does not match the selected goal or allowed range');
  }

  if (input.goalType !== 'maintain') {
    if (input.targetWeightKg === null) invalid('Directional goals require a target weight');
    assertPositiveFinite(input.targetWeightKg, 'Target weight');
    if (
      (input.goalType === 'gain' && input.targetWeightKg <= input.currentWeightKg) ||
      (input.goalType === 'lose' && input.targetWeightKg >= input.currentWeightKg)
    ) {
      invalid('Target weight must match the selected goal direction');
    }
  } else if (input.targetWeightKg !== null || input.goalRatePctPerWeek !== 0) {
    invalid('Maintenance requires no target and a zero weekly rate');
  }

  const goal = calculateGoalCalories({
    adaptiveTdeeKcal: input.baselineTdeeKcal,
    goalRatePctPerWeek: input.goalRatePctPerWeek,
    goalType: input.goalType,
    latestTrendWeightKg: input.currentWeightKg,
    systemCalorieFloorKcal: input.systemCalorieFloorKcal,
    targetWeightKg: input.targetWeightKg,
    userCalorieFloorKcal: input.userCalorieFloorKcal,
  });
  const macros = allocateMacros({
    fatAllocationPct: input.fatAllocationPct,
    goalCalories: goal.goalCalories,
    proteinGrams: input.proteinGrams,
  });
  const rateMagnitude = Math.abs(input.goalRatePctPerWeek) / 100;
  const endingWeight = input.targetWeightKg ?? input.currentWeightKg;
  const startingWeightChangeKgPerWeek = input.currentWeightKg * rateMagnitude;
  const endingWeightChangeKgPerWeek = endingWeight * rateMagnitude;
  const totalWeightChangeKg = Math.abs(endingWeight - input.currentWeightKg);
  const warningCodes: AdaptiveSetupProjection['warningCodes'] = [...goal.reasonCodes];
  if (rateGuidance.status === 'caution') warningCodes.push('OUTSIDE_RECOMMENDED_RANGE');

  let timeline: AdaptiveSetupTimeline | null = null;
  if (input.goalType !== 'maintain' && input.targetWeightKg !== null && !goal.goalReached) {
    const fractionalWeeks =
      input.goalType === 'gain'
        ? Math.log(input.targetWeightKg / input.currentWeightKg) / Math.log(1 + rateMagnitude)
        : Math.log(input.targetWeightKg / input.currentWeightKg) / Math.log(1 - rateMagnitude);
    if (!Number.isFinite(fractionalWeeks) || fractionalWeeks <= 0) {
      invalid('Goal duration could not be calculated from the selected inputs');
    }
    const elapsedCalendarDays = Math.ceil(fractionalWeeks * 7);
    timeline = {
      completionLocalDate: addCalendarDays(input.calculationLocalDate, elapsedCalendarDays),
      displayWeeks: Math.ceil(fractionalWeeks),
      fractionalWeeks,
    };
  }

  const calorieTarget = macros.calories;
  return {
    approximateMonthlyChangeKg: startingWeightChangeKgPerWeek * (52 / 12),
    baselineTdeeKcal: input.baselineTdeeKcal,
    carbohydrateCaloriesPct: (macros.carbs * 4 * 100) / calorieTarget,
    endingWeightChangeKgPerWeek,
    estimatedRmrKcal: input.estimatedRmrKcal,
    fatCaloriesPct: (macros.fat * 9 * 100) / calorieTarget,
    goal,
    macros,
    proteinCaloriesPct: (macros.protein * 4 * 100) / calorieTarget,
    proteinGramsPerKg: input.proteinGrams / input.currentWeightKg,
    proteinGramsPerPound: input.proteinGrams / (input.currentWeightKg / POUNDS_TO_KILOGRAMS),
    rateGuidance,
    rateIsGuardrailLimited:
      Math.abs(goal.achievableGoalRatePctPerWeek) + 0.001 < Math.abs(input.goalRatePctPerWeek),
    requestedGoalRatePctPerWeek: input.goalRatePctPerWeek,
    startingWeightChangeKgPerWeek,
    timeline,
    totalWeightChangeKg,
    warningCodes,
  };
}

export function convertAdaptiveSetupRateForDisplay(valueKg: number, unit: WeightUnit): number {
  return Number(convertWeightFromKg(valueKg, unit).toFixed(2));
}

export function getAdaptiveSetupLocalDate(instant: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    }).formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value;
    const date = `${value('year')}-${value('month')}-${value('day')}`;
    addCalendarDays(date, 0);
    return date;
  } catch {
    invalid(`Invalid IANA time zone: ${timeZone}`);
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) invalid(`${label} must be positive and finite`);
}

function invalid(message: string): never {
  throw new AdaptiveTdeeConfigurationError('INVALID_PROGRAM_CONFIGURATION', message);
}

function roundToNearestFive(value: number): number {
  return Math.round(value / 5) * 5;
}
