import { and, count, eq, sql, type SQL } from 'drizzle-orm';
import type {
  CreateFoodInput,
  Food,
  FoodQueryParams,
  FoodSort,
  UpdateFoodInput,
} from '@pulse/shared';

import { foods } from '../../db/schema/index.js';

export type FoodRecord = Food;

export type CreateFoodRecordInput = {
  id: string;
  userId: string;
} & CreateFoodInput;

export type FoodListResult = {
  foods: FoodRecord[];
  total: number;
};

const foodSelection = {
  id: foods.id,
  userId: foods.userId,
  name: foods.name,
  brand: foods.brand,
  servingSize: foods.servingSize,
  servingGrams: foods.servingGrams,
  calories: foods.calories,
  protein: foods.protein,
  carbs: foods.carbs,
  fat: foods.fat,
  fiber: foods.fiber,
  sugar: foods.sugar,
  verified: foods.verified,
  source: foods.source,
  notes: foods.notes,
  lastUsedAt: foods.lastUsedAt,
  createdAt: foods.createdAt,
  updatedAt: foods.updatedAt,
};

const toNullable = <T>(value: T | undefined): T | null => value ?? null;

const buildFoodFilters = (userId: string, query?: string) => {
  const filters: SQL<unknown>[] = [eq(foods.userId, userId)];

  if (query) {
    const pattern = `%${query.toLowerCase()}%`;

    filters.push(
      sql`(
        lower(${foods.name}) like ${pattern}
        or lower(coalesce(${foods.brand}, '')) like ${pattern}
      )`,
    );
  }

  return filters.length === 1 ? filters[0] : and(...filters);
};

const buildFoodSort = (sort: FoodSort) => {
  switch (sort) {
    case 'recent':
      return sql`case when ${foods.lastUsedAt} is null then 1 else 0 end asc, ${foods.lastUsedAt} desc, lower(${foods.name}) asc`;
    case 'protein':
      return sql`${foods.protein} desc, lower(${foods.name}) asc`;
    case 'name':
    default:
      return sql`lower(${foods.name}) asc, lower(coalesce(${foods.brand}, '')) asc`;
  }
};

const getFoodById = async (id: string, userId: string): Promise<FoodRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(foodSelection)
    .from(foods)
    .where(and(eq(foods.id, id), eq(foods.userId, userId)))
    .limit(1)
    .get();
};

export const createFood = async ({
  id,
  userId,
  name,
  brand,
  servingSize,
  servingGrams,
  calories,
  protein,
  carbs,
  fat,
  fiber,
  sugar,
  verified,
  source,
  notes,
}: CreateFoodRecordInput): Promise<FoodRecord> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .insert(foods)
    .values({
      id,
      userId,
      name,
      brand: toNullable(brand),
      servingSize: toNullable(servingSize),
      servingGrams: toNullable(servingGrams),
      calories,
      protein,
      carbs,
      fat,
      fiber: toNullable(fiber),
      sugar: toNullable(sugar),
      verified,
      source: toNullable(source),
      notes: toNullable(notes),
    })
    .run();

  if (result.changes !== 1) {
    throw new Error('Failed to persist food');
  }

  const food = await getFoodById(id, userId);
  if (!food) {
    throw new Error('Failed to load created food');
  }

  return food;
};

export const listFoods = async (
  userId: string,
  { q, sort, page, limit }: FoodQueryParams,
): Promise<FoodListResult> => {
  const { db } = await import('../../db/index.js');

  const filters = buildFoodFilters(userId, q);
  const offset = (page - 1) * limit;

  const foodRows = db
    .select(foodSelection)
    .from(foods)
    .where(filters)
    .orderBy(buildFoodSort(sort))
    .limit(limit)
    .offset(offset)
    .all();

  const totalRow = db
    .select({
      total: count(),
    })
    .from(foods)
    .where(filters)
    .get();

  return {
    foods: foodRows,
    total: totalRow?.total ?? 0,
  };
};

export const updateFood = async (
  id: string,
  userId: string,
  updates: UpdateFoodInput,
): Promise<FoodRecord | undefined> => {
  const { db } = await import('../../db/index.js');
  const nextValues: Partial<typeof foods.$inferInsert> & { updatedAt: number } = {
    updatedAt: Date.now(),
  };

  if (updates.name !== undefined) {
    nextValues.name = updates.name;
  }

  if ('brand' in updates) {
    nextValues.brand = toNullable(updates.brand);
  }

  if ('servingSize' in updates) {
    nextValues.servingSize = toNullable(updates.servingSize);
  }

  if ('servingGrams' in updates) {
    nextValues.servingGrams = toNullable(updates.servingGrams);
  }

  if (updates.calories !== undefined) {
    nextValues.calories = updates.calories;
  }

  if (updates.protein !== undefined) {
    nextValues.protein = updates.protein;
  }

  if (updates.carbs !== undefined) {
    nextValues.carbs = updates.carbs;
  }

  if (updates.fat !== undefined) {
    nextValues.fat = updates.fat;
  }

  if ('fiber' in updates) {
    nextValues.fiber = toNullable(updates.fiber);
  }

  if ('sugar' in updates) {
    nextValues.sugar = toNullable(updates.sugar);
  }

  if (updates.verified !== undefined) {
    nextValues.verified = updates.verified;
  }

  if ('source' in updates) {
    nextValues.source = toNullable(updates.source);
  }

  if ('notes' in updates) {
    nextValues.notes = toNullable(updates.notes);
  }

  const result = db
    .update(foods)
    .set(nextValues)
    .where(and(eq(foods.id, id), eq(foods.userId, userId)))
    .run();

  if (result.changes !== 1) {
    return undefined;
  }

  return getFoodById(id, userId);
};

export const deleteFood = async (id: string, userId: string): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .delete(foods)
    .where(and(eq(foods.id, id), eq(foods.userId, userId)))
    .run();

  return result.changes === 1;
};

export const updateFoodLastUsedAt = async (
  foodId: string,
  lastUsedAt = Date.now(),
): Promise<void> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .update(foods)
    .set({
      lastUsedAt,
    })
    .where(eq(foods.id, foodId))
    .run();

  if (result.changes !== 1) {
    throw new Error('Failed to update food last used timestamp');
  }
};
