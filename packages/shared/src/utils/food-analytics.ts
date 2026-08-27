import type {
  FoodAnalyticsCurrentDefinition,
  FoodAnalyticsRange,
  FoodAnalyticsRangeResult,
  FoodDefinitionReviewReason,
} from '../schemas/food-analytics.js';
import { addChartCalendarDays } from './chart-exploration.js';

export const FOOD_MACRO_CALORIE_ABSOLUTE_TOLERANCE_KCAL = 10;
export const FOOD_MACRO_CALORIE_RELATIVE_TOLERANCE = 0.05;

export type FoodDefinitionFactsInput = {
  servingSize: string | null;
  servingGrams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  verified: boolean;
  source: string | null;
  notes: string | null;
  updatedAt: number;
};

export const calculateMacroDerivedCalories = (
  input: Pick<FoodDefinitionFactsInput, 'protein' | 'carbs' | 'fat'>,
) => input.protein * 4 + input.carbs * 4 + input.fat * 9;

export const calculateMacroCalorieTolerance = (statedCalories: number) =>
  Math.max(
    FOOD_MACRO_CALORIE_ABSOLUTE_TOLERANCE_KCAL,
    statedCalories * FOOD_MACRO_CALORIE_RELATIVE_TOLERANCE,
  );

export const calculateFoodCurrentDefinition = (
  input: FoodDefinitionFactsInput,
): FoodAnalyticsCurrentDefinition => {
  const macroDerivedCalories = calculateMacroDerivedCalories(input);
  const macroCalorieDifference = Math.abs(macroDerivedCalories - input.calories);

  return {
    servingSize: input.servingSize,
    servingGrams: input.servingGrams,
    calories: input.calories,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    fiber: input.fiber,
    sugar: input.sugar,
    proteinPer100Kcal: input.calories > 0 ? (input.protein * 100) / input.calories : null,
    caloriesPer100Grams:
      input.servingGrams === null ? null : (input.calories * 100) / input.servingGrams,
    macroDerivedCalories,
    macroCalorieDifference,
    macroCalorieTolerance: calculateMacroCalorieTolerance(input.calories),
    verified: input.verified,
    source: input.source,
    notes: input.notes,
    updatedAt: input.updatedAt,
  };
};

export const calculateFoodDefinitionReviewReasons = (
  input: FoodDefinitionFactsInput,
  linkedUsageOccurrences: number,
): FoodDefinitionReviewReason[] => {
  const currentDefinition = calculateFoodCurrentDefinition(input);
  const reasons: FoodDefinitionReviewReason[] = [];

  if (!input.verified) reasons.push('UNVERIFIED');
  if (!input.source?.trim()) reasons.push('SOURCE_MISSING');
  if (input.servingGrams === null) reasons.push('SERVING_GRAMS_MISSING');
  if (currentDefinition.macroCalorieDifference > currentDefinition.macroCalorieTolerance) {
    reasons.push('MACRO_CALORIE_MISMATCH');
  }
  if (linkedUsageOccurrences === 0) reasons.push('NO_LINKED_USAGE');

  return reasons;
};

export const resolveFoodAnalyticsRange = (
  kind: FoodAnalyticsRange,
  endDate: string,
  timeZone: string,
  todayDate: string,
  timeZoneSource: FoodAnalyticsRangeResult['timeZoneSource'] = 'request',
): FoodAnalyticsRangeResult => ({
  kind,
  startDate: kind === 'all' ? null : addChartCalendarDays(endDate, -(kind === '30d' ? 29 : 89)),
  endDate,
  calendarDays: kind === 'all' ? null : kind === '30d' ? 30 : 90,
  timeZone,
  timeZoneSource,
  isHistorical: endDate < todayDate,
});

export const calculatePercent = (numerator: number, denominator: number) =>
  denominator > 0 ? (numerator * 100) / denominator : null;

export const calculateProteinPer100Kcal = (protein: number, calories: number) =>
  calories > 0 ? (protein * 100) / calories : null;

export const normalizeObservedPortionUnit = (value: string) => value.trim().toLowerCase();
