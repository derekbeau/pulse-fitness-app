import {
  apiDataResponseSchema,
  apiPaginatedResponseSchema,
  bodyMeasurementEntrySchema,
  bodyMeasurementQueryParamsSchema,
  createBodyMeasurementInputSchema,
  deleteBodyMeasurementResultSchema,
  patchBodyMeasurementInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  dateParamsSchema,
  idParamsSchema,
} from '../../openapi.js';

import {
  deleteBodyMeasurementById,
  EmptyBodyMeasurementError,
  findBodyMeasurementByDate,
  findBodyMeasurementById,
  FutureBodyMeasurementDateError,
  listBodyMeasurements,
  listBodyMeasurementsPaginated,
  patchBodyMeasurementById,
  upsertBodyMeasurement,
} from './store.js';

const listResponseSchema = z.union([
  apiPaginatedResponseSchema(bodyMeasurementEntrySchema),
  apiDataResponseSchema(z.array(bodyMeasurementEntrySchema)),
]);

const sendMutationError = (reply: Parameters<typeof sendError>[0], error: unknown) => {
  if (error instanceof EmptyBodyMeasurementError) {
    return sendError(reply, 400, error.code, error.message);
  }
  if (error instanceof FutureBodyMeasurementDateError) {
    return sendError(reply, 400, error.code, error.message);
  }
  throw error;
};

const notFound = (reply: Parameters<typeof sendError>[0]) =>
  sendError(reply, 404, 'BODY_MEASUREMENT_NOT_FOUND', 'Body measurement entry not found');

export const bodyMeasurementRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/',
    {
      schema: {
        body: createBodyMeasurementInputSchema,
        response: {
          200: apiDataResponseSchema(bodyMeasurementEntrySchema),
          201: apiDataResponseSchema(bodyMeasurementEntrySchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['body-measurements'],
        summary: 'Create or merge body measurements for a local date',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const existing = await findBodyMeasurementByDate(request.userId, request.body.date);
      try {
        const entry = await upsertBodyMeasurement(request.userId, request.body);
        return reply.code(existing ? 200 : 201).send({ data: entry });
      } catch (error) {
        return sendMutationError(reply, error);
      }
    },
  );

  typedApp.get(
    '/',
    {
      schema: {
        querystring: bodyMeasurementQueryParamsSchema,
        response: {
          200: listResponseSchema,
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['body-measurements'],
        summary: 'List body measurement entries',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const { days, from, limit, page, to } = request.query;
      const filters = { days, from, to };
      if (page !== undefined || limit !== undefined) {
        const resolvedPage = page ?? 1;
        const resolvedLimit = limit ?? 50;
        const result = await listBodyMeasurementsPaginated(request.userId, filters, {
          limit: resolvedLimit,
          offset: (resolvedPage - 1) * resolvedLimit,
        });
        return reply.send({
          data: result.entries,
          meta: { page: resolvedPage, limit: resolvedLimit, total: result.total },
        });
      }
      return reply.send({ data: await listBodyMeasurements(request.userId, filters) });
    },
  );

  typedApp.get(
    '/date/:date',
    {
      schema: {
        params: dateParamsSchema,
        response: {
          200: apiDataResponseSchema(bodyMeasurementEntrySchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-measurements'],
        summary: 'Get body measurements by local date',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const entry = await findBodyMeasurementByDate(request.userId, request.params.date);
      return entry ? reply.send({ data: entry }) : notFound(reply);
    },
  );

  typedApp.get(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(bodyMeasurementEntrySchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-measurements'],
        summary: 'Get a body measurement entry',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const entry = await findBodyMeasurementById(request.params.id, request.userId);
      return entry ? reply.send({ data: entry }) : notFound(reply);
    },
  );

  typedApp.patch(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        body: patchBodyMeasurementInputSchema,
        response: {
          200: apiDataResponseSchema(bodyMeasurementEntrySchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-measurements'],
        summary: 'Merge changes into a body measurement entry',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        const entry = await patchBodyMeasurementById(
          request.params.id,
          request.userId,
          request.body,
        );
        return entry ? reply.send({ data: entry }) : notFound(reply);
      } catch (error) {
        return sendMutationError(reply, error);
      }
    },
  );

  typedApp.delete(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(deleteBodyMeasurementResultSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-measurements'],
        summary: 'Delete a body measurement entry',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const deleted = await deleteBodyMeasurementById(request.params.id, request.userId);
      return deleted
        ? reply.send({ data: { deleted: true, id: request.params.id } })
        : notFound(reply);
    },
  );
};
