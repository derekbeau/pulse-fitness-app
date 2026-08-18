import {
  adaptiveCurrentTargetSchema,
  adaptiveCheckInKindSchema,
  adaptiveNutritionDaySchema,
  adaptivePriorTdeeSchema,
  adaptiveProgramCalculationSchema,
  adaptiveTdeeConstantsSchema,
  adaptiveWeightEntrySchema,
  type AdaptiveActivityLevel,
  type AdaptiveCheckInKind,
  type AdaptiveCheckInState,
  type AdaptiveConfidenceLabel,
  type AdaptiveCurrentTarget,
  type AdaptiveGoalType,
  type AdaptiveGoalSnapshot,
  type AdaptiveNutritionDay,
  type AdaptivePriorTdee,
  type AdaptiveProgramCalculation,
  type AdaptiveReadinessNoteCode,
  type AdaptiveReasonCode,
  type AdaptiveRmrEquation,
  type AdaptiveTdeeConstants,
  type AdaptiveWeightEntry,
} from '../schemas/adaptive-nutrition.js';
import { convertWeightFromKg, convertWeightToKg, POUNDS_TO_KILOGRAMS } from './weight-unit.js';

export { convertWeightFromKg, convertWeightToKg };

const DAY_MS = 86_400_000;
const ROUNDING_EPSILON = 1e-9;

function valueAt<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined) {
    throw new AdaptiveTdeeConfigurationError(
      'INVALID_PROGRAM_CONFIGURATION',
      `Missing ${label} at index ${index}`,
    );
  }
  return value;
}

function numberAt(values: readonly number[], index: number): number {
  return values[index] ?? 0;
}

export const ADAPTIVE_TDEE_CONSTANTS: Readonly<AdaptiveTdeeConstants> = Object.freeze({
  algorithmVersion: 'adaptive-tdee-v1',
  poundsToKilograms: POUNDS_TO_KILOGRAMS,
  activityMultipliers: Object.freeze({
    sedentary: 1.2,
    low_active: 1.375,
    active: 1.55,
    very_active: 1.725,
  }),
  energyDensityKcalPerKg: 7700,
  ewmaHalfLifeDays: 7,
  analysisDays: 21,
  warmupDays: 21,
  minimumCompleteNutritionDays: 12,
  minimumActualWeights: 3,
  minimumWeightSpanDays: 14,
  maximumWeightAgeDays: 7,
  minimumTrendPoints: 14,
  suspectAdjacentMaximumDays: 3,
  suspectWeightChangeFraction: 0.05,
  suspectMedianWindowDays: 7,
  suspectReturnFraction: 0.02,
  weightFrequencyFullCount: 7,
  recencyFullDays: 2,
  recencyDecayDays: 5,
  nutritionConfidenceWeight: 0.55,
  weightFrequencyConfidenceWeight: 0.2,
  weightSpanConfidenceWeight: 0.15,
  recencyConfidenceWeight: 0.1,
  estimatedRmrMinimumFraction: 0.8,
  estimatedRmrMaximumMultiple: 3,
  manualObservedTdeeMinimumKcal: 800,
  manualObservedTdeeMaximumKcal: 8000,
  maximumAdaptiveChangeKcal: 150,
  adaptiveStepFraction: 0.35,
  minimumLossCaloriesFraction: 0.75,
  absoluteCalorieFloorKcal: 1200,
  goalToleranceAbsoluteKg: 0.23,
  goalToleranceFraction: 0.0025,
  calorieRoundingIncrement: 10,
  macroFatRoundingIncrement: 5,
  proteinCaloriesPerGram: 4,
  carbohydrateCaloriesPerGram: 4,
  fatCaloriesPerGram: 9,
});

export const ADAPTIVE_ACTIVITY_MULTIPLIERS: Readonly<Record<AdaptiveActivityLevel, number>> =
  ADAPTIVE_TDEE_CONSTANTS.activityMultipliers;

export interface AdaptiveDateBoundaries {
  previewDate: string;
  analysisStart: string;
  analysisEnd: string;
  warmupStart: string;
}

export interface InterpolatedWeightPoint {
  date: string;
  weightKg: number;
  sourceEntryId: string | null;
  interpolated: boolean;
}

export interface TrendWeightPoint extends InterpolatedWeightPoint {
  trendWeightKg: number;
}

export interface AdaptiveEligibilityResult {
  eligible: boolean;
  holdReasons: AdaptiveReasonCode[];
  suspectWeightEntryIds: string[];
  suspectWeightEntries: Array<{ id: string; date: string }>;
  actualWeights: AdaptiveWeightEntry[];
  trendPoints: TrendWeightPoint[];
  usableNutritionDays: AdaptiveNutritionDay[];
  excludedIncompleteDays: number;
  excludedNutritionDates: string[];
  averageDailyIntakeKcal: number | null;
  actualWeightSpanDays: number;
  latestWeightAgeDays: number | null;
}

export interface AdaptiveReadinessEvidenceSummary {
  completeNutritionDaysLogged: number;
  completeNutritionDaysUsable: number;
  completeNutritionDaysBeforeWeightTrend: number;
  completeNutritionDaysAwaitingWeightTrend: number;
  completeNutritionDaysPendingCutoff: number;
  weighInsLogged: number;
  weighInsUsable: number;
  weighInsPendingCutoff: number;
  noteCodes: AdaptiveReadinessNoteCode[];
}

export interface AdaptiveConfidenceResult {
  score: number;
  label: AdaptiveConfidenceLabel;
  nutritionCoverage: number;
  weightFrequency: number;
  spanScore: number;
  recencyScore: number;
}

export interface AdaptiveTdeeUpdateResult {
  priorTdeeKcal: number;
  observedTdeeKcal: number;
  blendedTdeeKcal: number;
  requestedChangeKcal: number;
  limitedChangeKcal: number;
  proposedTdeeKcal: number;
  limited: boolean;
  reasonCodes: AdaptiveReasonCode[];
}

export interface AdaptiveGoalCaloriesResult {
  rawGoalCalories: number;
  goalCalories: number;
  desiredWeightChangeKgPerDay: number;
  requestedCalorieAdjustment: number;
  achievableGoalRatePctPerWeek: number;
  goalReached: boolean;
  reasonCodes: AdaptiveReasonCode[];
}

