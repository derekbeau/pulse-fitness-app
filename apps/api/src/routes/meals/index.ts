import {
  agentCreateMealInputSchema,
  type AgentMealItemInput,
  createMealInputSchema,
  patchMealInputSchema,
  patchMealItemInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { autoCreateIfMissing, resolveByName } from '../agentEnrichment.js';
import { sendError } from '../../lib/reply.js';
import { isAgentRequest, requireAuth } from '../../middleware/auth.js';
import { trackFoodUsage } from '../foods/store.js';
import {
  createMealForDate,
  findMealById,
  findMealItemById,
  patchMealById,
  patchMealItemById,
} from '../nutrition/store.js';

const MAX_MEAL_SUMMARY_LENGTH = 500;
const SUMMARY_ELLIPSIS = '...';

const isValidDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
};

const buildMealSummary = (names: string[], maxLength: number) => {
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
      : `${summary.slice(0, maxLength - SUMMARY_ELLIPSIS.length)}${SUMMARY_ELLIPSIS}`;
  }

  return summary;
};

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

const hasInlineMacros = (
  item: AgentMealItemInput,
): item is AgentMealItemInput & {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} =>
  item.calories !== undefined &&
  item.protein !== undefined &&
  item.carbs !== undefined &&
  item.fat !== undefined;

export const mealRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.post('/', async (request, reply) => {
    if (isAgentRequest(request)) {
      const parsedBody = agentCreateMealInputSchema.safeParse(request.body);
      if (!parsedBody.success || !isValidDate(parsedBody.data.date)) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal payload');
      }

      const { date, items, name, time } = parsedBody.data;
      const userId = request.userId;

      const itemResults = await Promise.all(
        items.map(async (item) => {
          if (isAdhocMealItem(item)) {
            return { kind: 'adhoc' as const, item };
          }

          const resolved = await resolveByName('food', item.foodName, userId);
          if (resolved) {
            return { kind: 'food' as const, item, food: resolved };
          }

          if (hasInlineMacros(item)) {
            const created = await autoCreateIfMissing(
              'food',
              {
                name: item.foodName,
                servingSize: item.unit,
                calories: item.calories,
                protein: item.protein,
                carbs: item.carbs,
                fat: item.fat,
              },
              userId,
            );
            return { kind: 'food' as const, item, food: created.entity };
          }

          return { kind: 'food' as const, item, food: undefined };
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
      const created = await createMealForDate(userId, date, {
        name,
        summary,
        time,
        items: mealItems,
      });

      const resolvedFoodIds = itemResults
        .flatMap((entry) => (entry.kind === 'food' && entry.food ? [entry.food.id] : []))
        .filter((value, index, values) => values.indexOf(value) === index);

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

      const macros = created.items.reduce(
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
            id: created.meal.id,
            name: created.meal.name,
            summary: created.meal.summary,
            date,
            time: created.meal.time,
          },
          macros,
          items: created.items.map((item) => ({
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
    }

    if (
      typeof request.body !== 'object' ||
      request.body === null ||
      !('date' in request.body) ||
      typeof request.body.date !== 'string' ||
      !isValidDate(request.body.date)
    ) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal payload');
    }
    const standardBody = createMealInputSchema.safeParse(request.body);
    if (!standardBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal payload');
    }
    const date = request.body.date;

    const created = await createMealForDate(request.userId, date, {
      name: standardBody.data.name,
      summary: standardBody.data.summary,
      time: standardBody.data.time,
      notes: standardBody.data.notes,
      items: standardBody.data.items,
    });

    const foodIds = [
      ...new Set(
        created.items
          .map((item) => item.foodId)
          .filter((foodId): foodId is string => typeof foodId === 'string'),
      ),
    ];
    const usageTrackingResults = await Promise.allSettled(
      foodIds.map((foodId) => trackFoodUsage(foodId, request.userId)),
    );
    usageTrackingResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        request.log.warn(
          { err: result.reason, foodId: foodIds[index], userId: request.userId },
          'Failed to track food usage after meal creation',
        );
      }
    });

    return reply.code(201).send({
      data: created,
    });
  });

  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsedBody = patchMealInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal payload');
    }

    const existingMeal = await findMealById(request.userId, request.params.id);
    if (!existingMeal) {
      return sendError(reply, 404, 'MEAL_NOT_FOUND', 'Meal not found');
    }

    const updatedMeal = await patchMealById(request.userId, request.params.id, parsedBody.data);
    if (!updatedMeal) {
      return sendError(reply, 404, 'MEAL_NOT_FOUND', 'Meal not found');
    }

    return reply.send({
      data: updatedMeal,
    });
  });

  app.patch<{ Params: { id: string; itemId: string } }>('/:id/items/:itemId', async (request, reply) => {
    const parsedBody = patchMealItemInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
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
      parsedBody.data,
    );
    if (!updatedMealItem) {
      return sendError(reply, 404, 'MEAL_ITEM_NOT_FOUND', 'Meal item not found');
    }

    return reply.send({
      data: updatedMealItem,
    });
  });
};
