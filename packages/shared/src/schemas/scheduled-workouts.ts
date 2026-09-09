import { feedbackNoteReviewSchema } from './feedback-provenance.js';
import { z } from 'zod';

import { dateSchema } from './common.js';
import { exerciseTrackingTypeSchema } from './exercises.js';
import { workoutTemplateSectionTypeSchema } from './workout-templates.js';
import {
  workoutFeedbackQuestionInputListSchema,
  workoutFeedbackQuestionListSchema,
} from './workout-feedback.js';

const requiredStringSchema = z.string().trim().min(1).max(255);
const requiredLongStringSchema = z.string().trim().min(1).max(4000);
const nullableLongStringSchema = z.preprocess((value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}, requiredLongStringSchema.nullable());

export const scheduledWorkoutSchema = z.object({
  feedbackNoteReview: feedbackNoteReviewSchema.optional(),
  id: z.string(),
  userId: z.string(),
  templateId: z.string().nullable(),
  date: dateSchema,
  sessionId: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  feedbackQuestions: workoutFeedbackQuestionListSchema.optional(),
});

export const scheduledWorkoutListItemSchema = z.object({
  id: z.string(),
  date: dateSchema,
  templateId: z.string().nullable(),
  templateName: requiredStringSchema.nullable(),
  templateTrackingTypes: z.array(exerciseTrackingTypeSchema).optional(),
  sessionId: z.string().nullable(),
  createdAt: z.number().int(),
});

export const createScheduledWorkoutInputSchema = z.object({
  templateId: requiredStringSchema,
  date: dateSchema,
});

export const updateScheduledWorkoutInputSchema = z
  .object({
    date: dateSchema.optional(),
    feedbackQuestions: workoutFeedbackQuestionInputListSchema.optional(),
    feedbackQuestionsExpectedRevision: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.feedbackQuestions !== undefined &&
      value.feedbackQuestionsExpectedRevision === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['feedbackQuestionsExpectedRevision'],
        message: 'feedbackQuestionsExpectedRevision is required when feedbackQuestions is provided',
      });
    }
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one scheduled workout field must be provided',
  });

export const scheduledWorkoutQueryParamsSchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
  })
  .refine((value) => value.from <= value.to, {
    message: 'from must be less than or equal to to',
    path: ['to'],
  });

const scheduledWorkoutExerciseSetTargetFieldSchemas = {
  targetWeight: z.number().finite().nullable(),
  targetWeightMin: z.number().finite().nullable(),
  targetWeightMax: z.number().finite().nullable(),
  targetSeconds: z.number().finite().nullable(),
  targetDistance: z.number().finite().nullable(),
  targetZone: z.number().finite().nullable(),
};

export const scheduledWorkoutExerciseSetSchema = z.object({
  // Detail reads must surface malformed legacy targets so the semantic inspector can emit an
  // actionable integrity warning. Mutation input schemas below remain strict.
  setNumber: z.number().finite(),
  repsMin: z.number().finite().nullable(),
  repsMax: z.number().finite().nullable(),
  reps: z.number().finite().nullable(),
  ...scheduledWorkoutExerciseSetTargetFieldSchemas,
});

export const scheduledWorkoutExerciseAgentNotesMetaSchema = z.object({
  author: requiredStringSchema,
  generatedAt: z.string().datetime({ offset: true }),
  scheduledDateAtGeneration: dateSchema,
  stale: z.boolean(),
});

export const scheduledWorkoutExerciseSchema = z.object({
  exerciseId: requiredStringSchema,
  exerciseName: requiredStringSchema,
  section: workoutTemplateSectionTypeSchema,
  orderIndex: z.number().int().min(0),
  programmingNotes: nullableLongStringSchema,
  agentNotes: nullableLongStringSchema,
  agentNotesMeta: scheduledWorkoutExerciseAgentNotesMetaSchema.nullable(),
  templateCues: z.array(requiredStringSchema).max(50).nullable(),
  supersetGroup: requiredStringSchema.nullable(),
  tempo: requiredStringSchema.nullable(),
  restSeconds: z.number().int().min(0).nullable(),
  sets: z.array(scheduledWorkoutExerciseSetSchema),
});

export const scheduledWorkoutTemplateDifferenceSchema = z.object({
  category: z.enum(['prescription', 'integrity']),
  severity: z.enum(['info', 'warning']),
  exerciseId: requiredStringSchema.nullable(),
  exerciseName: requiredStringSchema,
  field: requiredStringSchema,
  label: requiredStringSchema,
  setNumber: z.number().finite().nullable(),
  scheduledValue: requiredLongStringSchema,
  templateValue: requiredLongStringSchema,
  provenance: z.enum(['known', 'unknown']),
});

