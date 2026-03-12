import { z } from 'zod';

export const habitTrackingTypeSchema = z.enum(['boolean', 'numeric', 'time']);
export const habitFrequencySchema = z.enum(['daily', 'weekly', 'specific_days']);
export const referenceSourceSchema = z
  .enum(['weight', 'nutrition_daily', 'nutrition_meal', 'workout'])
  .nullable();

const weightReferenceConfigSchema = z.object({
  condition: z.literal('exists_today'),
});

const nutritionDailyReferenceConfigSchema = z.object({
  field: z.enum(['protein', 'calories', 'carbs', 'fat']),
  op: z.enum(['gte', 'lte', 'eq']),
  value: z.number().finite(),
});

const nutritionMealReferenceConfigSchema = z.object({
  mealType: z.string().trim().min(1).max(120),
  field: z.enum(['protein', 'calories', 'carbs', 'fat']),
  op: z.enum(['gte', 'lte', 'eq']),
  value: z.number().finite(),
});

const workoutReferenceConfigSchema = z.object({
  condition: z.literal('session_completed_today'),
});

export const referenceConfigSchema = z
  .union([
    weightReferenceConfigSchema,
    nutritionDailyReferenceConfigSchema,
    nutritionMealReferenceConfigSchema,
    workoutReferenceConfigSchema,
  ])
  .nullable();

const nullableTrimmedString = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength).nullable();

const targetSchema = z.number().positive().nullable();
// Nullable specific-day schedules should still require at least one weekday when provided.
const scheduledDaysSchema = z.array(z.number().int().min(0).max(6)).min(1).nullable();

const habitDefinitionFieldsSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).nullable().optional(),
  emoji: nullableTrimmedString(32).optional(),
  trackingType: habitTrackingTypeSchema,
  target: targetSchema.optional(),
  unit: nullableTrimmedString(50).optional(),
  frequency: habitFrequencySchema.optional(),
  frequencyTarget: z.number().int().min(1).max(7).nullable().optional(),
  scheduledDays: scheduledDaysSchema.optional(),
  pausedUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  referenceSource: referenceSourceSchema.optional(),
  referenceConfig: referenceConfigSchema.optional(),
});

const validateHabitDefinition = (
  value: z.infer<typeof habitDefinitionFieldsSchema>,
  context: z.RefinementCtx,
) => {
  const requiresTarget = value.trackingType !== 'boolean';
  const target = value.target ?? null;
  const unit = value.unit ?? null;
  const frequency = value.frequency ?? 'daily';
  const frequencyTarget = value.frequencyTarget ?? null;
  const scheduledDays = value.scheduledDays ?? null;
  const referenceSource = value.referenceSource ?? null;
  const referenceConfig = value.referenceConfig ?? null;

  if (requiresTarget) {
    if (target === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Target is required for numeric and time habits',
        path: ['target'],
      });
    }

    if (unit === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unit is required for numeric and time habits',
        path: ['unit'],
      });
    }
  } else {
    if (target !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Boolean habits cannot define a target',
        path: ['target'],
      });
    }

    if (unit !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Boolean habits cannot define a unit',
        path: ['unit'],
      });
    }
  }

  if (frequency === 'weekly' && frequencyTarget === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Weekly habits require frequencyTarget',
      path: ['frequencyTarget'],
    });
  }

  if (frequency === 'specific_days') {
    if (scheduledDays === null || scheduledDays.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Specific-day habits require scheduledDays',
        path: ['scheduledDays'],
      });
    }
  }

  if (referenceSource === null && referenceConfig !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'referenceConfig requires referenceSource',
      path: ['referenceConfig'],
    });
    return;
  }

  if (referenceSource !== null && referenceConfig === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'referenceConfig is required when referenceSource is set',
      path: ['referenceConfig'],
    });
    return;
  }

  if (referenceSource === null || referenceConfig === null) {
    return;
  }

  const referenceConfigBySourceValidators = {
    weight: weightReferenceConfigSchema,
    nutrition_daily: nutritionDailyReferenceConfigSchema,
    nutrition_meal: nutritionMealReferenceConfigSchema,
    workout: workoutReferenceConfigSchema,
  } as const;

  const parsedReferenceConfig =
    referenceConfigBySourceValidators[referenceSource].safeParse(referenceConfig);
  if (!parsedReferenceConfig.success) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid referenceConfig for source ${referenceSource}`,
      path: ['referenceConfig'],
    });
  }
};

const habitDefinitionSchema = habitDefinitionFieldsSchema.superRefine(validateHabitDefinition);

export const createHabitInputSchema = habitDefinitionSchema;

export const updateHabitInputSchema = habitDefinitionFieldsSchema
  .partial()
  .extend({
    active: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.frequency === 'weekly' &&
      (value.frequencyTarget === undefined || value.frequencyTarget === null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Weekly habits require frequencyTarget',
        path: ['frequencyTarget'],
      });
    }

    if (
      value.frequency === 'specific_days' &&
      (value.scheduledDays === undefined ||
        value.scheduledDays === null ||
        value.scheduledDays.length === 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Specific-day habits require scheduledDays',
        path: ['scheduledDays'],
      });
    }

    if (value.referenceSource === null && value.referenceConfig !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'referenceConfig cannot be set when referenceSource is null',
        path: ['referenceConfig'],
      });
    }

    if (value.referenceSource !== undefined && value.referenceSource !== null) {
      if (value.referenceConfig === undefined || value.referenceConfig === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'referenceConfig is required when referenceSource is set',
          path: ['referenceConfig'],
        });
      } else {
        const referenceConfigBySourceValidators = {
          weight: weightReferenceConfigSchema,
          nutrition_daily: nutritionDailyReferenceConfigSchema,
          nutrition_meal: nutritionMealReferenceConfigSchema,
          workout: workoutReferenceConfigSchema,
        } as const;

        const parsedReferenceConfig = referenceConfigBySourceValidators[
          value.referenceSource
        ].safeParse(value.referenceConfig);
        if (!parsedReferenceConfig.success) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid referenceConfig for source ${value.referenceSource}`,
            path: ['referenceConfig'],
          });
        }
      }
    }
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const reorderHabitsInputSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        sortOrder: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, {
      message: 'Habit ids must be unique',
    }),
});

export const habitSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  emoji: z.string().nullable(),
  trackingType: habitTrackingTypeSchema,
  target: z.number().nullable(),
  unit: z.string().nullable(),
  frequency: habitFrequencySchema,
  frequencyTarget: z.number().int().min(1).max(7).nullable(),
  scheduledDays: scheduledDaysSchema,
  pausedUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  referenceSource: referenceSourceSchema.optional(),
  referenceConfig: referenceConfigSchema.optional(),
  sortOrder: z.number().int().nonnegative(),
  active: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type HabitTrackingType = z.infer<typeof habitTrackingTypeSchema>;
export type HabitFrequency = z.infer<typeof habitFrequencySchema>;
export type ReferenceSource = z.infer<typeof referenceSourceSchema>;
export type ReferenceConfig = z.infer<typeof referenceConfigSchema>;
export type CreateHabitInput = z.infer<typeof createHabitInputSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitInputSchema>;
export type ReorderHabitsInput = z.infer<typeof reorderHabitsInputSchema>;
export type Habit = z.infer<typeof habitSchema>;
