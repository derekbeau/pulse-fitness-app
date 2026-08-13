import { z } from 'zod';

import { dateSchema } from './common.js';
import { nutritionLogStatusSchema } from './nutrition.js';

export const adaptiveTdeeAlgorithmVersionSchema = z.literal('adaptive-tdee-v1');
export const adaptiveProgramStatusSchema = z.enum(['active', 'paused']);
export const adaptiveRmrEquationSchema = z.enum(['mifflin_male', 'mifflin_female', 'manual_tdee']);
export const adaptiveActivityLevelSchema = z.enum([
  'sedentary',
  'low_active',
  'active',
  'very_active',
]);
export const adaptiveGoalTypeSchema = z.enum(['lose', 'maintain', 'gain']);
export const adaptiveCheckInKindSchema = z.enum(['baseline', 'weekly', 'manual']);
export const adaptiveCheckInStatusSchema = z.enum([
  'pending',
  'accepted',
  'declined',
  'superseded',
  'held',
]);
export const adaptiveCheckInStateSchema = z.enum(['baseline', 'learning', 'holding', 'updating']);
export const adaptiveConfidenceLabelSchema = z.enum(['Developing', 'Moderate', 'High']);

export const adaptiveReasonCodeSchema = z.enum([
  'INSUFFICIENT_NUTRITION',
  'INSUFFICIENT_WEIGHT',
  'INSUFFICIENT_WEIGHT_SPAN',
  'STALE_WEIGHT',
  'INSUFFICIENT_TREND_POINTS',
  'NO_OVERLAPPING_DATA',
  'SUSPECT_WEIGHT_DATA',
  'IMPLAUSIBLE_EXPENDITURE',
  'NO_CURRENT_WEIGHT',
  'PROGRAM_PAUSED',
  'LOW_CONFIDENCE',
  'CALORIE_FLOOR_APPLIED',
  'DEFICIT_LIMIT_APPLIED',
  'TDEE_CHANGE_LIMIT_APPLIED',
  'GOAL_REACHED',
  'TODAY_INCLUDED',
  'EXCLUDED_INCOMPLETE_DAYS',
  'SAME_DATE_TARGET_EXISTS',
]);

export const adaptiveTdeeConstantsSchema = z
  .object({
    algorithmVersion: adaptiveTdeeAlgorithmVersionSchema,
    poundsToKilograms: z.number().positive().finite(),
    activityMultipliers: z
      .object({
        sedentary: z.number().positive().finite(),
        low_active: z.number().positive().finite(),
        active: z.number().positive().finite(),
        very_active: z.number().positive().finite(),
      })
      .strict(),
    energyDensityKcalPerKg: z.number().positive().finite(),
    ewmaHalfLifeDays: z.number().positive().finite(),
    analysisDays: z.number().int().positive(),
    warmupDays: z.number().int().nonnegative(),
    minimumCompleteNutritionDays: z.number().int().positive(),
    minimumActualWeights: z.number().int().positive(),
    minimumWeightSpanDays: z.number().int().positive(),
    maximumWeightAgeDays: z.number().int().nonnegative(),
    minimumTrendPoints: z.number().int().positive(),
    suspectAdjacentMaximumDays: z.number().int().nonnegative(),
    suspectWeightChangeFraction: z.number().min(0).max(1).finite(),
    suspectMedianWindowDays: z.number().int().nonnegative(),
    suspectReturnFraction: z.number().min(0).max(1).finite(),
    weightFrequencyFullCount: z.number().positive().finite(),
    recencyFullDays: z.number().int().nonnegative(),
    recencyDecayDays: z.number().positive().finite(),
    nutritionConfidenceWeight: z.number().min(0).max(1).finite(),
    weightFrequencyConfidenceWeight: z.number().min(0).max(1).finite(),
    weightSpanConfidenceWeight: z.number().min(0).max(1).finite(),
    recencyConfidenceWeight: z.number().min(0).max(1).finite(),
    estimatedRmrMinimumFraction: z.number().positive().finite(),
    estimatedRmrMaximumMultiple: z.number().positive().finite(),
    manualObservedTdeeMinimumKcal: z.number().positive().finite(),
    manualObservedTdeeMaximumKcal: z.number().positive().finite(),
    maximumAdaptiveChangeKcal: z.number().positive().finite(),
    adaptiveStepFraction: z.number().min(0).max(1).finite(),
    minimumLossCaloriesFraction: z.number().min(0).max(1).finite(),
    absoluteCalorieFloorKcal: z.number().positive().finite(),
    goalToleranceAbsoluteKg: z.number().positive().finite(),
    goalToleranceFraction: z.number().positive().finite(),
    calorieRoundingIncrement: z.number().positive().finite(),
    macroFatRoundingIncrement: z.number().positive().finite(),
    proteinCaloriesPerGram: z.number().positive().finite(),
    carbohydrateCaloriesPerGram: z.number().positive().finite(),
    fatCaloriesPerGram: z.number().positive().finite(),
  })
  .strict();

