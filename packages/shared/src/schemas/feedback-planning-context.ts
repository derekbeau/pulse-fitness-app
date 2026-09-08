import { z } from 'zod';

import { dateSchema } from './common.js';
import {
  workoutFeedbackAnswerStateSchema,
  workoutFeedbackLateralitySchema,
  workoutFeedbackQuestionTimingSchema,
  workoutFeedbackQuestionTypeSchema,
  workoutFeedbackRespondentSourceSchema,
} from './workout-feedback.js';
import { workoutTemplateSectionTypeSchema } from './workout-templates.js';

export const FEEDBACK_PLANNING_DEFAULT_WINDOW_DAYS = 30;
export const FEEDBACK_PLANNING_MAX_WINDOW_DAYS = 90;
export const FEEDBACK_PLANNING_DEFAULT_LIMIT = 20;
export const FEEDBACK_PLANNING_MAX_LIMIT = 50;
export const FEEDBACK_PLANNING_SET_LIMIT = 200;

const requiredText = (maximum = 4000) => z.string().trim().min(1).max(maximum);
const nullableText = (maximum = 4000) => z.string().max(maximum).nullable();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const nativeValueSchema = z.union([
  z.number().finite(),
  z.boolean(),
  z.string().max(4000),
  z.array(z.string().max(255)).max(20),
  z.null(),
]);

export const feedbackPlanningViewSchema = z.enum(['planning', 'export']);

export const feedbackPlanningContextQuerySchema = z
  .object({
    view: feedbackPlanningViewSchema.default('planning'),
    windowDays: z.coerce
      .number()
      .int()
      .min(1)
      .max(FEEDBACK_PLANNING_MAX_WINDOW_DAYS)
      .default(FEEDBACK_PLANNING_DEFAULT_WINDOW_DAYS),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(FEEDBACK_PLANNING_MAX_LIMIT)
      .default(FEEDBACK_PLANNING_DEFAULT_LIMIT),
  })
  .strict();

export const feedbackPlanningClassificationSchema = z.enum([
  'current_explicit',
  'historical_observation',
  'unknown_skipped_unanswered',
  'legacy_untrusted',
  'legacy_derived',
  'superseded_interpretation',
  'clinician_authored_guidance',
]);

export const feedbackPlanningSourceAvailabilitySchema = z.enum([
  'available',
  'soft_deleted',
  'superseded',
  'legacy_untrusted',
  'inaccessible',
]);

export const feedbackPlanningDependencySchema = z
  .object({
    kind: z.enum([
      'answer_revision',
      'concern_evidence',
      'question_revision',
      'session',
      'session_sets',
      'note_disposition',
      'migration_classification',
      'programming_note',
    ]),
    id: z.string().min(1).max(255),
    version: z.string().max(4000).nullable(),
  })
  .strict();

export const feedbackPlanningSourceLocatorSchema = z
  .object({
    route: z.string().startsWith('/api/v1/'),
    entityType: z.enum([
      'workout_session',
      'workout_feedback_answer',
      'workout_feedback_question',
      'feedback_note_disposition',
      'feedback_audit',
      'scheduled_workout_exercise',
    ]),
    entityId: z.string().min(1).max(255),
    sessionId: z.string().min(1).max(255).nullable(),
  })
  .strict();

export const feedbackPlanningEvidenceSchema = z
  .object({
    id: z.string().min(1).max(255),
    projection: z.enum(['current', 'historical']),
    classification: feedbackPlanningClassificationSchema,
    actionable: z.boolean(),
    contentRole: z.literal('quoted_data'),
    question: z.object({
      id: z.string(),
      version: z.number().int().positive(),
      revisionId: z.string(),
      priorRevisionId: z.string().nullable(),
      prompt: z.string().max(255),
      type: workoutFeedbackQuestionTypeSchema,
      timing: workoutFeedbackQuestionTimingSchema,
      sourceKind: z.string(),
      sourceActorId: z.string().nullable(),
      sourceActorName: z.string().nullable(),
      authoredAt: z.string().datetime({ offset: true }),
    }),
    answer: z.object({
      responseId: z.string().nullable(),
      responseRevisionId: z.string().nullable(),
      revision: z.number().int().positive().nullable(),
      priorRevisionId: z.string().nullable(),
      state: z.union([workoutFeedbackAnswerStateSchema, z.literal('missing')]),
      nativeType: workoutFeedbackQuestionTypeSchema,
      nativeValue: nativeValueSchema,
      exactText: z.string().max(4000).nullable(),
      notes: z.string().max(4000).nullable(),
      answeredAt: z.string().datetime({ offset: true }).nullable(),
      respondentSource: workoutFeedbackRespondentSourceSchema.nullable(),
      respondentActorId: z.string().nullable(),
    }),
    session: z.object({
      id: z.string(),
      workoutName: z.string(),
      date: dateSchema,
      startedAt: z.number().int(),
      completedAt: z.number().int().nullable(),
      updatedAt: z.number().int(),
    }),
    context: z.object({
      exerciseId: z.string().nullable(),
      exerciseName: z.string().nullable(),
      bodyRegion: z.string().nullable(),
      laterality: workoutFeedbackLateralitySchema.nullable(),
      concernRef: z.string().nullable(),
      label: z.string().nullable(),
    }),
    source: z.object({
      kind: z.enum(['native_feedback_response', 'missing_native_response']),
      availability: feedbackPlanningSourceAvailabilitySchema,
      link: z.string().startsWith('/api/v1/').nullable(),
      locator: feedbackPlanningSourceLocatorSchema,
      lastUpdatedAt: z.number().int(),
      stale: z.boolean(),
      stalenessReasons: z.array(z.string().max(255)).max(20),
    }),
    dependencies: z.array(feedbackPlanningDependencySchema).min(1).max(20),
    dependencyFingerprint: sha256Schema,
  })
  .strict();