export interface AdaptiveMacroResult {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  macroCalories: number;
  calorieDifference: number;
}

export interface AdaptiveFingerprintInput {
  constants: AdaptiveTdeeConstants;
  program: AdaptiveProgramCalculation;
  priorTdee: AdaptivePriorTdee | null;
  currentTarget: AdaptiveCurrentTarget | null;
  boundaries: AdaptiveDateBoundaries;
  includeToday: boolean;
  nutritionDays: AdaptiveNutritionDay[];
  weightEntries: AdaptiveWeightEntry[];
  goal?: AdaptiveGoalSnapshot;
}

export interface AdaptiveRecommendationInput {
  localDate: string;
  includeToday: boolean;
  kind: AdaptiveCheckInKind;
  program: AdaptiveProgramCalculation;
  nutritionDays: AdaptiveNutritionDay[];
  weightEntries: AdaptiveWeightEntry[];
  priorTdee: AdaptivePriorTdee | null;
  currentTarget: AdaptiveCurrentTarget | null;
  constants?: AdaptiveTdeeConstants;
}

export interface AdaptiveRecommendationResult {
  algorithmVersion: 'adaptive-tdee-v1';
  inputFingerprint: string;
  kind: AdaptiveCheckInKind;
  state: AdaptiveCheckInState;
  boundaries: AdaptiveDateBoundaries;
  reasonCodes: AdaptiveReasonCode[];
  suspectWeightEntryIds: string[];
  suspectWeightEntries: Array<{ id: string; date: string }>;
  excludedNutritionDates: string[];
  completeNutritionDays: number;
  actualWeightCount: number;
  trendPointCount: number;
  averageDailyIntakeKcal: number | null;
  weightTrendKgPerDay: number | null;
  observedTdeeKcal: number | null;
  confidence: AdaptiveConfidenceResult | null;
  priorTdeeKcal: number;
  adaptiveUpdate: AdaptiveTdeeUpdateResult | null;
  latestTrendWeightKg: number | null;
  goal: AdaptiveGoalCaloriesResult | null;
  macros: AdaptiveMacroResult | null;
}

export class AdaptiveTdeeConfigurationError extends Error {
  readonly code: 'MACRO_CONFIGURATION_INFEASIBLE' | 'INVALID_PROGRAM_CONFIGURATION';

  constructor(
    code: 'MACRO_CONFIGURATION_INFEASIBLE' | 'INVALID_PROGRAM_CONFIGURATION',
    message: string,
  ) {
    super(message);
    this.name = 'AdaptiveTdeeConfigurationError';
    this.code = code;
  }
}

