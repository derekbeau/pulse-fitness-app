import { randomUUID } from 'node:crypto';

import { createFoodInputSchema, foodQueryParamsSchema, updateFoodInputSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';

import { createFood, deleteFood, listFoods, updateFood } from './store.js';

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

    return reply.code(201).send({
      data: food,
    });
  });

  app.get('/', async (request, reply) => {
    const parsedQuery = foodQueryParamsSchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid food query parameters');
    }

    const result = await listFoods(request.userId, parsedQuery.data);

    reply.header('Cache-Control', 'private, max-age=300');

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
