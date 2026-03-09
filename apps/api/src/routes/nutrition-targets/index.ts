import { createNutritionTargetInputSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';

import { getCurrentNutritionTarget, listNutritionTargets, upsertNutritionTarget } from './store.js';

export const nutritionTargetRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.post('/', async (request, reply) => {
    const parsedBody = createNutritionTargetInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid nutrition target payload');
    }

    const target = await upsertNutritionTarget(request.userId, parsedBody.data);

    return reply.send({
      data: target,
    });
  });

  app.get('/current', async (request, reply) => {
    const target = await getCurrentNutritionTarget(request.userId);

    return reply.send({
      data: target,
    });
  });

  app.get('/', async (request, reply) => {
    const targets = await listNutritionTargets(request.userId);

    return reply.send({
      data: targets,
    });
  });
};
