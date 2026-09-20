import {
  apiDataResponseSchema,
  apiPaginatedResponseSchema,
  approvePlanChangeProposalApiInputSchema,
  bodyCapabilityDetailSchema,
  bodyCapabilityRuntimeSchema,
  bodyConcernDetailSchema,
  bodyConcernRuntimeSchema,
  bodyContextListQuerySchema,
  bodyFlareSchema,
  bodyGuidanceDetailSchema,
  bodyGuidanceListQuerySchema,
  bodyGuidanceRuntimeSchema,
  correctBodyCapabilityApiInputSchema,
  correctBodyConcernApiInputSchema,
  correctBodyGuidanceApiInputSchema,
  createBodyCapabilityApiInputSchema,
  createBodyConcernApiInputSchema,
  createBodyGuidanceApiInputSchema,
  createPlanChangeProposalApiInputSchema,
  planChangeProposalSchema,
  proposalApprovalStatementSchema,
  recordBodyFlareApiInputSchema,
  recordProposalApprovalStatementApiInputSchema,
  revisePlanChangeProposalApiInputSchema,
  transitionBodyConcernApiInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
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
  BodyContextApprovalRequiredError,
  BodyContextIdempotencyConflictError,
  BodyContextInvalidTransitionError,
  BodyContextNotFoundError,
  BodyContextOwnedLinkNotFoundError,
  BodyContextProposalStaleError,
  BodyContextStaleTargetError,
  BodyContextStaleRevisionError,
  BodyContextTargetIneligibleError,
  approvePlanChangeProposal,
  correctBodyCapability,
  correctBodyConcern,
  correctBodyGuidance,
  createBodyCapability,
  createBodyConcern,
  createBodyGuidance,
  createPlanChangeProposal,
  getBodyCapability,
  getBodyConcern,
  getBodyGuidance,
  getPlanChangeProposal,
  listBodyCapabilities,
  listBodyConcerns,
  listBodyGuidance,
  recordBodyFlare,
  recordProposalApprovalStatement,
  revisePlanChangeProposal,
  transitionBodyConcern,
  type BodyContextActor,
} from './store.js';

const mutationErrors = {
  400: badRequestResponseSchema,
  401: apiErrorResponseSchema,
  403: apiErrorResponseSchema,
  404: apiErrorResponseSchema,
  409: apiErrorResponseSchema,
} as const;

const actorForRequest = (request: FastifyRequest): BodyContextActor =>
  request.authType === 'agent-token'
    ? {
        kind: 'agent_token',
        id: request.agentTokenId ?? request.userId,
        label: request.agentTokenName ?? null,
      }
    : { kind: 'user', id: request.userId, label: null };

type MutationResult<T> = { data: T; replayed: boolean; statusCode: number };
const sendMutation = async <T>(reply: FastifyReply, mutation: () => Promise<MutationResult<T>>) => {
  try {
    const result = await mutation();
    if (result.replayed) reply.header('Idempotent-Replay', 'true');
    return reply.code(result.statusCode).send({ data: result.data });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Request validation failed', {
        issues: error.issues,
      });
    }
    if (error instanceof UserTimeZoneRequiredError) {
      return sendError(reply, 400, error.code, error.message);
    }
    if (error instanceof BodyContextNotFoundError) {
      return sendError(reply, 404, error.code, 'Body-context record not found');
    }
    if (error instanceof BodyContextOwnedLinkNotFoundError) {
      return sendError(reply, 404, error.code, 'Linked record not found');
    }
    if (error instanceof BodyContextStaleRevisionError) {
      return sendError(reply, 409, error.code, error.message, {
        currentRevision: error.currentRevision,
        expectedRevision: error.expectedRevision,
      });
    }
    if (
      error instanceof BodyContextIdempotencyConflictError ||
      error instanceof BodyContextProposalStaleError ||
      error instanceof BodyContextStaleTargetError ||
      error instanceof BodyContextTargetIneligibleError
    ) {
      return sendError(reply, 409, error.code, error.message);
    }
    if (
      error instanceof BodyContextInvalidTransitionError ||
      error instanceof BodyContextApprovalRequiredError
    ) {
      return sendError(reply, 403, error.code, error.message);
    }
    throw error;
  }
};

