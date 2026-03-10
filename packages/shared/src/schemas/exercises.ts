import { z } from 'zod';

import { dateSchema } from './common.js';

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeNullableString = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const requiredStringSchema = z.string().trim().min(1).max(255);

const optionalStringSchema = z.preprocess(normalizeOptionalString, requiredStringSchema.optional());

const nullableInstructionsSchema = z.preprocess(
  normalizeNullableString,
  z.string().trim().min(1).max(4000).nullable(),
);

export const exerciseCategorySchema = z.enum(['compound', 'isolation', 'cardio', 'mobility']);
export const exerciseTrackingTypeSchema = z.enum([
  'weight_reps',
  'weight_seconds',
  'bodyweight_reps',
  'reps_only',
  'reps_seconds',
  'seconds_only',
  'distance',
  'cardio',
]);

export const exerciseSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  name: requiredStringSchema,
  muscleGroups: z.array(requiredStringSchema).min(1).max(20),
  equipment: requiredStringSchema,
  category: exerciseCategorySchema,
  trackingType: exerciseTrackingTypeSchema.default('weight_reps'),
  instructions: nullableInstructionsSchema,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const createExerciseInputSchema = z.object({
  name: requiredStringSchema,
  muscleGroups: z.array(requiredStringSchema).min(1).max(20),
  equipment: requiredStringSchema,
  category: exerciseCategorySchema,
  trackingType: exerciseTrackingTypeSchema.optional().default('weight_reps'),
  instructions: nullableInstructionsSchema.optional().default(null),
});

export const updateExerciseInputSchema = z
  .object({
    name: optionalStringSchema,
    muscleGroups: z.array(requiredStringSchema).min(1).max(20).optional(),
    equipment: optionalStringSchema,
    category: exerciseCategorySchema.optional(),
    trackingType: exerciseTrackingTypeSchema.optional(),
    instructions: nullableInstructionsSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one exercise field must be provided',
  });

export const exerciseQueryParamsSchema = z.object({
  q: optionalStringSchema,
  muscleGroup: optionalStringSchema,
  equipment: optionalStringSchema,
  category: exerciseCategorySchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const exerciseLastPerformanceSetSchema = z.object({
  setNumber: z.number().int().min(1),
  weight: z.number().min(0).nullable(),
  reps: z.number().int().min(0).nullable(),
});

export const exerciseLastPerformanceSchema = z.object({
  sessionId: z.string(),
  date: dateSchema,
  sets: z.array(exerciseLastPerformanceSetSchema).max(100),
});

export type ExerciseCategory = z.infer<typeof exerciseCategorySchema>;
export type ExerciseTrackingType = z.infer<typeof exerciseTrackingTypeSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type CreateExerciseInput = z.infer<typeof createExerciseInputSchema>;
export type UpdateExerciseInput = z.infer<typeof updateExerciseInputSchema>;
export type ExerciseQueryParams = z.infer<typeof exerciseQueryParamsSchema>;
export type ExerciseLastPerformance = z.infer<typeof exerciseLastPerformanceSchema>;
export type ExerciseLastPerformanceSet = z.infer<typeof exerciseLastPerformanceSetSchema>;