function parseDateParts(value: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new AdaptiveTdeeConfigurationError(
      'INVALID_PROGRAM_CONFIGURATION',
      `Invalid calendar date: ${value}`,
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const epoch = Date.UTC(year, month - 1, day);
  if (new Date(epoch).toISOString().slice(0, 10) !== value) {
    throw new AdaptiveTdeeConfigurationError(
      'INVALID_PROGRAM_CONFIGURATION',
      `Invalid calendar date: ${value}`,
    );
  }
  return [year, month, day];
}

function dateEpoch(value: string): number {
  const [year, month, day] = parseDateParts(value);
  return Date.UTC(year, month - 1, day);
}

export function addCalendarDays(value: string, days: number): string {
  return new Date(dateEpoch(value) + days * DAY_MS).toISOString().slice(0, 10);
}

export function calendarDaysBetween(earlier: string, later: string): number {
  return Math.round((dateEpoch(later) - dateEpoch(earlier)) / DAY_MS);
}

export function calculateAdaptiveDateBoundaries(
  localDate: string,
  includeToday: boolean,
  constants: AdaptiveTdeeConstants = ADAPTIVE_TDEE_CONSTANTS,
): AdaptiveDateBoundaries {
  parseDateParts(localDate);
  const analysisEnd = includeToday ? localDate : addCalendarDays(localDate, -1);
  const analysisStart = addCalendarDays(analysisEnd, -(constants.analysisDays - 1));
  return {
    previewDate: localDate,
    analysisStart,
    analysisEnd,
    warmupStart: addCalendarDays(analysisStart, -constants.warmupDays),
  };
}

export function calculateAgeOnDate(birthDate: string, onDate: string): number {
  const [birthYear, birthMonth, birthDay] = parseDateParts(birthDate);
  const [onYear, onMonth, onDay] = parseDateParts(onDate);
  if (birthDate > onDate) {
    throw new AdaptiveTdeeConfigurationError(
      'INVALID_PROGRAM_CONFIGURATION',
      'Birth date cannot be after the calculation date',
    );
  }
  const birthdayOccurred = onMonth > birthMonth || (onMonth === birthMonth && onDay >= birthDay);
  return onYear - birthYear - (birthdayOccurred ? 0 : 1);
}

export function calculateMifflinRmr(input: {
  equation: Exclude<AdaptiveRmrEquation, 'manual_tdee'>;
  weightKg: number;
  heightCm: number;
  ageYears: number;
}): number {
  const sexConstant = input.equation === 'mifflin_male' ? 5 : -161;
  return 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears + sexConstant;
}

export function calculateBaselineTdee(input: {
  equation: AdaptiveRmrEquation;
  weightKg: number;
  heightCm: number | null;
  birthDate: string | null;
  activityLevel: AdaptiveActivityLevel | null;
  manualBaselineTdeeKcal: number | null;
  calculationDate: string;
}): {
  estimatedRmrKcal: number | null;
  activityMultiplier: number | null;
  calculatedBaselineTdeeKcal: number | null;
  baselineTdeeKcal: number;
} {
  if (
    input.manualBaselineTdeeKcal !== null &&
    (!Number.isFinite(input.manualBaselineTdeeKcal) ||
      input.manualBaselineTdeeKcal < 800 ||
      input.manualBaselineTdeeKcal > 8000)
  ) {
    throw new AdaptiveTdeeConfigurationError(
      'INVALID_PROGRAM_CONFIGURATION',
      'Manual baseline TDEE must be between 800 and 8000 kcal',
    );
  }
  if (input.equation === 'manual_tdee') {
    if (input.manualBaselineTdeeKcal === null) {
      throw new AdaptiveTdeeConfigurationError(
        'INVALID_PROGRAM_CONFIGURATION',
        'Manual mode requires a manual baseline TDEE',
      );
    }
    return {
      estimatedRmrKcal: null,
      activityMultiplier: null,
      calculatedBaselineTdeeKcal: null,
      baselineTdeeKcal: Math.round(input.manualBaselineTdeeKcal),
    };
  }

  if (input.heightCm === null || input.birthDate === null || input.activityLevel === null) {
    throw new AdaptiveTdeeConfigurationError(
      'INVALID_PROGRAM_CONFIGURATION',
      'Mifflin-St Jeor requires height, birth date, and activity level',
    );
  }
  const estimatedRmrKcal = calculateMifflinRmr({
    equation: input.equation,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    ageYears: calculateAgeOnDate(input.birthDate, input.calculationDate),
  });
  const activityMultiplier = ADAPTIVE_ACTIVITY_MULTIPLIERS[input.activityLevel];
  const calculatedBaselineTdeeKcal = estimatedRmrKcal * activityMultiplier;
  return {
    estimatedRmrKcal,
    activityMultiplier,
    calculatedBaselineTdeeKcal,
    baselineTdeeKcal: Math.round(input.manualBaselineTdeeKcal ?? calculatedBaselineTdeeKcal),
  };
}

function compareDateAndId<T extends { date: string; id: string }>(left: T, right: T): number {
  if (left.date !== right.date) return left.date < right.date ? -1 : 1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function selectLatestNutritionDayByDate(
  days: readonly AdaptiveNutritionDay[],
): AdaptiveNutritionDay[] {
  const latestByDate = new Map<string, AdaptiveNutritionDay>();
  for (const day of [...days].sort(compareDateAndId)) {
    const current = latestByDate.get(day.date);
    if (
      current === undefined ||
      day.updatedAt > current.updatedAt ||
      (day.updatedAt === current.updatedAt && day.id > current.id)
    ) {
      latestByDate.set(day.date, day);
    }
  }
  return [...latestByDate.values()].sort(compareDateAndId);
}

function isCompleteNutritionEvidence(day: AdaptiveNutritionDay): boolean {
  return (
    day.status === 'complete' &&
    day.itemCount > 0 &&
    day.calories > 0 &&
    Number.isFinite(day.calories)
  );
}

export function interpolateDailyWeights(
  entries: readonly AdaptiveWeightEntry[],
): InterpolatedWeightPoint[] {
  if (entries.length === 0) return [];
  const sorted = [...entries].sort(compareDateAndId);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index]?.date === sorted[index - 1]?.date) {
      throw new AdaptiveTdeeConfigurationError(
        'INVALID_PROGRAM_CONFIGURATION',
        `Multiple weight entries exist for ${sorted[index]?.date ?? 'the same date'}`,
      );
    }
  }

  const points: InterpolatedWeightPoint[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = valueAt(sorted, index, 'weight entry');
    const next = valueAt(sorted, index + 1, 'weight entry');
    const gap = calendarDaysBetween(current.date, next.date);
    if (index === 0) {
      points.push({
        date: current.date,
        weightKg: current.weightKg,
        sourceEntryId: current.id,
        interpolated: false,
      });
    }
    for (let offset = 1; offset < gap; offset += 1) {
      points.push({
        date: addCalendarDays(current.date, offset),
        weightKg: current.weightKg + ((next.weightKg - current.weightKg) * offset) / gap,
        sourceEntryId: null,
        interpolated: true,
      });
    }
    points.push({
      date: next.date,
      weightKg: next.weightKg,
      sourceEntryId: next.id,
      interpolated: false,
    });
  }
  if (sorted.length === 1) {
    const only = valueAt(sorted, 0, 'weight entry');
    points.push({
      date: only.date,
      weightKg: only.weightKg,
      sourceEntryId: only.id,
      interpolated: false,
    });
  }
  return points;
}

export function calculateEwma(values: readonly number[], halfLifeDays = 7): number[] {
  if (halfLifeDays <= 0 || !Number.isFinite(halfLifeDays)) {
    throw new AdaptiveTdeeConfigurationError(
      'INVALID_PROGRAM_CONFIGURATION',
      'EWMA half-life must be positive',
    );
  }
  if (values.length === 0) return [];
  const alpha = 1 - Math.exp(Math.log(0.5) / halfLifeDays);
  const result = [valueAt(values, 0, 'EWMA value')];
  for (let index = 1; index < values.length; index += 1) {
    result.push(
      alpha * valueAt(values, index, 'EWMA value') +
        (1 - alpha) * valueAt(result, index - 1, 'EWMA result'),
    );
  }
  return result;
}

export function calculateRegressionSlope(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const xMean = (values.length - 1) / 2;
  const yMean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    const xDelta = index - xMean;
    numerator += xDelta * (valueAt(values, index, 'regression value') - yMean);
    denominator += xDelta * xDelta;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (valueAt(sorted, middle - 1, 'median value') + valueAt(sorted, middle, 'median value')) / 2
    : valueAt(sorted, middle, 'median value');
}

export function detectSuspectWeightEntries(
  entries: readonly AdaptiveWeightEntry[],
  constants: AdaptiveTdeeConstants = ADAPTIVE_TDEE_CONSTANTS,
): string[] {
  const sorted = [...entries].sort(compareDateAndId);
  const suspectIds = new Set<string>();
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = valueAt(sorted, index - 1, 'weight entry');
    const current = valueAt(sorted, index, 'weight entry');
    if (
      calendarDaysBetween(previous.date, current.date) <= constants.suspectAdjacentMaximumDays &&
      Math.abs(current.weightKg - previous.weightKg) / previous.weightKg >
        constants.suspectWeightChangeFraction
    ) {
      suspectIds.add(current.id);
    }
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const candidate = valueAt(sorted, index, 'weight entry');
    const localWeights = sorted
      .filter(
        (entry) =>
          Math.abs(calendarDaysBetween(candidate.date, entry.date)) <=
          constants.suspectMedianWindowDays,
      )
      .map((entry) => entry.weightKg);
    if (localWeights.length < 3) continue;
    const localMedian = median(localWeights);
    const next = valueAt(sorted, index + 1, 'weight entry');
    if (
      Math.abs(candidate.weightKg - localMedian) / localMedian >
        constants.suspectWeightChangeFraction &&
      Math.abs(next.weightKg - localMedian) / localMedian <= constants.suspectReturnFraction
    ) {
      suspectIds.add(candidate.id);
    }
  }
  return [...suspectIds].sort();
}

