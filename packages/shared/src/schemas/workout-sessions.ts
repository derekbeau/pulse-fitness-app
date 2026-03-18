import { z } from 'zod';

import { dateSchema } from './common.js';
import { exerciseTrackingTypeSchema } from './exercises.js';
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
const nullableShortStringSchema = z.preprocess(
  normalizeNullableString,
  requiredStringSchema.nullable(),
);
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
const exerciseNotesInputSchema = z.record(requiredStringSchema, nullableLongStringSchema);

const validateWorkoutSessionTiming = (
  value: {
    status: 'scheduled' | 'in-progress' | 'paused' | 'cancelled' | 'completed';
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

const hasValidTargetWeightRange = (value: {
  targetWeightMin?: number | null;
  targetWeightMax?: number | null;
}) =>
  value.targetWeightMin === undefined ||
  value.targetWeightMin === null ||
  value.targetWeightMax === undefined ||
  value.targetWeightMax === null ||
  value.targetWeightMin <= value.targetWeightMax;

export const workoutSessionStatusSchema = z.enum([
  'scheduled',
  'in-progress',
  'paused',
  'cancelled',
  'completed',
]);
export const timeSegmentsSchema = z.array(
  z.object({
    start: z.string(),
    end: z.string().nullable(),
  }),
);

const parseIsoTimestamp = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const validateTimeSegments = (
  timeSegments: z.infer<typeof timeSegmentsSchema>,
  context: z.RefinementCtx,
) => {
  let previousEnd: number | null = null;

  for (const [index, segment] of timeSegments.entries()) {
    const start = parseIsoTimestamp(segment.start);

    if (start === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Segment start must be a valid ISO timestamp',
        path: [index, 'start'],
      });
      return;
    }

    if (segment.end !== null) {
      const end = parseIsoTimestamp(segment.end);
      if (end === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Segment end must be a valid ISO timestamp',
          path: [index, 'end'],
        });
        return;
      }

      if (end < start) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Segment end must be greater than or equal to segment start',
          path: [index, 'end'],
        });
        return;
      }

      if (previousEnd !== null && start < previousEnd) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Time segments must be chronologically ordered and non-overlapping',
          path: [index, 'start'],
        });
        return;
      }

      previousEnd = end;
      continue;
    }

    if (index !== timeSegments.length - 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only the final segment may be open',
        path: [index, 'end'],
      });
      return;
    }

    if (previousEnd !== null && start < previousEnd) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Time segments must be chronologically ordered and non-overlapping',
        path: [index, 'start'],
      });
      return;
    }
  }
};
export const validatedTimeSegmentsSchema = timeSegmentsSchema.superRefine(validateTimeSegments);
export const workoutSessionFeedbackScoreSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const workoutSessionFeedbackResponseTypeSchema = z.enum([
  'scale',
  'text',
  'yes_no',
  'emoji',
  'slider',
  'multi_select',
]);

const workoutSessionFeedbackResponseBaseSchema = z.object({
  id: requiredStringSchema,
  label: requiredStringSchema,
  notes: optionalLongStringSchema.optional(),
});

export const workoutSessionFeedbackResponseSchema = z.discriminatedUnion('type', [
  workoutSessionFeedbackResponseBaseSchema.extend({
    type: z.literal('scale'),
    value: z.number(),
  }),
  workoutSessionFeedbackResponseBaseSchema.extend({
    type: z.literal('slider'),
    value: z.number(),
  }),
  workoutSessionFeedbackResponseBaseSchema.extend({
    type: z.literal('yes_no'),
    value: z.boolean(),
  }),
  workoutSessionFeedbackResponseBaseSchema.extend({
    type: z.literal('emoji'),
    value: requiredStringSchema,
  }),
  workoutSessionFeedbackResponseBaseSchema.extend({
    type: z.literal('text'),
    value: nullableLongStringSchema,
  }),
  workoutSessionFeedbackResponseBaseSchema.extend({
    type: z.literal('multi_select'),
    value: z.array(requiredStringSchema).max(20),
  }),
]);

export const workoutSessionFeedbackResponseValueSchema = z.union([
  z.number(),
  z.boolean(),
  requiredStringSchema,
  nullableLongStringSchema,
  z.array(requiredStringSchema).max(20),
]);

export const workoutSessionFeedbackSchema = z.object({
  energy: workoutSessionFeedbackScoreSchema,
  recovery: workoutSessionFeedbackScoreSchema,
  technique: workoutSessionFeedbackScoreSchema,
  notes: optionalLongStringSchema.optional(),
  responses: z.array(workoutSessionFeedbackResponseSchema).max(50).optional(),
});

