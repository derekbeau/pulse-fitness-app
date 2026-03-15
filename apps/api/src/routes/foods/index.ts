import { randomUUID } from 'node:crypto';

import {
  createFoodInputSchema,
  foodQueryParamsSchema,
  patchFoodInputSchema,
  updateFoodInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { isAgentRequest, requireAuth } from '../../middleware/auth.js';
import { buildDataResponse } from '../../middleware/agent-enrichment.js';

import { createFood, deleteFood, findFoodById, listFoods, updateFood } from './store.js';

export const foodsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.post('/', async (request, reply) => {
    const parsedBody = createFoodInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid food payload');
    }

    const food = await createFood({
      id: randomUUID(),
      userId: request.userId,
      ...parsedBody.data,
    });

    const responseData = isAgentRequest(request)
      ? {
          id: food.id,
          name: food.name,
          brand: food.brand,
          servingSize: food.servingSize,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
        }
      : food;

    return reply.code(201).send(
      buildDataResponse(
        request,
        responseData,
        isAgentRequest(request)
          ? {
              endpoint: 'food.create',
            }
          : undefined,
      ),
    );
  });

  app.get('/', async (request, reply) => {
    const parsedQuery = foodQueryParamsSchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid food query parameters');
    }

    const result = await listFoods(request.userId, parsedQuery.data);

    reply.header('Cache-Control', 'private, no-cache');

    if (isAgentRequest(request)) {
      return reply.send({
        data: result.foods.map((food) => ({
          id: food.id,
          name: food.name,
          brand: food.brand,
          servingSize: food.servingSize,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
        })),
      });
    }

    return reply.send({
      data: result.foods,
      meta: {
        page: parsedQuery.data.page,
        limit: parsedQuery.data.limit,
        total: result.total,
      },
    });
  });

  app.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsedBody = updateFoodInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid food payload');
    }

    const food = await updateFood(request.params.id, request.userId, parsedBody.data);
    if (!food) {
      return sendError(reply, 404, 'FOOD_NOT_FOUND', 'Food not found');
    }

    return reply.send({
      data: food,
    });
  });

  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsedBody = patchFoodInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid food payload');
    }

    const existingFood = await findFoodById(request.params.id, request.userId);
    if (!existingFood) {
      return sendError(reply, 404, 'FOOD_NOT_FOUND', 'Food not found');
    }

    const food = await updateFood(request.params.id, request.userId, parsedBody.data);
    if (!food) {
      return sendError(reply, 404, 'FOOD_NOT_FOUND', 'Food not found');
    }

    return reply.send({
      data: food,
    });
  });

  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const deleted = await deleteFood(request.params.id, request.userId);
    if (!deleted) {
      return sendError(reply, 404, 'FOOD_NOT_FOUND', 'Food not found');
    }

    return reply.send({
      data: {
        success: true,
      },
    });
  });
};
