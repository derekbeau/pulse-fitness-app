import {
  apiDataResponseSchema,
  createNutritionTargetInputSchema,
  nutritionTargetSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
} from '../../openapi.js';

import { getCurrentNutritionTarget, listNutritionTargets, upsertNutritionTarget } from './store.js';

const nullableNutritionTargetResponseSchema = apiDataResponseSchema(nutritionTargetSchema.nullable());

export const nutritionTargetRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/',
    {
      schema: {
        body: createNutritionTargetInputSchema,
        response: {
          200: apiDataResponseSchema(nutritionTargetSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['nutrition-targets'],
        summary: 'Upsert a nutrition target',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const target = await upsertNutritionTarget(request.userId, request.body);

      return reply.send({
        data: target,
      });
    },
  );

  typedApp.get(
    '/current',
    {
      schema: {
        response: {
          200: nullableNutritionTargetResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['nutrition-targets'],
        summary: 'Get the current nutrition target',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const target = await getCurrentNutritionTarget(request.userId);

      return reply.send({
        data: target,
      });
    },
  );

  typedApp.get(
    '/',
    {
      schema: {
        response: {
          200: apiDataResponseSchema(z.array(nutritionTargetSchema)),
          401: apiErrorResponseSchema,
        },
        tags: ['nutrition-targets'],
        summary: 'List nutrition targets',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const targets = await listNutritionTargets(request.userId);

      return reply.send({
        data: targets,
      });
    },
  );
};
