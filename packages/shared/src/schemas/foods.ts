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

const foodTagSchema = z.string().trim().toLowerCase().min(1).max(40);
const foodTagsSchema = z.array(foodTagSchema).max(20);
const optionalQueryTags = z.preprocess((value) => {
  if (value == null) {
    return undefined;
  }

  const rawTags = Array.isArray(value) ? value : [value];
  const parsedTags = rawTags.flatMap((tag) => {
    if (typeof tag !== 'string') {
      return [];
    }

    return tag.split(',');
  });

  const normalizedTags = parsedTags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);

  return normalizedTags.length > 0 ? normalizedTags : undefined;
}, foodTagsSchema.optional());

export const foodSortSchema = z.enum(['name', 'recent', 'popular']);

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
  usageCount: z.number().int().default(0),
  tags: foodTagsSchema.default([]),
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
  tags: foodTagsSchema.optional(),
});

const createFoodInputBaseSchema = foodMutationFieldsSchema
  .omit({ name: true })
  .extend({
    name: requiredText().optional(),
    foodName: requiredText().optional(),
    verified: z.boolean().optional().default(false),
    tags: foodTagsSchema.optional().default([]),
  })
  .refine((value) => value.name !== undefined || value.foodName !== undefined, {
    message: 'name or foodName is required',
    path: ['name'],
  });

export const createFoodInputSchema = createFoodInputBaseSchema.transform(
  ({ name, foodName, ...rest }, ctx) => {
    const resolvedName = name ?? foodName;
    if (!resolvedName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message: 'name or foodName is required',
      });
      return z.NEVER;
    }

    return {
      ...rest,
      name: resolvedName,
    };
  },
);

export const updateFoodInputSchema = foodMutationFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');

export const patchFoodInputSchema = updateFoodInputSchema;

export const mergeFoodInputSchema = z.object({
  loserId: z.string().uuid(),
});

export const foodQueryParamsSchema = z.object({
  q: optionalQueryText,
  tags: optionalQueryTags,
  sort: foodSortSchema.default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type Food = z.infer<typeof foodSchema>;
export type FoodSort = z.infer<typeof foodSortSchema>;
export type CreateFoodInput = z.infer<typeof createFoodInputSchema>;
export type UpdateFoodInput = z.infer<typeof updateFoodInputSchema>;
export type PatchFoodInput = z.infer<typeof patchFoodInputSchema>;
export type MergeFoodInput = z.infer<typeof mergeFoodInputSchema>;
export type FoodQueryParams = z.infer<typeof foodQueryParamsSchema>;