export const sessionSetSchema = z
  .object({
    id: z.string(),
    exerciseId: requiredStringSchema,
    orderIndex: z.number().int().min(0).optional(),
    setNumber: z.number().int().min(1),
    weight: z.number().min(0).nullable(),
    reps: nullableIntegerSchema,
    targetWeight: z.number().min(0).nullable().optional(),
    targetWeightMin: z.number().min(0).nullable().optional(),
    targetWeightMax: z.number().min(0).nullable().optional(),
    targetSeconds: nullableIntegerSchema.optional(),
    targetDistance: z.number().min(0).nullable().optional(),
    completed: z.boolean(),
    skipped: z.boolean(),
    section: workoutTemplateSectionTypeSchema.nullable(),
    notes: nullableLongStringSchema,
    createdAt: z.number().int(),
  })
  .refine((value) => !(value.completed && value.skipped), {
    message: 'A set cannot be both completed and skipped',
    path: ['skipped'],
  })
  .refine(hasValidTargetWeightRange, {
    message: 'targetWeightMin must be less than or equal to targetWeightMax',
    path: ['targetWeightMax'],
  });

export const workoutSessionExerciseSchema = z.object({
  exerciseId: requiredStringSchema,
  exerciseName: requiredStringSchema,
  supersetGroup: nullableShortStringSchema.default(null),
  trackingType: exerciseTrackingTypeSchema.nullable().optional(),
  exercise: z
    .object({
      formCues: z.array(requiredStringSchema).max(50).default([]),
      coachingNotes: nullableLongStringSchema.default(null),
      instructions: nullableLongStringSchema.default(null),
    })
    .optional(),
  orderIndex: z.number().int().min(0),
  section: workoutTemplateSectionTypeSchema.nullable(),
  sets: z.array(sessionSetSchema).max(500),
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
    timeSegments: timeSegmentsSchema,
    feedback: workoutSessionFeedbackSchema.nullable(),
    notes: nullableLongStringSchema,
    exercises: z.array(workoutSessionExerciseSchema).optional(),
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
    exerciseCount: z.number().int().nonnegative(),
    createdAt: z.number().int(),
  })
  .superRefine(validateWorkoutSessionTiming);

export const sessionSetInputSchema = z
  .object({
    exerciseId: requiredStringSchema.optional(),
    exerciseName: requiredStringSchema.optional(),
    orderIndex: z.number().int().min(0).optional().default(0),
    setNumber: z.number().int().min(1),
    weight: z.number().min(0).nullable().optional().default(null),
    reps: nullableIntegerSchema.optional().default(null),
    targetWeight: z.number().min(0).nullable().optional(),
    targetWeightMin: z.number().min(0).nullable().optional(),
    targetWeightMax: z.number().min(0).nullable().optional(),
    targetSeconds: nullableIntegerSchema.optional(),
    targetDistance: z.number().min(0).nullable().optional(),
    completed: z.boolean().optional().default(false),
    skipped: z.boolean().optional().default(false),
    supersetGroup: nullableShortStringSchema.optional().default(null),
    section: workoutTemplateSectionTypeSchema.nullable().optional().default(null),
    notes: nullableLongStringSchema.optional().default(null),
  })
  .refine((value) => !(value.completed && value.skipped), {
    message: 'A set cannot be both completed and skipped',
    path: ['skipped'],
  })
  .refine(hasValidTargetWeightRange, {
    message: 'targetWeightMin must be less than or equal to targetWeightMax',
    path: ['targetWeightMax'],
  })
  .transform((value, context) => {
    // Fastify validates/transforms request bodies before preHandler hooks run.
    // agentRequestTransform handles exerciseName resolution later via the
    // "exerciseId as name" fallback when this transform normalizes aliases.
    const resolvedExerciseId = value.exerciseId ?? value.exerciseName;
    if (!resolvedExerciseId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'exerciseId or exerciseName is required',
        path: ['exerciseId'],
      });
      return z.NEVER;
    }

    const normalized = {
      ...value,
      exerciseId: resolvedExerciseId,
    };
    delete normalized.exerciseName;
    return normalized;
  });

const workoutSessionExerciseMutationInputSchema = z
  .object({
    exerciseId: requiredStringSchema.optional(),
    exerciseName: requiredStringSchema.optional(),
    name: requiredStringSchema.optional(),
    sets: z.number().int().min(1).max(100),
    reps: z.number().int().min(0).max(1000).nullable().optional(),
    weight: z.number().min(0).nullable().optional(),
    section: workoutTemplateSectionTypeSchema.optional().default('main'),
  })
  .transform((value, context) => {
    const resolvedExerciseId = value.exerciseId ?? value.exerciseName ?? value.name;
    if (!resolvedExerciseId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'exerciseId, exerciseName, or name is required',
        path: ['exerciseId'],
      });
      return z.NEVER;
    }

    const normalized = {
      ...value,
      exerciseId: resolvedExerciseId,
    };
    delete normalized.exerciseName;
    delete normalized.name;
    return normalized;
  });

