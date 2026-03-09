import { z } from 'zod';

const requiredText = (maxLength = 255) => z.string().trim().min(1).max(maxLength);
const nonnegativeNumber = z.number().nonnegative().finite();

const mealTimeSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const mealItemInputSchema = z.object({
  foodId: z.string().trim().min(1).optional(),
  name: requiredText(),
  amount: z.number().positive().finite(),
  unit: requiredText(50),
  calories: nonnegativeNumber,
  protein: nonnegativeNumber,
  carbs: nonnegativeNumber,
  fat: nonnegativeNumber,
});

export const createMealInputSchema = z.object({
  name: requiredText(120),
  time: mealTimeSchema.optional(),
  notes: requiredText(2_000).optional(),
  items: z.array(mealItemInputSchema).min(1),
});

export type MealItemInput = z.infer<typeof mealItemInputSchema>;
export type CreateMealInput = z.infer<typeof createMealInputSchema>;