const bodyWeightKgSchema = z.number().min(25).max(350).finite();
const calorieSchema = z.number().positive().finite();

const adaptiveProgramCalculationObjectSchema = z
  .object({
    status: adaptiveProgramStatusSchema,
    timeZone: z.string().trim().min(1),
    rmrEquation: adaptiveRmrEquationSchema,
    heightCm: z.number().min(100).max(250).finite().nullable(),
    birthDate: dateSchema.nullable(),
    activityLevel: adaptiveActivityLevelSchema.nullable(),
    activityMultiplier: z.number().positive().finite().nullable(),
    estimatedRmrKcal: z.number().positive().finite().nullable(),
    calculatedBaselineTdeeKcal: z.number().positive().finite().nullable(),
    manualBaselineTdeeKcal: z.number().min(800).max(8000).finite().nullable(),
    baselineTdeeKcal: z.number().positive().finite(),
    goalType: adaptiveGoalTypeSchema,
    targetWeightKg: bodyWeightKgSchema.nullable(),
    goalRatePctPerWeek: z.number().min(-1).max(0.5).finite(),
    proteinGrams: z.number().int().min(40).max(400),
    fatAllocationPct: z.number().min(20).max(40).finite(),
    systemCalorieFloorKcal: z.number().int().min(1200),
    userCalorieFloorKcal: z.number().int().min(1200),
    algorithmVersion: adaptiveTdeeAlgorithmVersionSchema,
  })
  .strict();

const validateAdaptiveProgram = (
  program: z.infer<typeof adaptiveProgramCalculationObjectSchema>,
  context: z.RefinementCtx,
) => {
  if (program.rmrEquation === 'manual_tdee') {
    if (program.manualBaselineTdeeKcal === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Manual RMR mode requires a manual baseline TDEE',
        path: ['manualBaselineTdeeKcal'],
      });
    }
    for (const field of [
      'activityMultiplier',
      'estimatedRmrKcal',
      'calculatedBaselineTdeeKcal',
    ] as const) {
      if (program[field] !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Manual TDEE mode cannot retain equation-derived values',
          path: [field],
        });
      }
    }
  } else {
    if (program.heightCm === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Mifflin-St Jeor requires height',
        path: ['heightCm'],
      });
    }
    if (program.birthDate === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Mifflin-St Jeor requires birth date',
        path: ['birthDate'],
      });
    }
    if (program.activityLevel === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Mifflin-St Jeor requires activity level',
        path: ['activityLevel'],
      });
    }
    for (const field of [
      'activityMultiplier',
      'estimatedRmrKcal',
      'calculatedBaselineTdeeKcal',
    ] as const) {
      if (program[field] === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Equation mode requires persisted baseline intermediates',
          path: [field],
        });
      }
    }
  }

  if (program.goalType === 'maintain') {
    if (program.goalRatePctPerWeek !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Maintenance requires a zero weekly goal rate',
        path: ['goalRatePctPerWeek'],
      });
    }
  } else {
    if (program.targetWeightKg === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Weight-change goals require a target weight',
        path: ['targetWeightKg'],
      });
    }
    if (program.goalType === 'lose' && program.goalRatePctPerWeek >= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Loss requires a negative weekly goal rate',
        path: ['goalRatePctPerWeek'],
      });
    }
    if (program.goalType === 'lose' && program.goalRatePctPerWeek > -0.1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Loss rate must be at least 0.1 percent per week',
        path: ['goalRatePctPerWeek'],
      });
    }
    if (program.goalType === 'gain' && program.goalRatePctPerWeek <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Gain requires a positive weekly goal rate',
        path: ['goalRatePctPerWeek'],
      });
    }
    if (program.goalType === 'gain' && program.goalRatePctPerWeek < 0.1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Gain rate must be at least 0.1 percent per week',
        path: ['goalRatePctPerWeek'],
      });
    }
  }

  if (program.userCalorieFloorKcal < program.systemCalorieFloorKcal) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'User calorie floor cannot be below the system floor',
      path: ['userCalorieFloorKcal'],
    });
  }
};