export const feedbackPlanningPageSchema = z.object({
  items: z.array(feedbackPlanningEvidenceSchema).max(FEEDBACK_PLANNING_MAX_LIMIT),
  page: z.number().int().positive(),
  limit: z.number().int().min(1).max(FEEDBACK_PLANNING_MAX_LIMIT),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const feedbackPlanningOpenConcernSchema = z
  .object({
    concernRef: z.string().min(1).max(255),
    contextLabel: z.string().max(255).nullable(),
    exerciseId: z.string().nullable(),
    exerciseName: z.string().nullable(),
    bodyRegion: z.string().nullable(),
    laterality: workoutFeedbackLateralitySchema.nullable(),
    originalSourceTimestamp: z.string().datetime({ offset: true }),
    evidenceIds: z.array(z.string()).min(1).max(50),
    evidenceTotal: z.number().int().positive(),
    evidenceHasMore: z.boolean(),
    contradictory: z.boolean(),
    stale: z.boolean(),
    stalenessReasons: z.array(z.string().max(255)).max(20),
    latestDisposition: z.enum(['retain', 'revise', 'retire']).nullable(),
    decisionId: z.string().nullable(),
    decisionStale: z.boolean(),
    dependencyFingerprint: sha256Schema,
  })
  .strict();

export const feedbackPlanningSetEvidenceSchema = z
  .object({
    id: z.string(),
    sessionId: z.string(),
    exerciseId: z.string().nullable(),
    exerciseName: z.string().nullable(),
    setNumber: z.number().int().positive(),
    completed: z.boolean(),
    skipped: z.boolean(),
    reps: z.number().int().nonnegative().nullable(),
    rpe: z.number().int().min(1).max(10).nullable(),
    rir: z.number().int().min(0).max(5).nullable(),
    sourceLink: z.string().startsWith('/api/v1/'),
  })
  .superRefine((value, context) => {
    if (value.rpe !== null && value.rir !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'RPE and RIR must remain distinct, mutually exclusive native values.',
        path: ['rir'],
      });
    }
  });

export const feedbackPlanningAuditItemSchema = z.object({
  id: z.string(),
  sessionId: z.string().nullable(),
  classification: feedbackPlanningClassificationSchema,
  sourceKind: z.enum([
    'submission_audit',
    'provenance_audit',
    'migration_ledger',
    'note_disposition',
    'legacy_session_feedback',
  ]),
  sourceTimestamp: z.number().int(),
  sourceChecksum: z.string().nullable(),
  sourceVersion: z.number().int().nullable(),
  sourceLink: z.string().startsWith('/api/v1/').nullable(),
  sourceAvailability: feedbackPlanningSourceAvailabilitySchema,
  rawPayload: z.string().optional(),
  reason: z.string().max(4000),
  contentRole: z.literal('quoted_data'),
});

export const feedbackPlanningFollowUpDraftSchema = z.object({
  concernRef: z.string(),
  prompt: z.string().max(1000),
  timing: workoutFeedbackQuestionTimingSchema,
  reasons: z
    .array(z.enum(['missing', 'stale', 'contradictory', 'recurrence', 'changed_exposure']))
    .min(1),
  publicationState: z.literal('draft'),
  dependencies: z.array(feedbackPlanningDependencySchema).min(1).max(50),
  dependencyFingerprint: sha256Schema,
});

export const feedbackPrecautionDispositionSchema = z.enum(['retain', 'revise', 'retire']);

const scheduledNoteMutationSchema = z
  .object({
    scheduledWorkoutId: z.string().min(1).max(255),
    scheduledWorkoutExerciseId: z.string().min(1).max(255),
    expectedProgrammingNotes: nullableText(),
    programmingNotes: nullableText(),
  })
  .strict();

