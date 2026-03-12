import { randomUUID } from 'node:crypto';

import {
  agentCreateFoodInputSchema,
  agentFoodSearchParamsSchema,
  patchFoodInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { createFood, findFoodById, updateFood } from '../foods/store.js';

import { searchFoodsByName } from './store.js';

export const agentFoodsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/search', async (request, reply) => {
    const parsed = agentFoodSearchParamsSchema.safeParse(request.query);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid search parameters');
    }

    const { q, limit } = parsed.data;
    const results = await searchFoodsByName(request.userId, q, limit);

    return { data: results };
  });

  app.post('/', async (request, reply) => {
    const parsed = agentCreateFoodInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid food payload');
    }

    const { name, brand, servingSize, calories, protein, carbs, fat, source, notes } = parsed.data;

    const food = await createFood({
      id: randomUUID(),
      userId: request.userId,
      name,
      brand: brand ?? null,
      servingSize: servingSize ?? null,
      servingGrams: null,
      calories,
      protein,
      carbs,
      fat,
      fiber: null,
      sugar: null,
      verified: false,
      source: source ?? null,
      notes: notes ?? null,
    });

    return reply.code(201).send({
      data: {
        id: food.id,
        name: food.name,
        brand: food.brand,
        servingSize: food.servingSize,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
      },
    });
  });

  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = patchFoodInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid food payload');
    }

    const existingFood = await findFoodById(request.params.id, request.userId);
    if (!existingFood) {
      return sendError(reply, 404, 'FOOD_NOT_FOUND', 'Food not found');
    }

    const food = await updateFood(request.params.id, request.userId, parsed.data);
    if (!food) {
      return sendError(reply, 404, 'FOOD_NOT_FOUND', 'Food not found');
    }

    return reply.send({ data: food });
  });
};
