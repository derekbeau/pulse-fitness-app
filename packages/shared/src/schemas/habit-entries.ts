import { z } from 'zod';

import { dateSchema } from './common.js';

const habitEntryValueSchema = z.number().finite();

export const createHabitEntryInputSchema = z.object({
  date: dateSchema,
  completed: z.boolean(),
  value: habitEntryValueSchema.optional(),
});

export const updateHabitEntryInputSchema = z
  .object({
    completed: z.boolean().optional(),
    value: habitEntryValueSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const habitEntryQueryParamsSchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
  })
  .refine((value) => value.from <= value.to, {
    message: '`from` must be on or before `to`',
    path: ['to'],
  });

export const habitEntrySchema = z.object({
  id: z.string(),
  habitId: z.string(),
  userId: z.string(),
  date: dateSchema,
  completed: z.boolean(),
  value: z.number().nullable(),
  createdAt: z.number().int(),
});

export type CreateHabitEntryInput = z.infer<typeof createHabitEntryInputSchema>;
export type UpdateHabitEntryInput = z.infer<typeof updateHabitEntryInputSchema>;
export type HabitEntryQueryParams = z.infer<typeof habitEntryQueryParamsSchema>;
export type HabitEntry = z.infer<typeof habitEntrySchema>;