export const applyFeedbackPrecautionDecisionInputSchema = z
  .object({
    concernRef: requiredText(255),
    source: z
      .object({
        sessionId: requiredText(255),
        exerciseId: requiredText(255),
        section: workoutTemplateSectionTypeSchema,
        expectedTextHash: sha256Schema,
      })
      .strict(),
    supportingResponseRevisionIds: z.array(requiredText(255)).min(1).max(50),
    disposition: feedbackPrecautionDispositionSchema,
    interpretation: requiredText(),
    reason: requiredText(),
    safeguards: z.array(requiredText()).max(20).default([]),
    noGeneralSafeguardPresent: z.boolean().default(false),
    scheduledNoteMutations: z.array(scheduledNoteMutationSchema).max(50).default([]),
    idempotencyKey: requiredText(255),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.safeguards.length === 0 && !value.noGeneralSafeguardPresent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Declare exact safeguards or explicitly confirm that the source has none.',
        path: ['safeguards'],
      });
    }
    if (value.safeguards.length > 0 && value.noGeneralSafeguardPresent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'noGeneralSafeguardPresent conflicts with supplied safeguards.',
        path: ['noGeneralSafeguardPresent'],
      });
    }
    if (value.disposition === 'retain' && value.scheduledNoteMutations.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A retained precaution cannot mutate future programming notes.',
        path: ['scheduledNoteMutations'],
      });
    }
  });

export const feedbackPrecautionDecisionSchema = z.object({
  id: z.string(),
  concernRef: z.string(),
  sequence: z.number().int().positive(),
  priorDecisionId: z.string().nullable(),
  source: z.object({
    kind: z.literal('session_programming_note'),
    sessionId: z.string(),
    exerciseId: z.string(),
    section: workoutTemplateSectionTypeSchema,
    exactText: z.string().max(4000),
    textHash: sha256Schema,
    sourceTimestamp: z.number().int(),
    availability: feedbackPlanningSourceAvailabilitySchema,
    link: z.string().startsWith('/api/v1/').nullable(),
    classification: z.enum(['programming_precaution', 'clinician_authored_guidance']),
  }),
  supportingResponseRevisionIds: z.array(z.string()).min(1).max(50),
  disposition: feedbackPrecautionDispositionSchema,
  interpretation: z.string(),
  reason: z.string(),
  safeguards: z.array(z.string().max(4000)).max(20),
  noGeneralSafeguardPresent: z.boolean(),
  actor: z.object({
    kind: z.literal('agent_token'),
    id: z.string(),
    label: z.string(),
  }),
  dependencies: z.array(feedbackPlanningDependencySchema).min(1).max(100),
  dependencyFingerprint: sha256Schema,
  stale: z.boolean(),
  stalenessReasons: z.array(z.string()).max(20),
  scheduledNoteMutations: z.array(
    scheduledNoteMutationSchema.extend({
      before: nullableText(),
      after: nullableText(),
      sourceLink: z.string().startsWith('/api/v1/'),
    }),
  ),
  idempotencyKey: z.string(),
  createdAt: z.number().int(),
});

export const feedbackPlanningContextResponseSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  query: z.object({
    view: feedbackPlanningViewSchema,
    today: dateSchema,
    from: dateSchema.nullable(),
    windowDays: z.number().int().min(1).max(FEEDBACK_PLANNING_MAX_WINDOW_DAYS),
  }),
  current: feedbackPlanningPageSchema,
  history: feedbackPlanningPageSchema,
  openConcerns: z.object({
    items: z.array(feedbackPlanningOpenConcernSchema).max(FEEDBACK_PLANNING_MAX_LIMIT),
    page: z.number().int().positive(),
    limit: z.number().int().min(1).max(FEEDBACK_PLANNING_MAX_LIMIT),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }),
  followUpDrafts: z.array(feedbackPlanningFollowUpDraftSchema).max(FEEDBACK_PLANNING_MAX_LIMIT),
  setEvidence: z.object({
    items: z.array(feedbackPlanningSetEvidenceSchema).max(FEEDBACK_PLANNING_SET_LIMIT),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }),
  audit: z.object({
    items: z.array(feedbackPlanningAuditItemSchema).max(FEEDBACK_PLANNING_MAX_LIMIT),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }),
  decisions: z.object({
    items: z.array(feedbackPrecautionDecisionSchema).max(FEEDBACK_PLANNING_MAX_LIMIT),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }),
  cache: z.object({
    mode: z.literal('recompute_on_read'),
    storedDerivedContext: z.literal(false),
  }),
});

export type FeedbackPlanningContextQuery = z.infer<typeof feedbackPlanningContextQuerySchema>;
export type FeedbackPlanningContextResponse = z.infer<typeof feedbackPlanningContextResponseSchema>;
export type FeedbackPlanningEvidence = z.infer<typeof feedbackPlanningEvidenceSchema>;
export type FeedbackPlanningDependency = z.infer<typeof feedbackPlanningDependencySchema>;
export type ApplyFeedbackPrecautionDecisionInput = z.infer<
  typeof applyFeedbackPrecautionDecisionInputSchema
>;
export type FeedbackPrecautionDecision = z.infer<typeof feedbackPrecautionDecisionSchema>;
