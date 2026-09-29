import {
  activityAssignmentSchema,
  activityDetailSchema,
  activityExecutionSchema,
  activityGoalRuntimeSchema,
  activityListItemSchema,
  activityListQuerySchema,
  activityMaterializationResultSchema,
  activityRecurrenceReadModelSchema,
  apiDataResponseSchema,
  apiPaginatedResponseSchema,
  canonicalActivityDetailSchema,
  correctActivityApiInputSchema,
  correctActivityExecutionApiInputSchema,
  createActivityApiInputSchema,
  createActivityAssignmentApiInputSchema,
  createActivityGoalApiInputSchema,
  createActivityOwnedLinkApiInputSchema,
  createActivityRecurrenceApiInputSchema,
  materializeActivityRecurrenceApiInputSchema,
  ownedEntityLinkSchema,
  recordActivityExecutionApiInputSchema,
  replaceActivityGoalLinksApiInputSchema,
  rescheduleActivityAssignmentApiInputSchema,
  reviseActivityRecurrenceApiInputSchema,
  updateActivityGoalApiInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { ZodError } from 'zod';

import { sendError } from '../../lib/reply.js';
import { requireAgentOnly, requireAuth } from '../../middleware/auth.js';
import {
  agentTokenSecurity,
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
} from '../../openapi.js';

import {
  ActivityExecutionConflictError,
  ActivityIdempotencyConflictError,
  ActivityInvalidRangeError,
  ActivityNotFoundError,
  ActivityOwnedLinkNotFoundError,
  ActivityStaleRecurrenceError,
  ActivityStaleRevisionError,
  correctActivity,
  correctActivityExecution,
  createActivity,
  createActivityAssignment,
  createActivityGoal,
  createActivityOwnedLink,
  createActivityRecurrence,
  getActivityDetail,
  listActivities,
  listActivityGoals,
  materializeActivityRecurrence,
  recordActivityExecution,
  replaceActivityGoals,
  rescheduleActivityAssignment,
  reviseActivityRecurrence,
  updateActivityGoal,
  type ActivityMutationActor,
} from './store.js';

const mutationErrors = {
  400: badRequestResponseSchema,
  401: apiErrorResponseSchema,
  403: apiErrorResponseSchema,
  404: apiErrorResponseSchema,
  409: apiErrorResponseSchema,
} as const;

const actorForRequest = (request: FastifyRequest): ActivityMutationActor => ({
  kind: 'agent_token',
  id: request.agentTokenId ?? request.userId,
  label: request.agentTokenName ?? null,
});

type MutationResult<T> = {
  data: T;
  replayed: boolean;
  statusCode: number;
};

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
    if (error instanceof ActivityNotFoundError) {
      return sendError(reply, 404, error.code, 'Activity not found');
    }
    if (error instanceof ActivityOwnedLinkNotFoundError) {
      return sendError(reply, 404, error.code, 'Linked record not found');
    }
    if (error instanceof ActivityStaleRevisionError) {
      return sendError(reply, 409, error.code, error.message, {
        currentRevision: error.currentRevision,
        expectedRevision: error.expectedRevision,
      });
    }
    if (error instanceof ActivityStaleRecurrenceError) {
      return sendError(reply, 409, error.code, error.message, {
        currentRevisionId: error.currentRevisionId,
        expectedRevisionId: error.expectedRevisionId,
      });
    }
    if (error instanceof ActivityIdempotencyConflictError) {
      return sendError(reply, 409, error.code, error.message);
    }
    if (error instanceof ActivityExecutionConflictError) {
      return sendError(reply, 409, error.code, error.message);
    }
    if (error instanceof ActivityInvalidRangeError) {
      return sendError(reply, 400, error.code, error.message);
    }
    throw error;
  }
};

