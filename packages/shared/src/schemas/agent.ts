import { z } from 'zod';

import { dateSchema } from './common.js';
import { habitTrackingTypeSchema } from './habits.js';
import { workoutSessionStatusSchema } from './workout-sessions.js';
import { workoutTemplateSectionTypeSchema } from './workout-templates.js';

const requiredText = (maxLength = 255) => z.string().trim().min(1).max(maxLength);

export const agentWorkoutTemplateExerciseInputSchema = z.object({
  name: requiredText(),
  sets: z.number().int().min(1).max(100),
  reps: z.union([z.number().int().min(1).max(1000), z.string().min(1).max(20)]),
  restSeconds: z.number().int().min(0).max(3600).optional(),
  tags: z.array(requiredText()).max(20).optional(),
  cues: z.array(requiredText(500)).max(50).optional(),
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

export const agentWorkoutSessionExerciseMutationSchema = z.object({
  name: requiredText(),
  sets: z.number().int().min(1).max(100),
  reps: z.number().int().min(0).max(1000).nullable().optional(),
  weight: z.number().min(0).nullable().optional(),
  section: workoutTemplateSectionTypeSchema.optional().default('main'),
});

export const agentUpdateWorkoutSessionInputSchema = z
  .object({
    sets: z.array(agentWorkoutSetUpsertInputSchema).min(1).max(500).optional(),
    addExercises: z.array(agentWorkoutSessionExerciseMutationSchema).min(1).max(100).optional(),
    removeExercises: z.array(z.string().trim().min(1)).min(1).max(100).optional(),
    reorderExercises: z.array(z.string().trim().min(1)).min(1).max(200).optional(),
    status: workoutSessionStatusSchema.optional(),
    notes: optionalText(4000),
  })
  .refine(
    (value) =>
      value.sets !== undefined ||
      value.addExercises !== undefined ||
      value.removeExercises !== undefined ||
      value.reorderExercises !== undefined ||
      value.status !== undefined ||
      value.notes !== undefined,
    {
      message: 'At least one workout session field must be provided',
    },
  );

export const agentExerciseDedupCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  similarity: z.number().min(0).max(1),
});

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
export type AgentExerciseDedupCandidate = z.infer<typeof agentExerciseDedupCandidateSchema>;
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
