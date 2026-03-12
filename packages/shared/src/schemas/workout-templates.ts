import { z } from 'zod';

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

export const workoutTemplateSectionTypeSchema = z.enum(['warmup', 'main', 'cooldown']);

export const workoutTemplateExerciseSchema = z
  .object({
    id: z.string(),
    exerciseId: requiredStringSchema,
    exerciseName: requiredStringSchema,
    formCues: z.array(requiredStringSchema).max(50).optional(),
    sets: nullablePositiveIntSchema,
    repsMin: nullablePositiveIntSchema,
    repsMax: nullablePositiveIntSchema,
    tempo: nullableTempoSchema,
    restSeconds: nullableRestSecondsSchema,
    supersetGroup: nullableShortStringSchema,
    notes: nullableStringSchema,
    cues: z.array(requiredStringSchema).max(20).default([]),
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

const createOrUpdateWorkoutTemplateInputSchema = z
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

export const createWorkoutTemplateInputSchema = createOrUpdateWorkoutTemplateInputSchema;
export const updateWorkoutTemplateInputSchema = createOrUpdateWorkoutTemplateInputSchema;

export type WorkoutTemplateSectionType = z.infer<typeof workoutTemplateSectionTypeSchema>;
export type WorkoutTemplateExercise = z.infer<typeof workoutTemplateExerciseSchema>;
export type WorkoutTemplateSection = z.infer<typeof workoutTemplateSectionSchema>;
export type WorkoutTemplate = z.infer<typeof workoutTemplateSchema>;
export type CreateWorkoutTemplateInput = z.infer<typeof createWorkoutTemplateInputSchema>;
export type UpdateWorkoutTemplateInput = z.infer<typeof updateWorkoutTemplateInputSchema>;