function uniqueReasons(reasons: readonly AdaptiveReasonCode[]): AdaptiveReasonCode[] {
  return [...new Set(reasons)];
}

export function evaluateEligibility(input: {
  boundaries: AdaptiveDateBoundaries;
  nutritionDays: readonly AdaptiveNutritionDay[];
  weightEntries: readonly AdaptiveWeightEntry[];
  constants?: AdaptiveTdeeConstants;
}): AdaptiveEligibilityResult {
  const constants = input.constants ?? ADAPTIVE_TDEE_CONSTANTS;
  const actualWeights = input.weightEntries
    .filter(
      (entry) =>
        entry.date >= input.boundaries.warmupStart && entry.date <= input.boundaries.analysisEnd,
    )
    .sort(compareDateAndId);
  const holdReasons: AdaptiveReasonCode[] = [];
  const suspectWeightEntryIds = detectSuspectWeightEntries(actualWeights, constants);
  const suspectIdSet = new Set(suspectWeightEntryIds);
  const suspectWeightEntries = actualWeights
    .filter((entry) => suspectIdSet.has(entry.id))
    .map(({ id, date }) => ({ id, date }));

  if (actualWeights.length < constants.minimumActualWeights) {
    holdReasons.push('INSUFFICIENT_WEIGHT');
  }
  const actualWeightSpanDays =
    actualWeights.length > 1
      ? calendarDaysBetween(
          valueAt(actualWeights, 0, 'weight entry').date,
          valueAt(actualWeights, actualWeights.length - 1, 'weight entry').date,
        )
      : 0;
  if (
    actualWeights.length >= constants.minimumActualWeights &&
    actualWeightSpanDays < constants.minimumWeightSpanDays
  ) {
    holdReasons.push('INSUFFICIENT_WEIGHT_SPAN');
  }
  const latestWeightAgeDays =
    actualWeights.length > 0
      ? calendarDaysBetween(
          valueAt(actualWeights, actualWeights.length - 1, 'weight entry').date,
          input.boundaries.analysisEnd,
        )
      : null;
  if (latestWeightAgeDays !== null && latestWeightAgeDays > constants.maximumWeightAgeDays) {
    holdReasons.push('STALE_WEIGHT');
  }
  if (actualWeights.length > 0) {
    const earlyCoverageEnd = addCalendarDays(input.boundaries.analysisStart, 7);
    const lateCoverageStart = addCalendarDays(input.boundaries.analysisEnd, -7);
    if (
      !actualWeights.some((entry) => entry.date <= earlyCoverageEnd) ||
      !actualWeights.some((entry) => entry.date >= lateCoverageStart)
    ) {
      holdReasons.push('NO_OVERLAPPING_DATA');
    }
  }
  if (suspectWeightEntryIds.length > 0) {
    holdReasons.push('SUSPECT_WEIGHT_DATA');
  }

  const interpolated = interpolateDailyWeights(actualWeights);
  const smoothed = calculateEwma(
    interpolated.map((point) => point.weightKg),
    constants.ewmaHalfLifeDays,
  );
  const allTrendPoints = interpolated.map(
    (point, index): TrendWeightPoint => ({
      ...point,
      trendWeightKg: valueAt(smoothed, index, 'smoothed weight'),
    }),
  );
  const trendPoints = allTrendPoints.filter(
    (point) =>
      point.date >= input.boundaries.analysisStart && point.date <= input.boundaries.analysisEnd,
  );
  if (trendPoints.length < constants.minimumTrendPoints) {
    holdReasons.push('INSUFFICIENT_TREND_POINTS');
  }

  const firstTrendDate = trendPoints[0]?.date ?? null;
  const lastTrendDate = trendPoints.at(-1)?.date ?? null;
  const nutritionInAnalysis = selectLatestNutritionDayByDate(
    input.nutritionDays.filter(
      (day) =>
        day.date >= input.boundaries.analysisStart && day.date <= input.boundaries.analysisEnd,
    ),
  );
  const excludedIncompleteDays = nutritionInAnalysis.filter(
    (day) => day.status !== 'complete',
  ).length;
  const usableNutritionDays = nutritionInAnalysis
    .filter(
      (day) =>
        firstTrendDate !== null &&
        lastTrendDate !== null &&
        day.date >= firstTrendDate &&
        day.date <= lastTrendDate &&
        isCompleteNutritionEvidence(day),
    )
    .sort(compareDateAndId);
  const usableNutritionIds = new Set(usableNutritionDays.map((day) => day.id));
  const excludedNutritionDates = nutritionInAnalysis
    .filter(
      (day) =>
        firstTrendDate !== null &&
        lastTrendDate !== null &&
        day.date >= firstTrendDate &&
        day.date <= lastTrendDate &&
        !usableNutritionIds.has(day.id),
    )
    .map((day) => day.date)
    .sort();
  if (usableNutritionDays.length < constants.minimumCompleteNutritionDays) {
    holdReasons.push('INSUFFICIENT_NUTRITION');
  }
  if (
    trendPoints.length === 0 ||
    !nutritionInAnalysis.some(
      (day) =>
        firstTrendDate !== null &&
        lastTrendDate !== null &&
        day.date >= firstTrendDate &&
        day.date <= lastTrendDate,
    )
  ) {
    holdReasons.push('NO_OVERLAPPING_DATA');
  }

  const distinctHoldReasons = uniqueReasons(holdReasons);
  return {
    eligible: distinctHoldReasons.length === 0,
    holdReasons: distinctHoldReasons,
    suspectWeightEntryIds,
    suspectWeightEntries,
    actualWeights,
    trendPoints,
    usableNutritionDays,
    excludedIncompleteDays,
    excludedNutritionDates,
    averageDailyIntakeKcal:
      usableNutritionDays.length === 0
        ? null
        : usableNutritionDays.reduce((sum, day) => sum + day.calories, 0) /
          usableNutritionDays.length,
    actualWeightSpanDays,
    latestWeightAgeDays,
  };
}

