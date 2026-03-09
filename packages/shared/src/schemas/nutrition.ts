import { z } from 'zod';

import { dateSchema } from './common.js';

const requiredText = (maxLength = 255) => z.string().trim().min(1).max(maxLength);
const nonnegativeNumber = z.number().nonnegative().finite();

const mealTimeSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const nutritionMacroTotalsSchema = z.object({
  calories: nonnegativeNumber,
  protein: nonnegativeNumber,
  carbs: nonnegativeNumber,
  fat: nonnegativeNumber,
});

export const nutritionLogSchema = z.object({
  id: z.string(),
  userId: z.string(),
  date: dateSchema,
  notes: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const nutritionMealSchema = z.object({
  id: z.string(),
  nutritionLogId: z.string(),
  name: requiredText(120),
  time: mealTimeSchema.nullable(),
  notes: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const nutritionMealItemSchema = z.object({
  id: z.string(),
  mealId: z.string(),
  foodId: z.string().nullable(),
  name: requiredText(),
  amount: z.number().positive().finite(),
  unit: requiredText(50),
  calories: nonnegativeNumber,
  protein: nonnegativeNumber,
  carbs: nonnegativeNumber,
  fat: nonnegativeNumber,
  fiber: nonnegativeNumber.nullable(),
  sugar: nonnegativeNumber.nullable(),
  createdAt: z.number().int(),
});

export const dailyNutritionMealSchema = z.object({
  meal: nutritionMealSchema,
  items: z.array(nutritionMealItemSchema),
});

export const dailyNutritionSchema = z
  .object({
    log: nutritionLogSchema,
    meals: z.array(dailyNutritionMealSchema),
  })
  .nullable();

export const nutritionSummarySchema = z.object({
  date: dateSchema,
  meals: z.number().int().nonnegative(),
  actual: nutritionMacroTotalsSchema,
  target: nutritionMacroTotalsSchema.nullable(),
});

export const deleteMealResultSchema = z.object({
  success: z.literal(true),
});

export const mealItemInputSchema = z.object({
  foodId: z.string().trim().min(1).optional(),
  name: requiredText(),
  amount: z.number().positive().finite(),
  unit: requiredText(50),
  calories: nonnegativeNumber,
  protein: nonnegativeNumber,
  carbs: nonnegativeNumber,
  fat: nonnegativeNumber,
  fiber: nonnegativeNumber.optional(),
  sugar: nonnegativeNumber.optional(),
});

export const createMealInputSchema = z.object({
  name: requiredText(120),
  time: mealTimeSchema.optional(),
  notes: requiredText(2_000).optional(),
  items: z.array(mealItemInputSchema).min(1),
});

export type MealItemInput = z.infer<typeof mealItemInputSchema>;
export type CreateMealInput = z.infer<typeof createMealInputSchema>;
export type NutritionMacroTotals = z.infer<typeof nutritionMacroTotalsSchema>;
export type NutritionLog = z.infer<typeof nutritionLogSchema>;
export type NutritionMeal = z.infer<typeof nutritionMealSchema>;
export type NutritionMealItem = z.infer<typeof nutritionMealItemSchema>;
export type DailyNutritionMeal = z.infer<typeof dailyNutritionMealSchema>;
export type DailyNutrition = z.infer<typeof dailyNutritionSchema>;
export type NutritionSummary = z.infer<typeof nutritionSummarySchema>;
export type DeleteMealResult = z.infer<typeof deleteMealResultSchema>;
