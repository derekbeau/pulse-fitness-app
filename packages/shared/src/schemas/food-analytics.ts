import { z } from 'zod';

import { apiMetaSchema, dateSchema } from './common.js';

const optionalQueryText = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().max(255).optional());

const queryTagsSchema = z.preprocess(
  (value) => {
    if (value == null) return undefined;
    const values = (Array.isArray(value) ? value : [value]).flatMap((entry) =>
      typeof entry === 'string' ? entry.split(',') : [],
    );
    const normalized = [
      ...new Set(values.map((entry) => entry.trim().toLowerCase()).filter(Boolean)),
    ];
    return normalized.length > 0 ? normalized : undefined;
  },
  z.array(z.string().min(1).max(40)).max(20).optional(),
);

const ianaTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid IANA time zone');

export const foodAnalyticsRangeSchema = z.enum(['30d', '90d', 'all']);
export const foodAnalyticsSortSchema = z.enum([
  'most_used',
  'most_recent',
  'calorie_contribution',
  'protein_contribution',
  'protein_density',
  'calorie_density',
  'needs_review',
  'name',
]);
export const foodAnalyticsUsageFilterSchema = z.enum(['any', 'used', 'unused']);
export const foodAnalyticsVerificationFilterSchema = z.enum(['any', 'verified', 'unverified']);
export const foodAnalyticsReviewFilterSchema = z.enum(['any', 'needs_review', 'clear']);
export const foodAnalyticsGramsFilterSchema = z.enum(['any', 'has_grams', 'missing_grams']);

export const foodDefinitionReviewReasonSchema = z.enum([
  'UNVERIFIED',
  'SOURCE_MISSING',
  'SERVING_GRAMS_MISSING',
  'MACRO_CALORIE_MISMATCH',
  'NO_LINKED_USAGE',
]);