export function summarizeAdaptiveReadinessEvidence(input: {
  boundaries: AdaptiveDateBoundaries;
  nutritionDays: readonly AdaptiveNutritionDay[];
  weightEntries: readonly AdaptiveWeightEntry[];
  eligibility: AdaptiveEligibilityResult;
}): AdaptiveReadinessEvidenceSummary {
  const completeNutritionDaysLogged = selectLatestNutritionDayByDate(
    input.nutritionDays.filter(
      (day) =>
        day.date >= input.boundaries.analysisStart &&
        day.date <= input.boundaries.previewDate &&
        isCompleteNutritionEvidence(day),
    ),
  );
  const completeNutritionDaysPendingCutoff = completeNutritionDaysLogged.filter(
    (day) => day.date > input.boundaries.analysisEnd,
  ).length;
  const completedCompleteNutritionDays = completeNutritionDaysLogged.filter(
    (day) => day.date <= input.boundaries.analysisEnd,
  );
  const loggedWeights = input.weightEntries
    .filter(
      (entry) =>
        entry.date >= input.boundaries.warmupStart && entry.date <= input.boundaries.previewDate,
    )
    .sort(compareDateAndId);
  const pendingWeights = loggedWeights.filter((entry) => entry.date > input.boundaries.analysisEnd);
  const prospectiveTrendPoints = interpolateDailyWeights([
    ...input.eligibility.actualWeights,
    ...pendingWeights,
  ]).filter(
    (point) =>
      point.date >= input.boundaries.analysisStart && point.date <= input.boundaries.previewDate,
  );
  const firstWeightTrendDate =
    input.eligibility.trendPoints[0]?.date ?? prospectiveTrendPoints[0]?.date ?? null;
  const usableNutritionIds = new Set(input.eligibility.usableNutritionDays.map((day) => day.id));
  const completeNutritionDaysBeforeWeightTrend = completedCompleteNutritionDays.filter(
    (day) => firstWeightTrendDate !== null && day.date < firstWeightTrendDate,
  ).length;
  const completeNutritionDaysAwaitingWeightTrend = completedCompleteNutritionDays.filter(
    (day) =>
      !usableNutritionIds.has(day.id) &&
      (firstWeightTrendDate === null || day.date >= firstWeightTrendDate),
  ).length;
  const weighInsPendingCutoff = pendingWeights.length;
  const noteCodes: AdaptiveReadinessNoteCode[] = [];
  if (completeNutritionDaysPendingCutoff > 0) {
    noteCodes.push('COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF');
  }
  if (weighInsPendingCutoff > 0) {
    noteCodes.push('WEIGH_INS_PENDING_COMPLETED_DAY_CUTOFF');
  }
  if (completeNutritionDaysBeforeWeightTrend > 0) {
    noteCodes.push('COMPLETE_NUTRITION_BEFORE_WEIGHT_TREND');
  }
  if (completeNutritionDaysAwaitingWeightTrend > 0) {
    noteCodes.push('COMPLETE_NUTRITION_AWAITING_WEIGHT_TREND');
  }

  return {
    completeNutritionDaysLogged: completeNutritionDaysLogged.length,
    completeNutritionDaysUsable: input.eligibility.usableNutritionDays.length,
    completeNutritionDaysBeforeWeightTrend,
    completeNutritionDaysAwaitingWeightTrend,
    completeNutritionDaysPendingCutoff,
    weighInsLogged: loggedWeights.length,
    weighInsUsable: input.eligibility.actualWeights.length,
    weighInsPendingCutoff,
    noteCodes,
  };
}

