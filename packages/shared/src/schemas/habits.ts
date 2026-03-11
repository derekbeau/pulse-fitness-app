import { z } from 'zod';

export const habitTrackingTypeSchema = z.enum(['boolean', 'numeric', 'time']);
export const habitFrequencySchema = z.enum(['daily', 'weekly', 'specific_days']);

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
  sortOrder: z.number().int().nonnegative(),
  active: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type HabitTrackingType = z.infer<typeof habitTrackingTypeSchema>;
export type HabitFrequency = z.infer<typeof habitFrequencySchema>;
export type CreateHabitInput = z.infer<typeof createHabitInputSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitInputSchema>;
export type ReorderHabitsInput = z.infer<typeof reorderHabitsInputSchema>;
export type Habit = z.infer<typeof habitSchema>;
