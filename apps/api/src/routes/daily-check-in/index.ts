import {
  apiDataResponseSchema,
  answerDailyCheckInQuestionApiInputSchema,
  correctDailyCheckInAnswerApiInputSchema,
  createDailyCheckInQuestionApiInputSchema,
  dailyCheckInDetailSchema,
  dailyContextQuerySchema,
  dailyContextRuntimeResponseSchema,
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
  answerQuestion,
  CheckInIdempotencyConflictError,
  CheckInNotFoundError,
  CheckInOwnedLinkNotFoundError,
  CheckInStaleError,
  CheckInStaleQuestionError,
  correctAnswer,
  createQuestion,
  getQuestionDetail,
  readDailyContext,
  type DailyCheckInActor,
} from './store.js';
const actor = (r: FastifyRequest): DailyCheckInActor => ({
  kind: 'agent_token',
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
const mutation = async <T>(
  reply: FastifyReply,
  fn: () => Promise<{ data: T; replayed: boolean; statusCode: number }>,
) => {
  try {
    const r = await fn();
    if (r.replayed) reply.header('Idempotent-Replay', 'true');
    return reply.code(r.statusCode).send({ data: r.data });
  } catch (e) {
    if (e instanceof ZodError)
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Request validation failed', {
        issues: e.issues,
      });
    if (e instanceof CheckInNotFoundError)
      return sendError(reply, 404, e.code, 'Check-in record not found');
    if (e instanceof CheckInOwnedLinkNotFoundError)
      return sendError(reply, 404, e.code, 'Linked record not found');
    if (e instanceof CheckInStaleError)
      return sendError(reply, 409, e.code, e.message, {
        currentRevision: e.currentRevision,
        expectedRevision: e.expectedRevision,
      });
    if (e instanceof CheckInStaleQuestionError)
      return sendError(reply, 409, e.code, e.message, {
        currentQuestionRevisionId: e.currentQuestionRevisionId,
        expectedQuestionRevisionId: e.expectedQuestionRevisionId,
      });
    if (e instanceof CheckInIdempotencyConflictError)
      return sendError(
        reply,
        409,
        e.code,
        'The idempotency key was already used with a different request.',
      );
    throw e;
  }
};
export const dailyCheckInRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  const typed = app.withTypeProvider<ZodTypeProvider>();
  typed.get(
    '/daily-context',
    {
      schema: {
        querystring: dailyContextQuerySchema,
        response: {
          200: apiDataResponseSchema(dailyContextRuntimeResponseSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['daily-context'],
        summary: 'Read canonical grounded daily context',
        security: authSecurity,
      },
    },
    async (r, reply) => {
      try {
        return reply.send({ data: (await readDailyContext(r.userId, r.query.date)) as never });
      } catch (e) {
        if (e instanceof UserTimeZoneRequiredError) return sendError(reply, 400, e.code, e.message);
        throw e;
      }
    },
  );
  typed.post(
    '/check-in/questions',
    {
      preHandler: requireAgentOnly,
      schema: {
        body: createDailyCheckInQuestionApiInputSchema,
        response: { 201: apiDataResponseSchema(dailyCheckInDetailSchema), ...errors },
        tags: ['daily-context'],
        summary: 'Create or resume a canonical grounded check-in question',
        security: agentTokenSecurity,
      },
    },
    async (r, reply) => mutation(reply, () => createQuestion(r.userId, actor(r), r.body)),
  );
  typed.get(
    '/check-in/questions/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(dailyCheckInDetailSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['daily-context'],
        summary: 'Read canonical check-in history',
        security: authSecurity,
      },
    },
    async (r, reply) => {
      const d = await getQuestionDetail(r.userId, r.params.id);
      return d
        ? reply.send({ data: d as never })
        : sendError(reply, 404, 'CHECK_IN_NOT_FOUND', 'Check-in record not found');
    },
  );
  typed.post(
    '/check-in/questions/:id/answers',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: answerDailyCheckInQuestionApiInputSchema,
        response: { 201: apiDataResponseSchema(dailyCheckInDetailSchema), ...errors },
        tags: ['daily-context'],
        summary: 'Answer a canonical check-in question with compare-and-swap',
        security: agentTokenSecurity,
      },
    },
    async (r, reply) =>
      mutation(reply, () => answerQuestion(r.userId, actor(r), r.params.id, r.body)),
  );
  typed.post(
    '/check-in/answers/:id/corrections',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: correctDailyCheckInAnswerApiInputSchema,
        response: { 200: apiDataResponseSchema(dailyCheckInDetailSchema), ...errors },
        tags: ['daily-context'],
        summary: 'Append an immutable check-in answer correction',
        security: agentTokenSecurity,
      },
    },
    async (r, reply) =>
      mutation(reply, () => correctAnswer(r.userId, actor(r), r.params.id, r.body)),
  );
};
