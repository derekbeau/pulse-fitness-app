import {
  createMealInputSchema,
  patchMealInputSchema,
  patchMealItemInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import { trackFoodUsage } from '../foods/store.js';

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

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isValidDateParam = (date: string) => {
  if (!DATE_PATTERN.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
};
const isValidMealIdParam = (mealId: string) => mealId.trim().length > 0;
const isValidItemIdParam = (itemId: string) => itemId.trim().length > 0;
const isNonEmptyString = (value: string | null): value is string =>
  typeof value === 'string' && value.length > 0;

const parseIsoDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

export const nutritionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get<{ Querystring: { date?: string } }>('/week-summary', async (request, reply) => {
    const parsedDate = parseIsoDate(request.query.date);
    if (!parsedDate) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid nutrition week date');
    }

    const summary = await getNutritionWeekSummaryForDate(request.userId, parsedDate);

    return reply.send({
      data: summary,
    });
  });

  app.post<{ Params: { date: string } }>('/:date/meals', async (request, reply) => {
    if (!isValidDateParam(request.params.date)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid nutrition date');
    }

    const parsedBody = createMealInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal payload');
    }

    const created = await createMealForDate(request.userId, request.params.date, parsedBody.data);

    const foodIds = [...new Set(created.items.map((item) => item.foodId).filter(isNonEmptyString))];
    await Promise.allSettled(foodIds.map((foodId) => trackFoodUsage(foodId, request.userId)));

    return reply.code(201).send({
      data: created,
    });
  });

  app.get<{ Params: { date: string } }>('/:date', async (request, reply) => {
    if (!isValidDateParam(request.params.date)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid nutrition date');
    }

    const nutrition = await getDailyNutritionForDate(request.userId, request.params.date);

    return reply.send({
      data: nutrition,
    });
  });

  app.get<{ Params: { date: string } }>('/:date/summary', async (request, reply) => {
    if (!isValidDateParam(request.params.date)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid nutrition date');
    }

    const summary = await getDailyNutritionSummaryForDate(request.userId, request.params.date);

    return reply.send({
      data: summary,
    });
  });

  app.delete<{ Params: { date: string; mealId: string } }>(
    '/:date/meals/:mealId',
    async (request, reply) => {
      if (!isValidDateParam(request.params.date) || !isValidMealIdParam(request.params.mealId)) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal parameters');
      }

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

  app.patch<{ Params: { date: string; mealId: string } }>(
    '/:date/meals/:mealId',
    async (request, reply) => {
      if (!isValidDateParam(request.params.date) || !isValidMealIdParam(request.params.mealId)) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal parameters');
      }

      const parsedBody = patchMealInputSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal payload');
      }

      const existingMeal = await findMealForDate(
        request.userId,
        request.params.date,
        request.params.mealId,
      );
      if (!existingMeal) {
        return sendError(reply, 404, 'MEAL_NOT_FOUND', 'Meal not found');
      }

      const updatedMeal = await patchMealById(
        request.userId,
        request.params.mealId,
        parsedBody.data,
      );
      if (!updatedMeal) {
        return sendError(reply, 404, 'MEAL_NOT_FOUND', 'Meal not found');
      }

      return reply.send({
        data: updatedMeal,
      });
    },
  );

  app.patch<{ Params: { date: string; mealId: string; itemId: string } }>(
    '/:date/meals/:mealId/items/:itemId',
    async (request, reply) => {
      if (
        !isValidDateParam(request.params.date) ||
        !isValidMealIdParam(request.params.mealId) ||
        !isValidItemIdParam(request.params.itemId)
      ) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal item parameters');
      }

      const parsedBody = patchMealItemInputSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid meal item payload');
      }

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
        parsedBody.data,
      );
      if (!updatedMealItem) {
        return sendError(reply, 404, 'MEAL_ITEM_NOT_FOUND', 'Meal item not found');
      }

      return reply.send({
        data: updatedMealItem,
      });
    },
  );
};
