import { and, eq, sql } from 'drizzle-orm';

import { foods } from '../../db/schema/index.js';

export type AgentFoodRecord = {
  id: string;
  name: string;
  brand: string | null;
  servingSize: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const agentFoodSelection = {
  id: foods.id,
  name: foods.name,
  brand: foods.brand,
  servingSize: foods.servingSize,
  calories: foods.calories,
  protein: foods.protein,
  carbs: foods.carbs,
  fat: foods.fat,
};

const escapeLikePattern = (value: string) => value.toLowerCase().replace(/[%_\\]/g, '\\$&');

const recentSortExpr = sql`case when ${foods.lastUsedAt} is null then 1 else 0 end asc, ${foods.lastUsedAt} desc, lower(${foods.name}) asc`;

export const searchFoodsByName = async (
  userId: string,
  query: string | undefined,
  limit: number,
): Promise<AgentFoodRecord[]> => {
  const { db } = await import('../../db/index.js');

  const conditions = [eq(foods.userId, userId)];
  if (query) {
    const pattern = `%${escapeLikePattern(query)}%`;
    conditions.push(
      sql`(lower(${foods.name}) like ${pattern} escape '\\' or lower(coalesce(${foods.brand}, '')) like ${pattern} escape '\\')`,
    );
  }

  const where = conditions.length === 1 ? conditions[0] : and(...conditions);

  return db.select(agentFoodSelection).from(foods).where(where).orderBy(recentSortExpr).limit(limit).all();
};

export const findFoodByName = async (
  userId: string,
  foodName: string,
): Promise<AgentFoodRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  const nameLower = foodName.trim().toLowerCase();

  const exact = db
    .select(agentFoodSelection)
    .from(foods)
    .where(and(eq(foods.userId, userId), sql`lower(${foods.name}) = ${nameLower}`))
    .orderBy(recentSortExpr)
    .limit(1)
    .get();

  if (exact) {
    return exact;
  }

  const pattern = `%${escapeLikePattern(nameLower)}%`;
  return db
    .select(agentFoodSelection)
    .from(foods)
    .where(
      and(eq(foods.userId, userId), sql`lower(${foods.name}) like ${pattern} escape '\\'`),
    )
    .orderBy(recentSortExpr)
    .limit(1)
    .get();
};
