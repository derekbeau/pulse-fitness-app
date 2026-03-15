import {
  apiDataResponseSchema,
  createMealInputSchema,
  dailyNutritionMealSchema,
  dailyNutritionSchema,
  deleteMealResultSchema,
  nutritionMealItemSchema,
  nutritionMealSchema,
  nutritionSummarySchema,
  nutritionWeekSummarySchema,
  patchMealInputSchema,
  patchMealItemInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { sendError } from '../../lib/reply.js';
import { isAgentRequest, requireAuth } from '../../middleware/auth.js';
import { buildDataResponse } from '../../middleware/agent-enrichment.js';
import { trackFoodUsage } from '../foods/store.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  dateParamsSchema,
  isoDateTimeQuerySchema,
  mealItemParamsSchema,
  mealParamsSchema,
} from '../../openapi.js';

import {
  createMealForDate,
  deleteMealForDate,
  findMealForDate,
  findMealItemForDate,
  getDailyNutritionForDate,
  getDailyNutritionSummaryForDate,
  getNutritionWeekSummaryForDate,
  patchMealById,
  patchMealItemById,
} from './store.js';

const isNonEmptyString = (value: string | null): value is string =>
  typeof value === 'string' && value.length > 0;

const nutritionSummaryWithMealsSchema = z.object({
  summary: nutritionSummarySchema,
  meals: z.array(dailyNutritionMealSchema),
});

export const nutritionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/week-summary',
    {
      schema: {
        querystring: isoDateTimeQuerySchema,
        response: {
          200: apiDataResponseSchema(nutritionWeekSummarySchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Get a weekly nutrition summary',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const summary = await getNutritionWeekSummaryForDate(request.userId, request.query.date);

      return reply.send({
        data: summary,
      });
    },
  );

  typedApp.post(
    '/:date/meals',
    {
      schema: {
        params: dateParamsSchema,
        body: createMealInputSchema,
        response: {
          201: apiDataResponseSchema(dailyNutritionMealSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Create a meal for a specific date',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const created = await createMealForDate(request.userId, request.params.date, request.body);

      const foodIds = [
        ...new Set(created.items.map((item) => item.foodId).filter(isNonEmptyString)),
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

      const mealMacros = created.items.reduce(
        (totals, item) => ({
          calories: totals.calories + item.calories,
          protein: totals.protein + item.protein,
          carbs: totals.carbs + item.carbs,
          fat: totals.fat + item.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      );

      return reply.code(201).send(
        buildDataResponse(request, created, {
          endpoint: 'meal.create',
          mealDate: request.params.date,
          mealName: created.meal.name,
          itemCount: created.items.length,
          mealMacros,
        }),
      );
    },
  );

  typedApp.get(
    '/:date',
    {
      schema: {
        params: dateParamsSchema,
        response: {
          200: apiDataResponseSchema(dailyNutritionSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Get daily nutrition details',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const nutrition = await getDailyNutritionForDate(request.userId, request.params.date);

      return reply.send({
        data: nutrition,
      });
    },
  );

  typedApp.get(
    '/:date/summary',
    {
      schema: {
        params: dateParamsSchema,
        response: {
          200: z.union([
            apiDataResponseSchema(nutritionSummarySchema),
            apiDataResponseSchema(nutritionSummaryWithMealsSchema),
          ]),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Get daily nutrition summary',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      if (isAgentRequest(request)) {
        const [summary, dailyNutrition] = await Promise.all([
          getDailyNutritionSummaryForDate(request.userId, request.params.date),
          getDailyNutritionForDate(request.userId, request.params.date),
        ]);

        return reply.send({
          data: {
            summary,
            meals: dailyNutrition?.meals ?? [],
          },
        });
      }

      const summary = await getDailyNutritionSummaryForDate(request.userId, request.params.date);

      return reply.send({
        data: summary,
      });
    },
  );

  typedApp.delete(
    '/:date/meals/:mealId',
    {
      schema: {
        params: mealParamsSchema,
        response: {
          200: apiDataResponseSchema(deleteMealResultSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Delete a meal for a specific date',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const deleted = await deleteMealForDate(
        request.userId,
        request.params.date,
        request.params.mealId,
      );

      if (!deleted) {
        return sendError(reply, 404, 'MEAL_NOT_FOUND', 'Meal not found');
      }

      return reply.send({
        data: {
          success: true,
        },
      });
    },
  );

  typedApp.patch(
    '/:date/meals/:mealId',
    {
      schema: {
        params: mealParamsSchema,
        body: patchMealInputSchema,
        response: {
          200: apiDataResponseSchema(nutritionMealSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Update a meal for a specific date',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const existingMeal = await findMealForDate(
        request.userId,
        request.params.date,
        request.params.mealId,
      );
      if (!existingMeal) {
        return sendError(reply, 404, 'MEAL_NOT_FOUND', 'Meal not found');
      }

      const updatedMeal = await patchMealById(request.userId, request.params.mealId, request.body);
      if (!updatedMeal) {
        return sendError(reply, 404, 'MEAL_NOT_FOUND', 'Meal not found');
      }

      return reply.send(
        buildDataResponse(request, updatedMeal, {
          endpoint: 'meal.update',
          mealDate: request.params.date,
          mealName: updatedMeal.name,
        }),
      );
    },
  );

  typedApp.patch(
    '/:date/meals/:mealId/items/:itemId',
    {
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
        summary: 'Update a meal item for a specific date',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const existingMealItem = await findMealItemForDate(
        request.userId,
        request.params.date,
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

      return reply.send(
        buildDataResponse(request, updatedMealItem, {
          endpoint: 'meal.update',
          mealDate: request.params.date,
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
