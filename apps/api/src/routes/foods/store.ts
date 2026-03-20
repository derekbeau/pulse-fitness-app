import { and, count, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type {
  CreateFoodInput,
  Food,
  PatchFoodInput,
  FoodQueryParams,
  FoodSort,
  UpdateFoodInput,
} from '@pulse/shared';

import { foods, mealItems } from '../../db/schema/index.js';

export type FoodRecord = Food;

export type CreateFoodRecordInput = {
  id: string;
  userId: string;
} & CreateFoodInput;

export type FoodListResult = {
  foods: FoodRecord[];
  total: number;
};

export class FoodMergeSameIdError extends Error {
  constructor() {
    super('winnerId and loserId must be different');
    this.name = 'FoodMergeSameIdError';
  }
}

export class FoodMergeNotFoundError extends Error {
  constructor(public readonly foodRole: 'winner' | 'loser') {
    super(`Merge ${foodRole} food not found`);
    this.name = 'FoodMergeNotFoundError';
  }
}

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
  usageCount: foods.usageCount,
  tags: foods.tags,
  lastUsedAt: foods.lastUsedAt,
  createdAt: foods.createdAt,
  updatedAt: foods.updatedAt,
};

const toNullable = <T>(value: T | undefined): T | null => value ?? null;
const escapeLikePattern = (value: string) => value.toLowerCase().replace(/[%_\\]/g, '\\$&');

const buildFoodFilters = (userId: string, query?: string, tags?: string[]) => {
  const filters: SQL<unknown>[] = [eq(foods.userId, userId), isNull(foods.deletedAt)];

  if (query) {
    const pattern = `%${escapeLikePattern(query)}%`;

    filters.push(
      sql`(
        lower(${foods.name}) like ${pattern} escape '\\'
        or lower(coalesce(${foods.brand}, '')) like ${pattern} escape '\\'
      )`,
    );
  }

  if (tags && tags.length > 0) {
    for (const tag of tags) {
      filters.push(
        sql`exists (
          select 1
          from json_each(${foods.tags})
          where lower(json_each.value) = ${tag}
        )`,
      );
    }
  }

  return and(...filters);
};

const buildFoodSort = (sort: FoodSort) => {
  switch (sort) {
    case 'recent':
      return sql`case when ${foods.lastUsedAt} is null then 1 else 0 end asc, ${foods.lastUsedAt} desc, lower(${foods.name}) asc`;
    case 'popular':
      return sql`${foods.usageCount} desc, lower(${foods.name}) asc`;
    case 'name':
    default:
      return sql`lower(${foods.name}) asc, lower(coalesce(${foods.brand}, '')) asc`;
  }
};

export const findFoodById = async (id: string, userId: string): Promise<FoodRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(foodSelection)
    .from(foods)
    .where(and(eq(foods.id, id), eq(foods.userId, userId), isNull(foods.deletedAt)))
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
  tags,
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
      tags,
    })
    .run();

  if (result.changes !== 1) {
    throw new Error('Failed to persist food');
  }

  const food = await findFoodById(id, userId);
  if (!food) {
    throw new Error('Failed to load created food');
  }

  return food;
};