export function calculateObservedTdee(
  averageDailyIntakeKcal: number,
  weightTrendKgPerDay: number,
  energyDensityKcalPerKg = ADAPTIVE_TDEE_CONSTANTS.energyDensityKcalPerKg,
): number {
  return averageDailyIntakeKcal - weightTrendKgPerDay * energyDensityKcalPerKg;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateConfidence(input: {
  completeNutritionDays: number;
  actualWeightCount: number;
  weightSpanDays: number;
  latestWeightAgeDays: number;
  analysisDays?: number;
  constants?: AdaptiveTdeeConstants;
}): AdaptiveConfidenceResult {
  const constants = input.constants ?? ADAPTIVE_TDEE_CONSTANTS;
  const analysisDays = input.analysisDays ?? constants.analysisDays;
  const nutritionCoverage = clamp(input.completeNutritionDays / analysisDays, 0, 1);
  const weightFrequency = clamp(input.actualWeightCount / constants.weightFrequencyFullCount, 0, 1);
  const spanScore = clamp(input.weightSpanDays / analysisDays, 0, 1);
  const recencyScore =
    input.latestWeightAgeDays <= constants.recencyFullDays
      ? 1
      : clamp(
          1 - (input.latestWeightAgeDays - constants.recencyFullDays) / constants.recencyDecayDays,
          0,
          1,
        );
  const score = clamp(
    constants.nutritionConfidenceWeight * nutritionCoverage +
      constants.weightFrequencyConfidenceWeight * weightFrequency +
      constants.weightSpanConfidenceWeight * spanScore +
      constants.recencyConfidenceWeight * recencyScore,
    0,
    1,
  );
  return {
    score,
    label: score < 0.6 ? 'Developing' : score < 0.8 ? 'Moderate' : 'High',
    nutritionCoverage,
    weightFrequency,
    spanScore,
    recencyScore,
  };
}

function roundToIncrement(value: number, increment: number): number {
  return Math.round((value + ROUNDING_EPSILON) / increment) * increment;
}

function ceilToIncrement(value: number, increment: number): number {
  return Math.ceil((value - ROUNDING_EPSILON) / increment) * increment;
}

export function calculateSystemCalorieFloor(
  baselineTdeeKcal: number,
  absoluteFloorKcal = ADAPTIVE_TDEE_CONSTANTS.absoluteCalorieFloorKcal,
): number {
  return Math.max(
    absoluteFloorKcal,
    roundToIncrement(baselineTdeeKcal * 0.6, ADAPTIVE_TDEE_CONSTANTS.calorieRoundingIncrement),
  );
}

export function calculateAdaptiveTdee(input: {
  priorTdeeKcal: number;
  observedTdeeKcal: number;
  confidence: number;
  constants?: AdaptiveTdeeConstants;
}): AdaptiveTdeeUpdateResult {
  const constants = input.constants ?? ADAPTIVE_TDEE_CONSTANTS;
  const blendedTdeeKcal =
    input.priorTdeeKcal + input.confidence * (input.observedTdeeKcal - input.priorTdeeKcal);
  const requestedChangeKcal =
    constants.adaptiveStepFraction * (blendedTdeeKcal - input.priorTdeeKcal);
  const limitedChangeKcal = clamp(
    requestedChangeKcal,
    -constants.maximumAdaptiveChangeKcal,
    constants.maximumAdaptiveChangeKcal,
  );
  const rounded = roundToIncrement(
    input.priorTdeeKcal + limitedChangeKcal,
    constants.calorieRoundingIncrement,
  );
  const minimumRounded = ceilToIncrement(
    input.priorTdeeKcal - constants.maximumAdaptiveChangeKcal,
    constants.calorieRoundingIncrement,
  );
  const maximumRounded =
    Math.floor(
      (input.priorTdeeKcal + constants.maximumAdaptiveChangeKcal + ROUNDING_EPSILON) /
        constants.calorieRoundingIncrement,
    ) * constants.calorieRoundingIncrement;
  const boundedRounded = clamp(rounded, minimumRounded, maximumRounded);
  const proposedTdeeKcal =
    Math.abs(boundedRounded - input.priorTdeeKcal) < 10 ? input.priorTdeeKcal : boundedRounded;
  const limited = Math.abs(limitedChangeKcal - requestedChangeKcal) > ROUNDING_EPSILON;
  return {
    priorTdeeKcal: input.priorTdeeKcal,
    observedTdeeKcal: input.observedTdeeKcal,
    blendedTdeeKcal,
    requestedChangeKcal,
    limitedChangeKcal,
    proposedTdeeKcal,
    limited,
    reasonCodes: limited ? ['TDEE_CHANGE_LIMIT_APPLIED'] : [],
  };
}

export function calculateGoalCalories(input: {
  goalType: AdaptiveGoalType;
  goalRatePctPerWeek: number;
  targetWeightKg: number | null;
  latestTrendWeightKg: number;
  adaptiveTdeeKcal: number;
  systemCalorieFloorKcal: number;
  userCalorieFloorKcal: number;
  constants?: AdaptiveTdeeConstants;
}): AdaptiveGoalCaloriesResult {
  const constants = input.constants ?? ADAPTIVE_TDEE_CONSTANTS;
  const toleranceKg =
    input.targetWeightKg === null
      ? 0
      : Math.max(
          constants.goalToleranceAbsoluteKg,
          input.targetWeightKg * constants.goalToleranceFraction,
        );
  const goalReached =
    input.targetWeightKg !== null &&
    ((input.goalType === 'lose' &&
      input.latestTrendWeightKg <= input.targetWeightKg + toleranceKg) ||
      (input.goalType === 'gain' &&
        input.latestTrendWeightKg >= input.targetWeightKg - toleranceKg));
  const effectiveGoalRate = goalReached ? 0 : input.goalRatePctPerWeek;
  const desiredWeightChangeKgPerDay = (input.latestTrendWeightKg * (effectiveGoalRate / 100)) / 7;
  const requestedCalorieAdjustment = desiredWeightChangeKgPerDay * constants.energyDensityKcalPerKg;
  const rawGoalCalories = input.adaptiveTdeeKcal + requestedCalorieAdjustment;
  const reasonCodes: AdaptiveReasonCode[] = goalReached ? ['GOAL_REACHED'] : [];
  let goalCalories: number;

  if (input.goalType === 'lose' && !goalReached) {
    const deficitMinimum = input.adaptiveTdeeKcal * constants.minimumLossCaloriesFraction;
    const configuredFloor = Math.max(
      constants.absoluteCalorieFloorKcal,
      input.systemCalorieFloorKcal,
      input.userCalorieFloorKcal,
    );
    const effectiveMinimum = Math.max(configuredFloor, deficitMinimum);
    if (rawGoalCalories < effectiveMinimum) {
      goalCalories = ceilToIncrement(effectiveMinimum, constants.calorieRoundingIncrement);
      reasonCodes.push('CALORIE_FLOOR_APPLIED');
      if (deficitMinimum >= configuredFloor - ROUNDING_EPSILON) {
        reasonCodes.push('DEFICIT_LIMIT_APPLIED');
      }
    } else {
      goalCalories = roundToIncrement(rawGoalCalories, constants.calorieRoundingIncrement);
    }
  } else {
    goalCalories = roundToIncrement(rawGoalCalories, constants.calorieRoundingIncrement);
  }

  const achievableGoalRatePctPerWeek =
    ((((goalCalories - input.adaptiveTdeeKcal) / constants.energyDensityKcalPerKg) * 7) /
      input.latestTrendWeightKg) *
    100;
  return {
    rawGoalCalories,
    goalCalories,
    desiredWeightChangeKgPerDay,
    requestedCalorieAdjustment,
    achievableGoalRatePctPerWeek,
    goalReached,
    reasonCodes: uniqueReasons(reasonCodes),
  };
}

export function allocateMacros(input: {
  goalCalories: number;
  proteinGrams: number;
  fatAllocationPct: number;
  constants?: AdaptiveTdeeConstants;
}): AdaptiveMacroResult {
  const constants = input.constants ?? ADAPTIVE_TDEE_CONSTANTS;
  const fat = roundToIncrement(
    (input.goalCalories * (input.fatAllocationPct / 100)) / constants.fatCaloriesPerGram,
    constants.macroFatRoundingIncrement,
  );
  const remainingCalories =
    input.goalCalories -
    input.proteinGrams * constants.proteinCaloriesPerGram -
    fat * constants.fatCaloriesPerGram;
  if (remainingCalories < 0) {
    throw new AdaptiveTdeeConfigurationError(
      'MACRO_CONFIGURATION_INFEASIBLE',
      'Protein and fat allocations exceed the calorie target',
    );
  }
  const startingCarbs = Math.round(remainingCalories / constants.carbohydrateCaloriesPerGram);
  const candidates = [startingCarbs - 1, startingCarbs, startingCarbs + 1].filter(
    (candidate) => candidate >= 0,
  );
  const carbs = candidates.reduce(
    (best, candidate) => {
      const bestDifference = Math.abs(
        input.proteinGrams * constants.proteinCaloriesPerGram +
          best * constants.carbohydrateCaloriesPerGram +
          fat * constants.fatCaloriesPerGram -
          input.goalCalories,
      );
      const candidateDifference = Math.abs(
        input.proteinGrams * constants.proteinCaloriesPerGram +
          candidate * constants.carbohydrateCaloriesPerGram +
          fat * constants.fatCaloriesPerGram -
          input.goalCalories,
      );
      return candidateDifference < bestDifference ? candidate : best;
    },
    valueAt(candidates, 0, 'carbohydrate candidate'),
  );
  const macroCalories =
    input.proteinGrams * constants.proteinCaloriesPerGram +
    carbs * constants.carbohydrateCaloriesPerGram +
    fat * constants.fatCaloriesPerGram;
  return {
    calories: input.goalCalories,
    protein: input.proteinGrams,
    carbs,
    fat,
    macroCalories,
    calorieDifference: input.goalCalories - macroCalories,
  };
}

function roundWeightForFingerprint(value: number): number {
  return Number(value.toFixed(8));
}

function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(objectValue[key])}`)
      .join(',')}}`;
  }
  throw new AdaptiveTdeeConfigurationError(
    'INVALID_PROGRAM_CONFIGURATION',
    'Fingerprint input contains an unsupported value',
  );
}