const workoutSessionExerciseUpdateInputSchema = z.object({
  exerciseId: requiredStringSchema,
  supersetGroup: nullableShortStringSchema.optional().default(null),
});

export const createWorkoutSessionInputSchema = z
  .object({
    templateId: nullableTemplateIdSchema.optional().default(null),
    templateName: requiredStringSchema.optional(),
    name: requiredStringSchema,
    date: dateSchema,
    status: workoutSessionStatusSchema.optional().default('in-progress'),
    startedAt: z.number().int(),
    completedAt: z.number().int().nullable().optional().default(null),
    duration: nullableIntegerSchema.optional().default(null),
    timeSegments: validatedTimeSegmentsSchema.optional().default([]),
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
    timeSegments: validatedTimeSegmentsSchema.optional(),
    feedback: workoutSessionFeedbackSchema.nullable().optional(),
    notes: nullableLongStringSchema.optional(),
    exerciseNotes: exerciseNotesInputSchema.optional(),
    sets: z.array(sessionSetInputSchema).max(500).optional(),
    addExercises: z.array(workoutSessionExerciseMutationInputSchema).min(1).max(100).optional(),
    removeExercises: z.array(requiredStringSchema).min(1).max(100).optional(),
    reorderExercises: z.array(requiredStringSchema).min(1).max(200).optional(),
    exercises: z.array(workoutSessionExerciseUpdateInputSchema).min(1).max(200).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one workout session field must be provided',
  });

export const updateWorkoutSessionTimeSegmentsInputSchema = z.object({
  timeSegments: validatedTimeSegmentsSchema,
});

export const setCorrectionSchema = z
  .object({
    setId: requiredStringSchema,
    weight: z.number().min(0).optional(),
    reps: z.number().int().min(0).optional(),
    rpe: z.number().min(0).max(10).optional(),
  })
  .refine(
    (value) => value.weight !== undefined || value.reps !== undefined || value.rpe !== undefined,
    {
      message: 'At least one correction field must be provided',
    },
  );

export const sessionCorrectionRequestSchema = z.object({
  corrections: z.array(setCorrectionSchema).min(1).max(500),
});

export const reorderWorkoutSessionExercisesInputSchema = z.object({
  section: workoutTemplateSectionTypeSchema,
  exerciseIds: z.array(requiredStringSchema).max(100),
});

export const swapWorkoutSessionExerciseInputSchema = z.object({
  newExerciseId: requiredStringSchema,
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
    status: z
      .preprocess((value) => {
        if (value === undefined) {
          return undefined;
        }

        return Array.isArray(value) ? value : [value];
      }, z.array(workoutSessionStatusSchema).min(1))
      .optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'from must be less than or equal to to',
    path: ['to'],
  });

export type WorkoutSessionStatus = z.infer<typeof workoutSessionStatusSchema>;
export type WorkoutSessionTimeSegment = z.infer<typeof timeSegmentsSchema>[number];
export type WorkoutSessionFeedback = z.infer<typeof workoutSessionFeedbackSchema>;
export type WorkoutSessionFeedbackResponse = z.infer<typeof workoutSessionFeedbackResponseSchema>;
export type SessionSet = z.infer<typeof sessionSetSchema>;
export type WorkoutSessionExercise = z.infer<typeof workoutSessionExerciseSchema>;
export type WorkoutSession = z.infer<typeof workoutSessionSchema>;
export type WorkoutSessionListItem = z.infer<typeof workoutSessionListItemSchema>;
export type SessionSetInput = z.infer<typeof sessionSetInputSchema>;
export type CreateWorkoutSessionInput = z.infer<typeof createWorkoutSessionInputSchema>;
export type UpdateWorkoutSessionInput = z.infer<typeof updateWorkoutSessionInputSchema>;
export type UpdateWorkoutSessionTimeSegmentsInput = z.infer<
  typeof updateWorkoutSessionTimeSegmentsInputSchema
>;
export type SetCorrection = z.infer<typeof setCorrectionSchema>;
export type SessionCorrectionRequest = z.infer<typeof sessionCorrectionRequestSchema>;
export type ReorderWorkoutSessionExercisesInput = z.infer<
  typeof reorderWorkoutSessionExercisesInputSchema
>;
export type SwapWorkoutSessionExerciseInput = z.infer<typeof swapWorkoutSessionExerciseInputSchema>;
export type SaveWorkoutSessionAsTemplateInput = z.infer<
  typeof saveWorkoutSessionAsTemplateInputSchema
>;
export type WorkoutSessionQueryParams = z.infer<typeof workoutSessionQueryParamsSchema>;
