import { z } from 'zod';

import { dateSchema } from './common.js';
import { nutritionLogStatusSchema } from './nutrition.js';
import { createNutritionTargetInputSchema, nutritionTargetSchema } from './nutrition-targets.js';
import { weightUnitSchema } from './users.js';

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
export const adaptiveCheckInKindSchema = z.enum(['baseline', 'weekly', 'manual', 'goal_change']);
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

const adaptiveProgramMutationObjectSchema = z
  .object({
    status: adaptiveProgramStatusSchema.default('active'),
    timeZone: z.string().trim().min(1),
    heightCm: z.number().min(100).max(250).finite().nullable(),
    birthDate: dateSchema.nullable(),
    rmrEquation: adaptiveRmrEquationSchema,
    activityLevel: adaptiveActivityLevelSchema.nullable(),
    manualBaselineTdeeKcal: z.number().min(800).max(8000).finite().nullable(),
    goalType: adaptiveGoalTypeSchema,
    targetWeightKg: bodyWeightKgSchema.nullable(),
    goalRatePctPerWeek: z.number().min(-1).max(0.5).finite(),
    proteinGrams: z.number().int().min(40).max(400),
    fatAllocationPct: z.number().min(20).max(40).finite(),
    userCalorieFloorKcal: z.number().int().min(1200).optional(),
    currentWeight: z
      .object({
        weight: z.number().positive().finite().max(1500),
        unit: weightUnitSchema.optional(),
      })
      .strict()
      .nullable()
      .optional(),
    rebaseline: z.boolean().default(false),
    supersedePending: z.boolean().default(false),
  })
  .strict();

export const adaptiveProgramMutationSchema = adaptiveProgramMutationObjectSchema.superRefine(
  (program, context) => {
    if (program.rmrEquation === 'manual_tdee') {
      if (program.manualBaselineTdeeKcal === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Manual RMR mode requires a manual baseline TDEE',
          path: ['manualBaselineTdeeKcal'],
        });
      }
    } else {
      for (const field of ['heightCm', 'birthDate', 'activityLevel'] as const) {
        if (program[field] === null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Mifflin-St Jeor requires height, birth date, and activity level',
            path: [field],
          });
        }
      }
    }

    if (program.goalType === 'maintain' && program.goalRatePctPerWeek !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Maintenance requires a zero weekly goal rate',
        path: ['goalRatePctPerWeek'],
      });
    }
    if (program.goalType !== 'maintain' && program.targetWeightKg === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Weight-change goals require a target weight',
        path: ['targetWeightKg'],
      });
    }
    if (program.goalType === 'lose' && program.goalRatePctPerWeek > -0.1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Loss rate must be between -1.0 and -0.1 percent per week',
        path: ['goalRatePctPerWeek'],
      });
    }
    if (program.goalType === 'gain' && program.goalRatePctPerWeek < 0.1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Gain rate must be between 0.1 and 0.5 percent per week',
        path: ['goalRatePctPerWeek'],
      });
    }
  },
);

export const adaptiveProgramSchema = adaptiveProgramCalculationObjectSchema
  .extend({
    id: z.string().min(1),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .strict()
  .superRefine(validateAdaptiveProgram);

export const adaptiveGoalStatusSchema = z.enum(['active', 'completed', 'replaced', 'cancelled']);
export const adaptiveGoalEndedReasonSchema = z.enum([
  'completed',
  'direction_changed',
  'cancelled',
]);
export const adaptiveGoalRevisionReasonSchema = z.enum([
  'created',
  'user_edit',
  'migration',
  'goal_completion',
]);

const adaptiveGoalStrategyFieldsSchema = z
  .object({
    targetWeightKg: bodyWeightKgSchema.nullable(),
    maintenanceCenterKg: bodyWeightKgSchema.nullable(),
    goalRatePctPerWeek: z.number().min(-1).max(0.5).finite(),
  })
  .strict();

const validateGoalStrategy = (
  strategy: z.infer<typeof adaptiveGoalStrategyFieldsSchema> & { type?: AdaptiveGoalType },
  context: z.RefinementCtx,
) => {
  const type = strategy.type;
  if (type === 'maintain' || (type === undefined && strategy.goalRatePctPerWeek === 0)) {
    if (
      strategy.targetWeightKg !== null ||
      strategy.maintenanceCenterKg === null ||
      strategy.goalRatePctPerWeek !== 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Maintenance requires a center weight, no target weight, and a zero rate',
        path: ['maintenanceCenterKg'],
      });
    }
    return;
  }

  if (strategy.targetWeightKg === null || strategy.maintenanceCenterKg !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Weight-change goals require a target weight and no maintenance center',
      path: ['targetWeightKg'],
    });
  }
  if (
    (type === 'lose' && strategy.goalRatePctPerWeek > -0.1) ||
    (type === 'gain' && strategy.goalRatePctPerWeek < 0.1) ||
    (type === undefined &&
      !(strategy.goalRatePctPerWeek <= -0.1 || strategy.goalRatePctPerWeek >= 0.1))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Goal rate must match the strategy direction',
      path: ['goalRatePctPerWeek'],
    });
  }
};