export function canonicalizeAdaptiveFingerprintInput(input: AdaptiveFingerprintInput): string {
  const constants = adaptiveTdeeConstantsSchema.parse(input.constants);
  const program = adaptiveProgramCalculationSchema.parse(input.program);
  const priorTdee =
    input.priorTdee === null ? null : adaptivePriorTdeeSchema.parse(input.priorTdee);
  const currentTarget =
    input.currentTarget === null ? null : adaptiveCurrentTargetSchema.parse(input.currentTarget);
  const nutritionDays = input.nutritionDays
    .map((day) => adaptiveNutritionDaySchema.parse(day))
    .filter(
      (day) =>
        day.date >= input.boundaries.analysisStart && day.date <= input.boundaries.analysisEnd,
    )
    .sort(compareDateAndId)
    .map(({ id, date, status, calories, itemCount, updatedAt }) => ({
      id,
      date,
      status,
      calories: status === 'complete' ? calories : null,
      itemCount,
      updatedAt,
    }));
  const weightEntries = input.weightEntries
    .map((entry) => adaptiveWeightEntrySchema.parse(entry))
    .filter(
      (entry) =>
        entry.date >= input.boundaries.warmupStart && entry.date <= input.boundaries.analysisEnd,
    )
    .sort(compareDateAndId)
    .map(({ id, date, weightKg, updatedAt }) => ({
      id,
      date,
      weightKg: roundWeightForFingerprint(weightKg),
      updatedAt,
    }));
  return canonicalize({
    boundaries: input.boundaries,
    constants,
    currentTarget,
    goal: input.goal ?? null,
    includeToday: input.includeToday,
    nutritionDays,
    priorTdee,
    program,
    weightEntries,
  });
}

function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return bytes;
}

const SHA256_INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];
const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotateRight(value: number, places: number): number {
  return (value >>> places) | (value << (32 - places));
}

export function sha256Hex(value: string): string {
  const bytes = utf8Bytes(value);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 0xff);

  const hash = [...SHA256_INITIAL];
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array<number>(64).fill(0);
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      words[index] =
        ((numberAt(bytes, base) << 24) |
          (numberAt(bytes, base + 1) << 16) |
          (numberAt(bytes, base + 2) << 8) |
          numberAt(bytes, base + 3)) >>>
        0;
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rotateRight(numberAt(words, index - 15), 7) ^
        rotateRight(numberAt(words, index - 15), 18) ^
        (numberAt(words, index - 15) >>> 3);
      const s1 =
        rotateRight(numberAt(words, index - 2), 17) ^
        rotateRight(numberAt(words, index - 2), 19) ^
        (numberAt(words, index - 2) >>> 10);
      words[index] = (numberAt(words, index - 16) + s0 + numberAt(words, index - 7) + s1) >>> 0;
    }

    let a = numberAt(hash, 0);
    let b = numberAt(hash, 1);
    let c = numberAt(hash, 2);
    let d = numberAt(hash, 3);
    let e = numberAt(hash, 4);
    let f = numberAt(hash, 5);
    let g = numberAt(hash, 6);
    let h = numberAt(hash, 7);
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 =
        (h + sum1 + choice + numberAt(SHA256_CONSTANTS, index) + numberAt(words, index)) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (numberAt(hash, 0) + a) >>> 0;
    hash[1] = (numberAt(hash, 1) + b) >>> 0;
    hash[2] = (numberAt(hash, 2) + c) >>> 0;
    hash[3] = (numberAt(hash, 3) + d) >>> 0;
    hash[4] = (numberAt(hash, 4) + e) >>> 0;
    hash[5] = (numberAt(hash, 5) + f) >>> 0;
    hash[6] = (numberAt(hash, 6) + g) >>> 0;
    hash[7] = (numberAt(hash, 7) + h) >>> 0;
  }
  return hash.map((word) => word.toString(16).padStart(8, '0')).join('');
}

export function createAdaptiveInputFingerprint(input: AdaptiveFingerprintInput): string {
  return sha256Hex(canonicalizeAdaptiveFingerprintInput(input));
}

function recommendationState(hasPrior: boolean, eligible: boolean): AdaptiveCheckInState {
  if (eligible) return 'updating';
  return hasPrior ? 'holding' : 'learning';
}