export const activityRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/activities',
    {
      schema: {
        querystring: activityListQuerySchema,
        response: {
          200: apiPaginatedResponseSchema(activityListItemSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['activities'],
        summary: 'List canonical and explicitly ambiguous legacy activities',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const result = await listActivities(request.userId, request.query);
      return reply.send({
        data: result.data,
        meta: { page: request.query.page, limit: request.query.limit, total: result.total },
      });
    },
  );

  typedApp.post(
    '/activities',
    {
      preHandler: requireAgentOnly,
      schema: {
        body: createActivityApiInputSchema,
        response: { 201: apiDataResponseSchema(canonicalActivityDetailSchema), ...mutationErrors },
        tags: ['activities'],
        summary: 'Capture a canonical activity',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        createActivity(request.userId, actorForRequest(request), request.body),
      ),
  );

  typedApp.get(
    '/activities/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(activityDetailSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['activities'],
        summary: 'Get an activity with immutable history',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const activity = await getActivityDetail(request.userId, request.params.id);
      if (!activity) {
        return sendError(reply, 404, 'ACTIVITY_NOT_FOUND', 'Activity not found');
      }
      return reply.send({ data: activity });
    },
  );

  typedApp.patch(
    '/activities/:id',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: correctActivityApiInputSchema,
        response: { 200: apiDataResponseSchema(canonicalActivityDetailSchema), ...mutationErrors },
        tags: ['activities'],
        summary: 'Correct a canonical activity with compare-and-swap',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        correctActivity(request.userId, request.params.id, actorForRequest(request), request.body),
      ),
  );

  typedApp.put(
    '/activities/:id/goals',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: replaceActivityGoalLinksApiInputSchema,
        response: { 200: apiDataResponseSchema(canonicalActivityDetailSchema), ...mutationErrors },
        tags: ['activities'],
        summary: 'Replace activity goal links with compare-and-swap',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        replaceActivityGoals(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );

  typedApp.post(
    '/activities/:id/assignments',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: createActivityAssignmentApiInputSchema,
        response: { 201: apiDataResponseSchema(activityAssignmentSchema), ...mutationErrors },
        tags: ['activities'],
        summary: 'Assign an activity to a local calendar date',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        createActivityAssignment(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );

  typedApp.post(
    '/activities/:id/executions',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: recordActivityExecutionApiInputSchema,
        response: { 201: apiDataResponseSchema(activityExecutionSchema), ...mutationErrors },
        tags: ['activities'],
        summary: 'Record what actually happened for an activity',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        recordActivityExecution(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );

  typedApp.post(
    '/activities/:id/recurrences',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: createActivityRecurrenceApiInputSchema,
        response: {
          201: apiDataResponseSchema(activityRecurrenceReadModelSchema),
          ...mutationErrors,
        },
        tags: ['activities'],
        summary: 'Create a local-date activity recurrence',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        createActivityRecurrence(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );

  typedApp.post(
    '/activities/:id/links',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: createActivityOwnedLinkApiInputSchema,
        response: { 201: apiDataResponseSchema(ownedEntityLinkSchema), ...mutationErrors },
        tags: ['activities'],
        summary: 'Create an ownership-checked activity link',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        createActivityOwnedLink(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );

  typedApp.patch(
    '/activity-assignments/:id/reschedule',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: rescheduleActivityAssignmentApiInputSchema,
        response: { 200: apiDataResponseSchema(activityAssignmentSchema), ...mutationErrors },
        tags: ['activities'],
        summary: 'Reschedule an assignment while preserving its history',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        rescheduleActivityAssignment(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );

  typedApp.post(
    '/activity-executions/:id/corrections',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: correctActivityExecutionApiInputSchema,
        response: { 200: apiDataResponseSchema(activityExecutionSchema), ...mutationErrors },
        tags: ['activities'],
        summary: 'Correct an execution while preserving its prior revision',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        correctActivityExecution(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );

  typedApp.post(
    '/activity-recurrences/:id/revisions',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: reviseActivityRecurrenceApiInputSchema,
        response: {
          201: apiDataResponseSchema(activityRecurrenceReadModelSchema),
          ...mutationErrors,
        },
        tags: ['activities'],
        summary: 'Add an effective-dated recurrence revision',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        reviseActivityRecurrence(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );

  typedApp.post(
    '/activity-recurrences/:id/materialize',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: materializeActivityRecurrenceApiInputSchema,
        response: {
          200: apiDataResponseSchema(activityMaterializationResultSchema),
          ...mutationErrors,
        },
        tags: ['activities'],
        summary: 'Materialize recurrence assignments for a bounded date range',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        materializeActivityRecurrence(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );

  typedApp.get(
    '/activity-goals',
    {
      schema: {
        response: {
          200: apiDataResponseSchema(activityGoalRuntimeSchema.array()),
          401: apiErrorResponseSchema,
        },
        tags: ['activities'],
        summary: 'List activity goals',
        security: authSecurity,
      },
    },
    async (request, reply) => reply.send({ data: await listActivityGoals(request.userId) }),
  );

  typedApp.post(
    '/activity-goals',
    {
      preHandler: requireAgentOnly,
      schema: {
        body: createActivityGoalApiInputSchema,
        response: { 201: apiDataResponseSchema(activityGoalRuntimeSchema), ...mutationErrors },
        tags: ['activities'],
        summary: 'Create an activity goal',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        createActivityGoal(request.userId, actorForRequest(request), request.body),
      ),
  );

  typedApp.patch(
    '/activity-goals/:id',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: updateActivityGoalApiInputSchema,
        response: { 200: apiDataResponseSchema(activityGoalRuntimeSchema), ...mutationErrors },
        tags: ['activities'],
        summary: 'Update an activity goal with compare-and-swap',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) =>
      sendMutation(reply, () =>
        updateActivityGoal(
          request.userId,
          request.params.id,
          actorForRequest(request),
          request.body,
        ),
      ),
  );
};
