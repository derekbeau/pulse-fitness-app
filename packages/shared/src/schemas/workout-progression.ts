import { z } from 'zod';

import { dateSchema } from './common.js';
import { exerciseTrackingTypeSchema } from './exercises.js';

const idSchema = z.string().trim().min(1).max(255);
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
const nullableMetricSchema = z.number().finite().nonnegative().nullable();

export const workoutProgressionPolicyFamilySchema = z.enum([
  'double_progression',
  'strength_load',
  'rpe_regulated',
  'time_distance',
  'rehab_capacity',
]);

export const workoutProgressionDecisionSchema = z.enum(['increase', 'hold', 'reduce']);
export const workoutProgressionConfidenceSchema = z.enum(['supported', 'limited', 'unavailable']);
export const workoutProgressionStateSchema = z.enum([
  'current',
  'stale',
  'accepted',
  'edited',
  'kept',
  'held',
]);

export const workoutProgressionReasonCodeSchema = z.enum([
  'ALL_SETS_AT_RANGE_TOP',
  'ALL_TARGETS_COMPLETED',
  'BELOW_RANGE_TOP',
  'MISSED_OR_SKIPPED_SETS',
  'HIGH_EFFORT',
  'LOW_EFFORT',
  'MISSING_EFFORT',
  'MISSING_PRIOR_PRESCRIPTION',
  'NO_COMPLETED_HISTORY',
  'IDENTITY_MISMATCH',
  'UNSUPPORTED_TRACKING_TYPE',
  'REHAB_NO_AUTOMATIC_INCREASE',
  'ROUNDED_TO_INCREMENT',
]);

export const workoutProgressionPolicySchema = z
  .object({
    family: workoutProgressionPolicyFamilySchema,
    version: z.literal(1),
    loadIncrement: z.number().positive().finite().nullable(),
    loadIncreasePercent: z.number().positive().max(25).finite().nullable(),
    repRangeMin: z.number().int().positive().nullable(),
    repRangeMax: z.number().int().positive().nullable(),
    effortCeiling: z.number().min(1).max(10).finite().nullable(),
    lowEffortThreshold: z.number().min(1).max(10).finite().nullable(),
    secondsStep: z.number().int().positive().nullable(),
    distanceStep: z.number().positive().finite().nullable(),
    zoneCeiling: z.number().int().min(1).max(5).nullable(),
    allowReduction: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.repRangeMin !== null &&
      value.repRangeMax !== null &&
      value.repRangeMin > value.repRangeMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'repRangeMin must be less than or equal to repRangeMax',
        path: ['repRangeMax'],
      });
    }
    if (
      value.lowEffortThreshold !== null &&
      value.effortCeiling !== null &&
      value.lowEffortThreshold > value.effortCeiling
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'lowEffortThreshold must be less than or equal to effortCeiling',
        path: ['lowEffortThreshold'],
      });
    }
  });

