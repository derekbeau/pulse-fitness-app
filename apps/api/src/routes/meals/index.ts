import {
  addMealItemsInputSchema,
  apiDataResponseSchema,
  createMealForDateInputSchema,
  type CreateMealForDateInput,
  dailyNutritionMealSchema,
  nutritionMealItemSchema,
  nutritionMealSchema,
  patchMealInputSchema,
  patchMealItemInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';

import { sendError } from '../../lib/reply.js';
import { agentEnrichmentOnSend, setAgentEnrichmentContext } from '../../middleware/agent-enrichment.js';
import { isAgentRequest, requireAuth } from '../../middleware/auth.js';
import { agentRequestTransform } from '../../middleware/agent-transforms.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
  mealItemParamsSchema,
} from '../../openapi.js';
import { findFoodById } from '../foods/store.js';
import {
  addItemsToMeal,
  createMealForDate,
  findMealById,
  findMealItemById,
  patchMealById,
  patchMealItemById,
} from '../nutrition/store.js';

type MealCreateItemInput = CreateMealForDateInput['items'][number];
type PersistedMealCreateItem = {
  foodId?: string | null;
  name: string;
  amount: number;
  unit: string;
  displayQuantity?: number | null;
  displayUnit?: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
};

const MAX_MEAL_SUMMARY_LENGTH = 500;
const SUMMARY_ELLIPSIS = '...';

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

const hasInlineMacros = (
  item: MealCreateItemInput,
): item is MealCreateItemInput & {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} =>
  item.calories !== undefined &&
  item.protein !== undefined &&
  item.carbs !== undefined &&
  item.fat !== undefined;

const normalizeMealItemForCreate = async (
  item: MealCreateItemInput,
  userId: string,
): Promise<{ ok: true; item: PersistedMealCreateItem } | { ok: false; unresolvedName: string }> => {
  if (hasInlineMacros(item)) {
    return {
      ok: true,
      item: {
        foodId: item.foodId ?? null,
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        displayQuantity: item.displayQuantity,
        displayUnit: item.displayUnit,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        fiber: item.fiber,
        sugar: item.sugar,
      },
    };
  }

  if (typeof item.foodId !== 'string') {
    return {
      ok: false,
      unresolvedName: item.foodName ?? item.name,
    };
  }

  const food = await findFoodById(item.foodId, userId);
  if (!food) {
    return {
      ok: false,
      unresolvedName: item.foodName ?? item.name,
    };
  }

  return {
    ok: true,
    item: {
      foodId: food.id,
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      displayQuantity: item.displayQuantity,
      displayUnit: item.displayUnit,
      calories: food.calories * item.amount,
      protein: food.protein * item.amount,
      carbs: food.carbs * item.amount,
      fat: food.fat * item.amount,
      fiber: item.fiber,
      sugar: item.sugar,
    },
  };
};

