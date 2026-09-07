import { and, asc, count, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { reconcileFoodUsageInputSchema, reconcileFoodUsageResponseSchema } from '@pulse/shared';
import type {
  CreateFoodInput,
  Food,
  PatchFoodInput,
  FoodQueryParams,
  FoodSort,
  UpdateFoodInput,
} from '@pulse/shared';

import { foods, mealItems, meals, nutritionLogs, users } from '../../db/schema/index.js';

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
// Intentionally store-local: API schemas normalize legacy aliases at parse-time, but store utilities
// still accept aliases for internal call sites and defensive compatibility.
type LegacyFoodSort = 'name' | 'recent' | 'popular';

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

const buildFoodSort = (sort: FoodSort | LegacyFoodSort) => {
  switch (sort) {
    case 'newest':
      return sql`${foods.createdAt} desc, lower(${foods.name}) asc`;
    case 'oldest':
      return sql`${foods.createdAt} asc, lower(${foods.name}) asc`;
    case 'recently-updated':
    case 'recent':
      return sql`${foods.updatedAt} desc, lower(${foods.name}) asc`;
    case 'most-used':
    case 'popular':
      return sql`${foods.usageCount} desc, lower(${foods.name}) asc`;
    case 'least-used':
      return sql`${foods.usageCount} asc, lower(${foods.name}) asc`;
    case 'name-desc':
      return sql`lower(${foods.name}) desc, lower(coalesce(${foods.brand}, '')) desc`;
    case 'name-asc':
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
    .orderBy(buildFoodSort('recently-updated'))
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
    .orderBy(buildFoodSort('recently-updated'))
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
    .orderBy(buildFoodSort('recently-updated'))
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

  return db.transaction((tx) => {
    const result = tx
      .update(foods)
      .set({ deletedAt: new Date().toISOString() })
      .where(and(eq(foods.id, id), eq(foods.userId, userId), isNull(foods.deletedAt)))
      .run();
    if (result.changes === 1) refreshFoodUsage(tx, userId, [id]);
    return result.changes === 1;
  });
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

    const now = Date.now();

    tx.update(nutritionLogs)
      .set({
        status: 'partial',
        statusUpdatedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(nutritionLogs.userId, userId),
          eq(nutritionLogs.status, 'complete'),
          sql`exists (
            select 1
            from ${meals}
            inner join ${mealItems} on ${mealItems.mealId} = ${meals.id}
            where ${meals.nutritionLogId} = ${nutritionLogs.id}
              and ${mealItems.foodId} = ${loserId}
          )`,
        ),
      )
      .run();

    tx.update(mealItems)
      .set({ foodId: winnerId })
      .where(
        and(
          eq(mealItems.foodId, loserId),
          sql`exists (
            select 1
            from ${meals}
            inner join ${nutritionLogs} on ${nutritionLogs.id} = ${meals.nutritionLogId}
            where ${meals.id} = ${mealItems.mealId}
              and ${nutritionLogs.userId} = ${userId}
          )`,
        ),
      )
      .run();

    refreshFoodUsage(tx, userId, [winnerId, loserId]);

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

type UsageTransaction = Parameters<
  Parameters<(typeof import('../../db/index.js'))['db']['transaction']>[0]
>[0];

export class FoodUsageScopeError extends Error {}

// Single canonical projection. Call inside the same synchronous transaction as link mutations.
// A supplied target is internal-only; the public endpoint never accepts food or user selectors.
export const reconcileFoodUsage = (
  tx: UsageTransaction,
  userId: string,
  input: unknown = {},
  targetId?: string,
) => {
  const { mode, limit } = reconcileFoodUsageInputSchema.parse(input);
  if (
    typeof userId !== 'string' ||
    !userId.trim() ||
    !tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).get()
  ) {
    throw new FoodUsageScopeError('Valid user scope required');
  }
  const targets = tx
    .select({ id: foods.id, usageCount: foods.usageCount, lastUsedAt: foods.lastUsedAt })
    .from(foods)
    .where(
      and(eq(foods.userId, userId), targetId === undefined ? undefined : eq(foods.id, targetId)),
    )
    .orderBy(asc(foods.id))
    .limit(limit + 1)
    .all();
  if (targets.length > limit)
    throw new FoodUsageScopeError('Food scope exceeds limit; no changes applied');
  if (targetId !== undefined && targets.length !== 1)
    throw new FoodUsageScopeError('Food scope mismatch');
  const ids = targets.map((food) => food.id);
  const usageRows =
    ids.length === 0
      ? []
      : tx
          .select({
            foodId: mealItems.foodId,
            usageCount: sql<number>`cast(count(*) as integer)`,
            lastUsedAt: sql<number | null>`max(${mealItems.createdAt})`,
          })
          .from(mealItems)
          .innerJoin(meals, eq(meals.id, mealItems.mealId))
          .innerJoin(nutritionLogs, eq(nutritionLogs.id, meals.nutritionLogId))
          .innerJoin(foods, eq(foods.id, mealItems.foodId))
          .where(
            and(eq(nutritionLogs.userId, userId), eq(foods.userId, userId), inArray(foods.id, ids)),
          )
          .groupBy(mealItems.foodId)
          .all();
  const usage = new Map(
    usageRows.map((row) => [
      row.foodId,
      { usageCount: Number(row.usageCount), lastUsedAt: row.lastUsedAt },
    ]),
  );
  let changed = 0;
  let updated = 0;
  const rows = targets.map((food) => {
    const projected = usage.get(food.id) ?? { usageCount: 0, lastUsedAt: null };
    const before = { usageCount: food.usageCount, lastUsedAt: food.lastUsedAt };
    if (before.usageCount !== projected.usageCount || before.lastUsedAt !== projected.lastUsedAt) {
      changed++;
      if (mode === 'apply') {
        const result = tx
          .update(foods)
          .set({ ...projected, updatedAt: sql`${foods.updatedAt}` })
          .where(and(eq(foods.id, food.id), eq(foods.userId, userId)))
          .run();
        if (result.changes !== 1) throw new FoodUsageScopeError('Incomplete food usage update');
        updated++;
      }
    }
    return { id: food.id, before, projected };
  });
  // Validate the response while the caller transaction can still roll back.
  return reconcileFoodUsageResponseSchema.parse({
    userId,
    mode,
    reconciled: targets.length,
    changed,
    updated,
    rows,
  });
};

export const refreshFoodUsage = (
  tx: UsageTransaction,
  userId: string,
  foodIds: (string | null)[],
) => {
  for (const id of [...new Set(foodIds.filter((id): id is string => id !== null))].sort()) {
    // Existing hostile links are never foreign write targets; trashed owner foods still count.
    const target = tx
      .select({ id: foods.id })
      .from(foods)
      .where(and(eq(foods.id, id), eq(foods.userId, userId)))
      .get();
    if (target) reconcileFoodUsage(tx, userId, { mode: 'apply', limit: 1 }, id);
  }
};