export const scheduledWorkoutTemplateDiffSchema = z.object({
  status: z.enum(['customized', 'integrity_warning']),
  summary: requiredLongStringSchema,
  provenance: z.object({
    status: z.enum(['known', 'unknown']),
    scheduledTemplateVersion: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    currentTemplateVersion: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  differences: z.array(scheduledWorkoutTemplateDifferenceSchema).min(1),
});

export const scheduledWorkoutStaleExerciseSchema = z.object({
  exerciseId: requiredStringSchema,
  snapshotName: requiredStringSchema,
});

export const scheduledWorkoutDetailSchema = scheduledWorkoutSchema.extend({
  exercises: z.array(scheduledWorkoutExerciseSchema),
  templateDiff: scheduledWorkoutTemplateDiffSchema.nullable(),
  staleExercises: z.array(scheduledWorkoutStaleExerciseSchema),
  templateDeleted: z.boolean(),
});

export const updateScheduledWorkoutExerciseNotesInputSchema = z.object({
  notes: z
    .array(
      z.object({
        exerciseId: requiredStringSchema,
        agentNotes: nullableLongStringSchema,
      }),
    )
    .min(1)
    .max(200),
});

export const updateScheduledWorkoutExerciseNotesResponseSchema = scheduledWorkoutDetailSchema;

export const swapScheduledWorkoutExerciseInputSchema = z.object({
  fromExerciseId: requiredStringSchema,
  toExerciseId: z.preprocess((value) => {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, requiredStringSchema.nullable()),
  carryOverProgrammingNotes: z.boolean().optional(),
  preserveSets: z.boolean().optional(),
});

export const swapScheduledWorkoutExerciseResponseSchema = scheduledWorkoutDetailSchema;

const scheduledWorkoutEditableSectionSchema = z.enum(['warmup', 'main', 'cooldown']);

export const reorderScheduledWorkoutInputSchema = z
  .object({
    order: z.array(z.string().uuid()).min(1),
  })
  .strict();

export const updateScheduledWorkoutExercisesInputSchema = z
  .object({
    updates: z
      .array(
        z
          .object({
            exerciseId: z.string().uuid(),
            supersetGroup: z.string().nullable().optional(),
            section: scheduledWorkoutEditableSectionSchema.optional(),
            tempo: z.string().nullable().optional(),
            restSeconds: z.number().int().nonnegative().nullable().optional(),
            programmingNotes: z.string().nullable().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const editableSetFields = [
  'targetWeight',
  'targetWeightMin',
  'targetWeightMax',
  'targetSeconds',
  'targetDistance',
  'targetZone',
  'repsMin',
  'repsMax',
  'reps',
] as const;

export const updateScheduledWorkoutExerciseSetsInputSchema = z
  .object({
    exerciseId: z.string().uuid(),
    sets: z
      .array(
        z
          .object({
            setNumber: z.number().int().positive(),
            targetWeight: scheduledWorkoutExerciseSetTargetFieldSchemas.targetWeight.optional(),
            targetWeightMin:
              scheduledWorkoutExerciseSetTargetFieldSchemas.targetWeightMin.optional(),
            targetWeightMax:
              scheduledWorkoutExerciseSetTargetFieldSchemas.targetWeightMax.optional(),
            targetSeconds: scheduledWorkoutExerciseSetTargetFieldSchemas.targetSeconds.optional(),
            targetDistance: scheduledWorkoutExerciseSetTargetFieldSchemas.targetDistance.optional(),
            targetZone: scheduledWorkoutExerciseSetTargetFieldSchemas.targetZone.optional(),
            repsMin: z.number().int().nonnegative().nullable().optional(),
            repsMax: z.number().int().nonnegative().nullable().optional(),
            reps: z.number().int().nonnegative().nullable().optional(),
            remove: z.literal(true).optional(),
          })
          .strict()
          .refine(
            (setUpdate) =>
              !(setUpdate.remove && editableSetFields.some((field) => setUpdate[field] != null)),
            {
              message: 'remove cannot be combined with target fields',
            },
          ),
      )
      .min(1),
  })
  .strict();

export type ScheduledWorkout = z.infer<typeof scheduledWorkoutSchema>;
export type ScheduledWorkoutListItem = z.infer<typeof scheduledWorkoutListItemSchema>;
export type CreateScheduledWorkoutInput = z.infer<typeof createScheduledWorkoutInputSchema>;
export type UpdateScheduledWorkoutInput = z.infer<typeof updateScheduledWorkoutInputSchema>;
export type ScheduledWorkoutQueryParams = z.infer<typeof scheduledWorkoutQueryParamsSchema>;
export type ScheduledWorkoutExerciseSet = z.infer<typeof scheduledWorkoutExerciseSetSchema>;
export type ScheduledWorkoutExerciseAgentNotesMeta = z.infer<
  typeof scheduledWorkoutExerciseAgentNotesMetaSchema
>;
export type ScheduledWorkoutExercise = z.infer<typeof scheduledWorkoutExerciseSchema>;
export type ScheduledWorkoutStaleExercise = z.infer<typeof scheduledWorkoutStaleExerciseSchema>;
export type ScheduledWorkoutDetail = z.infer<typeof scheduledWorkoutDetailSchema>;
export type ScheduledWorkoutTemplateDiff = z.infer<typeof scheduledWorkoutTemplateDiffSchema>;
export type ScheduledWorkoutTemplateDifference = z.infer<
  typeof scheduledWorkoutTemplateDifferenceSchema
>;
export type UpdateScheduledWorkoutExerciseNotesInput = z.infer<
  typeof updateScheduledWorkoutExerciseNotesInputSchema
>;
export type SwapScheduledWorkoutExerciseInput = z.infer<
  typeof swapScheduledWorkoutExerciseInputSchema
>;
export type ReorderScheduledWorkoutInput = z.infer<typeof reorderScheduledWorkoutInputSchema>;
export type UpdateScheduledWorkoutExercisesInput = z.infer<
  typeof updateScheduledWorkoutExercisesInputSchema
>;
export type UpdateScheduledWorkoutExerciseSetsInput = z.infer<
  typeof updateScheduledWorkoutExerciseSetsInputSchema
>;