export const listFoods = async (
  userId: string,
  { q, tags, sort, page, limit }: FoodQueryParams,
): Promise<FoodListResult> => {
  const { db } = await import('../../db/index.js');

  const filters = buildFoodFilters(userId, q, tags);
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

export const searchFoodsByName = async (
  userId: string,
  query: string | undefined,
  limit: number,
): Promise<
  Array<{
    id: string;
    name: string;
    brand: string | null;
    servingSize: string | null;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>
> => {
  const { db } = await import('../../db/index.js');
  const filters: SQL<unknown>[] = [eq(foods.userId, userId), isNull(foods.deletedAt)];

  if (query) {
    const pattern = `%${escapeLikePattern(query)}%`;
    filters.push(
      sql`(
        lower(${foods.name}) like ${pattern} escape '\\'
        or lower(coalesce(${foods.brand}, '')) like ${pattern} escape '\\'
      )`,
    );
  }

  return db
    .select({
      id: foods.id,
      name: foods.name,
      brand: foods.brand,
      servingSize: foods.servingSize,
      calories: foods.calories,
      protein: foods.protein,
      carbs: foods.carbs,
      fat: foods.fat,
    })
    .from(foods)
    .where(and(...filters))
    .orderBy(buildFoodSort('recent'))
    .limit(limit)
    .all();
};

export const findFoodByName = async (
  userId: string,
  foodName: string,
): Promise<
  | {
      id: string;
      name: string;
      brand: string | null;
      servingSize: string | null;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }
  | undefined
> => {
  const { db } = await import('../../db/index.js');
  const nameLower = foodName.trim().toLowerCase();

  const exact = db
    .select({
      id: foods.id,
      name: foods.name,
      brand: foods.brand,
      servingSize: foods.servingSize,
      calories: foods.calories,
      protein: foods.protein,
      carbs: foods.carbs,
      fat: foods.fat,
    })
    .from(foods)
    .where(
      and(
        eq(foods.userId, userId),
        isNull(foods.deletedAt),
        sql`lower(${foods.name}) = ${nameLower}`,
      ),
    )
    .orderBy(buildFoodSort('recent'))
    .limit(1)
    .get();

  if (exact) {
    return exact;
  }

  const pattern = `%${escapeLikePattern(nameLower)}%`;
  return db
    .select({
      id: foods.id,
      name: foods.name,
      brand: foods.brand,
      servingSize: foods.servingSize,
      calories: foods.calories,
      protein: foods.protein,
      carbs: foods.carbs,
      fat: foods.fat,
    })
    .from(foods)
    .where(
      and(
        eq(foods.userId, userId),
        isNull(foods.deletedAt),
        sql`lower(${foods.name}) like ${pattern} escape '\\'`,
      ),
    )
    .orderBy(buildFoodSort('recent'))
    .limit(1)
    .get();
};

export const updateFood = async (
  id: string,
  userId: string,
  updates: UpdateFoodInput | PatchFoodInput,
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

  if (updates.tags !== undefined) {
    nextValues.tags = updates.tags;
  }

  const result = db
    .update(foods)
    .set(nextValues)
    .where(and(eq(foods.id, id), eq(foods.userId, userId), isNull(foods.deletedAt)))
    .run();

  if (result.changes !== 1) {
    return undefined;
  }

  return findFoodById(id, userId);
};

export const deleteFood = async (id: string, userId: string): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .update(foods)
    .set({
      deletedAt: new Date().toISOString(),
    })
    .where(and(eq(foods.id, id), eq(foods.userId, userId), isNull(foods.deletedAt)))
    .run();

  return result.changes === 1;
};

const mergeLastUsedAt = (winnerLastUsedAt: number | null, loserLastUsedAt: number | null) => {
  if (winnerLastUsedAt === null) {
    return loserLastUsedAt;
  }

  if (loserLastUsedAt === null) {
    return winnerLastUsedAt;
  }

  return Math.max(winnerLastUsedAt, loserLastUsedAt);
};

export const mergeFoods = async (
  userId: string,
  winnerId: string,
  loserId: string,
): Promise<FoodRecord> => {
  if (winnerId === loserId) {
    throw new FoodMergeSameIdError();
  }

  const { db } = await import('../../db/index.js');

  return db.transaction((tx) => {
    const winner = tx
      .select(foodSelection)
      .from(foods)
      .where(and(eq(foods.id, winnerId), eq(foods.userId, userId), isNull(foods.deletedAt)))
      .limit(1)
      .get();

    if (!winner) {
      throw new FoodMergeNotFoundError('winner');
    }

    const loser = tx
      .select(foodSelection)
      .from(foods)
      .where(and(eq(foods.id, loserId), eq(foods.userId, userId), isNull(foods.deletedAt)))
      .limit(1)
      .get();

    if (!loser) {
      throw new FoodMergeNotFoundError('loser');
    }

    // We scope winner/loser lookup by user first; UUID food IDs are globally unique, so this relink is user-safe.
    tx.update(mealItems).set({ foodId: winnerId }).where(eq(mealItems.foodId, loserId)).run();

    const now = Date.now();
    const updatedWinnerUsageCount = winner.usageCount + loser.usageCount;
    const updatedWinnerLastUsedAt = mergeLastUsedAt(winner.lastUsedAt, loser.lastUsedAt);

    const winnerUpdateResult = tx
      .update(foods)
      .set({
        usageCount: updatedWinnerUsageCount,
        lastUsedAt: updatedWinnerLastUsedAt,
        updatedAt: now,
      })
      .where(and(eq(foods.id, winnerId), eq(foods.userId, userId), isNull(foods.deletedAt)))
      .run();

    if (winnerUpdateResult.changes !== 1) {
      throw new Error('Failed to update winner food during merge');
    }

    const loserDeleteResult = tx
      .update(foods)
      .set({
        deletedAt: new Date(now).toISOString(),
        updatedAt: now,
      })
      .where(and(eq(foods.id, loserId), eq(foods.userId, userId), isNull(foods.deletedAt)))
      .run();

    if (loserDeleteResult.changes !== 1) {
      throw new Error('Failed to soft-delete loser food during merge');
    }

    const mergedWinner = tx
      .select(foodSelection)
      .from(foods)
      .where(and(eq(foods.id, winnerId), eq(foods.userId, userId), isNull(foods.deletedAt)))
      .limit(1)
      .get();

    if (!mergedWinner) {
      throw new Error('Failed to load merged winner food');
    }

    return mergedWinner;
  });
};

export const trackFoodUsage = async (
  foodId: string,
  userId: string,
  lastUsedAt = Date.now(),
): Promise<void> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .update(foods)
    .set({
      lastUsedAt,
      usageCount: sql`usage_count + 1`,
    })
    .where(and(eq(foods.id, foodId), eq(foods.userId, userId), isNull(foods.deletedAt)))
    .run();

  if (result.changes !== 1) {
    throw new Error('Failed to track food usage metrics');
  }
};

