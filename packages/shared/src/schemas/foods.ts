import { z } from 'zod';

const requiredText = (maxLength = 255) => z.string().trim().min(1).max(maxLength);
const optionalNullableText = (maxLength = 255) => requiredText(maxLength).nullable().optional();
const nonnegativeNumber = z.number().nonnegative();
const optionalNullablePositiveNumber = z.number().positive().nullable().optional();
const optionalNullableNonnegativeNumber = z.number().nonnegative().nullable().optional();

const optionalQueryText = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().max(255).optional());

export const foodSortSchema = z.enum(['name', 'recent', 'protein']);

export const foodSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: requiredText(),
  brand: z.string().nullable(),
  servingSize: z.string().nullable(),
  servingGrams: z.number().positive().nullable(),
  calories: nonnegativeNumber,
  protein: nonnegativeNumber,
  carbs: nonnegativeNumber,
  fat: nonnegativeNumber,
  fiber: nonnegativeNumber.nullable(),
  sugar: nonnegativeNumber.nullable(),
  verified: z.boolean(),
  source: z.string().nullable(),
  notes: z.string().nullable(),
  lastUsedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

const foodMutationFieldsSchema = z.object({
  name: requiredText(),
  brand: optionalNullableText(),
  servingSize: optionalNullableText(100),
  servingGrams: optionalNullablePositiveNumber,
  calories: nonnegativeNumber,
  protein: nonnegativeNumber,
  carbs: nonnegativeNumber,
  fat: nonnegativeNumber,
  fiber: optionalNullableNonnegativeNumber,
  sugar: optionalNullableNonnegativeNumber,
  verified: z.boolean(),
  source: optionalNullableText(),
  notes: optionalNullableText(2000),
});

export const createFoodInputSchema = foodMutationFieldsSchema.extend({
  verified: z.boolean().optional().default(false),
});

export const updateFoodInputSchema = foodMutationFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');

export const patchFoodInputSchema = foodMutationFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');

export const foodQueryParamsSchema = z.object({
  q: optionalQueryText,
  sort: foodSortSchema.default('name'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type Food = z.infer<typeof foodSchema>;
export type FoodSort = z.infer<typeof foodSortSchema>;
export type CreateFoodInput = z.infer<typeof createFoodInputSchema>;
export type UpdateFoodInput = z.infer<typeof updateFoodInputSchema>;
export type PatchFoodInput = z.infer<typeof patchFoodInputSchema>;
export type FoodQueryParams = z.infer<typeof foodQueryParamsSchema>;
