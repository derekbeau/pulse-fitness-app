import type { CreateFoodInput } from '@pulse/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { foods } from '../../db/schema/index.js';
import { exactReusableFood, normalizeFoodIdentity } from '../foods/reuse-policy.js';

type Transaction = Parameters<
  Parameters<(typeof import('../../db/index.js'))['db']['transaction']>[0]
>[0];
type FoodPlan = { userId: string; food: CreateFoodInput; createdFoodIds: Set<string> };
// Server-only intent, never a client-writable request field or stored history metadata.
const plans = new WeakMap<object, FoodPlan>();
const createdByBody = new WeakMap<object, Set<string>>();
export const trackFoodCreation = (body: object): Set<string> => {
  const ids = new Set<string>();
  createdByBody.set(body, ids);
  return ids;
};
export const getCreatedFoodIds = (body: unknown): ReadonlySet<string> =>
  typeof body === 'object' && body !== null ? (createdByBody.get(body) ?? new Set()) : new Set();
export const planMealFood = (item: object, plan: FoodPlan) => plans.set(item, plan);
export const transferMealFoodPlan = <T extends object>(source: object, target: T): T => {
  const plan = plans.get(source);
  if (plan) plans.set(target, plan);
  return target;
};
export class FoodReuseConflictError extends Error {
  constructor() {
    super('Food identity or brand is ambiguous; specify an owned foodId or explicit ad hoc item');
    this.name = 'FoodReuseConflictError';
  }
}

export const materializeMealFood = <T extends { name: string; amount: number }>(
  tx: Transaction,
  userId: string,
  item: T,
): T => {
  const plan = plans.get(item);
  if (!plan) return item;
  if (plan.userId !== userId) throw new Error('Meal food plan owner mismatch');
  // A synchronous transaction rechecks after prior writers and rolls creation back with the meal.
  const owned = tx
    .select()
    .from(foods)
    .where(and(eq(foods.userId, userId), isNull(foods.deletedAt)))
    .all();
  let food = exactReusableFood(owned, plan.food.name, plan.food.brand);
  if (!food) {
    if (
      owned.some(
        (candidate) =>
          normalizeFoodIdentity(candidate.name) === normalizeFoodIdentity(plan.food.name),
      )
    )
      throw new FoodReuseConflictError();
    food = tx
      .insert(foods)
      .values({ ...plan.food, userId })
      .returning()
      .get();
    if (!food) throw new Error('Failed to persist planned food');
    plan.createdFoodIds.add(food.id);
  }
  return {
    ...item,
    foodId: food.id,
    name: food.name,
    calories: food.calories * item.amount,
    protein: food.protein * item.amount,
    carbs: food.carbs * item.amount,
    fat: food.fat * item.amount,
    fiber: food.fiber == null ? undefined : food.fiber * item.amount,
    sugar: food.sugar == null ? undefined : food.sugar * item.amount,
  };
};
