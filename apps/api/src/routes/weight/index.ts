import { createWeightInputSchema, weightQueryParamsSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';

import {
  findBodyWeightEntryByDate,
  getLatestBodyWeightEntry,
  listBodyWeightEntries,
  upsertBodyWeightEntry,
} from './store.js';

export const weightRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.post('/', async (request, reply) => {
    const parsedBody = createWeightInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid weight payload');
    }

    const existingEntry = await findBodyWeightEntryByDate(request.userId, parsedBody.data.date);
    const entry = await upsertBodyWeightEntry(request.userId, parsedBody.data);

    return reply.code(existingEntry ? 200 : 201).send({
      data: entry,
    });
  });

  app.get('/latest', async (request, reply) => {
    const entry = await getLatestBodyWeightEntry(request.userId);

    return reply.send({
      data: entry,
    });
  });

  app.get('/', async (request, reply) => {
    const parsedQuery = weightQueryParamsSchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid weight query params');
    }

    const entries = await listBodyWeightEntries(request.userId, parsedQuery.data);

    return reply.send({
      data: entries,
    });
  });
};
