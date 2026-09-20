import { z } from 'zod';

import {
  activityAssignmentSchema,
  activityExecutionSchema,
  activityJournalActorSchema,
  bodyConcernSchema,
  canonicalActivityKindSchema,
  capabilitySchema,
  checkInAnswerRevisionObjectSchema,
  checkInQuestionRevisionSchema,
  guidanceSchema,
  healthObservationSchema,
  provenanceSchema,
} from './activity-journal-contracts.js';
import { dateSchema } from './common.js';

const id = z.string().trim().min(1).max(255);
const text = z.string().trim().min(1).max(10_000);
const shortText = z.string().trim().min(1).max(255);
const key = z.string().trim().min(8).max(255);
export const dailyCheckInSourceKindSchema = z.enum([
  'activity',
  'activity_assignment',
  'activity_execution',
  'activity_goal',
  'activity_recurrence_revision',
  'workout_session',
  'scheduled_workout',
  'body_concern',
  'capability',
  'guidance',
  'observation',
  'check_in_question',
  'check_in_answer',
  'proposal',
  'nutrition_log',
  'meal',
]);
export const dailyCheckInSourceReferenceSchema = z
  .object({
    kind: dailyCheckInSourceKindSchema,
    id,
    subjectUserId: id,
    revisionId: id,
  })
  .strict();
const createDailyCheckInSourceReferenceSchema = dailyCheckInSourceReferenceSchema.omit({
  subjectUserId: true,
});

/** API inputs deliberately omit subject and actor: both are derived from authentication. */
export const dailyContextQuerySchema = z.object({ date: dateSchema.optional() }).strict();
export const createDailyCheckInQuestionApiInputSchema = z
  .object({
    localDate: dateSchema,
    semanticTopic: shortText,
    prompt: text,
    sourceReferences: z.array(createDailyCheckInSourceReferenceSchema).min(1).max(50),
    followUpQuestionId: id.nullable().default(null),
    idempotencyKey: key,
  })
  .strict();
const answerDailyCheckInQuestionObjectSchema = z
  .object({
    expectedQuestionRevisionId: id,
    expectedAnswerRevision: z.number().int().nonnegative(),
    state: z.enum(['answered', 'unknown', 'skipped']),
    value: text.optional(),
    source: provenanceSchema.omit({ capturedAt: true, capturedBy: true }),
    idempotencyKey: key,
  })
  .strict();
export const answerDailyCheckInQuestionApiInputSchema =
  answerDailyCheckInQuestionObjectSchema.superRefine((value, ctx) => {
    if (value.state === 'answered' && value.value === undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'An answered check-in requires a value.',
      });
    if (value.state !== 'answered' && value.value !== undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Unknown and skipped answers cannot carry a value.',
      });
  });
export const correctDailyCheckInAnswerApiInputSchema = answerDailyCheckInQuestionObjectSchema
  .extend({ reason: text })
  .superRefine((value, ctx) => {
    if (value.state === 'answered' && value.value === undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'An answered check-in requires a value.',
      });
    if (value.state !== 'answered' && value.value !== undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Unknown and skipped answers cannot carry a value.',
      });
  });
export const dailyCheckInAnswerAuditRevisionSchema = checkInAnswerRevisionObjectSchema
  .extend({
    correctionReason: text.nullable(),
    recordedBy: activityJournalActorSchema,
  })
  .strict()
  .superRefine((answer, ctx) => {
    if (answer.state === 'answered' && answer.value === undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'An answered check-in requires a value.',
      });
    if (answer.state !== 'answered' && answer.value !== undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Unknown and skipped answers cannot carry a value.',
      });
  });
