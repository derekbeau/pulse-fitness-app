import { z } from 'zod';

export const habitTrackingTypeSchema = z.enum(['boolean', 'numeric', 'time']);

const nullableTrimmedString = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength).nullable();

const targetSchema = z.number().positive().nullable();

const habitDefinitionFieldsSchema = z.object({
  name: z.string().trim().min(1).max(255),
  emoji: nullableTrimmedString(32).optional(),
  trackingType: habitTrackingTypeSchema,
  target: targetSchema.optional(),
  unit: nullableTrimmedString(50).optional(),
});

const validateHabitDefinition = (
  value: z.infer<typeof habitDefinitionFieldsSchema>,
  context: z.RefinementCtx,
) => {
  const requiresTarget = value.trackingType !== 'boolean';
  const target = value.target ?? null;
  const unit = value.unit ?? null;

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

    return;
  }

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
};

const habitDefinitionSchema = habitDefinitionFieldsSchema.superRefine(validateHabitDefinition);

export const createHabitInputSchema = habitDefinitionSchema;

export const updateHabitInputSchema = habitDefinitionFieldsSchema
  .partial()
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
  emoji: z.string().nullable(),
  trackingType: habitTrackingTypeSchema,
  target: z.number().nullable(),
  unit: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  active: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type HabitTrackingType = z.infer<typeof habitTrackingTypeSchema>;
export type CreateHabitInput = z.infer<typeof createHabitInputSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitInputSchema>;
export type ReorderHabitsInput = z.infer<typeof reorderHabitsInputSchema>;
export type Habit = z.infer<typeof habitSchema>;