export const foodAnalyticsQuerySchema = z
  .object({
    range: foodAnalyticsRangeSchema.default('30d'),
    end: dateSchema.optional(),
    timeZone: ianaTimeZoneSchema.optional(),
    q: optionalQueryText,
    tags: queryTagsSchema,
    sort: foodAnalyticsSortSchema.default('most_used'),
    usage: foodAnalyticsUsageFilterSchema.default('any'),
    verification: foodAnalyticsVerificationFilterSchema.default('any'),
    review: foodAnalyticsReviewFilterSchema.default('any'),
    grams: foodAnalyticsGramsFilterSchema.default('any'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const foodAnalyticsDetailQuerySchema = foodAnalyticsQuerySchema
  .omit({
    q: true,
    tags: true,
    sort: true,
    usage: true,
    verification: true,
    review: true,
    grams: true,
    page: true,
    limit: true,
  })
  .extend({
    occurrencePage: z.coerce.number().int().min(1).default(1),
    occurrenceLimit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

const dayStateCountSchema = z
  .object({
    occurrences: z.number().int().nonnegative(),
    distinctDays: z.number().int().nonnegative(),
  })
  .strict();

export const foodAnalyticsDayStatesSchema = z
  .object({
    complete: dayStateCountSchema,
    partial: dayStateCountSchema,
    unknown: dayStateCountSchema,
  })
  .strict();

export const foodAnalyticsRangeResultSchema = z
  .object({
    kind: foodAnalyticsRangeSchema,
    startDate: dateSchema.nullable(),
    endDate: dateSchema,
    calendarDays: z.number().int().positive().nullable(),
    timeZone: ianaTimeZoneSchema,
    timeZoneSource: z.enum(['adaptive_program', 'user_profile', 'request', 'utc_default']),
    isHistorical: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    const expectedDays = value.kind === '30d' ? 30 : value.kind === '90d' ? 90 : null;
    if (value.calendarDays !== expectedDays) {
      context.addIssue({
        code: 'custom',
        path: ['calendarDays'],
        message: 'Range calendar days must match the selected preset',
      });
    }
    if (value.kind !== 'all' && value.startDate === null) {
      context.addIssue({
        code: 'custom',
        path: ['startDate'],
        message: 'Bounded ranges require a start date',
      });
    }
    if (value.startDate !== null && value.startDate > value.endDate) {
      context.addIssue({
        code: 'custom',
        path: ['startDate'],
        message: 'Range start cannot be after its end',
      });
    }
  });

export const foodAnalyticsCurrentDefinitionSchema = z
  .object({
    servingSize: z.string().nullable(),
    servingGrams: z.number().positive().nullable(),
    calories: z.number().nonnegative(),
    protein: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),
    fiber: z.number().nonnegative().nullable(),
    sugar: z.number().nonnegative().nullable(),
    proteinPer100Kcal: z.number().nonnegative().nullable(),
    caloriesPer100Grams: z.number().nonnegative().nullable(),
    macroDerivedCalories: z.number().nonnegative(),
    macroCalorieDifference: z.number().nonnegative(),
    macroCalorieTolerance: z.number().positive(),
    verified: z.boolean(),
    source: z.string().nullable(),
    notes: z.string().nullable(),
    updatedAt: z.number().int(),
  })
  .strict();

export const foodAnalyticsObservedPortionSchema = z
  .object({
    state: z.enum(['none', 'compatible', 'mixed_units']),
    unit: z.string().min(1).nullable(),
    medianQuantity: z.number().positive().nullable(),
    recentQuantity: z.number().positive().nullable(),
    recentLocalDate: dateSchema.nullable(),
    evidenceCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    const complete =
      value.unit !== null &&
      value.medianQuantity !== null &&
      value.recentQuantity !== null &&
      value.recentLocalDate !== null &&
      value.evidenceCount > 0;
    if ((value.state === 'compatible') !== complete) {
      context.addIssue({
        code: 'custom',
        message: 'Compatible portions require complete evidence',
      });
    }
    if (
      value.state !== 'compatible' &&
      [value.unit, value.medianQuantity, value.recentQuantity, value.recentLocalDate].some(
        (entry) => entry !== null,
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Unavailable portions cannot expose derived values',
      });
    }
  });

export const foodAnalyticsObservedUsageSchema = z
  .object({
    usageOccurrences: z.number().int().nonnegative(),
    distinctLoggedDays: z.number().int().nonnegative(),
    lastLoggedLocalDate: dateSchema.nullable(),
    totalCalories: z.number().nonnegative(),
    totalProtein: z.number().nonnegative(),
    linkedCalorieSharePercent: z.number().min(0).max(100).nullable(),
    proteinPer100Kcal: z.number().nonnegative().nullable(),
    caloriesPer100Grams: z.number().nonnegative().nullable(),
    portion: foodAnalyticsObservedPortionSchema,
    dayStates: foodAnalyticsDayStatesSchema,
  })
  .strict();

export const foodAnalyticsItemSchema = z
  .object({
    foodId: z.string().uuid(),
    name: z.string().trim().min(1),
    brand: z.string().nullable(),
    tags: z.array(z.string().min(1).max(40)).max(20),
    currentDefinition: foodAnalyticsCurrentDefinitionSchema,
    observed: foodAnalyticsObservedUsageSchema,
    definitionReviewReasons: z.array(foodDefinitionReviewReasonSchema),
  })
  .strict();

export const foodAnalyticsSummarySchema = z
  .object({
    savedFoodsTotal: z.number().int().nonnegative(),
    savedFoodsUsed: z.number().int().nonnegative(),
    linkedUsageOccurrences: z.number().int().nonnegative(),
    distinctLoggedDays: z.number().int().nonnegative(),
    linkedFoodCalories: z.number().nonnegative(),
    totalMealItemCalories: z.number().nonnegative(),
    linkedCaloriesPercent: z.number().min(0).max(100).nullable(),
    unlinkedMealItemCount: z.number().int().nonnegative(),
    unlinkedMealItemCalories: z.number().nonnegative(),
    inactiveLinkedMealItemCount: z.number().int().nonnegative(),
    inactiveLinkedMealItemCalories: z.number().nonnegative(),
    unresolvedLinkedMealItemCount: z.number().int().nonnegative(),
    unresolvedLinkedMealItemCalories: z.number().nonnegative(),
    definitionsNeedingReview: z.number().int().nonnegative(),
    dayStates: foodAnalyticsDayStatesSchema,
  })
  .strict();

export const foodAnalyticsSchema = z
  .object({
    range: foodAnalyticsRangeResultSchema,
    summary: foodAnalyticsSummarySchema,
    items: z.array(foodAnalyticsItemSchema),
    availableTags: z.array(z.string().min(1).max(40)),
  })
  .strict();

export const foodAnalyticsResponseSchema = z
  .object({
    data: foodAnalyticsSchema,
    meta: apiMetaSchema,
  })
  .strict();

export const foodAnalyticsOccurrenceSchema = z
  .object({
    mealItemId: z.string().uuid(),
    mealId: z.string().uuid(),
    localDate: dateSchema,
    mealName: z.string().min(1),
    mealTime: z.string().nullable(),
    quantity: z.number().positive(),
    unit: z.string().min(1),
    calories: z.number().nonnegative(),
    protein: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),
    nutritionDayState: z.enum(['complete', 'partial', 'unknown']),
  })
  .strict();

export const foodAnalyticsDetailSchema = z
  .object({
    range: foodAnalyticsRangeResultSchema,
    food: foodAnalyticsItemSchema,
    occurrences: z.array(foodAnalyticsOccurrenceSchema),
    occurrenceMeta: apiMetaSchema,
    snapshotNotice: z.literal(
      'Editing this saved food changes future defaults only. Historical meal snapshots stay unchanged.',
    ),
  })
  .strict();

export const foodAnalyticsDetailResponseSchema = z
  .object({
    data: foodAnalyticsDetailSchema,
  })
  .strict();

export type FoodAnalyticsRange = z.infer<typeof foodAnalyticsRangeSchema>;
export type FoodAnalyticsSort = z.infer<typeof foodAnalyticsSortSchema>;
export type FoodAnalyticsUsageFilter = z.infer<typeof foodAnalyticsUsageFilterSchema>;
export type FoodAnalyticsVerificationFilter = z.infer<typeof foodAnalyticsVerificationFilterSchema>;
export type FoodAnalyticsReviewFilter = z.infer<typeof foodAnalyticsReviewFilterSchema>;
export type FoodAnalyticsGramsFilter = z.infer<typeof foodAnalyticsGramsFilterSchema>;
export type FoodAnalyticsQuery = z.infer<typeof foodAnalyticsQuerySchema>;
export type FoodAnalyticsDetailQuery = z.infer<typeof foodAnalyticsDetailQuerySchema>;
export type FoodDefinitionReviewReason = z.infer<typeof foodDefinitionReviewReasonSchema>;
export type FoodAnalyticsDayStates = z.infer<typeof foodAnalyticsDayStatesSchema>;
export type FoodAnalyticsRangeResult = z.infer<typeof foodAnalyticsRangeResultSchema>;
export type FoodAnalyticsCurrentDefinition = z.infer<typeof foodAnalyticsCurrentDefinitionSchema>;
export type FoodAnalyticsObservedPortion = z.infer<typeof foodAnalyticsObservedPortionSchema>;
export type FoodAnalyticsObservedUsage = z.infer<typeof foodAnalyticsObservedUsageSchema>;
export type FoodAnalyticsItem = z.infer<typeof foodAnalyticsItemSchema>;
export type FoodAnalyticsSummary = z.infer<typeof foodAnalyticsSummarySchema>;
export type FoodAnalytics = z.infer<typeof foodAnalyticsSchema>;
export type FoodAnalyticsResponse = z.infer<typeof foodAnalyticsResponseSchema>;
export type FoodAnalyticsOccurrence = z.infer<typeof foodAnalyticsOccurrenceSchema>;
export type FoodAnalyticsDetail = z.infer<typeof foodAnalyticsDetailSchema>;
