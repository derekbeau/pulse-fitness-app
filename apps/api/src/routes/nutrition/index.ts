import { createMealInputSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import { updateFoodLastUsedAt } from '../foods/store.js';

import { createMealForDate, deleteMealForDate, getDailyNutritionForDate } from './store.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isValidDateParam = (date: string) => DATE_PATTERN.test(date);
const isValidMealIdParam = (mealId: string) => mealId.trim().length > 0;
const isNonEmptyString = (value: string | null): value is string =>
  typeof value === 'string' && value.length > 0;

export const nutritionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

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
    await Promise.all(foodIds.map((foodId) => updateFoodLastUsedAt(foodId, request.userId)));

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
};