export const adaptiveGoalSchema = adaptiveGoalStrategyFieldsSchema
  .extend({
    id: z.string().min(1),
    userId: z.string().min(1),
    programId: z.string().min(1),
    type: adaptiveGoalTypeSchema,
    status: adaptiveGoalStatusSchema,
    startTrendWeightKg: bodyWeightKgSchema,
    startScaleWeightKg: bodyWeightKgSchema.nullable(),
    startedLocalDate: dateSchema,
    endedLocalDate: dateSchema.nullable(),
    endedReason: adaptiveGoalEndedReasonSchema.nullable(),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .strict()
  .superRefine((goal, context) => {
    validateGoalStrategy(goal, context);
    const active = goal.status === 'active';
    const lifecycleFieldsMatch = active
      ? goal.endedLocalDate === null && goal.endedReason === null
      : goal.endedLocalDate !== null && goal.endedReason !== null;
    if (!lifecycleFieldsMatch) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Active and closed goal lifecycle fields must agree',
        path: ['status'],
      });
    }
    const expectedReason =
      goal.status === 'completed'
        ? 'completed'
        : goal.status === 'replaced'
          ? 'direction_changed'
          : goal.status === 'cancelled'
            ? 'cancelled'
            : null;
    if (!active && goal.endedReason !== expectedReason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Closed goal status must match its end reason',
        path: ['endedReason'],
      });
    }
  });

export const adaptiveGoalRevisionSchema = adaptiveGoalStrategyFieldsSchema
  .extend({
    id: z.string().min(1),
    goalId: z.string().min(1),
    userId: z.string().min(1),
    sequence: z.number().int().positive(),
    previousTargetWeightKg: bodyWeightKgSchema.nullable(),
    previousCenterKg: bodyWeightKgSchema.nullable(),
    previousRatePctPerWeek: z.number().min(-1).max(0.5).finite(),
    reason: adaptiveGoalRevisionReasonSchema,
    effectiveLocalDate: dateSchema,
    createdAt: z.number().int(),
  })
  .strict()
  .superRefine((revision, context) => {
    validateGoalStrategy(revision, context);
    validateGoalStrategy(
      {
        targetWeightKg: revision.previousTargetWeightKg,
        maintenanceCenterKg: revision.previousCenterKg,
        goalRatePctPerWeek: revision.previousRatePctPerWeek,
      },
      context,
    );
  });

export const adaptiveGoalSnapshotSchema = z
  .object({
    id: z.string().min(1),
    revisionId: z.string().min(1),
    type: adaptiveGoalTypeSchema,
    targetWeightKg: bodyWeightKgSchema.nullable(),
    maintenanceCenterKg: bodyWeightKgSchema.nullable(),
    goalRatePctPerWeek: z.number().min(-1).max(0.5).finite(),
  })
  .strict()
  .superRefine(validateGoalStrategy);

const adaptiveCheckInInputSnapshotFields = {
  constants: adaptiveTdeeConstantsSchema,
  program: adaptiveProgramCalculationSchema,
  priorTdee: adaptivePriorTdeeSchema.nullable(),
  currentTarget: adaptiveCurrentTargetSchema.nullable(),
  boundaries: adaptiveDateBoundariesSchema,
  includeToday: z.boolean(),
  nutritionDays: z.array(adaptiveNutritionDaySchema),
  weightEntries: z.array(adaptiveWeightEntrySchema),
} as const;

export const adaptiveCheckInInputSnapshotV1Schema = z
  .object({
    version: z.literal(1),
    ...adaptiveCheckInInputSnapshotFields,
  })
  .strict();

