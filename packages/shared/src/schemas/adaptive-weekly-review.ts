import { z } from 'zod';

import { adaptiveConfidenceLabelSchema } from './adaptive-nutrition.js';
import { dateSchema } from './common.js';

const requiredText = z.string().trim().min(1).max(4000);
const shortText = z.string().trim().min(1).max(255);
const idSchema = z.string().trim().min(1).max(255);
const fingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/u);

const isIanaTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
};

export const adaptiveReviewTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isIanaTimeZone, 'Expected a valid IANA time zone');

export const adaptiveReviewModuleKindSchema = z.enum([
  'data_quality',
  'outcome',
  'energy',
  'training_recovery',
  'recommendation',
]);

export const adaptiveReviewOutcomeSchema = z.enum([
  'keep',
  'adjust',
  'defer',
  'clarify',
  'goal_review',
  'training_review',
]);

export const adaptiveReviewEvidenceStateSchema = z.enum([
  'logged',
  'usable',
  'excluded',
  'pending_cutoff',
  'missing',
]);

export const adaptiveReviewEvidenceSchema = z
  .object({
    kind: z.enum([
      'nutrition',
      'weigh_in',
      'scheduled_workout',
      'workout_session',
      'annotation',
      'check_in',
    ]),
    id: idSchema.nullable(),
    localDate: dateSchema,
    state: adaptiveReviewEvidenceStateSchema,
    label: shortText,
    detail: requiredText,
    reasonCodes: z.array(shortText).max(50),
    resolution: requiredText.nullable(),
  })
  .strict();

export const adaptiveReviewContextSubjectSchema = z.union([
  z.object({ kind: z.literal('date'), localDate: dateSchema }).strict(),
  z
    .object({ kind: z.literal('date_range'), startDate: dateSchema, endDate: dateSchema })
    .strict()
    .refine((value) => value.startDate <= value.endDate, {
      message: 'startDate must be on or before endDate',
      path: ['endDate'],
    }),
  z.object({ kind: z.literal('nutrition_log'), id: idSchema }).strict(),
  z.object({ kind: z.literal('weigh_in'), id: idSchema }).strict(),
  z.object({ kind: z.literal('scheduled_workout'), id: idSchema }).strict(),
  z.object({ kind: z.literal('workout_session'), id: idSchema }).strict(),
  z.object({ kind: z.literal('check_in'), id: idSchema }).strict(),
  z.object({ kind: z.literal('upcoming_check_in'), targetReviewLocalDate: dateSchema }).strict(),
]);

const adaptiveReviewContextCreateSubjectSchema = z.union([
  z.object({ kind: z.literal('date'), localDate: dateSchema }).strict(),
  z
    .object({ kind: z.literal('date_range'), startDate: dateSchema, endDate: dateSchema })
    .strict()
    .refine((value) => value.startDate <= value.endDate, {
      message: 'startDate must be on or before endDate',
      path: ['endDate'],
    }),
  z.object({ kind: z.literal('nutrition_log'), id: idSchema }).strict(),
  z.object({ kind: z.literal('weigh_in'), id: idSchema }).strict(),
  z.object({ kind: z.literal('scheduled_workout'), id: idSchema }).strict(),
  z.object({ kind: z.literal('workout_session'), id: idSchema }).strict(),
  z.object({ kind: z.literal('check_in'), id: idSchema }).strict(),
  z.object({ kind: z.literal('upcoming_check_in') }).strict(),
]);

export const adaptiveReviewContextCategorySchema = z.enum([
  'illness',
  'recovery',
  'pain_injury',
  'travel',
  'nutrition_exception',
  'training_change',
  'schedule_change',
  'clarification',
  'other',
]);

export const adaptiveReviewContextResolutionKindSchema = z.enum(['nutrition_complete']);

