import { z } from 'zod';

import { dateSchema } from './common.js';

const requiredStringSchema = z.string().trim().min(1).max(255);

export const scheduledWorkoutSchema = z.object({
  id: z.string(),
  userId: z.string(),
  templateId: z.string().nullable(),
  date: dateSchema,
  sessionId: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const scheduledWorkoutListItemSchema = z.object({
  id: z.string(),
  date: dateSchema,
  templateId: z.string().nullable(),
  templateName: requiredStringSchema.nullable(),
  sessionId: z.string().nullable(),
  createdAt: z.number().int(),
});

export const createScheduledWorkoutInputSchema = z.object({
  templateId: requiredStringSchema,
  date: dateSchema,
});

export const updateScheduledWorkoutInputSchema = z
  .object({
    templateId: requiredStringSchema.optional(),
    date: dateSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one scheduled workout field must be provided',
  });

export const scheduledWorkoutQueryParamsSchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
  })
  .refine((value) => value.from <= value.to, {
    message: 'from must be less than or equal to to',
    path: ['to'],
  });

export type ScheduledWorkout = z.infer<typeof scheduledWorkoutSchema>;
export type ScheduledWorkoutListItem = z.infer<typeof scheduledWorkoutListItemSchema>;
export type CreateScheduledWorkoutInput = z.infer<typeof createScheduledWorkoutInputSchema>;
export type UpdateScheduledWorkoutInput = z.infer<typeof updateScheduledWorkoutInputSchema>;
export type ScheduledWorkoutQueryParams = z.infer<typeof scheduledWorkoutQueryParamsSchema>;
