import { z } from 'zod';

import {
  activityAssignmentSchema,
  activityExecutionSchema,
  activityJournalActorSchema,
  bodyConcernSchema,
  capabilitySchema,
  checkInAnswerRevisionSchema,
  checkInQuestionRevisionSchema,
  guidanceSchema,
  healthObservationSchema,
  ownedEntityReferenceSchema,
  provenanceSchema,
} from './activity-journal-contracts.js';
import { dateSchema } from './common.js';

const id = z.string().trim().min(1).max(255);
const text = z.string().trim().min(1).max(10_000);
const shortText = z.string().trim().min(1).max(255);
const key = z.string().trim().min(8).max(255);

/** API inputs deliberately omit subject and actor: both are derived from authentication. */
export const dailyContextQuerySchema = z.object({ date: dateSchema.optional() }).strict();
export const createDailyCheckInQuestionApiInputSchema = z
  .object({
    localDate: dateSchema,
    semanticTopic: shortText,
    prompt: text,
    sourceReferences: z
      .array(
        ownedEntityReferenceSchema
          .omit({ subjectUserId: true, revisionId: true })
          .extend({ revisionId: id.nullable().optional() }),
      )
      .min(1)
      .max(50),
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
export const dailyCheckInDetailSchema = z
  .object({
    question: checkInQuestionRevisionSchema,
    currentAnswer: checkInAnswerRevisionSchema.nullable(),
    answerHistory: z.array(checkInAnswerRevisionSchema),
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
        })
        .strict(),
    ),
    totals: z
      .object({ calories: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() })
      .strict(),
  })
  .nullable();
export const dailyContextWorkoutSchema = z
  .object({
    id,
    kind: z.enum(['planned', 'completed']),
    localDate: dateSchema,
    name: shortText,
    status: z.string(),
    sourceId: id,
    sourceTime: z.string().nullable(),
  })
  .strict();
export const dailyContextRuntimeResponseSchema = z
  .object({
    contractVersion: z.literal('activity-journal-v1'),
    subjectUserId: id,
    localDate: dateSchema,
    timeZone: z.string().min(1),
    pendingQuestions: z.array(checkInQuestionRevisionSchema),
    currentAnswers: z.array(checkInAnswerRevisionSchema),
    observations: z.array(healthObservationSchema),
    assignments: z.array(activityAssignmentSchema),
    executions: z.array(activityExecutionSchema),
    concerns: z.array(bodyConcernSchema),
    capabilities: z.array(capabilitySchema),
    guidance: z.array(guidanceSchema),
    workoutSessionIds: z.array(id),
    nutritionLocalDate: dateSchema,
    generatedAt: z.string().datetime({ offset: true }),
    nutrition: dailyContextNutritionSummarySchema,
    workouts: z.array(dailyContextWorkoutSchema),
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
