import {
  MAX_DASHBOARD_TREND_RANGE_DAYS,
  apiDataResponseSchema,
  dashboardConfigSchema,
  dashboardConsistencyTrendSchema,
  dashboardMacrosTrendSchema,
  dashboardSnapshotQuerySchema,
  dashboardSnapshotSchema,
  dashboardTrendQuerySchema,
  dashboardWeightTrendSchema,
  dateSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
} from '../../openapi.js';

import {
  getDashboardConfig,
  getDashboardConsistencyTrend,
  getDashboardMacrosTrend,
  getDashboardSnapshot,
  getDashboardWeightTrend,
  upsertDashboardConfig,
} from './dashboard-store.js';
import { addUtcDays, getUtcDateValue } from './dashboard-utils.js';

const DEFAULT_TREND_LOOKBACK_DAYS = 30;

const resolvedDashboardTrendRangeSchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
  })
  .refine((value) => value.from <= value.to, {
    message: '`from` must be on or before `to`',
    path: ['to'],
  })
  .refine(
    (value) => {
      const daysInclusive =
        (getUtcDateValue(value.to) - getUtcDateValue(value.from)) / (1000 * 60 * 60 * 24) + 1;
      return daysInclusive <= MAX_DASHBOARD_TREND_RANGE_DAYS;
    },
    {
      message: `Date range cannot exceed ${MAX_DASHBOARD_TREND_RANGE_DAYS} days`,
      path: ['to'],
    },
  );

// TODO: Accept a user timezone (or offset) so omitted date defaults to the user's local day.
const getTodayDate = () => new Date().toISOString().slice(0, 10);

const resolveTrendRange = (query: { from?: string; to?: string }) => {
  const to = query.to ?? getTodayDate();
  const from = query.from ?? addUtcDays(to, -DEFAULT_TREND_LOOKBACK_DAYS);

  return { from, to };
};

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const getValidatedTrendRange = (query: z.infer<typeof dashboardTrendQuerySchema>, reply: FastifyReply) => {
    const range = resolveTrendRange(query);
    const parsedRange = resolvedDashboardTrendRangeSchema.safeParse(range);
    if (!parsedRange.success) {
      sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid dashboard trend date range');
      return undefined;
    }

    return parsedRange.data;
  };

  typedApp.get(
    '/snapshot',
    {
      schema: {
        querystring: dashboardSnapshotQuerySchema,
        response: {
          200: apiDataResponseSchema(dashboardSnapshotSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['dashboard'],
        summary: 'Get the dashboard snapshot for a day',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const requestedDate = request.query.date ?? getTodayDate();
      const snapshot = await getDashboardSnapshot(request.userId, requestedDate);

      return reply.send({
        data: snapshot,
      });
    },
  );

  typedApp.get(
    '/trends/weight',
    {
      schema: {
        querystring: dashboardTrendQuerySchema,
        response: {
          200: apiDataResponseSchema(dashboardWeightTrendSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['dashboard'],
        summary: 'Get weight trend data',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const range = getValidatedTrendRange(request.query, reply);
      if (!range) {
        return reply;
      }

      const trend = await getDashboardWeightTrend(request.userId, range.from, range.to);
      reply.header('Cache-Control', 'private, max-age=3600');
      return reply.send({
        data: trend,
      });
    },
  );

  typedApp.get(
    '/trends/macros',
    {
      schema: {
        querystring: dashboardTrendQuerySchema,
        response: {
          200: apiDataResponseSchema(dashboardMacrosTrendSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['dashboard'],
        summary: 'Get macro trend data',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const range = getValidatedTrendRange(request.query, reply);
      if (!range) {
        return reply;
      }

      const trend = await getDashboardMacrosTrend(request.userId, range.from, range.to);
      reply.header('Cache-Control', 'private, max-age=3600');
      return reply.send({
        data: trend,
      });
    },
  );

  typedApp.get(
    '/trends/consistency',
    {
      schema: {
        querystring: dashboardTrendQuerySchema,
        response: {
          200: apiDataResponseSchema(dashboardConsistencyTrendSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['dashboard'],
        summary: 'Get consistency trend data',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const range = getValidatedTrendRange(request.query, reply);
      if (!range) {
        return reply;
      }

      const trend = await getDashboardConsistencyTrend(request.userId, range.from, range.to);
      reply.header('Cache-Control', 'private, max-age=3600');
      return reply.send({
        data: trend,
      });
    },
  );

  typedApp.get(
    '/config',
    {
      schema: {
        response: {
          200: apiDataResponseSchema(dashboardConfigSchema),
          401: apiErrorResponseSchema,
        },
        tags: ['dashboard'],
        summary: 'Get dashboard configuration',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const config = await getDashboardConfig(request.userId);

      return reply.send({
        data: config,
      });
    },
  );

  const handleConfigUpsert = async (
    request: FastifyRequest<{ Body: z.infer<typeof dashboardConfigSchema> }>,
    reply: FastifyReply,
  ) => {
    const config = await upsertDashboardConfig(request.userId, request.body);

    return reply.send({
      data: config,
    });
  };

  typedApp.post(
    '/config',
    {
      schema: {
        body: dashboardConfigSchema,
        response: {
          200: apiDataResponseSchema(dashboardConfigSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['dashboard'],
        summary: 'Create or replace dashboard configuration',
        security: authSecurity,
      },
    },
    handleConfigUpsert,
  );

  typedApp.put(
    '/config',
    {
      schema: {
        body: dashboardConfigSchema,
        response: {
          200: apiDataResponseSchema(dashboardConfigSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['dashboard'],
        summary: 'Replace dashboard configuration',
        security: authSecurity,
      },
    },
    handleConfigUpsert,
  );
};
