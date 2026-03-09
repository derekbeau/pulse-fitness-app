import { z } from 'zod';

import { dateSchema } from './common.js';
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
const requiredLongStringSchema = z.string().trim().min(1).max(4000);
const optionalLongStringSchema = z.preprocess(
  normalizeOptionalString,
  requiredLongStringSchema.optional(),
);
const nullableLongStringSchema = z.preprocess(
  normalizeNullableString,
  requiredLongStringSchema.nullable(),
);
const nullableTemplateIdSchema = z.preprocess(
  normalizeNullableString,
  requiredStringSchema.nullable(),
);
const nullableIntegerSchema = z.number().int().min(0).nullable();

const validateWorkoutSessionTiming = (
  value: {
    status: 'scheduled' | 'in-progress' | 'completed';
    startedAt: number;
    completedAt: number | null;
  },
  context: z.RefinementCtx,
) => {
  if (value.status === 'completed' && value.completedAt === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'completedAt is required when status is completed',
      path: ['completedAt'],
    });
  }

  if (value.status !== 'completed' && value.completedAt !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'completedAt may only be set when status is completed',
      path: ['completedAt'],
    });
  }

  if (value.completedAt !== null && value.completedAt < value.startedAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'completedAt must be greater than or equal to startedAt',
      path: ['completedAt'],
    });
  }
};

export const workoutSessionStatusSchema = z.enum(['scheduled', 'in-progress', 'completed']);
export const workoutSessionFeedbackScoreSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const workoutSessionFeedbackSchema = z.object({
  energy: workoutSessionFeedbackScoreSchema,
  recovery: workoutSessionFeedbackScoreSchema,
  technique: workoutSessionFeedbackScoreSchema,
  notes: optionalLongStringSchema.optional(),
});

export const sessionSetSchema = z
  .object({
    id: z.string(),
    exerciseId: requiredStringSchema,
    setNumber: z.number().int().min(1),
    weight: z.number().min(0).nullable(),
    reps: nullableIntegerSchema,
    completed: z.boolean(),
    skipped: z.boolean(),
    section: workoutTemplateSectionTypeSchema.nullable(),
    notes: nullableLongStringSchema,
    createdAt: z.number().int(),
  })
  .refine((value) => !(value.completed && value.skipped), {
    message: 'A set cannot be both completed and skipped',
    path: ['skipped'],
  });

export const workoutSessionSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    templateId: z.string().nullable(),
    name: requiredStringSchema,
    date: dateSchema,
    status: workoutSessionStatusSchema,
    startedAt: z.number().int(),
    completedAt: z.number().int().nullable(),
    duration: nullableIntegerSchema,
    feedback: workoutSessionFeedbackSchema.nullable(),
    notes: nullableLongStringSchema,
    sets: z.array(sessionSetSchema).max(500),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .superRefine(validateWorkoutSessionTiming);

export const workoutSessionListItemSchema = z
  .object({
    id: z.string(),
    name: requiredStringSchema,
    date: dateSchema,
    status: workoutSessionStatusSchema,
    templateId: z.string().nullable(),
    templateName: requiredStringSchema.nullable(),
    startedAt: z.number().int(),
    completedAt: z.number().int().nullable(),
    duration: nullableIntegerSchema,
    createdAt: z.number().int(),
  })
  .superRefine(validateWorkoutSessionTiming);

export const sessionSetInputSchema = z
  .object({
    exerciseId: requiredStringSchema,
    setNumber: z.number().int().min(1),
    weight: z.number().min(0).nullable().optional().default(null),
    reps: nullableIntegerSchema.optional().default(null),
    completed: z.boolean().optional().default(false),
    skipped: z.boolean().optional().default(false),
    section: workoutTemplateSectionTypeSchema.nullable().optional().default(null),
    notes: nullableLongStringSchema.optional().default(null),
  })
  .refine((value) => !(value.completed && value.skipped), {
    message: 'A set cannot be both completed and skipped',
    path: ['skipped'],
  });

export const createWorkoutSessionInputSchema = z
  .object({
    templateId: nullableTemplateIdSchema.optional().default(null),
    name: requiredStringSchema,
    date: dateSchema,
    status: workoutSessionStatusSchema.optional().default('in-progress'),
    startedAt: z.number().int(),
    completedAt: z.number().int().nullable().optional().default(null),
    duration: nullableIntegerSchema.optional().default(null),
    feedback: workoutSessionFeedbackSchema.nullable().optional().default(null),
    notes: nullableLongStringSchema.optional().default(null),
    sets: z.array(sessionSetInputSchema).max(500).optional().default([]),
  })
  .superRefine(validateWorkoutSessionTiming);

export const updateWorkoutSessionInputSchema = z
  .object({
    templateId: nullableTemplateIdSchema.optional(),
    name: requiredStringSchema.optional(),
    date: dateSchema.optional(),
    status: workoutSessionStatusSchema.optional(),
    startedAt: z.number().int().optional(),
    completedAt: z.number().int().nullable().optional(),
    duration: nullableIntegerSchema.optional(),
    feedback: workoutSessionFeedbackSchema.nullable().optional(),
    notes: nullableLongStringSchema.optional(),
    sets: z.array(sessionSetInputSchema).max(500).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one workout session field must be provided',
  });

export const saveWorkoutSessionAsTemplateInputSchema = z.preprocess(
  (value) => (value === null || value === undefined ? {} : value),
  z.object({
    name: requiredStringSchema.optional(),
    description: nullableLongStringSchema.optional(),
    tags: z.array(requiredStringSchema).max(20).optional(),
  }),
);

export const workoutSessionQueryParamsSchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    status: workoutSessionStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'from must be less than or equal to to',
    path: ['to'],
  });

export type WorkoutSessionStatus = z.infer<typeof workoutSessionStatusSchema>;
export type WorkoutSessionFeedback = z.infer<typeof workoutSessionFeedbackSchema>;
export type SessionSet = z.infer<typeof sessionSetSchema>;
export type WorkoutSession = z.infer<typeof workoutSessionSchema>;
export type WorkoutSessionListItem = z.infer<typeof workoutSessionListItemSchema>;
export type SessionSetInput = z.infer<typeof sessionSetInputSchema>;
export type CreateWorkoutSessionInput = z.infer<typeof createWorkoutSessionInputSchema>;
export type UpdateWorkoutSessionInput = z.infer<typeof updateWorkoutSessionInputSchema>;
export type SaveWorkoutSessionAsTemplateInput = z.infer<
  typeof saveWorkoutSessionAsTemplateInputSchema
>;
export type WorkoutSessionQueryParams = z.infer<typeof workoutSessionQueryParamsSchema>;