export const bodyContextRuntimeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/body-context/concerns',
    {
      schema: {
        querystring: bodyContextListQuerySchema,
        response: {
          200: apiPaginatedResponseSchema(bodyConcernRuntimeSchema),
          401: apiErrorResponseSchema,
        },
        tags: ['body-context'],
        summary: 'List canonical body concerns',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const result = await listBodyConcerns(
        request.userId,
        request.query.page,
        request.query.limit,
      );
      return reply.send({ data: result.data, meta: { ...request.query, total: result.total } });
    },
  );

  typed.post(
    '/body-context/concerns',
    {
      preHandler: requireAgentOnly,
      schema: {
        body: createBodyConcernApiInputSchema,
        response: { 201: apiDataResponseSchema(bodyConcernDetailSchema), ...mutationErrors },
        tags: ['body-context'],
        summary: 'Capture a canonical body concern',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        createBodyConcern(request.userId, actorForRequest(request), request.body),
      ),
  );

  typed.get(
    '/body-context/concerns/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(bodyConcernDetailSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-context'],
        summary: 'Read a concern with immutable history and flares',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const result = await getBodyConcern(request.userId, request.params.id);
      return result
        ? reply.send({ data: result })
        : sendError(reply, 404, 'BODY_CONTEXT_NOT_FOUND', 'Body-context record not found');
    },
  );

  typed.patch(
    '/body-context/concerns/:id',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: correctBodyConcernApiInputSchema,
        response: { 200: apiDataResponseSchema(bodyConcernDetailSchema), ...mutationErrors },
        tags: ['body-context'],
        summary: 'Correct a concern with compare-and-swap',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        correctBodyConcern(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );

  typed.post(
    '/body-context/concerns/:id/transitions',
    {
      schema: {
        params: idParamsSchema,
        body: transitionBodyConcernApiInputSchema,
        response: { 200: apiDataResponseSchema(bodyConcernDetailSchema), ...mutationErrors },
        tags: ['body-context'],
        summary: 'Append an explicit concern management transition',
        security: authSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        transitionBodyConcern(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );

  typed.post(
    '/body-context/concerns/:id/flares',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: recordBodyFlareApiInputSchema,
        response: { 201: apiDataResponseSchema(bodyFlareSchema), ...mutationErrors },
        tags: ['body-context'],
        summary: 'Durably record a flare before optional follow-up',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        recordBodyFlare(request.userId, request.params.id, actorForRequest(request), request.body),
      ),
  );

  typed.get(
    '/body-context/capabilities',
    {
      schema: {
        querystring: bodyContextListQuerySchema,
        response: {
          200: apiPaginatedResponseSchema(bodyCapabilityRuntimeSchema),
          401: apiErrorResponseSchema,
        },
        tags: ['body-context'],
        summary: 'List canonical capabilities',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const result = await listBodyCapabilities(
        request.userId,
        request.query.page,
        request.query.limit,
      );
      return reply.send({ data: result.data, meta: { ...request.query, total: result.total } });
    },
  );
  typed.post(
    '/body-context/capabilities',
    {
      preHandler: requireAgentOnly,
      schema: {
        body: createBodyCapabilityApiInputSchema,
        response: { 201: apiDataResponseSchema(bodyCapabilityDetailSchema), ...mutationErrors },
        tags: ['body-context'],
        summary: 'Capture a canonical capability',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        createBodyCapability(request.userId, actorForRequest(request), request.body),
      ),
  );
  typed.get(
    '/body-context/capabilities/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(bodyCapabilityDetailSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-context'],
        summary: 'Read a capability with immutable history',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const result = await getBodyCapability(request.userId, request.params.id);
      return result
        ? reply.send({ data: result })
        : sendError(reply, 404, 'BODY_CONTEXT_NOT_FOUND', 'Body-context record not found');
    },
  );
  typed.patch(
    '/body-context/capabilities/:id',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: correctBodyCapabilityApiInputSchema,
        response: { 200: apiDataResponseSchema(bodyCapabilityDetailSchema), ...mutationErrors },
        tags: ['body-context'],
        summary: 'Correct a capability with compare-and-swap',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        correctBodyCapability(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );

  typed.get(
    '/body-context/guidance',
    {
      schema: {
        querystring: bodyGuidanceListQuerySchema,
        response: {
          200: apiPaginatedResponseSchema(bodyGuidanceRuntimeSchema),
          401: apiErrorResponseSchema,
        },
        tags: ['body-context'],
        summary: 'List sourced guidance',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const result = await listBodyGuidance(
        request.userId,
        request.query.page,
        request.query.limit,
        request.query.concernId,
        request.query.capabilityId,
      );
      return reply.send({
        data: result.data,
        meta: { page: request.query.page, limit: request.query.limit, total: result.total },
      });
    },
  );
  typed.post(
    '/body-context/guidance',
    {
      preHandler: requireAgentOnly,
      schema: {
        body: createBodyGuidanceApiInputSchema,
        response: { 201: apiDataResponseSchema(bodyGuidanceDetailSchema), ...mutationErrors },
        tags: ['body-context'],
        summary: 'Capture guidance with explicit provenance',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        createBodyGuidance(request.userId, actorForRequest(request), request.body),
      ),
  );
  typed.get(
    '/body-context/guidance/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(bodyGuidanceDetailSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-context'],
        summary: 'Read guidance with immutable history',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const result = await getBodyGuidance(request.userId, request.params.id);
      return result
        ? reply.send({ data: result })
        : sendError(reply, 404, 'BODY_CONTEXT_NOT_FOUND', 'Body-context record not found');
    },
  );
  typed.patch(
    '/body-context/guidance/:id',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: correctBodyGuidanceApiInputSchema,
        response: { 200: apiDataResponseSchema(bodyGuidanceDetailSchema), ...mutationErrors },
        tags: ['body-context'],
        summary: 'Correct guidance with compare-and-swap',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        correctBodyGuidance(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );

  typed.post(
    '/plan-change-proposals',
    {
      preHandler: requireAgentOnly,
      schema: {
        body: createPlanChangeProposalApiInputSchema,
        response: { 201: apiDataResponseSchema(planChangeProposalSchema), ...mutationErrors },
        tags: ['body-context'],
        summary: 'Propose typed prospective plan changes',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        createPlanChangeProposal(request.userId, actorForRequest(request), request.body),
      ),
  );
  typed.get(
    '/plan-change-proposals/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(planChangeProposalSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-context'],
        summary: 'Read an exact plan-change proposal',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const result = await getPlanChangeProposal(request.userId, request.params.id);
      return result
        ? reply.send({ data: result })
        : sendError(reply, 404, 'BODY_CONTEXT_NOT_FOUND', 'Proposal not found');
    },
  );
  typed.patch(
    '/plan-change-proposals/:id',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: revisePlanChangeProposalApiInputSchema,
        response: { 200: apiDataResponseSchema(planChangeProposalSchema), ...mutationErrors },
        tags: ['body-context'],
        summary: 'Revise and invalidate approval for a proposal',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        revisePlanChangeProposal(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );
  typed.post(
    '/plan-change-proposals/:id/approval-statements',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: recordProposalApprovalStatementApiInputSchema,
        response: {
          201: apiDataResponseSchema(proposalApprovalStatementSchema),
          ...mutationErrors,
        },
        tags: ['body-context'],
        summary: 'Persist an explicit user approval statement relayed by an agent',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        recordProposalApprovalStatement(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );
  typed.post(
    '/plan-change-proposals/:id/approval',
    {
      schema: {
        params: idParamsSchema,
        body: approvePlanChangeProposalApiInputSchema,
        response: { 200: apiDataResponseSchema(planChangeProposalSchema), ...mutationErrors },
        tags: ['body-context'],
        summary: 'Approve and atomically execute the exact current proposal',
        security: authSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        approvePlanChangeProposal(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );
};