export const adaptiveReviewActorSchema = z
  .object({
    type: z.enum(['user', 'agent_token', 'system']),
    agentTokenId: idSchema.nullable(),
    label: shortText,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.type === 'agent_token') !== (value.agentTokenId !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only agent-token actors may include an agent token ID',
        path: ['agentTokenId'],
      });
    }
  });

export const adaptiveReviewContextSchema = z
  .object({
    id: idSchema,
    subject: adaptiveReviewContextSubjectSchema,
    category: adaptiveReviewContextCategorySchema,
    note: requiredText,
    resolution: requiredText.nullable(),
    // Optional only for immutable snapshots written before the structured
    // resolution discriminator was introduced in migration 0050.
    resolutionKind: adaptiveReviewContextResolutionKindSchema.nullable().optional(),
    provenance: adaptiveReviewActorSchema,
    revision: z.number().int().positive(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    deletedAt: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.resolutionKind === 'nutrition_complete' && !value.resolution) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A structured resolution kind requires resolution text',
        path: ['resolutionKind'],
      });
    }
  });

export const adaptiveReviewContextCreateInputSchema = z
  .object({
    subject: adaptiveReviewContextCreateSubjectSchema,
    category: adaptiveReviewContextCategorySchema,
    note: requiredText,
    resolution: requiredText.nullable().optional(),
    resolutionKind: adaptiveReviewContextResolutionKindSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.resolutionKind !== null && value.resolutionKind !== undefined && !value.resolution) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A structured resolution kind requires resolution text',
        path: ['resolutionKind'],
      });
    }
  });

export const adaptiveReviewContextUpdateInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    category: adaptiveReviewContextCategorySchema.optional(),
    note: requiredText.optional(),
    resolution: requiredText.nullable().optional(),
    resolutionKind: adaptiveReviewContextResolutionKindSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.category !== undefined ||
      value.note !== undefined ||
      value.resolution !== undefined ||
      value.resolutionKind !== undefined,
    'At least one context field must be provided',
  )
  .superRefine((value, context) => {
    if (value.resolutionKind !== null && value.resolutionKind !== undefined && !value.resolution) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A structured resolution kind requires resolution text in the same update',
        path: ['resolutionKind'],
      });
    }
  });

export const adaptiveReviewContextDeleteQuerySchema = z
  .object({ expectedRevision: z.coerce.number().int().positive() })
  .strict();

export const adaptiveReviewDataQualityModuleSchema = z
  .object({
    kind: z.literal('data_quality'),
    title: z.literal('Data quality'),
    summary: requiredText,
    evidence: z.array(adaptiveReviewEvidenceSchema).min(1),
    requiresClarification: z.boolean(),
    resolutionOptions: z.array(z.enum(['confirm_complete', 'mark_partial', 'add_context'])),
  })
  .strict();

export const adaptiveReviewOutcomeModuleSchema = z
  .object({
    kind: z.literal('outcome'),
    title: z.literal('Outcome'),
    goalType: z.enum(['lose', 'maintain', 'gain']),
    scaleWeightKg: z.number().positive().finite().nullable(),
    trendWeightKg: z.number().positive().finite().nullable(),
    trendChangeKg: z.number().finite().nullable(),
    actualRateKgPerWeek: z.number().finite().nullable(),
    desiredRateKgPerWeek: z.number().finite().nullable(),
    etaStartDate: dateSchema.nullable(),
    etaEndDate: dateSchema.nullable(),
    summary: requiredText,
    scaleNoiseExplanation: requiredText,
  })
  .strict();

export const adaptiveReviewEnergyModuleSchema = z
  .object({
    kind: z.literal('energy'),
    title: z.literal('Energy'),
    state: z.enum(['learning', 'updating', 'holding', 'review_needed']),
    averageIntakeKcal: z.number().nonnegative().finite().nullable(),
    averageTargetKcal: z.number().nonnegative().finite().nullable(),
    averageExpenditureKcal: z.number().positive().finite().nullable(),
    intakeMinusTargetKcal: z.number().finite().nullable(),
    intakeMinusExpenditureKcal: z.number().finite().nullable(),
    completeDays: z.number().int().nonnegative(),
    summary: requiredText,
    sourceCheckInIds: z.array(idSchema),
  })
  .strict();

