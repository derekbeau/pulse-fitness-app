import {
  apiDataResponseSchema,
  correctJournalObservationApiInputSchema,
  createJournalObservationApiInputSchema,
  journalDetailSchema,
  journalListQuerySchema,
  journalListSchema,
  journalWeeklyQuerySchema,
  weeklyReflectionReadModelSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import { sendError } from '../../lib/reply.js';
import { UserTimeZoneRequiredError } from '../../lib/user-time-zone.js';
import { requireAgentOnly, requireAuth } from '../../middleware/auth.js';
import {
  agentTokenSecurity,
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
} from '../../openapi.js';
import {
  correctJournalObservation,
  createJournalObservation,
  getJournalDetail,
  JournalIdempotencyConflictError,
  JournalNotFoundError,
  JournalOwnedLinkNotFoundError,
  JournalRangeError,
  JournalReceiptIntegrityError,
  JournalRoutineCopyError,
  JournalStaleRevisionError,
  listJournal,
  weeklyReflection,
} from './store.js';

const actor = (r: FastifyRequest) => ({
  kind: 'agent_token' as const,
  id: r.agentTokenId ?? r.userId,
  label: r.agentTokenName ?? null,
});
const errors = {
  400: badRequestResponseSchema,
  401: apiErrorResponseSchema,
  403: apiErrorResponseSchema,
  404: apiErrorResponseSchema,
  409: apiErrorResponseSchema,
} as const;
const handle = (reply: FastifyReply, e: unknown) => {
  if (e instanceof ZodError || e instanceof JournalRangeError)
    return sendError(reply, 400, 'VALIDATION_ERROR', 'Request validation failed');
  if (e instanceof UserTimeZoneRequiredError) return sendError(reply, 400, e.code, e.message);
  if (e instanceof JournalOwnedLinkNotFoundError)
    return sendError(reply, 404, e.code, 'Linked record not found');
  if (e instanceof JournalNotFoundError)
    return sendError(reply, 404, e.code, 'Journal observation not found');
  if (e instanceof JournalRoutineCopyError)
    return sendError(reply, 400, e.code, 'Journal content copies a linked routine log.');
  if (e instanceof JournalStaleRevisionError)
    return sendError(reply, 409, e.code, e.message, {
      expectedRevisionId: e.expectedRevisionId,
      currentRevisionId: e.currentRevisionId,
    });
  if (e instanceof JournalIdempotencyConflictError)
    return sendError(
      reply,
      409,
      e.code,
      'The idempotency key was already used with a different request.',
    );
  if (e instanceof JournalReceiptIntegrityError)
    return sendError(reply, 400, e.code, 'The stored Journal receipt could not be verified.');
  throw e;
};
const mutation = async (
  reply: FastifyReply,
  fn: () => Promise<{ data: unknown; replayed: boolean; statusCode: number }>,
) => {
  try {
    const result = await fn();
    if (result.replayed) reply.header('Idempotent-Replay', 'true');
    return reply.code(result.statusCode).send({ data: result.data });
  } catch (e) {
    return handle(reply, e);
  }
};
export const journalRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  const typed = app.withTypeProvider<ZodTypeProvider>();
  typed.get(
    '/journal',
    {
      schema: {
        querystring: journalListQuerySchema,
        response: { 200: apiDataResponseSchema(journalListSchema), ...errors },
        tags: ['journal'],
        summary: 'List canonical and date-only legacy Journal records',
        security: authSecurity,
      },
    },
    async (r, reply) => {
      try {
        return reply.send({ data: await listJournal(r.userId, r.query.from, r.query.to) });
      } catch (e) {
        return handle(reply, e);
      }
    },
  );
  typed.post(
    '/journal',
    {
      preHandler: requireAgentOnly,
      schema: {
        body: createJournalObservationApiInputSchema,
        response: { 201: apiDataResponseSchema(journalDetailSchema), ...errors },
        tags: ['journal'],
        summary: 'Capture a meaningful linked Journal observation',
        security: agentTokenSecurity,
      },
    },
    async (r, reply) => mutation(reply, () => createJournalObservation(r.userId, actor(r), r.body)),
  );
  typed.get(
    '/journal/weekly-reflection',
    {
      schema: {
        querystring: journalWeeklyQuerySchema,
        response: { 200: apiDataResponseSchema(weeklyReflectionReadModelSchema), ...errors },
        tags: ['journal'],
        summary: 'Derive a grounded weekly reflection from saved facts',
        security: authSecurity,
      },
    },
    async (r, reply) => {
      try {
        return reply.send({ data: await weeklyReflection(r.userId, r.query.start, r.query.end) });
      } catch (e) {
        return handle(reply, e);
      }
    },
  );
  typed.get(
    '/journal/:id',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: apiDataResponseSchema(journalDetailSchema), ...errors },
        tags: ['journal'],
        summary: 'Read current Journal observation and immutable history',
        security: authSecurity,
      },
    },
    async (r, reply) => {
      try {
        const d = await getJournalDetail(r.userId, r.params.id);
        return d
          ? reply.send({ data: d })
          : sendError(reply, 404, 'JOURNAL_NOT_FOUND', 'Journal observation not found');
      } catch (e) {
        return handle(reply, e);
      }
    },
  );
  typed.post(
    '/journal/:id/corrections',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: correctJournalObservationApiInputSchema,
        response: { 200: apiDataResponseSchema(journalDetailSchema), ...errors },
        tags: ['journal'],
        summary: 'Append an immutable Journal correction with compare-and-swap',
        security: agentTokenSecurity,
      },
    },
    async (r, reply) =>
      mutation(reply, () => correctJournalObservation(r.userId, actor(r), r.params.id, r.body)),
  );
};
