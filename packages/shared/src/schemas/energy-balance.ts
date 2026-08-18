import { z } from 'zod';

import {
  adaptiveConfidenceLabelSchema,
  adaptiveCheckInStateSchema,
  adaptiveEligibilityProgressSchema,
  adaptiveReasonCodeSchema,
  adaptiveTdeeAlgorithmVersionSchema,
} from './adaptive-nutrition.js';
import { dateSchema } from './common.js';

export const energyBalanceRangePresetSchema = z.enum(['1w', '1m', '3m', '6m', '1y', 'all']);
export const energyBalanceAggregationSchema = z.enum(['daily', 'weekly', 'monthly']);
export const energyBalanceAggregationQuerySchema = z.enum(['auto', 'daily', 'weekly', 'monthly']);
export const energyBalanceStateSchema = z.enum([
  'learning',
  'updating',
  'holding',
  'review_needed',
]);
export const energyBalanceNutritionStatusSchema = z.enum([
  'complete',
  'partial',
  'unknown',
  'missing',
  'excluded',
  'mixed',
]);
export const energyBalanceReasonCodeSchema = z.enum([
  'LEARNING_ESTIMATE',
  'HOLDING_ESTIMATE',
  'RECOMMENDATION_REVIEW_REQUIRED',
  'NO_COMPLETE_NUTRITION',
  'PARTIAL_NUTRITION_EXCLUDED',
  'UNKNOWN_NUTRITION_EXCLUDED',
  'MISSING_NUTRITION_EXCLUDED',
  'INVALID_COMPLETE_NUTRITION_EXCLUDED',
  'COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF',
  'NO_TARGET_DATA',
  'NO_EXPENDITURE_DATA',
  'INSUFFICIENT_TREND_DATA',
  'INCOMPLETE_RECONCILIATION_COVERAGE',
  'SHORT_WINDOW_NOISY',
  'INTAKE_ABOVE_TARGET',
  'INTAKE_BELOW_TARGET',
  'INTAKE_NEAR_TARGET',
  'INTAKE_ABOVE_EXPENDITURE',
  'INTAKE_BELOW_EXPENDITURE',
  'INTAKE_NEAR_EXPENDITURE',
  'PREDICTION_OBSERVED_ALIGNED',
  'PREDICTION_OBSERVED_DIVERGED',
]);

export const energyBalanceAnalyticsQuerySchema = z
  .object({
    range: energyBalanceRangePresetSchema.default('1m'),
    end: dateSchema.optional(),
    aggregation: energyBalanceAggregationQuerySchema.default('auto'),
  })
  .strict();

export const energyBalanceRangeSchema = z
  .object({
    preset: energyBalanceRangePresetSchema,
    startDate: dateSchema,
    endDate: dateSchema,
    aggregation: energyBalanceAggregationSchema,
    calendarDays: z.number().int().positive(),
  })
  .strict()
  .superRefine((range, context) => {
    if (range.startDate > range.endDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Energy balance range start must not follow its end',
        path: ['startDate'],
      });
    }
  });

export const energyBalanceMarkerSchema = z
  .object({
    id: z.string().min(1),
    date: dateSchema,
    type: z.enum(['check_in', 'goal_revision']),
    label: z.string().trim().min(1),
    checkInId: z.string().min(1).nullable(),
    inputFingerprint: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    goalId: z.string().min(1).nullable(),
    goalRevisionId: z.string().min(1).nullable(),
    state: energyBalanceStateSchema.nullable(),
  })
  .strict();

export const energyBalancePointSchema = z
  .object({
    periodStart: dateSchema,
    periodEnd: dateSchema,
    nutritionStatus: energyBalanceNutritionStatusSchema,
    sourceNutritionStatus: z.enum(['complete', 'partial', 'unknown']).nullable(),
    nutritionLogIds: z.array(z.string().min(1)),
    loggedIntakeKcal: z.number().nonnegative().finite().nullable(),
    intakeKcal: z.number().positive().finite().nullable(),
    includedInBalance: z.boolean(),
    completeNutritionDays: z.number().int().nonnegative(),
    partialNutritionDays: z.number().int().nonnegative(),
    unknownNutritionDays: z.number().int().nonnegative(),
    missingNutritionDays: z.number().int().nonnegative(),
    excludedNutritionDays: z.number().int().nonnegative(),
    targetKcal: z.number().nonnegative().finite().nullable(),
    targetIds: z.array(z.string().min(1)),
    expenditureKcal: z.number().positive().finite().nullable(),
    trendWeightKg: z.number().min(25).max(350).finite().nullable(),
    goalType: z.enum(['lose', 'maintain', 'gain']).nullable(),
    state: energyBalanceStateSchema,
    calculationState: adaptiveCheckInStateSchema,
    calculationReasonCodes: z.array(adaptiveReasonCodeSchema),
    reasonCodes: z.array(energyBalanceReasonCodeSchema),
    expenditureSourceCheckInId: z.string().min(1).nullable(),
    expenditureSourceInputFingerprint: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    stateSourceCheckInId: z.string().min(1).nullable(),
    stateSourceInputFingerprint: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    sourceCheckInIds: z.array(z.string().min(1)),
    sourceInputFingerprints: z.array(z.string().regex(/^[0-9a-f]{64}$/)),
    goalRevisionIds: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((point, context) => {
    if (point.periodStart > point.periodEnd) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Energy balance point start must not follow its end',
        path: ['periodStart'],
      });
    }
    if (point.intakeKcal !== null && !point.includedInBalance) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Excluded nutrition cannot carry modeled intake',
        path: ['intakeKcal'],
      });
    }
    if (point.includedInBalance && point.intakeKcal === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Included nutrition requires modeled intake',
        path: ['intakeKcal'],
      });
    }
    if (point.nutritionStatus === 'missing' && point.loggedIntakeKcal !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Missing nutrition cannot carry logged intake',
        path: ['loggedIntakeKcal'],
      });
    }
    if (
      point.nutritionStatus !== 'complete' &&
      point.nutritionStatus !== 'mixed' &&
      point.includedInBalance
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only complete daily evidence can be included in energy balance',
        path: ['includedInBalance'],
      });
    }
    if (
      point.nutritionStatus === 'mixed' &&
      point.includedInBalance &&
      point.completeNutritionDays === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Included mixed periods require at least one complete nutrition day',
        path: ['completeNutritionDays'],
      });
    }
  });

