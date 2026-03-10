import { z } from 'zod';

const requiredText = (maxLength = 255) => z.string().trim().min(1).max(maxLength);

export const agentFoodSearchParamsSchema = z.object({
  q: z.string().trim().min(1).max(255).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const agentFoodResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  servingSize: z.string().nullable(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

export const agentCreateFoodInputSchema = z.object({
  name: requiredText(),
  brand: requiredText().nullable().optional(),
  servingSize: z.string().trim().nullable().optional(),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
  source: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

export const agentMealItemInputSchema = z.object({
  foodName: requiredText(),
  quantity: z.number().positive().finite(),
  unit: z.string().trim().min(1).max(50).default('serving'),
});

export const agentCreateMealInputSchema = z.object({
  name: requiredText(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  items: z.array(agentMealItemInputSchema).min(1),
});

export type AgentFoodSearchParams = z.infer<typeof agentFoodSearchParamsSchema>;
export type AgentFoodResult = z.infer<typeof agentFoodResultSchema>;
export type AgentCreateFoodInput = z.infer<typeof agentCreateFoodInputSchema>;
export type AgentMealItemInput = z.infer<typeof agentMealItemInputSchema>;
export type AgentCreateMealInput = z.infer<typeof agentCreateMealInputSchema>;
