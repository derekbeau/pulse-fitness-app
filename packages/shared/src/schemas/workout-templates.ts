import { z } from 'zod';
import { exerciseTrackingTypeSchema } from './exercises.js';

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
const nullableStringSchema = z.preprocess(
  normalizeNullableString,
  requiredLongStringSchema.nullable(),
);
const nullableShortStringSchema = z.preprocess(
  normalizeNullableString,
  z.string().trim().min(1).max(255).nullable(),
);
const nullableTempoSchema = z.preprocess(
  normalizeNullableString,
  z
    .string()
    .trim()
    .regex(/^\d{4}$/)
    .nullable(),
);
const nullablePositiveIntSchema = z.number().int().min(1).max(999).nullable();
const nullableRestSecondsSchema = z.number().int().min(0).max(3600).nullable();
const nullableNonNegativeNumberSchema = z.number().min(0).nullable();

export const workoutTemplateSectionTypeSchema = z.enum(['warmup', 'main', 'cooldown']);
export const workoutTemplateExerciseSetSchema = z
  .object({
    setNumber: z.number().int().min(1),
    targetWeight: nullableNonNegativeNumberSchema.optional(),
    targetWeightMin: nullableNonNegativeNumberSchema.optional(),
    targetWeightMax: nullableNonNegativeNumberSchema.optional(),
    targetSeconds: z.number().int().min(0).nullable().optional(),
    targetDistance: nullableNonNegativeNumberSchema.optional(),
  })
  .refine(
    (value) =>
      value.targetWeightMin === undefined ||
      value.targetWeightMin === null ||
      value.targetWeightMax === undefined ||
      value.targetWeightMax === null ||
      value.targetWeightMin <= value.targetWeightMax,
    {
      message: 'targetWeightMin must be less than or equal to targetWeightMax',
      path: ['targetWeightMax'],
    },
  );

export const workoutTemplateExerciseSchema = z
  .object({
    id: z.string(),
    exerciseId: requiredStringSchema,
    exerciseName: requiredStringSchema,
    // Backward compatibility for legacy payloads; API routes should still return explicit trackingType.
    trackingType: exerciseTrackingTypeSchema.default('weight_reps'),
    exercise: z
      .object({
        formCues: z.array(requiredStringSchema).max(50).default([]),
        coachingNotes: nullableStringSchema.default(null),
        instructions: nullableStringSchema.default(null),
      })
      .optional(),
    // Deprecated in favor of `exercise.formCues`; retained for compatibility with existing clients
    // until all consumers are migrated.
    formCues: z.array(requiredStringSchema).max(50).optional(),
    sets: nullablePositiveIntSchema,
    repsMin: nullablePositiveIntSchema,
    repsMax: nullablePositiveIntSchema,
    tempo: nullableTempoSchema,
    restSeconds: nullableRestSecondsSchema,
    supersetGroup: nullableShortStringSchema,
    notes: nullableStringSchema,
    cues: z.array(requiredStringSchema).max(20).default([]),
    setTargets: z.array(workoutTemplateExerciseSetSchema).max(100).optional(),
    programmingNotes: nullableStringSchema.optional(),
  })
  .refine(
    (value) => value.repsMin === null || value.repsMax === null || value.repsMin <= value.repsMax,
    {
      message: 'repsMin must be less than or equal to repsMax',
      path: ['repsMax'],
    },
  );

export const workoutTemplateSectionSchema = z.object({
  type: workoutTemplateSectionTypeSchema,
  exercises: z.array(workoutTemplateExerciseSchema),
});

const workoutTemplateExerciseInputSchema = z
  .object({
    exerciseId: requiredStringSchema,
    sets: nullablePositiveIntSchema.optional().default(null),
    repsMin: nullablePositiveIntSchema.optional().default(null),
    repsMax: nullablePositiveIntSchema.optional().default(null),
    tempo: nullableTempoSchema.optional().default(null),
    restSeconds: nullableRestSecondsSchema.optional().default(null),
    supersetGroup: nullableShortStringSchema.optional().default(null),
    notes: nullableStringSchema.optional().default(null),
    cues: z.array(requiredStringSchema).max(20).optional().default([]),
    setTargets: z.array(workoutTemplateExerciseSetSchema).max(100).optional(),
    programmingNotes: nullableStringSchema.optional(),
  })
  .refine(
    (value) => value.repsMin === null || value.repsMax === null || value.repsMin <= value.repsMax,
    {
      message: 'repsMin must be less than or equal to repsMax',
      path: ['repsMax'],
    },
  );

const workoutTemplateSectionInputSchema = z.object({
  type: workoutTemplateSectionTypeSchema,
  exercises: z.array(workoutTemplateExerciseInputSchema).max(100).default([]),
});

export const workoutTemplateSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: requiredStringSchema,
  description: nullableStringSchema,
  tags: z.array(requiredStringSchema).max(20),
  sections: z
    .array(workoutTemplateSectionSchema)
    .length(3)
    .refine(
      (sections) =>
        sections[0]?.type === 'warmup' &&
        sections[1]?.type === 'main' &&
        sections[2]?.type === 'cooldown',
      {
        message: 'Sections must be ordered warmup, main, cooldown',
      },
    ),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

const createWorkoutTemplateInputSchemaInternal = z
  .object({
    name: requiredStringSchema,
    description: nullableStringSchema.optional().default(null),
    tags: z.array(requiredStringSchema).max(20).optional().default([]),
    sections: z.array(workoutTemplateSectionInputSchema).max(3).optional().default([]),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();

    value.sections.forEach((section, index) => {
      if (seen.has(section.type)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each section type may only appear once',
          path: ['sections', index, 'type'],
        });
      }

      seen.add(section.type);
    });
  });

export const createWorkoutTemplateInputSchema = createWorkoutTemplateInputSchemaInternal;
export const updateWorkoutTemplateInputSchema = z
  .object({
    name: requiredStringSchema.optional(),
    description: nullableStringSchema.optional(),
    tags: z.array(requiredStringSchema).max(20).optional(),
    sections: z.array(workoutTemplateSectionInputSchema).max(3).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.name === undefined &&
      value.description === undefined &&
      value.tags === undefined &&
      value.sections === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field must be provided',
      });
      return;
    }

    if (!value.sections) {
      return;
    }

    const seen = new Set<string>();

    value.sections.forEach((section, index) => {
      if (seen.has(section.type)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each section type may only appear once',
          path: ['sections', index, 'type'],
        });
      }

      seen.add(section.type);
    });
  });

export const reorderWorkoutTemplateExercisesInputSchema = z.object({
  section: workoutTemplateSectionTypeSchema,
  exerciseIds: z.array(z.string().trim().min(1)).max(100),
});

export type WorkoutTemplateSectionType = z.infer<typeof workoutTemplateSectionTypeSchema>;
export type WorkoutTemplateExerciseSet = z.infer<typeof workoutTemplateExerciseSetSchema>;
export type WorkoutTemplateExercise = z.infer<typeof workoutTemplateExerciseSchema>;
export type WorkoutTemplateSection = z.infer<typeof workoutTemplateSectionSchema>;
export type WorkoutTemplate = z.infer<typeof workoutTemplateSchema>;
export type CreateWorkoutTemplateInput = z.infer<typeof createWorkoutTemplateInputSchema>;
export type UpdateWorkoutTemplateInput = z.infer<typeof updateWorkoutTemplateInputSchema>;
export type ReorderWorkoutTemplateExercisesInput = z.infer<
  typeof reorderWorkoutTemplateExercisesInputSchema
>;
