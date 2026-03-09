import { z } from 'zod';

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

export const exerciseSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  name: requiredStringSchema,
  muscleGroups: z.array(requiredStringSchema).min(1).max(20),
  equipment: requiredStringSchema,
  category: exerciseCategorySchema,
  instructions: nullableInstructionsSchema,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const createExerciseInputSchema = z.object({
  name: requiredStringSchema,
  muscleGroups: z.array(requiredStringSchema).min(1).max(20),
  equipment: requiredStringSchema,
  category: exerciseCategorySchema,
  instructions: nullableInstructionsSchema.optional().default(null),
});

export const updateExerciseInputSchema = z
  .object({
    name: optionalStringSchema,
    muscleGroups: z.array(requiredStringSchema).min(1).max(20).optional(),
    equipment: optionalStringSchema,
    category: exerciseCategorySchema.optional(),
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

export type ExerciseCategory = z.infer<typeof exerciseCategorySchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type CreateExerciseInput = z.infer<typeof createExerciseInputSchema>;
export type UpdateExerciseInput = z.infer<typeof updateExerciseInputSchema>;
export type ExerciseQueryParams = z.infer<typeof exerciseQueryParamsSchema>;