export const adaptiveCheckInInputSnapshotV2Schema = z
  .object({
    version: z.literal(2),
    ...adaptiveCheckInInputSnapshotFields,
    goal: adaptiveGoalSnapshotSchema,
  })
  .strict();

export const adaptiveCheckInInputSnapshotSchema = z.discriminatedUnion('version', [
  adaptiveCheckInInputSnapshotV1Schema,
  adaptiveCheckInInputSnapshotV2Schema,
]);

export const adaptivePreviewInputSchema = z
  .object({
    kind: z.enum(['weekly', 'manual']),
    includeToday: z.boolean().default(false),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.kind === 'weekly' && input.includeToday) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Weekly check-ins cannot include today',
        path: ['includeToday'],
      });
    }
  });

export const adaptiveAcceptInputSchema = z
  .object({ replaceSameDateTarget: z.boolean().default(false) })
  .strict();

export const adaptiveCheckInQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export const adaptiveCheckInSummarySchema = z
  .object({
    id: z.string().min(1),
    goalId: z.string().nullable(),
    goalRevisionId: z.string().nullable(),
    kind: adaptiveCheckInKindSchema,
    status: adaptiveCheckInStatusSchema,
    calculationState: adaptiveCheckInStateSchema,
    localDate: dateSchema,
    analysisStart: dateSchema.nullable(),
    analysisEnd: dateSchema.nullable(),
    includeToday: z.boolean(),
    algorithmVersion: adaptiveTdeeAlgorithmVersionSchema,
    dataFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    reasonCodes: z.array(adaptiveReasonCodeSchema),
    priorTdeeKcal: calorieSchema.nullable(),
    observedTdeeKcal: z.number().finite().nullable(),
    proposedTdeeKcal: calorieSchema.nullable(),
    currentTargets: nutritionTargetSchema.nullable(),
    proposedTargets: createNutritionTargetInputSchema.nullable(),
    acceptedNutritionTargetId: z.string().nullable(),
    resolvedAt: z.number().int().nullable(),
    createdAt: z.number().int(),
  })
  .strict();

export const adaptiveGoalQuerySchema = adaptiveCheckInQuerySchema;

