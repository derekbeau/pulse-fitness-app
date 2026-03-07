import { z } from 'zod';

import { dateSchema } from './common.js';

const weightNotesSchema = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value.length === 0 ? undefined : value));

export const createWeightInputSchema = z.object({
  date: dateSchema,
  weight: z.number().positive().finite(),
  notes: weightNotesSchema.optional(),
});

export const weightQueryParamsSchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });

export type CreateWeightInput = z.infer<typeof createWeightInputSchema>;
export type WeightQueryParams = z.infer<typeof weightQueryParamsSchema>;
