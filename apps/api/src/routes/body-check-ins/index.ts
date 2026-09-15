import {
  apiDataResponseSchema,
  apiPaginatedResponseSchema,
  bodyProgressAnalyticsQuerySchema,
  bodyProgressAnalyticsSchema,
  bodyCheckInListQuerySchema,
  bodyCheckInExportSchema,
  bodyCheckInHistorySchema,
  bodyCheckInPreferenceSchema,
  bodyCheckInSchema,
  bodyContextFactsSchema,
  bodyDueQuerySchema,
  bodyDueStateSchema,
  createBodyCheckInInputSchema,
  patchBodyCheckInInputSchema,
  patchBodyCheckInPreferenceSchema,
  skipBodyDueInputSchema,
  snoozeBodyDueInputSchema,
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
  BodyCheckInCompletionError,
  BodyCheckInConflictError,
  BodyCheckInCorrectionReasonError,
  BodyCheckInIdempotencyConflictError,
  BodyCheckInVersionConflictError,
  createBodyCheckIn,
  deleteBodyCheckIn,
  exportBodyCheckIns,
  findBodyCheckInById,
  findBodyCheckInHistory,
  findBodyCheckInPreference,
  getBodyContextFacts,
  getBodyDueState,
  listBodyCheckIns,
  patchBodyCheckIn,
  skipBodyDueOccurrence,
  snoozeBodyDueOccurrence,
  upsertBodyCheckInPreference,
} from './store.js';
import { getBodyProgressAnalytics } from './analytics-store.js';

const nullablePreferenceResponse = apiDataResponseSchema(bodyCheckInPreferenceSchema.nullable());
const deleteResultSchema = z.object({ deleted: z.literal(true), id: z.string() }).strict();
const conflictResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    existingId: z.string().optional(),
  }),
});
const versionConflictResponseSchema = z.object({
  error: z.object({
    code: z.literal('BODY_CHECK_IN_VERSION_CONFLICT'),
    message: z.string(),
    expectedVersion: z.number().int(),
    currentVersion: z.number().int(),
  }),
});

const handleMutationError = (reply: Parameters<typeof sendError>[0], error: unknown) => {
  if (error instanceof BodyCheckInConflictError) {
    return reply.code(409).send({
      error: { code: error.code, message: error.message, existingId: error.existingId },
    });
  }
  if (
    error instanceof BodyCheckInIdempotencyConflictError ||
    error instanceof BodyCheckInCompletionError ||
    error instanceof BodyCheckInCorrectionReasonError
  ) {
    return sendError(reply, 409, error.code, error.message);
  }
  if (error instanceof BodyCheckInVersionConflictError) {
    return reply.code(409).send({
      error: {
        code: error.code,
        message: error.message,
        expectedVersion: error.expectedVersion,
        currentVersion: error.currentVersion,
      },
    });
  }
  if (error instanceof RangeError)
    return sendError(reply, 400, 'BODY_CHECK_IN_INVALID', error.message);
  throw error;
};

