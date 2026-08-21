import {
  apiDataResponseSchema,
  apiPaginatedResponseSchema,
  bodyWeightEntrySchema,
  createWeightInputSchema,
  deleteWeightResultSchema,
  patchWeightInputSchema,
  trendWeightAnalyticsSchema,
  trendWeightQuerySchema,
  weightQueryParamsSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import { buildDataResponse } from '../../middleware/agent-enrichment.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
} from '../../openapi.js';

import {
  deleteBodyWeightEntryById,
  findBodyWeightEntryById,
  findBodyWeightEntryByDate,
  getLatestBodyWeightEntry,
  getBodyWeightDisplayUnit,
  listBodyWeightEntries,
  listBodyWeightEntriesPaginated,
  patchBodyWeightEntryById,
  upsertBodyWeightEntry,
  toBodyWeightEntry,
} from './store.js';
import { getTrendWeightAnalytics } from './trend-store.js';

const listWeightEntriesResponseSchema = z.union([
  apiPaginatedResponseSchema(bodyWeightEntrySchema),
  apiDataResponseSchema(z.array(bodyWeightEntrySchema)),
]);

export const weightRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/',
    {
      schema: {
        body: createWeightInputSchema,
        response: {
          200: apiDataResponseSchema(bodyWeightEntrySchema),
          201: apiDataResponseSchema(bodyWeightEntrySchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['weight'],
        summary: 'Create or replace a body weight entry for a date',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const displayUnit = await getBodyWeightDisplayUnit(request.userId);
      const inputUnit = request.body.unit ?? displayUnit;
      const existingCanonicalEntry = await findBodyWeightEntryByDate(
        request.userId,
        request.body.date,
      );
      let canonicalEntry;
      try {
        canonicalEntry = await upsertBodyWeightEntry(request.userId, request.body, inputUnit);
      } catch (error) {
        if (error instanceof RangeError) {
          return sendError(reply, 400, 'WEIGHT_OUT_OF_RANGE', error.message);
        }
        throw error;
      }
      const existingEntry = existingCanonicalEntry
        ? toBodyWeightEntry(existingCanonicalEntry, displayUnit)
        : null;
      const entry = toBodyWeightEntry(canonicalEntry, displayUnit);

      return reply.code(existingEntry ? 200 : 201).send(
        buildDataResponse(request, entry, {
          endpoint: 'weight.mutation',
          previousEntry: existingEntry,
        }),
      );
    },
  );

  typedApp.get(
    '/trend',
    {
      schema: {
        querystring: trendWeightQuerySchema,
        response: {
          200: apiDataResponseSchema(trendWeightAnalyticsSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['weight'],
        summary: 'Get canonical Trend Weight analytics',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        const analytics = await getTrendWeightAnalytics(request.userId, request.query);
        return reply.send(buildDataResponse(request, analytics));
      } catch (error) {
        if (error instanceof RangeError) {
          return sendError(reply, 400, 'TREND_WEIGHT_INVALID_END', error.message);
        }
        throw error;
      }
    },
  );

  typedApp.get(
    '/latest',
    {
      schema: {
        response: {
          200: apiDataResponseSchema(bodyWeightEntrySchema.nullable()),
          401: apiErrorResponseSchema,
        },
        tags: ['weight'],
        summary: 'Get the latest body weight entry',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const displayUnit = await getBodyWeightDisplayUnit(request.userId);
      const canonicalEntry = await getLatestBodyWeightEntry(request.userId);
      const entry = canonicalEntry ? toBodyWeightEntry(canonicalEntry, displayUnit) : null;

      return reply.send(buildDataResponse(request, entry));
    },
  );

  typedApp.get(
    '/',
    {
      schema: {
        querystring: weightQueryParamsSchema,
        response: {
          200: listWeightEntriesResponseSchema,
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['weight'],
        summary: 'List body weight entries',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const displayUnit = await getBodyWeightDisplayUnit(request.userId);
      const { days, from, limit, page, to } = request.query;
      const queryFilters = {
        days,
        from,
        to,
      };

      if (page !== undefined || limit !== undefined) {
        const resolvedPage = page ?? 1;
        const resolvedLimit = limit ?? 50;
        const offset = (resolvedPage - 1) * resolvedLimit;
        const { entries: canonicalEntries, total } = await listBodyWeightEntriesPaginated(
          request.userId,
          queryFilters,
          {
            limit: resolvedLimit,
            offset,
          },
        );
        const entries = canonicalEntries.map((entry) => toBodyWeightEntry(entry, displayUnit));

        return reply.send({
          data: entries,
          meta: {
            page: resolvedPage,
            limit: resolvedLimit,
            total,
          },
        });
      }

      const canonicalEntries = await listBodyWeightEntries(request.userId, queryFilters);
      const entries = canonicalEntries.map((entry) => toBodyWeightEntry(entry, displayUnit));
      return reply.send({ data: entries });
    },
  );

  typedApp.patch(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        body: patchWeightInputSchema,
        response: {
          200: apiDataResponseSchema(bodyWeightEntrySchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['weight'],
        summary: 'Update a body weight entry',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const displayUnit = await getBodyWeightDisplayUnit(request.userId);
      const existingCanonicalEntry = await findBodyWeightEntryById(
        request.params.id,
        request.userId,
      );
      if (!existingCanonicalEntry) {
        return sendError(reply, 404, 'WEIGHT_NOT_FOUND', 'Weight entry not found');
      }

      let canonicalEntry;
      try {
        canonicalEntry = await patchBodyWeightEntryById(
          request.params.id,
          request.userId,
          request.body,
          request.body.unit ?? displayUnit,
        );
      } catch (error) {
        if (error instanceof RangeError) {
          return sendError(reply, 400, 'WEIGHT_OUT_OF_RANGE', error.message);
        }
        throw error;
      }
      if (!canonicalEntry) {
        return sendError(reply, 404, 'WEIGHT_NOT_FOUND', 'Weight entry not found');
      }
      const entry = toBodyWeightEntry(canonicalEntry, displayUnit);

      return reply.send({
        data: entry,
      });
    },
  );

  typedApp.delete(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(deleteWeightResultSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['weight'],
        summary: 'Delete a body weight entry',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const deleted = await deleteBodyWeightEntryById(request.params.id, request.userId);
      if (!deleted) {
        return sendError(reply, 404, 'WEIGHT_NOT_FOUND', 'Weight entry not found');
      }

      return reply.send({
        data: {
          deleted: true,
          id: request.params.id,
        },
      });
    },
  );
};