export const adaptiveReviewTrainingModuleSchema = z
  .object({
    kind: z.literal('training_recovery'),
    title: z.literal('Training and recovery'),
    scheduledCount: z.number().int().nonnegative(),
    completedCount: z.number().int().nonnegative(),
    movedCount: z.number().int().nonnegative(),
    skippedCount: z.number().int().nonnegative(),
    averageRpe: z.number().min(1).max(10).finite().nullable(),
    averageEnergy: z.number().min(1).max(5).finite().nullable(),
    averageRecovery: z.number().min(1).max(5).finite().nullable(),
    performanceTrend: z.enum(['improving', 'steady', 'declining', 'unavailable']),
    painOrIllnessPresent: z.boolean(),
    summary: requiredText,
    evidence: z.array(adaptiveReviewEvidenceSchema),
    nutritionCausalRuleApplied: z.literal(false),
  })
  .strict();

export const adaptiveReviewTargetProposalSchema = z
  .object({
    calories: z.number().int().min(1200).max(10_000),
    protein: z.number().int().nonnegative().max(1000),
    carbs: z.number().int().nonnegative().max(1000),
    fat: z.number().int().nonnegative().max(1000),
    effectiveDate: dateSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const macroCalories = value.protein * 4 + value.carbs * 4 + value.fat * 9;
    if (Math.abs(macroCalories - value.calories) > 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Macro calories must match the calorie target within 2 kcal',
        path: ['calories'],
      });
    }
  });

export const adaptiveReviewCausalBreakdownSchema = z
  .object({
    priorExpenditureKcal: z.number().positive().finite().nullable(),
    observedExpenditureKcal: z.number().positive().finite().nullable(),
    proposedExpenditureKcal: z.number().positive().finite().nullable(),
    observedTrendContributionKcal: z.number().finite().nullable(),
    goalRateContributionKcal: z.number().finite().nullable(),
    requestedAdjustmentKcal: z.number().finite().nullable(),
    appliedAdjustmentKcal: z.number().finite().nullable(),
    smoothingOrCapKcal: z.number().finite().nullable(),
    safetyFloorKcal: z.number().nonnegative().finite(),
    deficitLimitKcal: z.number().nonnegative().finite().nullable(),
    includedNutritionDates: z.array(dateSchema),
    excludedNutrition: z.array(
      z.object({ localDate: dateSchema, reasonCodes: z.array(shortText).min(1) }).strict(),
    ),
    includedWeightDates: z.array(dateSchema),
    excludedWeight: z.array(
      z.object({ localDate: dateSchema, reasonCodes: z.array(shortText).min(1) }).strict(),
    ),
    confidenceLabel: adaptiveConfidenceLabelSchema.nullable(),
    confidenceScore: z.number().min(0).max(1).finite().nullable(),
    readinessReasonCodes: z.array(shortText),
  })
  .strict();

export const adaptiveReviewRecommendationModuleSchema = z
  .object({
    kind: z.literal('recommendation'),
    title: z.literal('Recommendation'),
    outcome: adaptiveReviewOutcomeSchema,
    headline: requiredText,
    explanation: requiredText,
    currentTarget: adaptiveReviewTargetProposalSchema.nullable(),
    proposedTarget: adaptiveReviewTargetProposalSchema.nullable(),
    causalBreakdown: adaptiveReviewCausalBreakdownSchema,
  })
  .strict();

export const adaptiveReviewModuleSchema = z.discriminatedUnion('kind', [
  adaptiveReviewDataQualityModuleSchema,
  adaptiveReviewOutcomeModuleSchema,
  adaptiveReviewEnergyModuleSchema,
  adaptiveReviewTrainingModuleSchema,
  adaptiveReviewRecommendationModuleSchema,
]);

