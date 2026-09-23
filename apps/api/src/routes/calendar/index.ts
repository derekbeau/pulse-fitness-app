import { apiDataResponseSchema, calendarRuntimeSchema, dateSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sqlite } from '../../db/index.js';
import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import { apiErrorResponseSchema, authSecurity, badRequestResponseSchema } from '../../openapi.js';
import {
  buildCalendarReadModel,
  CalendarReadLimitError,
  CalendarTimeZoneError,
} from './read-model.js';

const repeated = <T extends string>(schema: z.ZodType<T>) =>
  z
    .union([schema, z.array(schema)])
    .optional()
    .transform((value): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]));
const querySchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    domain: repeated(z.enum(['activity', 'workout', 'journal', 'body_context', 'nutrition'])),
    state: repeated(z.enum(['planned', 'completed', 'observed', 'summary'])),
  })
  .strict();

export const calendarRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  app.withTypeProvider<ZodTypeProvider>().get(
    '/calendar',
    {
      schema: {
        querystring: querySchema,
        response: {
          200: apiDataResponseSchema(calendarRuntimeSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          422: apiErrorResponseSchema,
        },
        security: authSecurity,
        tags: ['calendar'],
        summary: 'Read the owned cross-domain calendar and agenda',
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-cache');
      const { from, to, domain, state } = request.query;
      if (from > to)
        return sendError(reply, 400, 'CALENDAR_RANGE_INVALID', 'From must be on or before to');
      const days =
        Math.round(
          (Date.parse(`${to}T12:00:00.000Z`) - Date.parse(`${from}T12:00:00.000Z`)) / 86_400_000,
        ) + 1;
      if (days > 42)
        return sendError(
          reply,
          400,
          'CALENDAR_RANGE_LIMIT',
          'Calendar range must be at most 42 days',
        );
      try {
        return {
          data: await buildCalendarReadModel({
            sqlite,
            userId: request.userId,
            from,
            to,
            domains: domain,
            states: state,
          }),
        };
      } catch (error) {
        if (error instanceof CalendarTimeZoneError)
          return sendError(reply, 400, 'USER_TIME_ZONE_REQUIRED', 'Set a valid IANA time zone');
        if (error instanceof CalendarReadLimitError)
          return sendError(reply, 422, 'CALENDAR_READ_LIMIT_EXCEEDED', error.message, {
            scope: error.scope,
            limit: error.limit,
          });
        throw error;
      }
    },
  );
};
