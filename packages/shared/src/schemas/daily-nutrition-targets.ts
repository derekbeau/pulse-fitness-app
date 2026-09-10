import { z } from 'zod';

import { dateSchema } from './common.js';

const calorieSchema = z.number().nonnegative().finite().max(10_000);
const macroSchema = z.number().nonnegative().finite().max(1_000);
const nullableOverrideFields = {
  calories: calorieSchema.nullable(),
  protein: macroSchema.nullable(),
  carbs: macroSchema.nullable(),
  fat: macroSchema.nullable(),
};

export const dailyNutritionTargetReasonSchema = z
  .string()
  .trim()
  .min(1, 'Enter a reason or clear it')
  .max(2_000, 'Use 2,000 characters or fewer');

export const patchDailyNutritionTargetInputSchema = z
  .object({
    calories: nullableOverrideFields.calories.optional(),
    protein: nullableOverrideFields.protein.optional(),
    carbs: nullableOverrideFields.carbs.optional(),
    fat: nullableOverrideFields.fat.optional(),
    reason: dailyNutritionTargetReasonSchema.nullable().optional(),
  })
  .strict();

export const dailyNutritionTargetValuesSchema = z.object({
  calories: calorieSchema,
  protein: macroSchema,
  carbs: macroSchema,
  fat: macroSchema,
});

export const dailyNutritionTargetBaselineSchema = dailyNutritionTargetValuesSchema.extend({
  targetEventId: z.string().min(1),
  targetId: z.string().min(1),
  effectiveDate: dateSchema,
  recordedAt: z.number().int().positive(),
  source: z.enum(['manual', 'adaptive']),
  adaptiveCheckInId: z.string().min(1).nullable(),
});

export const dailyNutritionTargetOverrideSchema = z.object({
  id: z.string().min(1),
  date: dateSchema,
  ...nullableOverrideFields,
  reason: dailyNutritionTargetReasonSchema.nullable(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});

export const resolvedDailyNutritionTargetSchema = z
  .object({
    date: dateSchema,
    timeZone: z.string().min(1),
    baseline: dailyNutritionTargetBaselineSchema.nullable(),
    override: dailyNutritionTargetOverrideSchema.nullable(),
    effective: dailyNutritionTargetValuesSchema.nullable(),
    adjusted: z.boolean(),
    overriddenFields: z.array(z.enum(['calories', 'protein', 'carbs', 'fat'])),
  })
  .strict()
  .superRefine((value, context) => {
    const fields = ['calories', 'protein', 'carbs', 'fat'] as const;
    const actualOverriddenFields = value.override
      ? fields.filter((field) => value.override?.[field] !== null)
      : [];
    const addIssue = (message: string, path: Array<string | number>) =>
      context.addIssue({ code: z.ZodIssueCode.custom, message, path });

    if (value.override && value.override.date !== value.date) {
      addIssue('Override date must match the resolved date', ['override', 'date']);
    }
    if (value.adjusted !== actualOverriddenFields.length > 0) {
      addIssue('Adjusted state must match the stored override fields', ['adjusted']);
    }
    if (
      value.overriddenFields.length !== actualOverriddenFields.length ||
      value.overriddenFields.some((field, index) => field !== actualOverriddenFields[index])
    ) {
      addIssue('Overridden fields must identify every stored field in canonical order', [
        'overriddenFields',
      ]);
    }
    if (!value.baseline && value.effective) {
      addIssue('Effective values require a causal baseline', ['effective']);
    }
    if (value.baseline && !value.effective) {
      addIssue('A causal baseline requires effective values', ['effective']);
    }
    if (value.baseline && value.effective) {
      for (const field of fields) {
        const expected = value.override?.[field] ?? value.baseline[field];
        if (value.effective[field] !== expected) {
          addIssue(`Effective ${field} must resolve from its override or baseline`, [
            'effective',
            field,
          ]);
        }
      }
    }
    if (
      value.baseline &&
      (value.baseline.source === 'adaptive') !== (value.baseline.adaptiveCheckInId !== null)
    ) {
      addIssue('Adaptive baseline provenance must include its accepted check-in', [
        'baseline',
        'adaptiveCheckInId',
      ]);
    }
  });

export type PatchDailyNutritionTargetInput = z.infer<typeof patchDailyNutritionTargetInputSchema>;
export type DailyNutritionTargetValues = z.infer<typeof dailyNutritionTargetValuesSchema>;
export type DailyNutritionTargetBaseline = z.infer<typeof dailyNutritionTargetBaselineSchema>;
export type DailyNutritionTargetOverride = z.infer<typeof dailyNutritionTargetOverrideSchema>;
export type ResolvedDailyNutritionTarget = z.infer<typeof resolvedDailyNutritionTargetSchema>;
