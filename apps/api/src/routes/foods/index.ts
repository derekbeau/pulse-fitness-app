import { randomUUID } from 'node:crypto';

import {
  agentFoodResultSchema,
  apiDataResponseSchema,
  apiPaginatedResponseSchema,
  createFoodInputSchema,
  foodQueryParamsSchema,
  foodSchema,
  patchFoodInputSchema,
  updateFoodInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { sendError } from '../../lib/reply.js';
import { isAgentRequest, requireAuth } from '../../middleware/auth.js';
import { buildDataResponse } from '../../middleware/agent-enrichment.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
  successFlagSchema,
} from '../../openapi.js';

import { createFood, deleteFood, findFoodById, listFoods, updateFood } from './store.js';

const createFoodResponseSchema = z.union([
  apiDataResponseSchema(foodSchema),
  apiDataResponseSchema(agentFoodResultSchema),
]);

const listFoodsResponseSchema = z.union([
  apiPaginatedResponseSchema(foodSchema),
  apiDataResponseSchema(z.array(agentFoodResultSchema)),
]);

const successResponseSchema = apiDataResponseSchema(successFlagSchema);

export const foodsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/',
    {
      schema: {
        body: createFoodInputSchema,
        response: {
          201: createFoodResponseSchema,
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['foods'],
        summary: 'Create a food entry',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const body = request.body;
      const food = await createFood({
        id: randomUUID(),
        userId: request.userId,
        ...body,
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
    },
  );

  typedApp.get(
    '/',
    {
      schema: {
        querystring: foodQueryParamsSchema,
        response: {
          200: listFoodsResponseSchema,
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['foods'],
        summary: 'List foods',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const query = request.query;
      const result = await listFoods(request.userId, query);

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
          page: query.page,
          limit: query.limit,
          total: result.total,
        },
      });
    },
  );

  typedApp.put(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateFoodInputSchema,
        response: {
          200: apiDataResponseSchema(foodSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['foods'],
        summary: 'Replace a food entry',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const food = await updateFood(request.params.id, request.userId, request.body);
      if (!food) {
        return sendError(reply, 404, 'FOOD_NOT_FOUND', 'Food not found');
      }

      return reply.send({
        data: food,
      });
    },
  );

  typedApp.patch(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        body: patchFoodInputSchema,
        response: {
          200: apiDataResponseSchema(foodSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['foods'],
        summary: 'Update a food entry',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const existingFood = await findFoodById(request.params.id, request.userId);
      if (!existingFood) {
        return sendError(reply, 404, 'FOOD_NOT_FOUND', 'Food not found');
      }

      const food = await updateFood(request.params.id, request.userId, request.body);
      if (!food) {
        return sendError(reply, 404, 'FOOD_NOT_FOUND', 'Food not found');
      }

      return reply.send({
        data: food,
      });
    },
  );

  typedApp.delete(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: successResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['foods'],
        summary: 'Delete a food entry',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const deleted = await deleteFood(request.params.id, request.userId);
      if (!deleted) {
        return sendError(reply, 404, 'FOOD_NOT_FOUND', 'Food not found');
      }

      return reply.send({
        data: {
          success: true,
        },
      });
    },
  );
};
