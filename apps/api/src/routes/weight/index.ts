import {
  apiDataResponseSchema,
  apiPaginatedResponseSchema,
  bodyWeightEntrySchema,
  createWeightInputSchema,
  deleteWeightResultSchema,
  patchWeightInputSchema,
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
  listBodyWeightEntries,
  listBodyWeightEntriesPaginated,
  patchBodyWeightEntryById,
  upsertBodyWeightEntry,
} from './store.js';

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
      const existingEntry = await findBodyWeightEntryByDate(request.userId, request.body.date);
      const entry = await upsertBodyWeightEntry(request.userId, request.body);

      return reply.code(existingEntry ? 200 : 201).send(
        buildDataResponse(request, entry, {
          endpoint: 'weight.mutation',
          previousEntry: existingEntry,
        }),
      );
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
      const entry = await getLatestBodyWeightEntry(request.userId);

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
        const { entries, total } = await listBodyWeightEntriesPaginated(request.userId, queryFilters, {
          limit: resolvedLimit,
          offset,
        });

        return reply.send({
          data: entries,
          meta: {
            page: resolvedPage,
            limit: resolvedLimit,
            total,
          },
        });
      }

      const entries = await listBodyWeightEntries(request.userId, queryFilters);
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
      const existingEntry = await findBodyWeightEntryById(request.params.id, request.userId);
      if (!existingEntry) {
        return sendError(reply, 404, 'WEIGHT_NOT_FOUND', 'Weight entry not found');
      }

      const entry = await patchBodyWeightEntryById(
        request.params.id,
        request.userId,
        request.body,
      );
      if (!entry) {
        return sendError(reply, 404, 'WEIGHT_NOT_FOUND', 'Weight entry not found');
      }

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
