import { randomUUID } from 'node:crypto';

import {
  apiDataResponseSchema,
  apiPaginatedResponseSchema,
  createFoodInputSchema,
  foodAnalyticsDetailQuerySchema,
  foodAnalyticsDetailResponseSchema,
  foodAnalyticsQuerySchema,
  foodAnalyticsResponseSchema,
  foodQueryParamsSchema,
  foodSchema,
  mergeFoodInputSchema,
  patchFoodInputSchema,
  updateFoodInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { sqlite } from '../../db/index.js';
import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  agentEnrichmentOnSend,
  setAgentEnrichmentContext,
} from '../../middleware/agent-enrichment.js';
import { agentRequestTransform } from '../../middleware/agent-transforms.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
  successFlagSchema,
} from '../../openapi.js';

import {
  createFood,
  deleteFood,
  findFoodById,
  FoodMergeNotFoundError,
  FoodMergeSameIdError,
  listFoods,
  mergeFoods,
  updateFood,
} from './store.js';
import {
  createFoodAnalyticsStore,
  FoodAnalyticsNotFoundError,
  FoodAnalyticsTimeZoneConflictError,
} from './analytics-store.js';

const createFoodResponseSchema = apiDataResponseSchema(foodSchema);

const listFoodsResponseSchema = apiPaginatedResponseSchema(foodSchema);

const successResponseSchema = apiDataResponseSchema(successFlagSchema);
const mergeFoodParamsSchema = z.object({
  winnerId: z.string().uuid(),
});
const foodAnalyticsStore = createFoodAnalyticsStore({ sqlite });

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

  typedApp.get(
    '/analytics',
    {
      schema: {
        querystring: foodAnalyticsQuerySchema,
        response: {
          200: foodAnalyticsResponseSchema,
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['foods'],
        summary: 'Analyze saved-food usage and contribution',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        const result = foodAnalyticsStore.getAnalytics(request.userId, request.query);
        reply.header('Cache-Control', 'private, no-cache');
        return reply.send(result);
      } catch (error) {
        if (error instanceof FoodAnalyticsTimeZoneConflictError) {
          return sendError(reply, 400, 'FOOD_ANALYTICS_TIME_ZONE_CONFLICT', error.message);
        }
        if (error instanceof RangeError) {
          return sendError(reply, 400, 'FOOD_ANALYTICS_INVALID_RANGE', error.message);
        }
        throw error;
      }
    },
  );

  typedApp.get(
    '/:id/analytics',
    {
      schema: {
        params: idParamsSchema,
        querystring: foodAnalyticsDetailQuerySchema,
        response: {
          200: foodAnalyticsDetailResponseSchema,
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['foods'],
        summary: 'Inspect saved-food usage evidence',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        const data = foodAnalyticsStore.getDetail(request.userId, request.params.id, request.query);
        reply.header('Cache-Control', 'private, no-cache');
        return reply.send({ data });
      } catch (error) {
        if (error instanceof FoodAnalyticsNotFoundError) {
          return sendError(reply, 404, 'FOOD_NOT_FOUND', 'Food not found');
        }
        if (error instanceof FoodAnalyticsTimeZoneConflictError) {
          return sendError(reply, 400, 'FOOD_ANALYTICS_TIME_ZONE_CONFLICT', error.message);
        }
        if (error instanceof RangeError) {
          return sendError(reply, 400, 'FOOD_ANALYTICS_INVALID_RANGE', error.message);
        }
        throw error;
      }
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

  typedApp.post(
    '/:winnerId/merge',
    {
      schema: {
        params: mergeFoodParamsSchema,
        body: mergeFoodInputSchema,
        response: {
          200: apiDataResponseSchema(foodSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['foods'],
        summary: 'Merge one food into another',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        const mergedFood = await mergeFoods(
          request.userId,
          request.params.winnerId,
          request.body.loserId,
        );

        return reply.send({
          data: mergedFood,
        });
      } catch (error) {
        if (error instanceof FoodMergeSameIdError) {
          return sendError(reply, 400, 'INVALID_FOOD_MERGE', error.message);
        }

        if (error instanceof FoodMergeNotFoundError) {
          return sendError(reply, 404, 'FOOD_NOT_FOUND', 'Food not found');
        }

        throw error;
      }
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