export const energyBalanceCurrentSchema = z
  .object({
    state: energyBalanceStateSchema,
    calculationState: adaptiveCheckInStateSchema,
    adaptiveTdeeKcal: z.number().positive().finite(),
    calorieTargetKcal: z.number().nonnegative().finite().nullable(),
    goalType: z.enum(['lose', 'maintain', 'gain']).nullable(),
    confidenceLabel: adaptiveConfidenceLabelSchema.nullable(),
    confidenceScore: z.number().min(0).max(1).finite().nullable(),
    readiness: adaptiveEligibilityProgressSchema,
    reasonCodes: z.array(adaptiveReasonCodeSchema),
    expenditureSourceCheckInId: z.string().min(1).nullable(),
    expenditureSourceInputFingerprint: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    stateSourceCheckInId: z.string().min(1).nullable(),
    stateSourceInputFingerprint: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
  })
  .strict();

export const energyBalanceSummarySchema = z
  .object({
    averageIntakeKcal: z.number().positive().finite().nullable(),
    averageExpenditureKcal: z.number().positive().finite().nullable(),
    averageTargetKcal: z.number().nonnegative().finite().nullable(),
    averageIntakeMinusTargetKcal: z.number().finite().nullable(),
    intakeTargetComparableDays: z.number().int().nonnegative(),
    averageIntakeMinusExpenditureKcal: z.number().finite().nullable(),
    intakeExpenditureComparableDays: z.number().int().nonnegative(),
    completeNutritionDays: z.number().int().nonnegative(),
    excludedNutritionDays: z.number().int().nonnegative(),
    coverageRatio: z.number().min(0).max(1).finite(),
    predictedWeightChangeKg: z.number().finite().nullable(),
    predictedModeledDays: z.number().int().nonnegative(),
    observedTrendWeightChangeKg: z.number().finite().nullable(),
    observedTrendStartDate: dateSchema.nullable(),
    observedTrendEndDate: dateSchema.nullable(),
    reconciliationComparable: z.boolean(),
    reasonCodes: z.array(energyBalanceReasonCodeSchema),
  })
  .strict();

export const energyBalanceExplanationSchema = z
  .object({
    headline: z.string().trim().min(1),
    detail: z.string().trim().min(1),
    reasonCodes: z.array(energyBalanceReasonCodeSchema),
  })
  .strict();

export const energyBalanceAnalyticsSchema = z
  .object({
    algorithmVersion: adaptiveTdeeAlgorithmVersionSchema,
    timeZone: z.string().trim().min(1),
    range: energyBalanceRangeSchema,
    isHistorical: z.boolean(),
    current: energyBalanceCurrentSchema,
    summary: energyBalanceSummarySchema,
    points: z.array(energyBalancePointSchema),
    markers: z.array(energyBalanceMarkerSchema),
    explanation: energyBalanceExplanationSchema,
  })
  .strict();

export type EnergyBalanceAggregation = z.infer<typeof energyBalanceAggregationSchema>;
export type EnergyBalanceAggregationQuery = z.infer<typeof energyBalanceAggregationQuerySchema>;
export type EnergyBalanceAnalytics = z.infer<typeof energyBalanceAnalyticsSchema>;
export type EnergyBalanceAnalyticsQuery = z.infer<typeof energyBalanceAnalyticsQuerySchema>;
export type EnergyBalanceCurrent = z.infer<typeof energyBalanceCurrentSchema>;
export type EnergyBalanceExplanation = z.infer<typeof energyBalanceExplanationSchema>;
export type EnergyBalanceMarker = z.infer<typeof energyBalanceMarkerSchema>;
export type EnergyBalanceNutritionStatus = z.infer<typeof energyBalanceNutritionStatusSchema>;
export type EnergyBalancePoint = z.infer<typeof energyBalancePointSchema>;
export type EnergyBalanceRange = z.infer<typeof energyBalanceRangeSchema>;
export type EnergyBalanceRangePreset = z.infer<typeof energyBalanceRangePresetSchema>;
export type EnergyBalanceReasonCode = z.infer<typeof energyBalanceReasonCodeSchema>;
export type EnergyBalanceState = z.infer<typeof energyBalanceStateSchema>;
export type EnergyBalanceSummary = z.infer<typeof energyBalanceSummarySchema>;