export const adaptiveProgramCalculationSchema =
  adaptiveProgramCalculationObjectSchema.superRefine(validateAdaptiveProgram);

export const adaptiveProgramSetupSchema = adaptiveProgramCalculationObjectSchema
  .extend({ currentWeightKg: bodyWeightKgSchema })
  .strict()
  .superRefine((program, context) => {
    validateAdaptiveProgram(program, context);
    if (
      program.goalType === 'lose' &&
      program.targetWeightKg !== null &&
      program.targetWeightKg >= program.currentWeightKg
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Loss target must be below the current weight',
        path: ['targetWeightKg'],
      });
    }
    if (
      program.goalType === 'gain' &&
      program.targetWeightKg !== null &&
      program.targetWeightKg <= program.currentWeightKg
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Gain target must be above the current weight',
        path: ['targetWeightKg'],
      });
    }
  });

export const adaptiveNutritionDaySchema = z
  .object({
    id: z.string().min(1),
    date: dateSchema,
    status: nutritionLogStatusSchema,
    calories: z.number().nonnegative().finite(),
    itemCount: z.number().int().nonnegative(),
    updatedAt: z.number().int(),
  })
  .strict();

export const adaptiveWeightEntrySchema = z
  .object({
    id: z.string().min(1),
    date: dateSchema,
    weightKg: bodyWeightKgSchema,
    updatedAt: z.number().int(),
  })
  .strict();

export const adaptivePriorTdeeSchema = z
  .object({ checkInId: z.string().min(1), tdeeKcal: calorieSchema })
  .strict();

export const adaptiveCurrentTargetSchema = z
  .object({
    id: z.string().min(1),
    calories: calorieSchema,
    protein: z.number().nonnegative().finite(),
    carbs: z.number().nonnegative().finite(),
    fat: z.number().nonnegative().finite(),
    source: z.enum(['manual', 'adaptive']),
    adaptiveCheckInId: z.string().nullable(),
    macroCalories: z.number().nonnegative().finite().nullable(),
    effectiveDate: dateSchema,
    updatedAt: z.number().int(),
  })
  .strict()
  .superRefine((target, context) => {
    if ((target.source === 'adaptive') !== (target.adaptiveCheckInId !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Adaptive target provenance must match its check-in link',
        path: ['adaptiveCheckInId'],
      });
    }
  });

export const adaptiveDateBoundariesSchema = z
  .object({
    previewDate: dateSchema,
    analysisStart: dateSchema,
    analysisEnd: dateSchema,
    warmupStart: dateSchema,
  })
  .strict();

const suspectWeightReferenceSchema = z.object({ id: z.string().min(1), date: dateSchema }).strict();
const adaptiveConfidenceSchema = z
  .object({
    score: z.number().min(0).max(1).finite(),
    label: adaptiveConfidenceLabelSchema,
    nutritionCoverage: z.number().min(0).max(1).finite(),
    weightFrequency: z.number().min(0).max(1).finite(),
    spanScore: z.number().min(0).max(1).finite(),
    recencyScore: z.number().min(0).max(1).finite(),
  })
  .strict();
const adaptiveUpdateSchema = z
  .object({
    priorTdeeKcal: calorieSchema,
    observedTdeeKcal: z.number().finite(),
    blendedTdeeKcal: z.number().finite(),
    requestedChangeKcal: z.number().finite(),
    limitedChangeKcal: z.number().min(-150).max(150).finite(),
    proposedTdeeKcal: calorieSchema,
    limited: z.boolean(),
    reasonCodes: z.array(adaptiveReasonCodeSchema),
  })
  .strict();
const adaptiveGoalCaloriesSchema = z
  .object({
    rawGoalCalories: z.number().finite(),
    goalCalories: calorieSchema,
    desiredWeightChangeKgPerDay: z.number().finite(),
    requestedCalorieAdjustment: z.number().finite(),
    achievableGoalRatePctPerWeek: z.number().finite(),
    goalReached: z.boolean(),
    reasonCodes: z.array(adaptiveReasonCodeSchema),
  })
  .strict();
