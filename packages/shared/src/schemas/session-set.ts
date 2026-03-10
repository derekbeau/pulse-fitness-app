import { z } from 'zod';

import { workoutTemplateSectionTypeSchema } from './workout-templates.js';

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
const nullableLongStringSchema = z.preprocess(
  normalizeNullableString,
  z.string().trim().min(1).max(4000).nullable(),
);

export const createSetSchema = z.object({
  exerciseId: requiredStringSchema,
  setNumber: z.number().int().min(1),
  weight: z.number().min(0).nullable().optional().default(null),
  reps: z.number().int().min(0).nullable().optional().default(null),
  seconds: z.number().int().min(0).nullable().optional().default(null),
  distance: z.number().min(0).nullable().optional().default(null),
  section: workoutTemplateSectionTypeSchema.nullable().optional().default(null),
});

export const updateSetSchema = z
  .object({
    weight: z.number().min(0).nullable().optional(),
    reps: z.number().int().min(0).nullable().optional(),
    seconds: z.number().int().min(0).nullable().optional(),
    distance: z.number().min(0).nullable().optional(),
    completed: z.boolean().optional(),
    skipped: z.boolean().optional(),
    notes: z.preprocess(normalizeOptionalString, nullableLongStringSchema.optional()),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one set field must be provided',
  })
  .refine((value) => !(value.completed === true && value.skipped === true), {
    message: 'A set cannot be both completed and skipped',
    path: ['skipped'],
  });

export const batchUpsertSetsSchema = z.object({
  sets: z.array(createSetSchema.extend({ id: z.string().optional() })).max(500),
});

export type CreateSetInput = z.infer<typeof createSetSchema>;
export type UpdateSetInput = z.infer<typeof updateSetSchema>;
export type BatchUpsertSetsInput = z.infer<typeof batchUpsertSetsSchema>;