export const dailyCheckInQuestionAuditRevisionSchema = z
  .object({
    revision: checkInQuestionRevisionSchema,
    recordedBy: activityJournalActorSchema,
    recordedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const dailyCheckInDetailSchema = z
  .object({
    question: checkInQuestionRevisionSchema,
    questionHistory: z.array(dailyCheckInQuestionAuditRevisionSchema).min(1),
    currentAnswer: dailyCheckInAnswerAuditRevisionSchema.nullable(),
    answerHistory: z.array(dailyCheckInAnswerAuditRevisionSchema),
    followUpQuestionId: id.nullable(),
  })
  .strict();
export const dailyContextNutritionSummarySchema = z
  .object({
    status: z.enum(['unknown', 'partial', 'complete']),
    meals: z.array(
      z
        .object({
          id,
          name: shortText,
          summary: z.string().nullable(),
          time: z.string().nullable(),
          sourceReference: dailyCheckInSourceReferenceSchema,
        })
        .strict(),
    ),
    totals: z
      .object({ calories: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() })
      .strict(),
    sourceReference: dailyCheckInSourceReferenceSchema,
  })
  .nullable();
export const dailyContextWorkoutSchema = z
  .object({
    id,
    kind: z.enum(['planned', 'in_progress', 'paused', 'completed']),
    plannedLocalDate: dateSchema.nullable(),
    actualLocalDate: dateSchema.nullable(),
    name: shortText,
    status: z.enum(['scheduled', 'in-progress', 'paused', 'completed']),
    scheduledWorkoutId: id.nullable(),
    workoutSessionId: id.nullable(),
    sourceReference: dailyCheckInSourceReferenceSchema,
    sourceTime: z.string().nullable(),
  })
  .strict();
export const dailyContextActivitySummarySchema = z
  .object({
    id,
    subjectUserId: id,
    kind: canonicalActivityKindSchema,
    name: shortText,
    source: provenanceSchema,
    actor: activityJournalActorSchema,
    revision: z.number().int().positive(),
    currentRevisionId: id,
    goalIds: z.array(id).max(20),
    assignmentIds: z.array(id).max(200),
    executionIds: z.array(id).max(200),
    structuredWorkoutSessionId: id.nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    sourceReference: dailyCheckInSourceReferenceSchema,
  })
  .strict();
export const dailyContextRuntimeResponseSchema = z
  .object({
    contractVersion: z.literal('activity-journal-v1'),
    subjectUserId: id,
    localDate: dateSchema,
    timeZone: z.string().min(1),
    pendingQuestions: z.array(checkInQuestionRevisionSchema),
    currentAnswers: z.array(dailyCheckInAnswerAuditRevisionSchema),
    observations: z.array(healthObservationSchema),
    assignments: z.array(activityAssignmentSchema),
    executions: z.array(activityExecutionSchema),
    activities: z.array(dailyContextActivitySummarySchema),
    concerns: z.array(bodyConcernSchema),
    capabilities: z.array(capabilitySchema),
    guidance: z.array(guidanceSchema),
    workoutSessionIds: z.array(id),
    nutritionLocalDate: dateSchema,
    generatedAt: z.string().datetime({ offset: true }),
    nutrition: dailyContextNutritionSummarySchema,
    workouts: z.array(dailyContextWorkoutSchema),
    sourceReferences: z.array(dailyCheckInSourceReferenceSchema).max(1000),
  })
  .strict();
export type DailyCheckInActor = z.infer<typeof activityJournalActorSchema>;
export type CreateDailyCheckInQuestionApiInput = z.infer<
  typeof createDailyCheckInQuestionApiInputSchema
>;
export type AnswerDailyCheckInQuestionApiInput = z.infer<
  typeof answerDailyCheckInQuestionApiInputSchema
>;
export type CorrectDailyCheckInAnswerApiInput = z.infer<
  typeof correctDailyCheckInAnswerApiInputSchema
>;
export type DailyCheckInSourceKind = z.infer<typeof dailyCheckInSourceKindSchema>;
export type DailyCheckInSourceReference = z.infer<typeof dailyCheckInSourceReferenceSchema>;
export type DailyCheckInAnswerAuditRevision = z.infer<typeof dailyCheckInAnswerAuditRevisionSchema>;
export type DailyCheckInDetail = z.infer<typeof dailyCheckInDetailSchema>;