const adaptiveMacroSchema = z
  .object({
    calories: calorieSchema,
    protein: z.number().int().min(40).max(400),
    carbs: z.number().int().nonnegative(),
    fat: z.number().int().nonnegative(),
    macroCalories: z.number().nonnegative().finite(),
    calorieDifference: z.number().min(-2).max(2).finite(),
  })
  .strict();
const adaptiveRecommendationBaseFields = {
  algorithmVersion: adaptiveTdeeAlgorithmVersionSchema,
  inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  kind: adaptiveCheckInKindSchema,
  boundaries: adaptiveDateBoundariesSchema,
  reasonCodes: z.array(adaptiveReasonCodeSchema),
  suspectWeightEntryIds: z.array(z.string().min(1)),
  suspectWeightEntries: z.array(suspectWeightReferenceSchema),
  excludedNutritionDates: z.array(dateSchema),
  completeNutritionDays: z.number().int().nonnegative(),
  actualWeightCount: z.number().int().nonnegative(),
  trendPointCount: z.number().int().nonnegative(),
  averageDailyIntakeKcal: z.number().positive().finite().nullable(),
  priorTdeeKcal: calorieSchema,
  latestTrendWeightKg: bodyWeightKgSchema.nullable(),
} as const;
const adaptiveNonUpdatingRecommendationFields = {
  weightTrendKgPerDay: z.number().finite().nullable(),
  observedTdeeKcal: z.number().finite().nullable(),
  confidence: z.null(),
  adaptiveUpdate: z.null(),
  goal: z.null(),
  macros: z.null(),
} as const;

export const adaptiveRecommendationSchema = z.discriminatedUnion('state', [
  z
    .object({
      ...adaptiveRecommendationBaseFields,
      state: z.literal('baseline'),
      weightTrendKgPerDay: z.null(),
      observedTdeeKcal: z.null(),
      confidence: z.null(),
      adaptiveUpdate: z.null(),
      goal: adaptiveGoalCaloriesSchema,
      macros: adaptiveMacroSchema,
    })
    .strict(),
  z
    .object({
      ...adaptiveRecommendationBaseFields,
      state: z.literal('learning'),
      ...adaptiveNonUpdatingRecommendationFields,
    })
    .strict(),
  z
    .object({
      ...adaptiveRecommendationBaseFields,
      state: z.literal('holding'),
      ...adaptiveNonUpdatingRecommendationFields,
    })
    .strict(),
  z
    .object({
      ...adaptiveRecommendationBaseFields,
      state: z.literal('updating'),
      weightTrendKgPerDay: z.number().finite(),
      observedTdeeKcal: z.number().finite(),
      confidence: adaptiveConfidenceSchema,
      adaptiveUpdate: adaptiveUpdateSchema,
      goal: adaptiveGoalCaloriesSchema,
      macros: adaptiveMacroSchema,
    })
    .strict(),
]);

export type AdaptiveActivityLevel = z.infer<typeof adaptiveActivityLevelSchema>;
export type AdaptiveCheckInKind = z.infer<typeof adaptiveCheckInKindSchema>;
export type AdaptiveCheckInStatus = z.infer<typeof adaptiveCheckInStatusSchema>;
export type AdaptiveCheckInState = z.infer<typeof adaptiveCheckInStateSchema>;
export type AdaptiveConfidenceLabel = z.infer<typeof adaptiveConfidenceLabelSchema>;
export type AdaptiveCurrentTarget = z.infer<typeof adaptiveCurrentTargetSchema>;
export type AdaptiveGoalType = z.infer<typeof adaptiveGoalTypeSchema>;
export type AdaptiveNutritionDay = z.infer<typeof adaptiveNutritionDaySchema>;
export type AdaptivePriorTdee = z.infer<typeof adaptivePriorTdeeSchema>;
export type AdaptiveProgramCalculation = z.infer<typeof adaptiveProgramCalculationSchema>;
export type AdaptiveProgramSetup = z.infer<typeof adaptiveProgramSetupSchema>;
export type AdaptiveReasonCode = z.infer<typeof adaptiveReasonCodeSchema>;
export type AdaptiveRecommendation = z.infer<typeof adaptiveRecommendationSchema>;
export type AdaptiveRmrEquation = z.infer<typeof adaptiveRmrEquationSchema>;
export type AdaptiveTdeeConstants = z.infer<typeof adaptiveTdeeConstantsSchema>;
export type AdaptiveWeightEntry = z.infer<typeof adaptiveWeightEntrySchema>;
