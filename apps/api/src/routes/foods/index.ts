import { randomUUID } from 'node:crypto';

import {
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

import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import { agentEnrichmentOnSend, setAgentEnrichmentContext } from '../../middleware/agent-enrichment.js';
import { agentRequestTransform } from '../../middleware/agent-transforms.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
  successFlagSchema,
} from '../../openapi.js';

import { createFood, deleteFood, findFoodById, listFoods, updateFood } from './store.js';

const createFoodResponseSchema = apiDataResponseSchema(foodSchema);

const listFoodsResponseSchema = apiPaginatedResponseSchema(foodSchema);

const successResponseSchema = apiDataResponseSchema(successFlagSchema);

export const foodsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/',
    {
      preHandler: agentRequestTransform,
      onSend: agentEnrichmentOnSend,
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

      setAgentEnrichmentContext(request, {
        endpoint: 'food.create',
      });

      return reply.code(201).send({
        data: food,
      });
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