export const workoutProgressionTargetSchema = z
  .object({
    setNumber: z.number().int().positive(),
    weight: nullableMetricSchema,
    weightMin: nullableMetricSchema,
    weightMax: nullableMetricSchema,
    repsMin: z.number().int().positive().nullable(),
    repsMax: z.number().int().positive().nullable(),
    reps: z.number().int().nonnegative().nullable(),
    seconds: z.number().int().nonnegative().nullable(),
    distance: nullableMetricSchema,
    zone: z.number().int().min(1).max(5).nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.weightMin === null || value.weightMax === null || value.weightMin <= value.weightMax,
    { message: 'weightMin must be less than or equal to weightMax', path: ['weightMax'] },
  )
  .refine(
    (value) => value.repsMin === null || value.repsMax === null || value.repsMin <= value.repsMax,
    { message: 'repsMin must be less than or equal to repsMax', path: ['repsMax'] },
  );

export const workoutProgressionPerformanceSetSchema = z
  .object({
    setId: idSchema,
    setNumber: z.number().int().positive(),
    completed: z.boolean(),
    skipped: z.boolean(),
    weight: nullableMetricSchema,
    reps: z.number().int().nonnegative().nullable(),
    seconds: z.number().int().nonnegative().nullable(),
    distance: nullableMetricSchema,
    rpe: z.number().min(1).max(10).finite().nullable(),
    zone: z.number().int().min(1).max(5).nullable(),
  })
  .strict()
  .refine((value) => !(value.completed && value.skipped), {
    message: 'A set cannot be both completed and skipped',
    path: ['skipped'],
  });

export const workoutProgressionEvidenceSchema = z
  .object({
    scheduledWorkoutId: idSchema,
    scheduledWorkoutDate: dateSchema,
    scheduledWorkoutExerciseId: idSchema,
    exerciseId: idSchema,
    exerciseName: z.string().trim().min(1).max(255),
    trackingType: exerciseTrackingTypeSchema,
    sourceSessionId: idSchema.nullable(),
    sourceSessionDate: dateSchema.nullable(),
    priorTargets: z.array(workoutProgressionTargetSchema).min(1).max(100),
    performance: z.array(workoutProgressionPerformanceSetSchema).max(100),
    policy: workoutProgressionPolicySchema,
  })
  .strict();

export const workoutProgressionRecommendationSchema = z
  .object({
    id: idSchema,
    userId: idSchema,
    state: workoutProgressionStateSchema,
    sourceFingerprint: fingerprintSchema,
    evidence: workoutProgressionEvidenceSchema,
    decision: workoutProgressionDecisionSchema,
    confidence: workoutProgressionConfidenceSchema,
    reasonCodes: z.array(workoutProgressionReasonCodeSchema).min(1),
    recommendedTargets: z.array(workoutProgressionTargetSchema).min(1).max(100),
    facts: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
    generatedAt: z.number().int().positive(),
    effectiveDate: dateSchema,
    staleAt: z.number().int().positive().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.recommendedTargets.length !== value.evidence.priorTargets.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'recommendedTargets must preserve the prior target set count',
        path: ['recommendedTargets'],
      });
    }
    if ((value.state === 'stale') !== (value.staleAt !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'staleAt must be present exactly when state is stale',
        path: ['staleAt'],
      });
    }
    if (value.confidence === 'unavailable' && value.decision !== 'hold') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unavailable recommendations must hold the current prescription',
        path: ['decision'],
      });
    }
  });

export const previewWorkoutProgressionInputSchema = z
  .object({ scheduledWorkoutId: idSchema })
  .strict();

export const workoutProgressionActionTypeSchema = z.enum(['accept', 'edit', 'keep', 'hold']);

export const applyWorkoutProgressionActionInputSchema = z
  .object({
    action: workoutProgressionActionTypeSchema,
    expectedFingerprint: fingerprintSchema,
    idempotencyKey: z.string().trim().min(8).max(255),
    editedTargets: z.array(workoutProgressionTargetSchema).min(1).max(100).nullable(),
    reason: z.string().trim().min(1).max(1000).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.action === 'edit') !== (value.editedTargets !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'editedTargets are required exactly for edit actions',
        path: ['editedTargets'],
      });
    }
    if ((value.action === 'hold') !== (value.reason !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'reason is required exactly for hold actions',
        path: ['reason'],
      });
    }
  });

export const workoutProgressionActionSchema = z
  .object({
    id: idSchema,
    recommendationId: idSchema,
    sequence: z.number().int().positive(),
    action: workoutProgressionActionTypeSchema,
    appliedTargets: z.array(workoutProgressionTargetSchema).min(1).max(100),
    reason: z.string().trim().min(1).max(1000).nullable(),
    actorType: z.enum(['user', 'agent']),
    actorId: idSchema,
    idempotencyKey: z.string().trim().min(8).max(255),
    createdAt: z.number().int().positive(),
  })
  .strict();