export function buildAdaptiveRecommendation(
  rawInput: AdaptiveRecommendationInput,
): AdaptiveRecommendationResult {
  const kind = adaptiveCheckInKindSchema.parse(rawInput.kind);
  if (kind === 'weekly' && rawInput.includeToday) {
    throw new AdaptiveTdeeConfigurationError(
      'INVALID_PROGRAM_CONFIGURATION',
      'Weekly check-ins cannot include the current local date',
    );
  }
  const constants = adaptiveTdeeConstantsSchema.parse(
    rawInput.constants ?? ADAPTIVE_TDEE_CONSTANTS,
  );
  const program = adaptiveProgramCalculationSchema.parse(rawInput.program);
  const nutritionDays = rawInput.nutritionDays.map((day) => adaptiveNutritionDaySchema.parse(day));
  const weightEntries = rawInput.weightEntries.map((entry) =>
    adaptiveWeightEntrySchema.parse(entry),
  );
  const priorTdee =
    rawInput.priorTdee === null ? null : adaptivePriorTdeeSchema.parse(rawInput.priorTdee);
  const currentTarget =
    rawInput.currentTarget === null
      ? null
      : adaptiveCurrentTargetSchema.parse(rawInput.currentTarget);
  const boundaries = calculateAdaptiveDateBoundaries(
    rawInput.localDate,
    rawInput.includeToday,
    constants,
  );
  const inputFingerprint = createAdaptiveInputFingerprint({
    constants,
    program,
    priorTdee,
    currentTarget,
    boundaries,
    includeToday: rawInput.includeToday,
    nutritionDays,
    weightEntries,
  });
  const eligibility = evaluateEligibility({ boundaries, nutritionDays, weightEntries, constants });
  const warnings: AdaptiveReasonCode[] = [];
  if (rawInput.includeToday) warnings.push('TODAY_INCLUDED');
  if (eligibility.excludedIncompleteDays > 0) warnings.push('EXCLUDED_INCOMPLETE_DAYS');
  const holdReasons = [...eligibility.holdReasons];
  if (program.status === 'paused') holdReasons.unshift('PROGRAM_PAUSED');
  const latestTrendWeightKg = eligibility.trendPoints.at(-1)?.trendWeightKg ?? null;
  if (latestTrendWeightKg === null) holdReasons.push('NO_CURRENT_WEIGHT');

  const priorTdeeKcal = priorTdee?.tdeeKcal ?? program.baselineTdeeKcal;
  const baseResult = {
    algorithmVersion: constants.algorithmVersion,
    inputFingerprint,
    kind,
    boundaries,
    suspectWeightEntryIds: eligibility.suspectWeightEntryIds,
    suspectWeightEntries: eligibility.suspectWeightEntries,
    excludedNutritionDates: eligibility.excludedNutritionDates,
    completeNutritionDays: eligibility.usableNutritionDays.length,
    actualWeightCount: eligibility.actualWeights.length,
    trendPointCount: eligibility.trendPoints.length,
    averageDailyIntakeKcal: eligibility.averageDailyIntakeKcal,
    priorTdeeKcal,
    latestTrendWeightKg,
  } as const;

  if (holdReasons.length > 0 || eligibility.averageDailyIntakeKcal === null) {
    return {
      ...baseResult,
      state: recommendationState(priorTdee !== null, false),
      reasonCodes: uniqueReasons([...holdReasons, ...warnings]),
      weightTrendKgPerDay: null,
      observedTdeeKcal: null,
      confidence: null,
      adaptiveUpdate: null,
      goal: null,
      macros: null,
    };
  }

  if (latestTrendWeightKg === null) {
    throw new AdaptiveTdeeConfigurationError(
      'INVALID_PROGRAM_CONFIGURATION',
      'Eligible recommendations require a current trend weight',
    );
  }

  const weightTrendKgPerDay = calculateRegressionSlope(
    eligibility.trendPoints.map((point) => point.trendWeightKg),
  );
  const observedTdeeKcal = calculateObservedTdee(
    eligibility.averageDailyIntakeKcal,
    weightTrendKgPerDay,
    constants.energyDensityKcalPerKg,
  );
  const estimatedRmr = program.estimatedRmrKcal;
  const implausible =
    estimatedRmr === null
      ? observedTdeeKcal < constants.manualObservedTdeeMinimumKcal ||
        observedTdeeKcal > constants.manualObservedTdeeMaximumKcal
      : observedTdeeKcal < constants.estimatedRmrMinimumFraction * estimatedRmr ||
        observedTdeeKcal > constants.estimatedRmrMaximumMultiple * estimatedRmr;
  if (implausible) {
    return {
      ...baseResult,
      state: recommendationState(priorTdee !== null, false),
      reasonCodes: uniqueReasons(['IMPLAUSIBLE_EXPENDITURE', ...warnings]),
      weightTrendKgPerDay,
      observedTdeeKcal,
      confidence: null,
      adaptiveUpdate: null,
      goal: null,
      macros: null,
    };
  }

  const confidence = calculateConfidence({
    completeNutritionDays: eligibility.usableNutritionDays.length,
    actualWeightCount: eligibility.actualWeights.length,
    weightSpanDays: eligibility.actualWeightSpanDays,
    latestWeightAgeDays: eligibility.latestWeightAgeDays ?? constants.maximumWeightAgeDays,
    analysisDays: constants.analysisDays,
    constants,
  });
  if (confidence.label === 'Developing') warnings.push('LOW_CONFIDENCE');
  const adaptiveUpdate = calculateAdaptiveTdee({
    priorTdeeKcal,
    observedTdeeKcal,
    confidence: confidence.score,
    constants,
  });
  const goal = calculateGoalCalories({
    goalType: program.goalType,
    goalRatePctPerWeek: program.goalRatePctPerWeek,
    targetWeightKg: program.targetWeightKg,
    latestTrendWeightKg,
    adaptiveTdeeKcal: adaptiveUpdate.proposedTdeeKcal,
    systemCalorieFloorKcal: program.systemCalorieFloorKcal,
    userCalorieFloorKcal: program.userCalorieFloorKcal,
    constants,
  });
  const macros = allocateMacros({
    goalCalories: goal.goalCalories,
    proteinGrams: program.proteinGrams,
    fatAllocationPct: program.fatAllocationPct,
    constants,
  });
  return {
    ...baseResult,
    state: recommendationState(priorTdee !== null, true),
    reasonCodes: uniqueReasons([...warnings, ...adaptiveUpdate.reasonCodes, ...goal.reasonCodes]),
    weightTrendKgPerDay,
    observedTdeeKcal,
    confidence,
    adaptiveUpdate,
    goal,
    macros,
  };
}
