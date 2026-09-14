import { z } from 'zod';

import { convertCircumferenceToMm, hasAtMostOneDecimalPlace } from '../utils/circumference-unit.js';
import { dateSchema } from './common.js';

export const lengthUnitSchema = z.enum(['cm', 'in']);

export const bodyMeasurementInputFields = [
  'waist',
  'hips',
  'chest',
  'neck',
  'left_arm',
  'right_arm',
  'left_thigh',
  'right_thigh',
] as const;

export const bodyMeasurementCanonicalFields = [
  'waistMm',
  'hipsMm',
  'chestMm',
  'neckMm',
  'leftArmMm',
  'rightArmMm',
  'leftThighMm',
  'rightThighMm',
] as const;

const circumferenceInputSchema = z.number().positive().finite().refine(hasAtMostOneDecimalPlace, {
  message: 'Circumference must have no more than one decimal place',
});

const bodyFatPercentSchema = z.number().finite().min(1).max(70).refine(hasAtMostOneDecimalPlace, {
  message: 'Body fat percent must have no more than one decimal place',
});

const notesInputSchema = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value.length === 0 ? null : value));

const optionalMeasurementFields = {
  waist: circumferenceInputSchema.nullable().optional(),
  hips: circumferenceInputSchema.nullable().optional(),
  chest: circumferenceInputSchema.nullable().optional(),
  neck: circumferenceInputSchema.nullable().optional(),
  left_arm: circumferenceInputSchema.nullable().optional(),
  right_arm: circumferenceInputSchema.nullable().optional(),
  left_thigh: circumferenceInputSchema.nullable().optional(),
  right_thigh: circumferenceInputSchema.nullable().optional(),
  body_fat_percent: bodyFatPercentSchema.nullable().optional(),
};

type MeasurementMutation = {
  unit?: z.infer<typeof lengthUnitSchema>;
  body_fat_percent?: number | null;
} & Partial<Record<(typeof bodyMeasurementInputFields)[number], number | null>>;

const validateMeasurementMutation = (
  value: MeasurementMutation,
  context: z.RefinementCtx,
  requireMutation: boolean,
) => {
  const suppliedCircumferences = bodyMeasurementInputFields.filter(
    (field) => value[field] !== undefined,
  );
  const valuedCircumferences = suppliedCircumferences.filter((field) => value[field] !== null);
  const hasMeasurementMutation =
    suppliedCircumferences.length > 0 || value.body_fat_percent !== undefined;

  if (requireMutation && !hasMeasurementMutation) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one measurement must be provided',
    });
  }

  if (valuedCircumferences.length > 0 && value.unit === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: '`unit` is required with circumference values',
      path: ['unit'],
    });
  }

  if (value.unit !== undefined && valuedCircumferences.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: '`unit` requires at least one circumference value',
      path: ['unit'],
    });
  }

  if (value.unit !== undefined) {
    for (const field of valuedCircumferences) {
      const circumference = value[field];
      if (typeof circumference !== 'number') continue;
      try {
        convertCircumferenceToMm(circumference, value.unit);
      } catch (error) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: error instanceof Error ? error.message : 'Invalid circumference',
          path: [field],
        });
      }
    }
  }
};

export const createBodyMeasurementInputSchema = z
  .object({
    date: dateSchema,
    unit: lengthUnitSchema.optional(),
    ...optionalMeasurementFields,
    notes: notesInputSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => validateMeasurementMutation(value, context, true));

export const patchBodyMeasurementInputSchema = z
  .object({
    unit: lengthUnitSchema.optional(),
    ...optionalMeasurementFields,
    notes: notesInputSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    validateMeasurementMutation(value, context, false);
    const hasMeasurementMutation =
      bodyMeasurementInputFields.some((field) => value[field] !== undefined) ||
      value.body_fat_percent !== undefined;
    if (!hasMeasurementMutation && value.notes === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one measurement or notes change must be provided',
      });
    }
  });

const canonicalCircumferenceSchema = z.number().int().min(200).max(3000).nullable();

export const bodyMeasurementEntrySchema = z
  .object({
    id: z.string(),
    date: dateSchema,
    waistMm: canonicalCircumferenceSchema,
    hipsMm: canonicalCircumferenceSchema,
    chestMm: canonicalCircumferenceSchema,
    neckMm: canonicalCircumferenceSchema,
    leftArmMm: canonicalCircumferenceSchema,
    rightArmMm: canonicalCircumferenceSchema,
    leftThighMm: canonicalCircumferenceSchema,
    rightThighMm: canonicalCircumferenceSchema,
    bodyFatPercent: bodyFatPercentSchema.nullable(),
    unitAtEntry: lengthUnitSchema.nullable(),
    notes: z.string().max(2000).nullable(),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .strict()
  .refine(
    (value) =>
      bodyMeasurementCanonicalFields.some((field) => value[field] !== null) ||
      value.bodyFatPercent !== null,
    { message: 'Body measurement entries must contain at least one measurement' },
  )
  .refine(
    (value) =>
      !bodyMeasurementCanonicalFields.some((field) => value[field] !== null) ||
      value.unitAtEntry !== null,
    {
      message: 'Canonical circumference values require entry-unit provenance',
      path: ['unitAtEntry'],
    },
  );

export const bodyMeasurementQueryParamsSchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    days: z.coerce.number().int().positive().max(3650).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
  })
  .strict()
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  })
  .refine(({ from, days }) => from === undefined || days === undefined, {
    message: '`from` and `days` cannot be used together',
    path: ['from'],
  });

export const deleteBodyMeasurementResultSchema = z
  .object({ deleted: z.literal(true), id: z.string() })
  .strict();

export type LengthUnit = z.infer<typeof lengthUnitSchema>;
export type CreateBodyMeasurementInput = z.infer<typeof createBodyMeasurementInputSchema>;
export type PatchBodyMeasurementInput = z.infer<typeof patchBodyMeasurementInputSchema>;
export type BodyMeasurementEntry = z.infer<typeof bodyMeasurementEntrySchema>;
export type BodyMeasurementQueryParams = z.infer<typeof bodyMeasurementQueryParamsSchema>;
