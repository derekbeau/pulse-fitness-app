import { dashboardSnapshotQuerySchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireUserAuth } from '../../middleware/auth.js';

import { getDashboardSnapshot } from './dashboard-store.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// TODO: Accept a user timezone (or offset) so omitted date defaults to the user's local day.
const getTodayDate = () => new Date().toISOString().slice(0, 10);

const isValidDateParam = (date: string) => {
  if (!DATE_PATTERN.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
};

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireUserAuth);

  app.get('/snapshot', async (request, reply) => {
    const parsedQuery = dashboardSnapshotQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid dashboard snapshot query');
    }

    const requestedDate = parsedQuery.data.date ?? getTodayDate();
    if (!isValidDateParam(requestedDate)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid dashboard snapshot date');
    }

    const snapshot = await getDashboardSnapshot(request.userId, requestedDate);

    return reply.send({
      data: snapshot,
    });
  });
};