const moduleOrder = new Map(
  ['data_quality', 'outcome', 'energy', 'training_recovery', 'recommendation'].map(
    (kind, index) => [kind, index],
  ),
);

export const adaptiveWeeklyReviewSnapshotSchema = z
  .object({
    version: z.literal(1),
    reviewLocalDate: dateSchema,
    analysisStart: dateSchema,
    analysisEnd: dateSchema,
    timeZone: adaptiveReviewTimeZoneSchema,
    weightUnit: z.enum(['kg', 'lbs']),
    programId: idSchema,
    checkInId: idSchema,
    goalId: idSchema.nullable(),
    goalRevisionId: idSchema.nullable(),
    algorithmVersion: shortText,
    sourceFingerprint: fingerprintSchema,
    headline: requiredText,
    summary: requiredText,
    confidenceLabel: adaptiveConfidenceLabelSchema.nullable(),
    confidenceScore: z.number().min(0).max(1).finite().nullable(),
    modules: z.array(adaptiveReviewModuleSchema).min(2).max(5),
    contexts: z.array(adaptiveReviewContextSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const kinds = value.modules.map((module) => module.kind);
    if (new Set(kinds).size !== kinds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Review modules must be unique' });
    }
    if (!kinds.includes('outcome') || !kinds.includes('recommendation')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Outcome and recommendation modules are required',
      });
    }
    for (let index = 1; index < kinds.length; index += 1) {
      if (
        (moduleOrder.get(kinds[index - 1] ?? '') ?? -1) >=
        (moduleOrder.get(kinds[index] ?? '') ?? -1)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Review modules must follow deterministic display order',
          path: ['modules', index],
        });
      }
    }
  });

export const adaptiveReviewDeferConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('until_date'), localDate: dateSchema }).strict(),
  z
    .object({
      kind: z.literal('until_evidence'),
      evidence: z.enum([
        'next_complete_nutrition_day',
        'next_weigh_in',
        'nutrition_eligibility_restored',
        'weight_freshness_restored',
      ]),
      baselineFingerprint: fingerprintSchema,
    })
    .strict(),
]);

export type AdaptiveReviewActionInput =
  | {
      type: 'accept';
      expectedFingerprint: string;
      expectedActionSequence: number;
      replaceSameDateTarget?: boolean;
    }
  | {
      type: 'edit';
      expectedFingerprint: string;
      expectedActionSequence: number;
      proposal: z.infer<typeof adaptiveReviewTargetProposalSchema>;
      reason: string;
    }
  | {
      type: 'defer';
      expectedFingerprint: string;
      expectedActionSequence: number;
      condition: z.infer<typeof adaptiveReviewDeferConditionSchema>;
      reason: string;
    }
  | {
      type: 'decline';
      expectedFingerprint: string;
      expectedActionSequence: number;
      reason?: string;
    }
  | { type: 'ask_agent'; expectedActionSequence: number; question: string }
  | { type: 'answer'; expectedActionSequence: number; answer: string; contextId: string | null };

const actionFields = {
  accept: ['expectedFingerprint'],
  edit: ['expectedFingerprint', 'proposal', 'reason'],
  defer: ['expectedFingerprint', 'condition', 'reason'],
  decline: ['expectedFingerprint'],
  ask_agent: ['question'],
  answer: ['answer', 'contextId'],
} as const;