export const decrementFoodUsage = async (foodId: string, userId: string): Promise<void> => {
  const { db } = await import('../../db/index.js');

  db.update(foods)
    .set({
      usageCount: sql`case when usage_count > 0 then usage_count - 1 else 0 end`,
    })
    .where(and(eq(foods.id, foodId), eq(foods.userId, userId)))
    .run();
};

export const reconcileFoodUsage = async (
  userId: string,
): Promise<{ reconciled: number; updated: number }> => {
  const { db } = await import('../../db/index.js');

  return db.transaction((tx) => {
    const foodsForUser = tx
      .select({
        id: foods.id,
        usageCount: foods.usageCount,
        lastUsedAt: foods.lastUsedAt,
      })
      .from(foods)
      .where(and(eq(foods.userId, userId), isNull(foods.deletedAt)))
      .all();

    if (foodsForUser.length === 0) {
      return { reconciled: 0, updated: 0 };
    }

    const usageRows = tx
      .select({
        foodId: mealItems.foodId,
        usageCount: sql<number>`cast(count(*) as integer)`,
        lastUsedAt: sql<number | null>`max(${mealItems.createdAt})`,
      })
      .from(mealItems)
      .innerJoin(foods, eq(foods.id, mealItems.foodId))
      .where(and(eq(foods.userId, userId), isNull(foods.deletedAt)))
      .groupBy(mealItems.foodId)
      .all();

    const usageByFoodId = new Map<string, { usageCount: number; lastUsedAt: number | null }>();
    for (const row of usageRows) {
      if (typeof row.foodId !== 'string') {
        continue;
      }

      usageByFoodId.set(row.foodId, {
        usageCount: Number(row.usageCount ?? 0),
        lastUsedAt: row.lastUsedAt === null ? null : Number(row.lastUsedAt),
      });
    }

    let updated = 0;
    const now = Date.now();

    for (const food of foodsForUser) {
      const nextUsage = usageByFoodId.get(food.id) ?? { usageCount: 0, lastUsedAt: null };
      const usageChanged = food.usageCount !== nextUsage.usageCount;
      const lastUsedAtChanged = food.lastUsedAt !== nextUsage.lastUsedAt;

      if (!usageChanged && !lastUsedAtChanged) {
        continue;
      }

      if (usageChanged || lastUsedAtChanged) {
        updated += 1;
      }

      tx.update(foods)
        .set({
          usageCount: nextUsage.usageCount,
          lastUsedAt: nextUsage.lastUsedAt,
          updatedAt: now,
        })
        .where(and(eq(foods.id, food.id), eq(foods.userId, userId), isNull(foods.deletedAt)))
        .run();
    }

    return {
      reconciled: foodsForUser.length,
      updated,
    };
  });
};