export const bodyCheckInRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/preferences',
    {
      schema: {
        response: { 200: nullablePreferenceResponse, 401: apiErrorResponseSchema },
        tags: ['body-check-ins'],
        summary: 'Get body check-in preferences',
        security: authSecurity,
      },
    },
    async (request, reply) => reply.send({ data: await findBodyCheckInPreference(request.userId) }),
  );

  typedApp.patch(
    '/preferences',
    {
      schema: {
        body: patchBodyCheckInPreferenceSchema,
        response: {
          200: apiDataResponseSchema(bodyCheckInPreferenceSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['body-check-ins'],
        summary: 'Create or update typed body check-in preferences',
        security: authSecurity,
      },
    },
    async (request, reply) =>
      reply.send({ data: await upsertBodyCheckInPreference(request.userId, request.body) }),
  );

  typedApp.get(
    '/due',
    {
      schema: {
        querystring: bodyDueQuerySchema,
        response: {
          200: apiDataResponseSchema(bodyDueStateSchema),
          401: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['body-check-ins'],
        summary: 'Get server-owned body check-in due state',
        security: authSecurity,
      },
    },
    async (request, reply) =>
      reply.send({ data: await getBodyDueState(request.userId, request.query.date) }),
  );

  typedApp.get(
    '/analytics',
    {
      schema: {
        querystring: bodyProgressAnalyticsQuerySchema,
        response: {
          200: apiDataResponseSchema(bodyProgressAnalyticsSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['body-check-ins'],
        summary: 'Get server-owned Body Progress trends and signal evidence',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        reply.header('Cache-Control', 'private, no-cache');
        return reply.send({
          data: await getBodyProgressAnalytics(request.userId, request.query),
        });
      } catch (error) {
        if (error instanceof RangeError) {
          return sendError(reply, 400, 'BODY_PROGRESS_RANGE_INVALID', error.message);
        }
        throw error;
      }
    },
  );

  typedApp.post(
    '/due/:date/skip',
    {
      schema: {
        params: dateParamsSchema,
        body: skipBodyDueInputSchema,
        response: {
          200: apiDataResponseSchema(bodyDueStateSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['body-check-ins'],
        summary: 'Skip the current anchored body check-in occurrence',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await skipBodyDueOccurrence(request.userId, request.params.date),
        });
      } catch (error) {
        return handleMutationError(reply, error);
      }
    },
  );

  typedApp.post(
    '/due/:date/snooze',
    {
      schema: {
        params: dateParamsSchema,
        body: snoozeBodyDueInputSchema,
        response: {
          200: apiDataResponseSchema(bodyDueStateSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['body-check-ins'],
        summary: 'Snooze the current body check-in prompt without moving its anchor',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await snoozeBodyDueOccurrence(
            request.userId,
            request.params.date,
            request.body.snoozedUntil,
          ),
        });
      } catch (error) {
        return handleMutationError(reply, error);
      }
    },
  );

  typedApp.get(
    '/',
    {
      schema: {
        querystring: bodyCheckInListQuerySchema,
        response: {
          200: apiPaginatedResponseSchema(bodyCheckInSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['body-check-ins'],
        summary: 'List body check-ins and raw readings',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const result = await listBodyCheckIns(request.userId, request.query);
      return reply.send({
        data: result.entries,
        meta: { page: request.query.page, limit: request.query.limit, total: result.total },
      });
    },
  );

  typedApp.post(
    '/',
    {
      schema: {
        body: createBodyCheckInInputSchema,
        response: {
          200: apiDataResponseSchema(bodyCheckInSchema),
          201: apiDataResponseSchema(bodyCheckInSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          409: conflictResponseSchema,
        },
        tags: ['body-check-ins'],
        summary: 'Persist a draft or completed body check-in',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        const result = await createBodyCheckIn({
          userId: request.userId,
          input: request.body,
          source: request.authType === 'agent-token' ? 'agent_token' : 'user',
          sourceId: request.agentTokenId ?? null,
        });
        return reply.code(result.replayed ? 200 : 201).send({ data: result.entry });
      } catch (error) {
        return handleMutationError(reply, error);
      }
    },
  );

  typedApp.get(
    '/export',
    {
      schema: {
        response: {
          200: apiDataResponseSchema(bodyCheckInExportSchema),
          401: apiErrorResponseSchema,
        },
        tags: ['body-check-ins'],
        summary: 'Export all owner-scoped body check-in preferences and history',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      return reply.send({ data: await exportBodyCheckIns(request.userId) });
    },
  );

  typedApp.get(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(bodyCheckInSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-check-ins'],
        summary: 'Get one body check-in',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const entry = await findBodyCheckInById(request.params.id, request.userId);
      return entry
        ? reply.send({ data: entry })
        : sendError(reply, 404, 'BODY_CHECK_IN_NOT_FOUND', 'Body check-in not found');
    },
  );

  typedApp.get(
    '/:id/history',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(bodyCheckInHistorySchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-check-ins'],
        summary: 'Replay immutable body check-in versions and raw readings',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const history = await findBodyCheckInHistory(request.params.id, request.userId);
      return history
        ? reply.send({ data: history })
        : sendError(reply, 404, 'BODY_CHECK_IN_NOT_FOUND', 'Body check-in not found');
    },
  );

  typedApp.patch(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        body: patchBodyCheckInInputSchema,
        response: {
          200: apiDataResponseSchema(bodyCheckInSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: z.union([versionConflictResponseSchema, apiErrorResponseSchema]),
        },
        tags: ['body-check-ins'],
        summary: 'Resume or correct a body check-in',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        const entry = await patchBodyCheckIn(request.params.id, request.userId, request.body, {
          source: request.authType === 'agent-token' ? 'agent_token' : 'user',
          sourceId: request.agentTokenId ?? null,
        });
        return entry
          ? reply.send({ data: entry })
          : sendError(reply, 404, 'BODY_CHECK_IN_NOT_FOUND', 'Body check-in not found');
      } catch (error) {
        return handleMutationError(reply, error);
      }
    },
  );

  typedApp.delete(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(deleteResultSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-check-ins'],
        summary: 'Delete a body check-in and its readings',
        security: authSecurity,
      },
    },
    async (request, reply) =>
      (await deleteBodyCheckIn(request.params.id, request.userId))
        ? reply.send({ data: { deleted: true as const, id: request.params.id } })
        : sendError(reply, 404, 'BODY_CHECK_IN_NOT_FOUND', 'Body check-in not found'),
  );
};

export const bodyContextRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  app.withTypeProvider<ZodTypeProvider>().get(
    '/body',
    {
      schema: {
        response: {
          200: apiDataResponseSchema(bodyContextFactsSchema),
          401: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['context'],
        summary: 'Get concise Body Progress context facts',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-cache');
      return reply.send({ data: await getBodyContextFacts(request.userId) });
    },
  );
};
