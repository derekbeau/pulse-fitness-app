import { z } from 'zod';

import { dateSchema } from './common.js';

const MAX_CALORIES_TARGET = 10_000;
const MAX_MACRO_GRAMS_TARGET = 1_000;

const calorieTargetSchema = z.number().nonnegative().finite().max(MAX_CALORIES_TARGET);
const macroGramTargetSchema = z.number().nonnegative().finite().max(MAX_MACRO_GRAMS_TARGET);

export const createNutritionTargetInputSchema = z.object({
  calories: calorieTargetSchema,
  protein: macroGramTargetSchema,
  carbs: macroGramTargetSchema,
  fat: macroGramTargetSchema,
  // Effective date is interpreted as a UTC calendar date (YYYY-MM-DD).
  effectiveDate: dateSchema,
});

export const nutritionTargetSchema = z.object({
  id: z.string(),
  calories: calorieTargetSchema,
  protein: macroGramTargetSchema,
  carbs: macroGramTargetSchema,
  fat: macroGramTargetSchema,
  effectiveDate: dateSchema,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type CreateNutritionTargetInput = z.infer<typeof createNutritionTargetInputSchema>;
export type NutritionTarget = z.infer<typeof nutritionTargetSchema>;
