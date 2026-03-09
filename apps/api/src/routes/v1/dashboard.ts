import {
  MAX_DASHBOARD_TREND_RANGE_DAYS,
  dashboardConfigSchema,
  dashboardSnapshotQuerySchema,
  dashboardTrendQuerySchema,
} from '@pulse/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireUserAuth } from '../../middleware/auth.js';

import {
  getDashboardConfig,
  getDashboardConsistencyTrend,
  getDashboardMacrosTrend,
  getDashboardSnapshot,
  getDashboardWeightTrend,
  upsertDashboardConfig,
} from './dashboard-store.js';
import { addUtcDays, getUtcDateValue } from './dashboard-utils.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TREND_LOOKBACK_DAYS = 30;

// TODO: Accept a user timezone (or offset) so omitted date defaults to the user's local day.
const getTodayDate = () => new Date().toISOString().slice(0, 10);

const isValidDateParam = (date: string) => {
  if (!DATE_PATTERN.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
};

const resolveTrendRange = (query: { from?: string; to?: string }) => {
  const to = query.to ?? getTodayDate();
  const from = query.from ?? addUtcDays(to, -DEFAULT_TREND_LOOKBACK_DAYS);

  return { from, to };
};

const isValidTrendRange = (from: string, to: string) => {
  if (!isValidDateParam(from) || !isValidDateParam(to) || from > to) {
    return false;
  }

  const daysInclusive = (getUtcDateValue(to) - getUtcDateValue(from)) / (1000 * 60 * 60 * 24) + 1;
  return daysInclusive <= MAX_DASHBOARD_TREND_RANGE_DAYS;
};

const handleTrendRoute =
  <T>(getTrend: (userId: string, from: string, to: string) => Promise<T>) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedQuery = dashboardTrendQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid dashboard trend query');
    }

    const range = resolveTrendRange(parsedQuery.data);
    if (!isValidTrendRange(range.from, range.to)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid dashboard trend date range');
    }

    const trend = await getTrend(request.userId, range.from, range.to);
    return reply.send({
      data: trend,
    });
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

  app.get('/trends/weight', handleTrendRoute(getDashboardWeightTrend));
  app.get('/trends/macros', handleTrendRoute(getDashboardMacrosTrend));
  app.get('/trends/consistency', handleTrendRoute(getDashboardConsistencyTrend));

  app.get('/config', async (request, reply) => {
    const config = await getDashboardConfig(request.userId);

    return reply.send({
      data: config,
    });
  });

  const handleConfigUpsert = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedBody = dashboardConfigSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid dashboard config payload');
    }

    const config = await upsertDashboardConfig(request.userId, parsedBody.data);

    return reply.send({
      data: config,
    });
  };

  app.post('/config', handleConfigUpsert);
  app.put('/config', handleConfigUpsert);
};