export const adaptiveReviewActionInputSchema = z
  .object({
    type: z.enum(['accept', 'edit', 'defer', 'decline', 'ask_agent', 'answer']),
    expectedActionSequence: z.number().int().nonnegative(),
    expectedFingerprint: fingerprintSchema.optional(),
    replaceSameDateTarget: z.boolean().optional(),
    proposal: adaptiveReviewTargetProposalSchema.optional(),
    condition: adaptiveReviewDeferConditionSchema.optional(),
    reason: requiredText.optional(),
    question: requiredText.optional(),
    answer: requiredText.optional(),
    contextId: idSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const permitted = new Set<string>([
      'type',
      'expectedActionSequence',
      ...actionFields[value.type],
      ...(value.type === 'decline' ? ['reason'] : []),
      ...(value.type === 'accept' ? ['replaceSameDateTarget'] : []),
    ]);
    for (const [field, fieldValue] of Object.entries(value)) {
      if (fieldValue !== undefined && !permitted.has(field)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} is not valid for ${value.type}`,
          path: [field],
        });
      }
    }
    for (const field of actionFields[value.type]) {
      if (value[field] === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} is required for ${value.type}`,
          path: [field],
        });
      }
    }
  }) as z.ZodType<AdaptiveReviewActionInput>;

export const adaptiveReviewActionSchema = z
  .object({
    id: idSchema,
    sequence: z.number().int().positive(),
    type: z.enum(['accept', 'edit', 'defer', 'decline', 'ask_agent', 'answer', 'supersede']),
    payload: z.record(z.string(), z.unknown()),
    actor: adaptiveReviewActorSchema,
    createdAt: z.number().int().nonnegative(),
  })
  .strict();

export const adaptiveReviewStateSchema = z.enum([
  'pending',
  'awaiting_clarification',
  'deferred',
  'accepted',
  'declined',
  'superseded',
  'stale',
]);

export const adaptiveWeeklyReviewSchema = z
  .object({
    id: idSchema,
    checkInId: idSchema,
    sourceFingerprint: fingerprintSchema,
    snapshot: adaptiveWeeklyReviewSnapshotSchema,
    state: adaptiveReviewStateSchema,
    actionSequence: z.number().int().nonnegative(),
    actions: z.array(adaptiveReviewActionSchema),
    effectiveProposal: adaptiveReviewTargetProposalSchema.nullable(),
    deferCondition: adaptiveReviewDeferConditionSchema.nullable(),
    availableActions: z.array(
      z.enum(['accept', 'edit', 'defer', 'decline', 'ask_agent', 'answer']),
    ),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();

export const adaptiveWeeklyReviewPreviewInputSchema = z
  .object({
    kind: z.enum(['weekly', 'manual']),
    supersedePendingRecommendation: z.boolean().optional(),
  })
  .strict();

export const adaptiveWeeklyReviewListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const adaptiveWeeklyReviewPendingSchema = z
  .object({ review: adaptiveWeeklyReviewSchema.nullable() })
  .strict();

export type AdaptiveReviewModuleKind = z.infer<typeof adaptiveReviewModuleKindSchema>;
export type AdaptiveReviewOutcome = z.infer<typeof adaptiveReviewOutcomeSchema>;
export type AdaptiveReviewContextSubject = z.infer<typeof adaptiveReviewContextSubjectSchema>;
export type AdaptiveReviewContext = z.infer<typeof adaptiveReviewContextSchema>;
export type AdaptiveReviewContextCreateInput = z.infer<
  typeof adaptiveReviewContextCreateInputSchema
>;
export type AdaptiveReviewContextUpdateInput = z.infer<
  typeof adaptiveReviewContextUpdateInputSchema
>;
export type AdaptiveWeeklyReviewSnapshot = z.infer<typeof adaptiveWeeklyReviewSnapshotSchema>;
export type AdaptiveReviewTargetProposal = z.infer<typeof adaptiveReviewTargetProposalSchema>;
export type AdaptiveReviewDeferCondition = z.infer<typeof adaptiveReviewDeferConditionSchema>;
export type AdaptiveReviewAction = z.infer<typeof adaptiveReviewActionSchema>;
export type AdaptiveWeeklyReview = z.infer<typeof adaptiveWeeklyReviewSchema>;
export type AdaptiveWeeklyReviewPreviewInput = z.infer<
  typeof adaptiveWeeklyReviewPreviewInputSchema
>;
