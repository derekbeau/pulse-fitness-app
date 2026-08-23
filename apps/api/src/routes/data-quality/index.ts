import {
  apiDataResponseSchema,
  dataQualityCalendarQuerySchema,
  dataQualityCalendarSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';

import { buildDataResponse } from '../../middleware/agent-enrichment.js';
import { requireAuth } from '../../middleware/auth.js';
import { apiErrorResponseSchema, authSecurity, badRequestResponseSchema } from '../../openapi.js';
import { getDataQualityCalendar } from './store.js';

export const dataQualityRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/calendar',
    {
      onRequest: requireAuth,
      schema: {
        querystring: dataQualityCalendarQuerySchema,
        response: {
          200: apiDataResponseSchema(dataQualityCalendarSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['data-quality'],
        summary: 'Get a bounded cross-domain Data Quality calendar',
        description:
          'Composes nutrition, weight, workout, Adaptive TDEE, weekly-review, and bounded context truth for an inclusive range without mutating or duplicating the source domains.',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const calendar = await getDataQualityCalendar(request.userId, request.query);
      return reply.send(buildDataResponse(request, calendar));
    },
  );
};
