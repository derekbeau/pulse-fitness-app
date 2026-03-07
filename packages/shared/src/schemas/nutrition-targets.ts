import { z } from 'zod';

import { dateSchema } from './common.js';

const nutritionMacroSchema = z.number().nonnegative().finite();

export const createNutritionTargetInputSchema = z.object({
  calories: nutritionMacroSchema,
  protein: nutritionMacroSchema,
  carbs: nutritionMacroSchema,
  fat: nutritionMacroSchema,
  effectiveDate: dateSchema,
});

export type CreateNutritionTargetInput = z.infer<typeof createNutritionTargetInputSchema>;
