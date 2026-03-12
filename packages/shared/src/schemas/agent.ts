import { z } from 'zod';

import { dateSchema } from './common.js';
import { exerciseCategorySchema, exerciseTrackingTypeSchema } from './exercises.js';
import { habitTrackingTypeSchema } from './habits.js';
import { workoutSessionStatusSchema } from './workout-sessions.js';

const requiredText = (maxLength = 255) => z.string().trim().min(1).max(maxLength);

export const agentFoodSearchParamsSchema = z.object({
  q: z.string().trim().min(1).max(255).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const agentFoodResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  servingSize: z.string().nullable(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

export const agentCreateFoodInputSchema = z.object({
  name: requiredText(),
  brand: requiredText().nullable().optional(),
  servingSize: z.string().trim().nullable().optional(),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
  source: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

export const agentMealItemInputSchema = z.object({
  foodName: requiredText(),
  quantity: z.number().positive().finite(),
  unit: z.string().trim().min(1).max(50).default('serving'),
});

export const agentCreateMealInputSchema = z.object({
  name: requiredText(120),
  date: dateSchema,
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  items: z.array(agentMealItemInputSchema).min(1),
});

export const agentWorkoutTemplateExerciseInputSchema = z.object({
  name: requiredText(),
  sets: z.number().int().min(1).max(100),
  reps: z.number().int().min(1).max(1000),
  restSeconds: z.number().int().min(0).max(3600).optional(),
  tags: z.array(requiredText()).max(20).optional(),
  formCues: z.array(requiredText(500)).max(50).optional(),
});

export const agentWorkoutTemplateSectionInputSchema = z.object({
  name: requiredText(120),
  exercises: z.array(agentWorkoutTemplateExerciseInputSchema).min(1).max(100),
});

export const agentCreateWorkoutTemplateInputSchema = z.object({
  name: requiredText(255),
  sections: z.array(agentWorkoutTemplateSectionInputSchema).min(1).max(20),
});

export const agentUpdateWorkoutTemplateInputSchema = agentCreateWorkoutTemplateInputSchema;

const optionalText = (maxLength = 4000) =>
  z.preprocess((value) => {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, z.string().trim().min(1).max(maxLength).nullable().optional());

export const agentCreateWorkoutSessionInputSchema = z
  .object({
    templateId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).max(255).optional(),
  })
  .refine((value) => value.templateId !== undefined || value.name !== undefined, {
    message: 'templateId or name is required',
  });

export const agentWorkoutSetUpsertInputSchema = z.object({
  exerciseName: requiredText(),
  setNumber: z.number().int().min(1).max(100),
  weight: z.number().min(0).nullable(),
  reps: z.number().int().min(0).nullable(),
});

export const agentUpdateWorkoutSessionInputSchema = z
  .object({
    sets: z.array(agentWorkoutSetUpsertInputSchema).min(1).max(500).optional(),
    status: workoutSessionStatusSchema.optional(),
    notes: optionalText(4000),
  })
  .refine(
    (value) => value.sets !== undefined || value.status !== undefined || value.notes !== undefined,
    {
      message: 'At least one workout session field must be provided',
    },
  );

export const agentCreateExerciseInputSchema = z.object({
  name: requiredText(),
  category: exerciseCategorySchema.optional(),
  muscleGroups: z.array(requiredText()).min(1).max(20).optional(),
  equipment: requiredText().optional(),
  force: z.boolean().optional().default(false),
});

export const agentPatchExerciseInputSchema = z
  .object({
    muscleGroups: z.array(requiredText()).min(1).max(20).optional(),
    equipment: requiredText().optional(),
    category: exerciseCategorySchema.optional(),
    trackingType: exerciseTrackingTypeSchema.optional(),
    instructions: optionalText(4000),
    formCues: z.array(requiredText(500)).max(50).optional(),
    tags: z.array(requiredText()).max(20).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one exercise field must be provided',
  });

export const agentExerciseDedupCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  similarity: z.number().min(0).max(1),
});

export const agentExerciseCreateResponseSchema = z.discriminatedUnion('created', [
  z.object({
    created: z.literal(false),
    candidates: z.array(agentExerciseDedupCandidateSchema).min(1),
  }),
  z.object({
    created: z.literal(true),
    exercise: z.object({
      id: z.string(),
      name: z.string(),
      category: exerciseCategorySchema,
      trackingType: exerciseTrackingTypeSchema,
      muscleGroups: z.array(z.string()),
      equipment: z.string(),
      instructions: z.string().nullable(),
      tags: z.array(z.string()),
      formCues: z.array(z.string()),
    }),
  }),
]);

export const agentTemplateNewExerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  possibleDuplicates: z.array(z.string()).default([]),
});

export const agentExerciseSearchParamsSchema = z.object({
  q: requiredText(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const agentCreateWeightInputSchema = z.object({
  date: dateSchema,
  weight: z.number().positive().finite().max(1_500),
  notes: z.string().trim().max(2_000).optional(),
});

export const agentUpdateHabitEntryInputSchema = z
  .object({
    date: dateSchema,
    completed: z.boolean().optional(),
    value: z.number().finite().optional(),
  })
  .refine((value) => value.completed !== undefined || value.value !== undefined, {
    message: 'At least one habit entry field must be provided',
  });

export const agentNutritionSummaryParamsSchema = z.object({
  date: dateSchema,
});

const agentContextMacroTotalsSchema = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

export const agentContextMealItemSchema = z.object({
  name: z.string(),
  amount: z.number(),
  unit: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

export const agentContextMealSchema = z.object({
  name: z.string(),
  items: z.array(agentContextMealItemSchema),
});

export const agentContextRecentWorkoutExerciseSchema = z.object({
  name: z.string(),
  sets: z.object({
    total: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
});

export const agentContextRecentWorkoutSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: dateSchema,
  completedAt: z.number().int().nullable(),
  exercises: z.array(agentContextRecentWorkoutExerciseSchema),
});

export const agentContextHabitSchema = z.object({
  name: z.string(),
  trackingType: habitTrackingTypeSchema,
  streak: z.number().int().nonnegative(),
  todayCompleted: z.boolean(),
});

export const agentContextScheduledWorkoutSchema = z.object({
  date: dateSchema,
  templateName: z.string(),
});

export const agentContextResponseSchema = z.object({
  user: z.object({
    name: z.string().nullable(),
  }),
  recentWorkouts: z.array(agentContextRecentWorkoutSchema),
  todayNutrition: z.object({
    actual: agentContextMacroTotalsSchema,
    target: agentContextMacroTotalsSchema,
    meals: z.array(agentContextMealSchema),
  }),
  weight: z.object({
    current: z.number(),
    trend7d: z.number(),
  }),
  habits: z.array(agentContextHabitSchema),
  scheduledWorkouts: z.array(agentContextScheduledWorkoutSchema),
});

export type AgentFoodSearchParams = z.infer<typeof agentFoodSearchParamsSchema>;
export type AgentFoodResult = z.infer<typeof agentFoodResultSchema>;
export type AgentCreateFoodInput = z.infer<typeof agentCreateFoodInputSchema>;
export type AgentMealItemInput = z.infer<typeof agentMealItemInputSchema>;
export type AgentCreateMealInput = z.infer<typeof agentCreateMealInputSchema>;
export type AgentWorkoutTemplateExerciseInput = z.infer<
  typeof agentWorkoutTemplateExerciseInputSchema
>;
export type AgentWorkoutTemplateSectionInput = z.infer<
  typeof agentWorkoutTemplateSectionInputSchema
>;
export type AgentCreateWorkoutTemplateInput = z.infer<typeof agentCreateWorkoutTemplateInputSchema>;
export type AgentUpdateWorkoutTemplateInput = z.infer<typeof agentUpdateWorkoutTemplateInputSchema>;
export type AgentCreateWorkoutSessionInput = z.infer<typeof agentCreateWorkoutSessionInputSchema>;
export type AgentWorkoutSetUpsertInput = z.infer<typeof agentWorkoutSetUpsertInputSchema>;
export type AgentUpdateWorkoutSessionInput = z.infer<typeof agentUpdateWorkoutSessionInputSchema>;
export type AgentCreateExerciseInput = z.infer<typeof agentCreateExerciseInputSchema>;
export type AgentPatchExerciseInput = z.infer<typeof agentPatchExerciseInputSchema>;
export type AgentExerciseDedupCandidate = z.infer<typeof agentExerciseDedupCandidateSchema>;
export type AgentExerciseCreateResponse = z.infer<typeof agentExerciseCreateResponseSchema>;
export type AgentTemplateNewExercise = z.infer<typeof agentTemplateNewExerciseSchema>;
export type AgentExerciseSearchParams = z.infer<typeof agentExerciseSearchParamsSchema>;
export type AgentCreateWeightInput = z.infer<typeof agentCreateWeightInputSchema>;
export type AgentUpdateHabitEntryInput = z.infer<typeof agentUpdateHabitEntryInputSchema>;
export type AgentNutritionSummaryParams = z.infer<typeof agentNutritionSummaryParamsSchema>;
export type AgentContextMealItem = z.infer<typeof agentContextMealItemSchema>;
export type AgentContextMeal = z.infer<typeof agentContextMealSchema>;
export type AgentContextRecentWorkoutExercise = z.infer<
  typeof agentContextRecentWorkoutExerciseSchema
>;
export type AgentContextRecentWorkout = z.infer<typeof agentContextRecentWorkoutSchema>;
export type AgentContextHabit = z.infer<typeof agentContextHabitSchema>;
export type AgentContextScheduledWorkout = z.infer<typeof agentContextScheduledWorkoutSchema>;
export type AgentContextResponse = z.infer<typeof agentContextResponseSchema>;
