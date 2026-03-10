import { z } from 'zod';

import { dateSchema } from './common.js';

const MAX_BODY_WEIGHT = 1_500;

const weightNotesSchema = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value.length === 0 ? undefined : value));

const bodyWeightValueSchema = z.number().positive().finite().max(MAX_BODY_WEIGHT);

export const createWeightInputSchema = z.object({
  date: dateSchema,
  weight: bodyWeightValueSchema,
  notes: weightNotesSchema.optional(),
});

export const bodyWeightEntrySchema = z.object({
  id: z.string(),
  date: dateSchema,
  weight: bodyWeightValueSchema,
  notes: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const weightQueryParamsSchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    days: z.coerce.number().int().positive().max(3650).optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });

export type BodyWeightEntry = z.infer<typeof bodyWeightEntrySchema>;
export type CreateWeightInput = z.infer<typeof createWeightInputSchema>;
export type WeightQueryParams = z.infer<typeof weightQueryParamsSchema>;