export const mealRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/',
    {
      preHandler: agentRequestTransform,
      onSend: agentEnrichmentOnSend,
      schema: {
        body: createMealForDateInputSchema,
        response: {
          201: apiDataResponseSchema(dailyNutritionMealSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          422: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Create a meal entry',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const normalizedItems = await Promise.all(
        request.body.items.map((item) => normalizeMealItemForCreate(item, request.userId)),
      );
      const unresolvedFoods = normalizedItems
        .filter((result): result is { ok: false; unresolvedName: string } => !result.ok)
        .map((result) => result.unresolvedName);

      if (unresolvedFoods.length > 0) {
        return sendError(
          reply,
          422,
          'UNRESOLVED_FOODS',
          `Could not find foods: ${unresolvedFoods.join(', ')}`,
        );
      }

      const resolvedItems = normalizedItems
        .filter((result): result is { ok: true; item: PersistedMealCreateItem } => result.ok)
        .map((result) => result.item);

      const summary =
        request.body.summary !== undefined
          ? request.body.summary
          : isAgentRequest(request)
            ? buildMealSummary(
                resolvedItems.map((item) => item.name),
                MAX_MEAL_SUMMARY_LENGTH,
              )
            : undefined;

      const created = await createMealForDate(request.userId, request.body.date, {
        name: request.body.name,
        summary,
        time: request.body.time,
        notes: request.body.notes,
        items: resolvedItems,
      });

      const mealMacros = created.items.reduce(
        (totals, item) => ({
          calories: totals.calories + item.calories,
          protein: totals.protein + item.protein,
          carbs: totals.carbs + item.carbs,
          fat: totals.fat + item.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      );

      setAgentEnrichmentContext(request, {
        endpoint: 'meal.create',
        mealDate: request.body.date,
        mealName: created.meal.name,
        itemCount: created.items.length,
        mealMacros,
      });

      return reply.code(201).send({
        data: created,
      });
    },
  );

  typedApp.post(
    '/:id/items',
    {
      preHandler: agentRequestTransform,
      onSend: agentEnrichmentOnSend,
      schema: {
        params: idParamsSchema,
        body: addMealItemsInputSchema,
        response: {
          200: apiDataResponseSchema(dailyNutritionMealSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          422: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Add items to an existing meal',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const normalizedItems = await Promise.all(
        request.body.items.map((item) => normalizeMealItemForCreate(item, request.userId)),
      );
      const unresolvedFoods = normalizedItems
        .filter((result): result is { ok: false; unresolvedName: string } => !result.ok)
        .map((result) => result.unresolvedName);

      if (unresolvedFoods.length > 0) {
        return sendError(
          reply,
          422,
          'UNRESOLVED_FOODS',
          `Could not find foods: ${unresolvedFoods.join(', ')}`,
        );
      }

      const resolvedItems = normalizedItems
        .filter((result): result is { ok: true; item: PersistedMealCreateItem } => result.ok)
        .map((result) => result.item);

      const updatedMeal = await addItemsToMeal(request.userId, request.params.id, resolvedItems);
      if (!updatedMeal) {
        return sendError(reply, 404, 'MEAL_NOT_FOUND', 'Meal not found');
      }

      const addedItemMacros = resolvedItems.reduce(
        (totals, item) => ({
          calories: totals.calories + item.calories,
          protein: totals.protein + item.protein,
          carbs: totals.carbs + item.carbs,
          fat: totals.fat + item.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      );

      setAgentEnrichmentContext(request, {
        endpoint: 'meal.update',
        mealName: updatedMeal.meal.name,
        itemCount: resolvedItems.length,
        mealMacros: addedItemMacros,
      });

      return reply.send({
        data: updatedMeal,
      });
    },
  );

  typedApp.patch(
    '/:id',
    {
      preHandler: agentRequestTransform,
      onSend: agentEnrichmentOnSend,
      schema: {
        params: idParamsSchema,
        body: patchMealInputSchema,
        response: {
          200: apiDataResponseSchema(nutritionMealSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Update a meal entry',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const existingMeal = await findMealById(request.userId, request.params.id);
      if (!existingMeal) {
        return sendError(reply, 404, 'MEAL_NOT_FOUND', 'Meal not found');
      }

      const updatedMeal = await patchMealById(request.userId, request.params.id, request.body);
      if (!updatedMeal) {
        return sendError(reply, 404, 'MEAL_NOT_FOUND', 'Meal not found');
      }

      setAgentEnrichmentContext(request, {
        endpoint: 'meal.update',
        mealName: updatedMeal.name,
      });

      return reply.send({
        data: updatedMeal,
      });
    },
  );

  typedApp.patch(
    '/:id/items/:itemId',
    {
      preHandler: agentRequestTransform,
      onSend: agentEnrichmentOnSend,
      schema: {
        params: mealItemParamsSchema,
        body: patchMealItemInputSchema,
        response: {
          200: apiDataResponseSchema(nutritionMealItemSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Update a meal item',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const existingMealItem = await findMealItemById(
        request.userId,
        request.params.mealId,
        request.params.itemId,
      );
      if (!existingMealItem) {
        return sendError(reply, 404, 'MEAL_ITEM_NOT_FOUND', 'Meal item not found');
      }

      const updatedMealItem = await patchMealItemById(
        request.userId,
        request.params.mealId,
        request.params.itemId,
        request.body,
      );
      if (!updatedMealItem) {
        return sendError(reply, 404, 'MEAL_ITEM_NOT_FOUND', 'Meal item not found');
      }

      setAgentEnrichmentContext(request, {
        endpoint: 'meal.update',
        mealName: existingMealItem.name,
        itemCount: 1,
        mealMacros: {
          calories: updatedMealItem.calories,
          protein: updatedMealItem.protein,
          carbs: updatedMealItem.carbs,
          fat: updatedMealItem.fat,
        },
      });

      return reply.send({
        data: updatedMealItem,
      });
    },
  );
};