export const workoutProgressionPreviewResponseSchema = z
  .object({ recommendations: z.array(workoutProgressionRecommendationSchema).max(200) })
  .strict();

export const workoutMuscleRoleSchema = z.enum(['primary', 'secondary']);

export const workoutMuscleContributionSchema = z
  .object({
    id: idSchema,
    exerciseId: idSchema,
    muscle: z.string().trim().min(1).max(100),
    role: workoutMuscleRoleSchema,
    factor: z.number().positive().max(1).finite(),
    version: z.literal(1),
    effectiveAt: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const expected = value.role === 'primary' ? 1 : 0.5;
    if (value.factor !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.role} contributions must use factor ${expected}`,
        path: ['factor'],
      });
    }
  });

export const workoutMuscleAnalyticsRangeSchema = z.enum(['7d', '30d', '90d']);

export const workoutMuscleAnalyticsSourceSchema = z
  .object({
    sessionId: idSchema,
    setId: idSchema,
    exerciseId: idSchema,
    contributionId: idSchema,
    date: dateSchema,
    factor: z.number().positive().max(1).finite(),
    completed: z.boolean(),
    planned: z.boolean(),
    volumeLoad: z.number().finite().nonnegative().nullable(),
  })
  .strict();

export const workoutMuscleAnalyticsRowSchema = z
  .object({
    muscle: z.string().trim().min(1).max(100),
    qualifyingSetEquivalents: z.number().finite().nonnegative(),
    plannedSetEquivalents: z.number().finite().nonnegative(),
    completedSessionCount: z.number().int().nonnegative(),
    exerciseCount: z.number().int().nonnegative(),
    volumeLoad: z.number().finite().nonnegative().nullable(),
    previousQualifyingSetEquivalents: z.number().finite().nonnegative(),
    change: z.enum(['increased', 'stable', 'decreased', 'no_comparison']),
    sourceIds: z.array(idSchema).max(500),
  })
  .strict();

export const workoutMuscleAnalyticsSchema = z
  .object({
    range: workoutMuscleAnalyticsRangeSchema,
    startDate: dateSchema,
    endDate: dateSchema,
    contributionVersion: z.literal(1),
    rows: z.array(workoutMuscleAnalyticsRowSchema).max(200),
    sources: z.array(workoutMuscleAnalyticsSourceSchema).max(5000),
  })
  .strict()
  .refine((value) => value.startDate <= value.endDate, {
    message: 'startDate must be less than or equal to endDate',
    path: ['endDate'],
  });

export type WorkoutProgressionPolicy = z.infer<typeof workoutProgressionPolicySchema>;
export type WorkoutProgressionDecision = z.infer<typeof workoutProgressionDecisionSchema>;
export type WorkoutProgressionReasonCode = z.infer<typeof workoutProgressionReasonCodeSchema>;
export type WorkoutProgressionTarget = z.infer<typeof workoutProgressionTargetSchema>;
export type WorkoutProgressionPerformanceSet = z.infer<
  typeof workoutProgressionPerformanceSetSchema
>;
export type WorkoutProgressionEvidence = z.infer<typeof workoutProgressionEvidenceSchema>;
export type WorkoutProgressionRecommendation = z.infer<
  typeof workoutProgressionRecommendationSchema
>;
export type PreviewWorkoutProgressionInput = z.infer<typeof previewWorkoutProgressionInputSchema>;
export type ApplyWorkoutProgressionActionInput = z.infer<
  typeof applyWorkoutProgressionActionInputSchema
>;
export type WorkoutProgressionAction = z.infer<typeof workoutProgressionActionSchema>;
export type WorkoutMuscleContribution = z.infer<typeof workoutMuscleContributionSchema>;
export type WorkoutMuscleAnalytics = z.infer<typeof workoutMuscleAnalyticsSchema>;
