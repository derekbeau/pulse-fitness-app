import { z } from 'zod';

import { dateSchema } from './common.js';
import { exerciseTrackingTypeSchema } from './exercises.js';
import { workoutTemplateSectionTypeSchema } from './workout-templates.js';

const requiredStringSchema = z.string().trim().min(1).max(255);
const requiredLongStringSchema = z.string().trim().min(1).max(4000);
const nullableLongStringSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  },
  requiredLongStringSchema.nullable(),
);

export const scheduledWorkoutSchema = z.object({
  id: z.string(),
  userId: z.string(),
  templateId: z.string().nullable(),
  date: dateSchema,
  sessionId: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
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

export const scheduledWorkoutExerciseSetSchema = z.object({
  setNumber: z.number().int().min(1),
  repsMin: z.number().int().min(1).nullable(),
  repsMax: z.number().int().min(1).nullable(),
  reps: z.number().int().min(1).nullable(),
  targetWeight: z.number().min(0).nullable(),
  targetWeightMin: z.number().min(0).nullable(),
  targetWeightMax: z.number().min(0).nullable(),
  targetSeconds: z.number().int().min(0).nullable(),
  targetDistance: z.number().min(0).nullable(),
});

export const scheduledWorkoutExerciseAgentNotesMetaSchema = z.object({
  author: requiredStringSchema,
  generatedAt: z.string().datetime({ offset: true }),
  scheduledDateAtGeneration: dateSchema,
  stale: z.boolean().optional(),
});

export const scheduledWorkoutExerciseSchema = z.object({
  exerciseId: requiredStringSchema,
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

export const scheduledWorkoutTemplateDriftSchema = z.object({
  changedAt: z.number().int(),
  summary: requiredLongStringSchema,
});

export const scheduledWorkoutStaleExerciseSchema = z.object({
  exerciseId: requiredStringSchema,
  snapshotName: requiredStringSchema,
});

export const scheduledWorkoutDetailSchema = scheduledWorkoutSchema.extend({
  exercises: z.array(scheduledWorkoutExerciseSchema),
  templateDrift: scheduledWorkoutTemplateDriftSchema.nullable().optional(),
  staleExercises: z.array(scheduledWorkoutStaleExerciseSchema).optional(),
  templateDeleted: z.boolean().optional(),
});

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
export type ScheduledWorkoutTemplateDrift = z.infer<typeof scheduledWorkoutTemplateDriftSchema>;
export type ScheduledWorkoutStaleExercise = z.infer<typeof scheduledWorkoutStaleExerciseSchema>;
export type ScheduledWorkoutDetail = z.infer<typeof scheduledWorkoutDetailSchema>;
