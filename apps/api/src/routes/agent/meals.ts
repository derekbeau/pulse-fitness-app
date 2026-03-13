import {
  agentCreateMealInputSchema,
  type AgentMealItemInput,
  patchMealInputSchema,
  patchMealItemInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { trackFoodUsage } from '../foods/store.js';
import {
  createMealForDate,
  findMealById,
  findMealItemById,
  patchMealById,
  patchMealItemById,
} from '../nutrition/store.js';

import { isValidDate } from './date-utils.js';
import { findFoodByName } from './store.js';

const MAX_MEAL_SUMMARY_LENGTH = 500;
const SUMMARY_ELLIPSIS = '…';

function buildMealSummary(names: string[], maxLength: number): string {
  let summary = '';

  for (const name of names) {
    const candidate = summary ? `${summary}, ${name}` : name;

    if (candidate.length <= maxLength) {
      summary = candidate;
      continue;
    }

    if (!summary) {
      return name.slice(0, maxLength);
    }

    return summary.length + SUMMARY_ELLIPSIS.length <= maxLength
      ? `${summary}${SUMMARY_ELLIPSIS}`
      : summary.slice(0, maxLength - SUMMARY_ELLIPSIS.length) + SUMMARY_ELLIPSIS;
  }

  return summary;
}

const isAdhocMealItem = (
  item: AgentMealItemInput,
): item is AgentMealItemInput & {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} =>
  (item.adhoc === true || item.saveToFoods === false) &&
  item.calories !== undefined &&
  item.protein !== undefined &&
  item.carbs !== undefined &&
  item.fat !== undefined;

export const agentMealsRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', async (request, reply) => {
    const parsed = agentCreateMealInputSchema.safeParse(request.body);
    if (!parsed.success || !isValidDate(parsed.data.date)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal payload');
    }

    const { name, date, time, items } = parsed.data;
    const userId = request.userId;

    const itemResults = await Promise.all(
      items.map(async (item) => {
        if (isAdhocMealItem(item)) {
          return { kind: 'adhoc' as const, item };
        }

        const food = await findFoodByName(userId, item.foodName);
        return { kind: 'food' as const, item, food };
      }),
    );

    const unresolved = itemResults
      .filter((entry) => entry.kind === 'food' && entry.food === undefined)
      .map((entry) => entry.item.foodName);

    if (unresolved.length > 0) {
      return sendError(
        reply,
        422,
        'UNRESOLVED_FOODS',
        `Could not find foods: ${unresolved.join(', ')}`,
      );
    }

    const mealItems = itemResults.map((entry) => {
      if (entry.kind === 'adhoc') {
        return {
          foodId: null,
          name: entry.item.foodName,
          amount: entry.item.quantity,
          unit: entry.item.unit,
          displayQuantity: entry.item.displayQuantity ?? null,
          displayUnit: entry.item.displayUnit ?? null,
          calories: entry.item.calories,
          protein: entry.item.protein,
          carbs: entry.item.carbs,
          fat: entry.item.fat,
        };
      }

      if (!entry.food) {
        throw new Error('Unresolved food passed validation guard');
      }

      // Scale macros by quantity (1 unit = 1 serving as defined by the food record)
      return {
        foodId: entry.food.id,
        name: entry.food.name,
        amount: entry.item.quantity,
        unit: entry.item.unit,
        displayQuantity: entry.item.displayQuantity ?? null,
        displayUnit: entry.item.displayUnit ?? null,
        calories: entry.food.calories * entry.item.quantity,
        protein: entry.food.protein * entry.item.quantity,
        carbs: entry.food.carbs * entry.item.quantity,
        fat: entry.food.fat * entry.item.quantity,
      };
    });
    const summary = buildMealSummary(
      mealItems.map((item) => item.name),
      MAX_MEAL_SUMMARY_LENGTH,
    );

    const { meal, items: createdItems } = await createMealForDate(userId, date, {
      name,
      summary,
      time,
      items: mealItems,
    });

    const resolvedFoodIds = itemResults
      .flatMap((entry) => (entry.kind === 'food' && entry.food ? [entry.food.id] : []))
      .filter((value, index, list) => list.indexOf(value) === index);

    // Update recency/popularity for resolved foods (best-effort)
    const usageTrackingResults = await Promise.allSettled(
      resolvedFoodIds.map((foodId) => trackFoodUsage(foodId, userId)),
    );
    usageTrackingResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        request.log.warn(
          { err: result.reason, foodId: resolvedFoodIds[index], userId },
          'Failed to track food usage after agent meal creation',
        );
      }
    });

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
          summary: meal.summary,
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
          displayQuantity: item.displayQuantity,
          displayUnit: item.displayUnit,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
        })),
      },
    });
  });

  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = patchMealInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal payload');
    }

    const existingMeal = await findMealById(request.userId, request.params.id);
    if (!existingMeal) {
      return sendError(reply, 404, 'MEAL_NOT_FOUND', 'Meal not found');
    }

    const updatedMeal = await patchMealById(request.userId, request.params.id, parsed.data);
    if (!updatedMeal) {
      return sendError(reply, 404, 'MEAL_NOT_FOUND', 'Meal not found');
    }

    return reply.send({
      data: updatedMeal,
    });
  });

  app.patch<{ Params: { id: string; itemId: string } }>('/:id/items/:itemId', async (request, reply) => {
    const parsed = patchMealItemInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal item payload');
    }

    const existingMealItem = await findMealItemById(request.userId, request.params.id, request.params.itemId);
    if (!existingMealItem) {
      return sendError(reply, 404, 'MEAL_ITEM_NOT_FOUND', 'Meal item not found');
    }

    const updatedMealItem = await patchMealItemById(
      request.userId,
      request.params.id,
      request.params.itemId,
      parsed.data,
    );
    if (!updatedMealItem) {
      return sendError(reply, 404, 'MEAL_ITEM_NOT_FOUND', 'Meal item not found');
    }

    return reply.send({
      data: updatedMealItem,
    });
  });
};
