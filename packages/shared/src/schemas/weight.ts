import { z } from 'zod';

import { dateSchema } from './common.js';
import { weightUnitSchema } from './users.js';
import { convertWeightToKg, isCanonicalBodyWeight } from '../utils/weight-unit.js';

const MAX_BODY_WEIGHT = 1_500;

const weightNotesSchema = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value.length === 0 ? undefined : value));

const bodyWeightValueSchema = z.number().positive().finite().max(MAX_BODY_WEIGHT);

const validateExplicitWeightUnit = (
  value: { unit?: 'lbs' | 'kg'; weight?: number },
  context: z.RefinementCtx,
) => {
  if (value.weight === undefined || value.unit === undefined) {
    return;
  }

  if (!isCanonicalBodyWeight(convertWeightToKg(value.weight, value.unit))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Weight must be between 25 and 350 kg after conversion',
      path: ['weight'],
    });
  }
};

export const createWeightInputSchema = z
  .object({
    date: dateSchema,
    weight: bodyWeightValueSchema,
    unit: weightUnitSchema.optional(),
    notes: weightNotesSchema.optional(),
  })
  .superRefine(validateExplicitWeightUnit);

export const patchWeightInputSchema = z
  .object({
    weight: bodyWeightValueSchema.optional(),
    unit: weightUnitSchema.optional(),
    notes: weightNotesSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.weight === undefined && value.notes === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field must be provided',
      });
    }

    if (value.unit !== undefined && value.weight === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '`unit` requires `weight`',
        path: ['unit'],
      });
    }

    validateExplicitWeightUnit(value, context);
  });

export const bodyWeightEntrySchema = z.object({
  id: z.string(),
  date: dateSchema,
  weight: bodyWeightValueSchema,
  unit: weightUnitSchema,
  notes: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const deleteWeightResultSchema = z.object({
  deleted: z.literal(true),
  id: z.string(),
});

export const weightQueryParamsSchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    days: z.coerce.number().int().positive().max(3650).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  })
  .refine(({ from, days }) => from === undefined || days === undefined, {
    message: '`from` and `days` cannot be used together',
    path: ['from'],
  });

export type BodyWeightEntry = z.infer<typeof bodyWeightEntrySchema>;
export type CreateWeightInput = z.infer<typeof createWeightInputSchema>;
export type DeleteWeightResult = z.infer<typeof deleteWeightResultSchema>;
export type PatchWeightInput = z.infer<typeof patchWeightInputSchema>;
export type WeightQueryParams = z.infer<typeof weightQueryParamsSchema>;
