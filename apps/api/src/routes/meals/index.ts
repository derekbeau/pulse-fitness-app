import {
  agentCreateMealInputSchema,
  type AgentMealItemInput,
  apiDataResponseSchema,
  createMealForDateInputSchema,
  dailyNutritionMealSchema,
  dateSchema,
  nutritionMacroTotalsSchema,
  nutritionMealItemSchema,
  nutritionMealSchema,
  patchMealInputSchema,
  patchMealItemInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { autoCreateIfMissing, resolveByName } from '../agentEnrichment.js';
import { sendError } from '../../lib/reply.js';
import { isAgentRequest, requireAuth } from '../../middleware/auth.js';
import { buildDataResponse } from '../../middleware/agent-enrichment.js';
import { trackFoodUsage } from '../foods/store.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
} from '../../openapi.js';
import {
  createMealForDate,
  findMealById,
  findMealItemById,
  patchMealById,
  patchMealItemById,
} from '../nutrition/store.js';

const MAX_MEAL_SUMMARY_LENGTH = 500;
const SUMMARY_ELLIPSIS = '...';

const mealItemIdParamsSchema = idParamsSchema.extend({
  itemId: z.string().trim().min(1),
});

const createMealRequestSchema = z.union([
  agentCreateMealInputSchema.transform((data) => ({
    mode: 'agent' as const,
    data,
  })),
  createMealForDateInputSchema.transform((data) => ({
    mode: 'standard' as const,
    data,
  })),
]);

const agentMealSchema = nutritionMealSchema
  .pick({
    id: true,
    name: true,
    summary: true,
    time: true,
  })
  .extend({
    date: dateSchema,
  });

const agentMealItemResponseSchema = nutritionMealItemSchema.pick({
  id: true,
  foodId: true,
  name: true,
  amount: true,
  unit: true,
  displayQuantity: true,
  displayUnit: true,
  calories: true,
  protein: true,
  carbs: true,
  fat: true,
});

const createMealResponseSchema = z.union([
  apiDataResponseSchema(dailyNutritionMealSchema),
  apiDataResponseSchema(
    z.object({
      meal: agentMealSchema,
      macros: nutritionMacroTotalsSchema,
      items: z.array(agentMealItemResponseSchema),
    }),
  ),
]);

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

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/',
    {
      schema: {
        body: createMealRequestSchema,
        response: {
          201: createMealResponseSchema,
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
      if (isAgentRequest(request) && request.body.mode !== 'agent') {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal payload');
      }

      if (!isAgentRequest(request) && request.body.mode !== 'standard') {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal payload');
      }

      if (request.body.mode === 'agent') {
        const { date, items, name, time } = request.body.data;
        const userId = request.userId;

        const itemResults = await Promise.all(
          items.map(async (item) => {
            if (isAdhocMealItem(item)) {
              return { kind: 'adhoc' as const, item };
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

            const resolved = await resolveByName('food', item.foodName, userId);
            return { kind: 'food' as const, item, food: resolved };
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

        const responseData = {
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
        };

        return reply.code(201).send(
          buildDataResponse(request, responseData, {
            endpoint: 'meal.create',
            mealDate: date,
            mealName: created.meal.name,
            itemCount: created.items.length,
            mealMacros: macros,
          }),
        );
      }

      const { date } = request.body.data;
      const created = await createMealForDate(request.userId, date, {
        name: request.body.data.name,
        summary: request.body.data.summary,
        time: request.body.data.time,
        notes: request.body.data.notes,
        items: request.body.data.items,
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

      return reply.code(201).send(buildDataResponse(request, created));
    },
  );

  typedApp.patch(
    '/:id',
    {
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

      return reply.send(
        buildDataResponse(request, updatedMeal, {
          endpoint: 'meal.update',
          mealName: updatedMeal.name,
        }),
      );
    },
  );

  typedApp.patch(
    '/:id/items/:itemId',
    {
      schema: {
        params: mealItemIdParamsSchema,
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
        request.params.id,
        request.params.itemId,
      );
      if (!existingMealItem) {
        return sendError(reply, 404, 'MEAL_ITEM_NOT_FOUND', 'Meal item not found');
      }

      const updatedMealItem = await patchMealItemById(
        request.userId,
        request.params.id,
        request.params.itemId,
        request.body,
      );
      if (!updatedMealItem) {
        return sendError(reply, 404, 'MEAL_ITEM_NOT_FOUND', 'Meal item not found');
      }

      return reply.send(
        buildDataResponse(request, updatedMealItem, {
          endpoint: 'meal.update',
          mealName: existingMealItem.name,
          itemCount: 1,
          mealMacros: {
            calories: updatedMealItem.calories,
            protein: updatedMealItem.protein,
            carbs: updatedMealItem.carbs,
            fat: updatedMealItem.fat,
          },
        }),
      );
    },
  );
};