export const adaptiveGoalHistorySummarySchema = z
  .object({
    goal: adaptiveGoalSchema,
    latestRevision: adaptiveGoalRevisionSchema,
    finalTrendWeightKg: bodyWeightKgSchema.nullable(),
    netChangeKg: z.number().finite().nullable(),
    durationDays: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const adaptiveGoalDetailSchema = z
  .object({
    goal: adaptiveGoalSchema,
    revisions: z.array(adaptiveGoalRevisionSchema).min(1),
    acceptedCheckIns: z.array(adaptiveCheckInSummarySchema),
  })
  .strict();

export const adaptiveGoalAllowedActionsSchema = z
  .object({
    edit: z.boolean(),
    startNew: z.boolean(),
    cancel: z.boolean(),
    complete: z.boolean(),
  })
  .strict();

export const adaptiveCurrentGoalSchema = z
  .object({
    goal: adaptiveGoalSchema,
    latestRevision: adaptiveGoalRevisionSchema,
    progress: z.null(),
    pendingGoalChange: z.null(),
    allowedActions: adaptiveGoalAllowedActionsSchema,
  })
  .strict();

export const adaptiveCheckInDetailSchema = adaptiveCheckInSummarySchema
  .extend({
    inputSnapshot: adaptiveCheckInInputSnapshotSchema,
    calculationSnapshot: adaptiveRecommendationSchema,
  })
  .strict();

export const adaptiveEligibilityProgressSchema = z
  .object({
    eligible: z.boolean(),
    completeNutritionDays: z.number().int().nonnegative(),
    requiredCompleteNutritionDays: z.number().int().positive(),
    weighIns: z.number().int().nonnegative(),
    requiredWeighIns: z.number().int().positive(),
    weightSpanDays: z.number().int().nonnegative(),
    requiredWeightSpanDays: z.number().int().positive(),
    latestWeightAgeDays: z.number().int().nonnegative().nullable(),
    reasonCodes: z.array(adaptiveReasonCodeSchema),
  })
  .strict();

export const adaptiveNutritionReadStateSchema = z.enum([
  'setup_required',
  'baseline',
  'learning',
  'updating',
  'holding',
  'pending_recommendation',
]);

export const adaptiveNutritionStateSchema = z
  .object({
    state: adaptiveNutritionReadStateSchema,
    program: adaptiveProgramSchema.nullable(),
    currentTarget: nutritionTargetSchema.nullable(),
    latestAcceptedCheckIn: adaptiveCheckInSummarySchema.nullable(),
    pendingCheckIn: adaptiveCheckInSummarySchema.nullable(),
    checkInDue: z.boolean(),
    nextCheckInDate: dateSchema.nullable(),
    eligibility: adaptiveEligibilityProgressSchema.nullable(),
  })
  .strict();

export const adaptiveAcceptResultSchema = z
  .object({
    checkIn: adaptiveCheckInDetailSchema,
    target: nutritionTargetSchema,
  })
  .strict();

export type AdaptiveActivityLevel = z.infer<typeof adaptiveActivityLevelSchema>;
export type AdaptiveCheckInKind = z.infer<typeof adaptiveCheckInKindSchema>;
export type AdaptiveCheckInStatus = z.infer<typeof adaptiveCheckInStatusSchema>;
export type AdaptiveCheckInState = z.infer<typeof adaptiveCheckInStateSchema>;
export type AdaptiveConfidenceLabel = z.infer<typeof adaptiveConfidenceLabelSchema>;
export type AdaptiveCurrentTarget = z.infer<typeof adaptiveCurrentTargetSchema>;
export type AdaptiveGoalType = z.infer<typeof adaptiveGoalTypeSchema>;
export type AdaptiveGoalStatus = z.infer<typeof adaptiveGoalStatusSchema>;
export type AdaptiveGoalEndedReason = z.infer<typeof adaptiveGoalEndedReasonSchema>;
export type AdaptiveGoalRevisionReason = z.infer<typeof adaptiveGoalRevisionReasonSchema>;
export type AdaptiveGoal = z.infer<typeof adaptiveGoalSchema>;
export type AdaptiveGoalRevision = z.infer<typeof adaptiveGoalRevisionSchema>;
export type AdaptiveGoalSnapshot = z.infer<typeof adaptiveGoalSnapshotSchema>;
export type AdaptiveCurrentGoal = z.infer<typeof adaptiveCurrentGoalSchema>;
export type AdaptiveGoalHistorySummary = z.infer<typeof adaptiveGoalHistorySummarySchema>;
export type AdaptiveGoalDetail = z.infer<typeof adaptiveGoalDetailSchema>;
export type AdaptiveNutritionDay = z.infer<typeof adaptiveNutritionDaySchema>;
export type AdaptivePriorTdee = z.infer<typeof adaptivePriorTdeeSchema>;
export type AdaptiveProgramCalculation = z.infer<typeof adaptiveProgramCalculationSchema>;
export type AdaptiveProgramSetup = z.infer<typeof adaptiveProgramSetupSchema>;
export type AdaptiveProgramMutation = z.infer<typeof adaptiveProgramMutationSchema>;
export type AdaptiveProgram = z.infer<typeof adaptiveProgramSchema>;
export type AdaptiveReasonCode = z.infer<typeof adaptiveReasonCodeSchema>;
export type AdaptiveRecommendation = z.infer<typeof adaptiveRecommendationSchema>;
export type AdaptiveCheckInInputSnapshot = z.infer<typeof adaptiveCheckInInputSnapshotSchema>;
export type AdaptiveCheckInSummary = z.infer<typeof adaptiveCheckInSummarySchema>;
export type AdaptiveCheckInDetail = z.infer<typeof adaptiveCheckInDetailSchema>;
export type AdaptiveEligibilityProgress = z.infer<typeof adaptiveEligibilityProgressSchema>;
export type AdaptiveNutritionReadState = z.infer<typeof adaptiveNutritionReadStateSchema>;
export type AdaptiveNutritionState = z.infer<typeof adaptiveNutritionStateSchema>;
export type AdaptivePreviewInput = z.infer<typeof adaptivePreviewInputSchema>;
export type AdaptiveAcceptInput = z.infer<typeof adaptiveAcceptInputSchema>;
export type AdaptiveAcceptResult = z.infer<typeof adaptiveAcceptResultSchema>;
export type AdaptiveRmrEquation = z.infer<typeof adaptiveRmrEquationSchema>;
export type AdaptiveTdeeConstants = z.infer<typeof adaptiveTdeeConstantsSchema>;
export type AdaptiveWeightEntry = z.infer<typeof adaptiveWeightEntrySchema>;
