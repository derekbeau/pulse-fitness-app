import { updateUserInputSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireAuth, requireJwtOnly } from '../../middleware/auth.js';

import { getUserById, updateUser } from './store.js';

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  app.addHook('onRequest', requireJwtOnly);

  app.get('/me', async (request, reply) => {
    const user = await getUserById(request.userId);

    if (!user) {
      return sendError(reply, 404, 'NOT_FOUND', 'User not found');
    }

    return reply.send({ data: user });
  });

  app.patch('/me', async (request, reply) => {
    const parsed = updateUserInputSchema.safeParse(request.body);

    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid user update payload');
    }

    const user = await updateUser(request.userId, parsed.data);

    if (!user) {
      return sendError(reply, 404, 'NOT_FOUND', 'User not found');
    }

    return reply.send({ data: user });
  });
};
