import { dashboardSnapshotQuerySchema, dashboardTrendQuerySchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireUserAuth } from '../../middleware/auth.js';

import {
  getDashboardConsistencyTrend,
  getDashboardMacrosTrend,
  getDashboardSnapshot,
  getDashboardWeightTrend,
} from './dashboard-store.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TREND_LOOKBACK_DAYS = 30;
const MAX_TREND_RANGE_DAYS = 365;

// TODO: Accept a user timezone (or offset) so omitted date defaults to the user's local day.
const getTodayDate = () => new Date().toISOString().slice(0, 10);

const isValidDateParam = (date: string) => {
  if (!DATE_PATTERN.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
};

const addUtcDays = (date: string, days: number) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const getUtcDateValue = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
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
  return daysInclusive <= MAX_TREND_RANGE_DAYS;
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

  app.get('/trends/weight', async (request, reply) => {
    const parsedQuery = dashboardTrendQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid dashboard trend query');
    }

    const range = resolveTrendRange(parsedQuery.data);
    if (!isValidTrendRange(range.from, range.to)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid dashboard trend date range');
    }

    const trend = await getDashboardWeightTrend(request.userId, range.from, range.to);
    return reply.send({
      data: trend,
    });
  });

  app.get('/trends/macros', async (request, reply) => {
    const parsedQuery = dashboardTrendQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid dashboard trend query');
    }

    const range = resolveTrendRange(parsedQuery.data);
    if (!isValidTrendRange(range.from, range.to)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid dashboard trend date range');
    }

    const trend = await getDashboardMacrosTrend(request.userId, range.from, range.to);
    return reply.send({
      data: trend,
    });
  });

  app.get('/trends/consistency', async (request, reply) => {
    const parsedQuery = dashboardTrendQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid dashboard trend query');
    }

    const range = resolveTrendRange(parsedQuery.data);
    if (!isValidTrendRange(range.from, range.to)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid dashboard trend date range');
    }

    const trend = await getDashboardConsistencyTrend(request.userId, range.from, range.to);
    return reply.send({
      data: trend,
    });
  });
};
