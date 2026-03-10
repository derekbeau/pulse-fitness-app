import { agentCreateMealInputSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { updateFoodLastUsedAt } from '../foods/store.js';
import { createMealForDate } from '../nutrition/store.js';

import { findFoodByName } from './store.js';

export const agentMealsRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', async (request, reply) => {
    const parsed = agentCreateMealInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal payload');
    }

    const { name, date, time, items } = parsed.data;
    const userId = request.userId;

    // Resolve food names to food records
    const resolvedFoods = await Promise.all(
      items.map(async (item) => {
        const food = await findFoodByName(userId, item.foodName);
        return { item, food };
      }),
    );

    const unresolved = resolvedFoods
      .filter(({ food }) => food === undefined)
      .map(({ item }) => item.foodName);

    if (unresolved.length > 0) {
      return sendError(
        reply,
        422,
        'UNRESOLVED_FOODS',
        `Could not find foods: ${unresolved.join(', ')}`,
      );
    }

    // All foods resolved — safe to cast since we checked above
    const resolvedItems = resolvedFoods as Array<{
      item: (typeof resolvedFoods)[number]['item'];
      food: NonNullable<(typeof resolvedFoods)[number]['food']>;
    }>;

    // Scale macros by quantity (1 unit = 1 serving as defined by the food record)
    const mealItems = resolvedItems.map(({ item, food }) => ({
      foodId: food.id,
      name: food.name,
      amount: item.quantity,
      unit: item.unit,
      calories: food.calories * item.quantity,
      protein: food.protein * item.quantity,
      carbs: food.carbs * item.quantity,
      fat: food.fat * item.quantity,
    }));

    const { meal, items: createdItems } = await createMealForDate(userId, date, {
      name,
      time,
      items: mealItems,
    });

    // Update lastUsedAt for resolved foods (best-effort)
    await Promise.allSettled(
      resolvedItems.map(({ food }) => updateFoodLastUsedAt(food.id, userId)),
    );

    const macros = createdItems.reduce(
      (acc, item) => ({
        calories: acc.calories + item.calories,
        protein: acc.protein + item.protein,
        carbs: acc.carbs + item.carbs,
        fat: acc.fat + item.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );

    return reply.code(201).send({
      data: {
        meal: {
          id: meal.id,
          name: meal.name,
          date,
          time: meal.time,
        },
        macros,
        items: createdItems.map((item) => ({
          id: item.id,
          foodId: item.foodId,
          name: item.name,
          amount: item.amount,
          unit: item.unit,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
        })),
      },
    });
  });
};
