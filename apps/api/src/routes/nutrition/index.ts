import { FoodReuseConflictError } from '../meals/food-plans.js';
import { agentRequestTransform } from '../../middleware/agent-transforms.js';
import { normalizeMealItemForCreate } from '../meals/index.js';
import {
  apiDataResponseSchema,
  createMealResponseSchema,
  createMealInputSchema,
  dailyEnergyAdherenceSchema,
  dailyNutritionSchema,
  deleteMealResultSchema,
  nutritionLoggingContextQuerySchema,
  nutritionLoggingContextSchema,
  nutritionMealItemSchema,
  nutritionMealSchema,
  nutritionSummarySchema,
  nutritionWeekSummarySchema,
  patchNutritionLogInputSchema,
  patchMealInputSchema,
  patchMealItemInputSchema,
  updateNutritionLogStatusInputSchema,
  nutritionLogSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';

import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  agentEnrichmentOnSend,
  setAgentEnrichmentContext,
} from '../../middleware/agent-enrichment.js';
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
  getNutritionLoggingContext,
  getNutritionWeekSummaryForDate,
  patchNutritionLogForDate,
  patchMealById,
  patchMealItemById,
} from './store.js';
import { getDailyEnergyAdherenceForDate } from './daily-energy-store.js';
import {
  FutureNutritionDateError,
  NutritionLogRequiredError,
  updateNutritionLogStatus,
} from './status-store.js';

export const nutritionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof FoodReuseConflictError)
      return sendError(reply, 422, 'UNRESOLVED_FOODS', error.message);
    if (error instanceof Error && error.name === 'MealFoodOwnershipError') {
      return sendError(
        reply,
        400,
        'INVALID_FOOD_REFERENCE',
        'One or more food references are unavailable',
      );
    }
    throw error;
  });

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

  typedApp.patch(
    '/:date',
    {
      schema: {
        params: dateParamsSchema,
        body: patchNutritionLogInputSchema,
        response: {
          200: apiDataResponseSchema(dailyNutritionSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Create, replace, or clear a daily nutrition note',
        description:
          'Returns canonical daily detail. Trimmed notes are limited to 2,000 Unicode code units. Null clears; omission preserves. Clearing an absent day returns data: null. Valid future dates are allowed without changing completeness.',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const nutrition = await patchNutritionLogForDate(
        request.userId,
        request.params.date,
        request.body,
      );
      return reply.send({ data: nutrition });
    },
  );

  typedApp.patch(
    '/:date/status',
    {
      schema: {
        params: dateParamsSchema,
        body: updateNutritionLogStatusInputSchema,
        response: {
          200: apiDataResponseSchema(nutritionLogSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Update explicit nutrition-day completeness status',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        const log = await updateNutritionLogStatus(
          request.userId,
          request.params.date,
          request.body.status,
        );
        return reply.send({ data: log });
      } catch (error) {
        if (error instanceof FutureNutritionDateError) {
          return sendError(
            reply,
            400,
            'FUTURE_NUTRITION_DATE',
            'Future nutrition dates cannot be marked complete',
          );
        }
        if (error instanceof NutritionLogRequiredError) {
          return sendError(
            reply,
            409,
            'NUTRITION_LOG_REQUIRED',
            'A nutrition log is required before its status can be changed',
          );
        }
        throw error;
      }
    },
  );

  typedApp.get(
    '/:date/energy-adherence',
    {
      schema: {
        params: dateParamsSchema,
        response: {
          200: apiDataResponseSchema(dailyEnergyAdherenceSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Get accepted daily energy adherence facts',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const adherence = await getDailyEnergyAdherenceForDate(request.userId, request.params.date);
      reply.header('Cache-Control', 'private, no-cache');
      return reply.send({ data: adherence });
    },
  );

  typedApp.get(
    '/logging-context',
    {
      schema: {
        querystring: nutritionLoggingContextQuerySchema,
        response: {
          200: apiDataResponseSchema(nutritionLoggingContextSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Get nutrition logging context',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const context = await getNutritionLoggingContext(request.userId, request.query);

      reply.header('Cache-Control', 'private, no-cache');

      return reply.send({
        data: context,
      });
    },
  );

  typedApp.post(
    '/:date/meals',
    {
      preHandler: agentRequestTransform,
      onSend: agentEnrichmentOnSend,
      schema: {
        params: dateParamsSchema,
        body: createMealInputSchema,
        response: {
          201: apiDataResponseSchema(createMealResponseSchema),
          422: apiErrorResponseSchema,
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Create a meal for a specific date',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const { returnSummary = false, ...mealInput } = request.body;
      const normalized = await Promise.all(
        mealInput.items.map((item) => normalizeMealItemForCreate(item, request.userId)),
      );
      if (normalized.some((result) => !result.ok))
        return sendError(reply, 422, 'UNRESOLVED_FOODS', 'Could not resolve foods');
      let created: Awaited<ReturnType<typeof createMealForDate>>;
      try {
        created = await createMealForDate(request.userId, request.params.date, {
          ...mealInput,
          items: normalized.flatMap((result) => (result.ok ? [result.item] : [])),
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'MealFoodOwnershipError')
          return sendError(
            reply,
            422,
            'INVALID_MEAL_ITEMS',
            'One or more meal items reference unavailable foods',
          );
        throw error;
      }

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
        mealDate: request.params.date,
        mealName: created.meal.name,
        itemCount: created.items.length,
        mealMacros,
      });

      const data = returnSummary
        ? {
            ...created,
            summary: await getDailyNutritionSummaryForDate(request.userId, request.params.date),
          }
        : created;

      return reply.code(201).send({
        data,
      });
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
      onSend: agentEnrichmentOnSend,
      schema: {
        params: dateParamsSchema,
        response: {
          200: apiDataResponseSchema(nutritionSummarySchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['nutrition'],
        summary: 'Get daily nutrition summary',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const summary = await getDailyNutritionSummaryForDate(request.userId, request.params.date);
      setAgentEnrichmentContext(request, {
        endpoint: 'nutrition.summary',
        date: request.params.date,
      });

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
      onSend: agentEnrichmentOnSend,
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

      setAgentEnrichmentContext(request, {
        endpoint: 'meal.update',
        mealDate: request.params.date,
        mealName: updatedMeal.name,
      });

      return reply.send({
        data: updatedMeal,
      });
    },
  );

  typedApp.patch(
    '/:date/meals/:mealId/items/:itemId',
    {
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

      setAgentEnrichmentContext(request, {
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
      });

      return reply.send({
        data: updatedMealItem,
      });
    },
  );
};
