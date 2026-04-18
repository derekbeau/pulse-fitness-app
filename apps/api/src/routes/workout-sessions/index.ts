import { randomUUID } from 'node:crypto';

import {
  apiDataResponseSchema,
  batchUpsertSetsSchema,
  createSetSchema,
  createWorkoutSessionInputSchema,
  reorderWorkoutSessionExercisesInputSchema,
  sessionCorrectionRequestSchema,
  saveWorkoutSessionAsTemplateInputSchema,
  sessionSetSchema,
  swapWorkoutSessionExerciseInputSchema,
  type CreateWorkoutSessionInput,
  type SessionSetInput,
  updateSetSchema,
  updateWorkoutSessionInputSchema,
  updateWorkoutSessionSectionTimerInputSchema,
  updateWorkoutSessionTimeSegmentsInputSchema,
  workoutSessionListItemSchema,
  workoutSessionQueryParamsSchema,
  workoutSessionSchema,
  workoutTemplateSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { sendError } from '../../lib/reply.js';
import { isAgentRequest, requireAuth } from '../../middleware/auth.js';
import {
  agentEnrichmentOnSend,
  buildDataResponse,
  setAgentEnrichmentContext,
} from '../../middleware/agent-enrichment.js';
import { agentRequestTransform } from '../../middleware/agent-transforms.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
  opaqueIdParamSchema,
  successFlagSchema,
} from '../../openapi.js';
import { allRelatedExercisesOwned } from '../exercises/store.js';
import {
  deleteScheduledWorkout,
  findScheduledWorkoutBySessionId,
  linkTodayScheduledWorkoutToSession,
  unlinkScheduledWorkoutSession,
} from '../scheduled-workouts/store.js';
import { templateBelongsToUser } from '../workout-templates/template-access.js';
import {
  applyExerciseNotesToSets,
  buildExerciseSectionOrder,
  buildInitialSessionSets,
  reorderSessionSetsByExercise,
  toExerciseSectionKey,
} from './session-set-utils.js';

import {
  applySessionCorrections,
  batchUpsertSessionSets,
  createSessionSet,
  createWorkoutSession,
  deleteWorkoutSession,
  findInvalidSessionExerciseIds,
  findWorkoutSessionAccess,
  findWorkoutSessionById,
  hardDeleteWorkoutSession,
  InvalidSessionCorrectionSetError,
  listSessionSetGroups,
  listWorkoutSessions,
  reorderWorkoutSessionExercises,
  saveCompletedSessionAsTemplate,
  SessionSetNotFoundError,
  swapWorkoutSessionExercise,
  updateSessionSet,
  updateWorkoutSession,
  WorkoutSessionNotCompletedError,
  WorkoutSessionNotFoundError,
} from './store.js';
import {
  calculateActiveDuration,
  closeOpenTimeSegment,
  findOpenTimeSegment,
  openTimeSegment,
} from './time-segments.js';

const sessionIdParamsSchema = z.object({
  sessionId: opaqueIdParamSchema,
});

const sessionSetParamsSchema = sessionIdParamsSchema.extend({
  setId: opaqueIdParamSchema,
});

const sessionExerciseParamsSchema = idParamsSchema.extend({
  exerciseId: opaqueIdParamSchema,
});

const sessionSetGroupSchema = z.object({
  exerciseId: z.string().nullable(),
  sets: z.array(sessionSetSchema),
});

const warningMetaSchema = z.object({
  warning: z.string(),
});

const swapWorkoutSessionResponseSchema = apiDataResponseSchema(workoutSessionSchema).extend({
  meta: warningMetaSchema.optional(),
});

const WORKOUT_SESSION_NOT_FOUND_RESPONSE = {
  code: 'WORKOUT_SESSION_NOT_FOUND',
  message: 'Workout session not found',
} as const;

const WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE = {
  code: 'WORKOUT_TEMPLATE_NOT_FOUND',
  message: 'Workout template not found',
} as const;

const INVALID_SESSION_EXERCISE_RESPONSE = {
  code: 'INVALID_SESSION_EXERCISE',
  message: 'Session references one or more unavailable exercises',
} as const;

const WORKOUT_SESSION_NOT_ACTIVE_RESPONSE = {
  code: 'WORKOUT_SESSION_NOT_ACTIVE',
  message: 'Workout session is not active',
} as const;

const WORKOUT_SESSION_NOT_COMPLETED_RESPONSE = {
  code: 'WORKOUT_SESSION_NOT_COMPLETED',
  message: 'Workout session must be completed before saving as template',
} as const;

const WORKOUT_SESSION_CORRECTION_NOT_COMPLETED_RESPONSE = {
  code: 'WORKOUT_SESSION_NOT_COMPLETED',
  message: 'Workout session must be completed before applying corrections',
} as const;

const WORKOUT_SESSION_INVALID_TRANSITION_RESPONSE = {
  code: 'WORKOUT_SESSION_INVALID_TRANSITION',
  message: 'Invalid workout session status transition',
} as const;

const WORKOUT_SESSION_ACTIVE_SECTION_REQUIRED_RESPONSE = {
  code: 'WORKOUT_SESSION_ACTIVE_SECTION_REQUIRED',
  message: 'activeSection is required when transitioning a session to in-progress',
} as const;

const WORKOUT_SESSION_SECTION_SWITCH_REQUIRES_PAUSE_RESPONSE = {
  code: 'WORKOUT_SESSION_SECTION_SWITCH_REQUIRES_PAUSE',
  message:
    'Cannot switch active workout sections while already in-progress. Pause first, then start the next section.',
} as const;

const WORKOUT_SESSION_SECTION_TIMER_REQUIRES_IN_PROGRESS_RESPONSE = {
  code: 'WORKOUT_SESSION_SECTION_TIMER_REQUIRES_IN_PROGRESS',
  message: 'Section timers can only be changed while the workout session is in-progress',
} as const;

const WORKOUT_SESSION_SECTION_TIMER_PAUSE_MISMATCH_RESPONSE = {
  code: 'WORKOUT_SESSION_SECTION_TIMER_PAUSE_MISMATCH',
  message:
    'Cannot pause section timer because no matching section timer is currently running for this session',
} as const;

const WORKOUT_SESSION_NOT_SWAPPABLE_RESPONSE = {
  code: 'WORKOUT_SESSION_NOT_SWAPPABLE',
  message: 'Workout session must be planned, in progress, or paused to swap exercises',
} as const;

const WORKOUT_SESSION_EXERCISE_NOT_FOUND_RESPONSE = {
  code: 'WORKOUT_SESSION_EXERCISE_NOT_FOUND',
  message: 'Session exercise not found',
} as const;

const WORKOUT_SESSION_DUPLICATE_EXERCISE_RESPONSE = {
  code: 'WORKOUT_SESSION_DUPLICATE_EXERCISE',
  message: 'Session already contains the replacement exercise',
} as const;

const WORKOUT_SESSION_EXERCISE_HAS_LOGGED_SETS_RESPONSE = {
  code: 'WORKOUT_SESSION_EXERCISE_HAS_LOGGED_SETS',
  message: 'Cannot remove an exercise with logged sets',
} as const;

const SESSION_SET_NOT_FOUND_RESPONSE = {
  code: 'SESSION_SET_NOT_FOUND',
  message: 'Session set not found',
} as const;

const INVALID_SESSION_CORRECTION_SET_RESPONSE = {
  code: 'INVALID_SESSION_CORRECTION_SET',
  message: 'One or more corrections reference sets outside the workout session',
} as const;

const UNSUPPORTED_SESSION_CORRECTION_RESPONSE = {
  code: 'INVALID_SESSION_CORRECTION',
  message:
    'Workout session corrections must include weight or reps. Set-level RPE corrections are not persisted yet',
} as const;

const toCreateWorkoutSessionInput = (
  session: Awaited<ReturnType<typeof findWorkoutSessionById>>,
): CreateWorkoutSessionInput => {
  if (!session) {
    throw new Error('Workout session must exist to build an update payload');
  }

  const supersetGroupByExerciseId = new Map<string, string | null>();
  for (const exercise of session.exercises ?? []) {
    if (typeof exercise.exerciseId !== 'string') {
      continue;
    }

    supersetGroupByExerciseId.set(exercise.exerciseId, exercise.supersetGroup);
  }

  return {
    templateId: session.templateId,
    name: session.name,
    date: session.date,
    status: session.status,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    duration: session.duration,
    timeSegments: session.timeSegments,
    feedback: session.feedback,
    notes: session.notes,
    sets: session.sets.flatMap((set) =>
      // Deleted exercises cannot be resolved back into actionable active-session inputs.
      typeof set.exerciseId !== 'string'
        ? []
        : [
            {
              exerciseId: set.exerciseId,
              orderIndex: set.orderIndex ?? 0,
              setNumber: set.setNumber,
              weight: set.weight,
              reps: set.reps,
              completed: set.completed,
              skipped: set.skipped,
              supersetGroup: supersetGroupByExerciseId.get(set.exerciseId) ?? null,
              section: set.section,
              notes: set.notes,
            },
          ],
    ),
  };
};

const getReferencedExerciseIds = (sets: CreateWorkoutSessionInput['sets']) =>
  sets.map((set) => set.exerciseId);

const buildInvalidExerciseMessage = (invalidExerciseIds: string[]) => {
  const preview = invalidExerciseIds.slice(0, 3).join(', ');
  const suffix = invalidExerciseIds.length > 3 ? ', ...' : '';
  return `${INVALID_SESSION_EXERCISE_RESPONSE.message}: ${preview}${suffix}`;
};

const ensureOwnedSession = async ({
  sessionId,
  userId,
  reply,
}: {
  sessionId: string;
  userId: string;
  reply: FastifyReply;
}) => {
  const session = await findWorkoutSessionAccess(sessionId, userId);
  if (!session) {
    sendError(
      reply,
      404,
      WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
      WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
    );
    return undefined;
  }

  return session;
};

const ensureOwnedActiveSession = async ({
  sessionId,
  userId,
  reply,
}: {
  sessionId: string;
  userId: string;
  reply: FastifyReply;
}) => {
  const session = await ensureOwnedSession({ sessionId, userId, reply });
  if (!session) {
    return undefined;
  }

  if (session.status !== 'in-progress') {
    sendError(
      reply,
      409,
      WORKOUT_SESSION_NOT_ACTIVE_RESPONSE.code,
      WORKOUT_SESSION_NOT_ACTIVE_RESPONSE.message,
    );
    return undefined;
  }

  return session;
};

const MIN_VALID_STARTED_AT_TIMESTAMP = Date.UTC(2020, 0, 1);
const isValidTimestamp = (value: number) =>
  Number.isFinite(new Date(value).getTime()) && value >= MIN_VALID_STARTED_AT_TIMESTAMP;

const nowIsoString = () => new Date().toISOString();

const toIsoString = (value: number) => new Date(value).toISOString();

export const workoutSessionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/',
    {
      preHandler: agentRequestTransform,
      onSend: agentEnrichmentOnSend,
      schema: {
        body: createWorkoutSessionInputSchema,
        response: {
          201: apiDataResponseSchema(workoutSessionSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'Create a workout session',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      let input: CreateWorkoutSessionInput = request.body;
      // templateName is an AgentToken-only convenience; JWT callers must send templateId.
      if (request.body.templateName !== undefined && !isAgentRequest(request)) {
        return sendError(
          reply,
          400,
          'VALIDATION_ERROR',
          'templateName is only supported for AgentToken requests',
        );
      }

      // AgentToken callers passed templateName, but middleware could not resolve it to templateId.
      if (request.body.templateName !== undefined && request.body.templateId === null) {
        return sendError(
          reply,
          404,
          WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
          WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
        );
      }

      if (request.body.templateId !== null) {
        const { findWorkoutTemplateById } = await import('../workout-templates/store.js');
        const template = await findWorkoutTemplateById(request.body.templateId, request.userId);
        if (!template) {
          return sendError(
            reply,
            404,
            WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
            WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
          );
        }

        if (request.body.sets.length === 0) {
          input = {
            ...request.body,
            sets: buildInitialSessionSets(template.sections),
          };
        }
      }

      const invalidExerciseIds = await findInvalidSessionExerciseIds({
        userId: request.userId,
        exerciseIds: getReferencedExerciseIds(input.sets),
      });
      if (invalidExerciseIds.length > 0) {
        return sendError(
          reply,
          400,
          INVALID_SESSION_EXERCISE_RESPONSE.code,
          buildInvalidExerciseMessage(invalidExerciseIds),
        );
      }

      const session = await createWorkoutSession({
        id: randomUUID(),
        userId: request.userId,
        input,
      });

      if (input.templateId !== null) {
        await linkTodayScheduledWorkoutToSession({
          userId: request.userId,
          templateId: input.templateId,
          date: input.date,
          sessionId: session.id,
        });
      }

      setAgentEnrichmentContext(request, {
        endpoint: 'workout-session.mutation',
        action: 'create',
        session,
      });

      return reply.code(201).send({
        data: session,
      });
    },
  );

  typedApp.get(
    '/',
    {
      schema: {
        querystring: workoutSessionQueryParamsSchema,
        response: {
          200: apiDataResponseSchema(z.array(workoutSessionListItemSchema)),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'List workout sessions',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const sessions = await listWorkoutSessions({
        userId: request.userId,
        ...request.query,
      });

      return reply.send({
        data: sessions,
      });
    },
  );

  typedApp.post(
    '/:sessionId/sets',
    {
      schema: {
        params: sessionIdParamsSchema,
        body: createSetSchema,
        response: {
          201: apiDataResponseSchema(sessionSetSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'Create a set in an active workout session',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const session = await ensureOwnedActiveSession({
        sessionId: request.params.sessionId,
        userId: request.userId,
        reply,
      });
      if (!session) {
        return reply;
      }

      const invalidExerciseIds = await findInvalidSessionExerciseIds({
        userId: request.userId,
        exerciseIds: [request.body.exerciseId],
      });
      if (invalidExerciseIds.length > 0) {
        return sendError(
          reply,
          400,
          INVALID_SESSION_EXERCISE_RESPONSE.code,
          buildInvalidExerciseMessage(invalidExerciseIds),
        );
      }

      const set = await createSessionSet({
        id: randomUUID(),
        sessionId: session.id,
        input: request.body,
      });

      return reply.code(201).send({
        data: set,
      });
    },
  );

  typedApp.patch(
    '/:sessionId/sets/:setId',
    {
      schema: {
        params: sessionSetParamsSchema,
        body: updateSetSchema,
        response: {
          200: apiDataResponseSchema(sessionSetSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'Update a set in an active workout session',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const session = await ensureOwnedActiveSession({
        sessionId: request.params.sessionId,
        userId: request.userId,
        reply,
      });
      if (!session) {
        return reply;
      }

      const set = await updateSessionSet({
        sessionId: session.id,
        setId: request.params.setId,
        input: request.body,
      });
      if (!set) {
        return sendError(
          reply,
          404,
          SESSION_SET_NOT_FOUND_RESPONSE.code,
          SESSION_SET_NOT_FOUND_RESPONSE.message,
        );
      }

      return reply.send({
        data: set,
      });
    },
  );

  typedApp.patch(
    '/:sessionId/corrections',
    {
      schema: {
        params: sessionIdParamsSchema,
        body: sessionCorrectionRequestSchema,
        response: {
          200: apiDataResponseSchema(workoutSessionSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'Apply corrections to a completed workout session',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const unsupportedCorrection = request.body.corrections.find(
        (correction) => correction.weight === undefined && correction.reps === undefined,
      );
      if (unsupportedCorrection) {
        return sendError(
          reply,
          400,
          UNSUPPORTED_SESSION_CORRECTION_RESPONSE.code,
          `${UNSUPPORTED_SESSION_CORRECTION_RESPONSE.message}: ${unsupportedCorrection.setId}`,
        );
      }

      try {
        const session = await applySessionCorrections({
          sessionId: request.params.sessionId,
          userId: request.userId,
          corrections: request.body.corrections,
        });

        return reply.send({
          data: session,
        });
      } catch (error) {
        if (error instanceof WorkoutSessionNotFoundError) {
          return sendError(
            reply,
            404,
            WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
            WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
          );
        }

        if (error instanceof WorkoutSessionNotCompletedError) {
          return sendError(
            reply,
            409,
            WORKOUT_SESSION_CORRECTION_NOT_COMPLETED_RESPONSE.code,
            WORKOUT_SESSION_CORRECTION_NOT_COMPLETED_RESPONSE.message,
          );
        }

        if (error instanceof InvalidSessionCorrectionSetError) {
          return sendError(
            reply,
            400,
            INVALID_SESSION_CORRECTION_SET_RESPONSE.code,
            `${INVALID_SESSION_CORRECTION_SET_RESPONSE.message}: ${error.setId}`,
          );
        }

        throw error;
      }
    },
  );

  typedApp.get(
    '/:sessionId/sets',
    {
      schema: {
        params: sessionIdParamsSchema,
        response: {
          200: apiDataResponseSchema(z.array(sessionSetGroupSchema)),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'List grouped sets for a workout session',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const session = await ensureOwnedSession({
        sessionId: request.params.sessionId,
        userId: request.userId,
        reply,
      });
      if (!session) {
        return reply;
      }

      const groupedSets = await listSessionSetGroups(session.id);

      return reply.send({
        data: groupedSets,
      });
    },
  );

  typedApp.put(
    '/:sessionId/sets',
    {
      schema: {
        params: sessionIdParamsSchema,
        body: batchUpsertSetsSchema,
        response: {
          200: apiDataResponseSchema(z.array(sessionSetGroupSchema)),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'Batch upsert sets in an active workout session',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const session = await ensureOwnedActiveSession({
        sessionId: request.params.sessionId,
        userId: request.userId,
        reply,
      });
      if (!session) {
        return reply;
      }

      const invalidExerciseIds = await findInvalidSessionExerciseIds({
        userId: request.userId,
        exerciseIds: request.body.sets.map((set) => set.exerciseId),
      });
      if (invalidExerciseIds.length > 0) {
        return sendError(
          reply,
          400,
          INVALID_SESSION_EXERCISE_RESPONSE.code,
          buildInvalidExerciseMessage(invalidExerciseIds),
        );
      }

      try {
        const groupedSets = await batchUpsertSessionSets({
          sessionId: session.id,
          input: request.body,
        });

        return reply.send({
          data: groupedSets,
        });
      } catch (error) {
        if (error instanceof SessionSetNotFoundError) {
          return sendError(
            reply,
            404,
            SESSION_SET_NOT_FOUND_RESPONSE.code,
            SESSION_SET_NOT_FOUND_RESPONSE.message,
          );
        }

        throw error;
      }
    },
  );

  typedApp.post(
    '/:id/save-as-template',
    {
      schema: {
        params: idParamsSchema,
        body: saveWorkoutSessionAsTemplateInputSchema,
        response: {
          201: apiDataResponseSchema(workoutTemplateSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'Save a completed workout session as a template',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const session = await findWorkoutSessionById(request.params.id, request.userId);
      if (!session) {
        return sendError(
          reply,
          404,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
        );
      }

      if (session.status !== 'completed') {
        return sendError(
          reply,
          409,
          WORKOUT_SESSION_NOT_COMPLETED_RESPONSE.code,
          WORKOUT_SESSION_NOT_COMPLETED_RESPONSE.message,
        );
      }

      const template = await saveCompletedSessionAsTemplate({
        input: request.body,
        session,
        userId: request.userId,
      });

      return reply.code(201).send({
        data: template,
      });
    },
  );

  typedApp.get(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(workoutSessionSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'Get a workout session',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const session = await findWorkoutSessionById(request.params.id, request.userId);
      if (!session) {
        return sendError(
          reply,
          404,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
        );
      }

      return reply.send({
        data: session,
      });
    },
  );

  const resolveSessionTransition = ({
    existingStatus,
    requestedStatus,
    currentTimeSegments,
    requestedCompletedAt,
    requestedDuration,
    requestedActiveSection,
  }: {
    existingStatus: CreateWorkoutSessionInput['status'];
    requestedStatus: CreateWorkoutSessionInput['status'];
    currentTimeSegments: CreateWorkoutSessionInput['timeSegments'];
    requestedCompletedAt: number | null;
    requestedDuration: number | null;
    requestedActiveSection: z.infer<typeof updateWorkoutSessionInputSchema>['activeSection'];
  }) => {
    let nextTimeSegments = currentTimeSegments;
    let nextDuration = requestedDuration;

    if (requestedStatus === 'paused' && existingStatus !== 'in-progress') {
      return {
        ok: false as const,
        code: WORKOUT_SESSION_INVALID_TRANSITION_RESPONSE.code,
        message: WORKOUT_SESSION_INVALID_TRANSITION_RESPONSE.message,
        statusCode: 409,
      };
    }

    if (
      requestedStatus === 'in-progress' &&
      existingStatus !== 'paused' &&
      existingStatus !== 'in-progress' &&
      existingStatus !== 'scheduled'
    ) {
      return {
        ok: false as const,
        code: WORKOUT_SESSION_INVALID_TRANSITION_RESPONSE.code,
        message: WORKOUT_SESSION_INVALID_TRANSITION_RESPONSE.message,
        statusCode: 409,
      };
    }

    if (requestedStatus === 'completed' && existingStatus === 'cancelled') {
      return {
        ok: false as const,
        code: WORKOUT_SESSION_INVALID_TRANSITION_RESPONSE.code,
        message: WORKOUT_SESSION_INVALID_TRANSITION_RESPONSE.message,
        statusCode: 409,
      };
    }

    if (requestedStatus === 'cancelled' && existingStatus === 'completed') {
      return {
        ok: false as const,
        code: WORKOUT_SESSION_INVALID_TRANSITION_RESPONSE.code,
        message: WORKOUT_SESSION_INVALID_TRANSITION_RESPONSE.message,
        statusCode: 409,
      };
    }

    if (requestedStatus === 'paused' && existingStatus === 'in-progress') {
      nextTimeSegments = closeOpenTimeSegment(nextTimeSegments, nowIsoString());
      nextDuration = calculateActiveDuration(nextTimeSegments);
      return {
        ok: true as const,
        completedAt: null,
        duration: nextDuration,
        timeSegments: nextTimeSegments,
      };
    }

    if (requestedStatus === 'in-progress' && existingStatus === 'paused') {
      if (!requestedActiveSection) {
        return {
          ok: false as const,
          code: WORKOUT_SESSION_ACTIVE_SECTION_REQUIRED_RESPONSE.code,
          message: WORKOUT_SESSION_ACTIVE_SECTION_REQUIRED_RESPONSE.message,
          statusCode: 400,
        };
      }

      nextTimeSegments = openTimeSegment(nextTimeSegments, nowIsoString(), requestedActiveSection);
      return {
        ok: true as const,
        completedAt: null,
        duration: nextDuration,
        timeSegments: nextTimeSegments,
      };
    }

    if (requestedStatus === 'in-progress' && existingStatus === 'scheduled') {
      if (!requestedActiveSection) {
        return {
          ok: false as const,
          code: WORKOUT_SESSION_ACTIVE_SECTION_REQUIRED_RESPONSE.code,
          message: WORKOUT_SESSION_ACTIVE_SECTION_REQUIRED_RESPONSE.message,
          statusCode: 400,
        };
      }

      if (!nextTimeSegments.some((segment) => segment.end === null)) {
        nextTimeSegments = openTimeSegment(
          nextTimeSegments,
          nowIsoString(),
          requestedActiveSection,
        );
      }

      return {
        ok: true as const,
        completedAt: null,
        duration: nextDuration,
        timeSegments: nextTimeSegments,
      };
    }

    if (requestedStatus === 'cancelled' && existingStatus !== 'cancelled') {
      nextTimeSegments = closeOpenTimeSegment(nextTimeSegments, nowIsoString());
      nextDuration = calculateActiveDuration(nextTimeSegments);
      return {
        ok: true as const,
        completedAt: null,
        duration: nextDuration,
        timeSegments: nextTimeSegments,
      };
    }

    if (requestedStatus === 'completed' && existingStatus !== 'completed') {
      const completedAt = requestedCompletedAt ?? Date.now();
      nextTimeSegments = closeOpenTimeSegment(nextTimeSegments, toIsoString(completedAt));
      nextDuration = calculateActiveDuration(nextTimeSegments);
      return {
        ok: true as const,
        completedAt,
        duration: nextDuration,
        timeSegments: nextTimeSegments,
      };
    }

    if (requestedStatus === 'in-progress' && existingStatus === 'in-progress') {
      if (!requestedActiveSection) {
        return {
          ok: true as const,
          completedAt: requestedCompletedAt,
          duration: nextDuration,
          timeSegments: nextTimeSegments,
        };
      }

      const openSegment = findOpenTimeSegment(nextTimeSegments);
      if (openSegment && openSegment.segment.section !== requestedActiveSection) {
        return {
          ok: false as const,
          code: WORKOUT_SESSION_SECTION_SWITCH_REQUIRES_PAUSE_RESPONSE.code,
          message: WORKOUT_SESSION_SECTION_SWITCH_REQUIRES_PAUSE_RESPONSE.message,
          statusCode: 409,
        };
      }

      return {
        ok: true as const,
        completedAt: requestedCompletedAt,
        duration: nextDuration,
        timeSegments: nextTimeSegments,
      };
    }

    return {
      ok: true as const,
      completedAt: requestedCompletedAt,
      duration: nextDuration,
      timeSegments: nextTimeSegments,
    };
  };

  const updateSessionById = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as z.infer<typeof idParamsSchema>;
    const body = request.body as z.infer<typeof updateWorkoutSessionInputSchema>;

    if (body.startedAt !== undefined) {
      if (!isValidTimestamp(body.startedAt)) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid startedAt timestamp');
      }

      if (body.startedAt > Date.now()) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'startedAt cannot be in the future');
      }
    }

    const existingSession = await findWorkoutSessionById(params.id, request.userId);
    if (!existingSession) {
      return sendError(
        reply,
        404,
        WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
        WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
      );
    }

    let merged = toCreateWorkoutSessionInput(existingSession);
    if (body.sets !== undefined) {
      if (request.method === 'PUT') {
        merged = {
          ...merged,
          sets: body.sets,
        };
      } else {
        const setMap = new Map(
          merged.sets.map((set) => [`${set.exerciseId}:${set.setNumber}`, { ...set }]),
        );
        const exerciseOrder = new Map<string, number>();
        for (const set of merged.sets) {
          if (!exerciseOrder.has(set.exerciseId)) {
            exerciseOrder.set(set.exerciseId, exerciseOrder.size);
          }
        }

        for (const set of body.sets) {
          const exerciseId = set.exerciseId;
          if (!exerciseOrder.has(exerciseId)) {
            exerciseOrder.set(exerciseId, exerciseOrder.size);
          }

          const key = `${exerciseId}:${set.setNumber}`;
          const previous = setMap.get(key);

          if (previous) {
            setMap.set(key, {
              ...previous,
              weight: set.weight,
              reps: set.reps,
              completed: true,
              skipped: false,
            });
            continue;
          }

          setMap.set(key, {
            exerciseId,
            orderIndex: exerciseOrder.get(exerciseId) ?? 0,
            setNumber: set.setNumber,
            weight: set.weight,
            reps: set.reps,
            completed: true,
            skipped: false,
            supersetGroup: null,
            section: 'main',
            notes: null,
          });
        }

        merged = {
          ...merged,
          sets: Array.from(setMap.values()).sort((left, right) => {
            const leftOrder = exerciseOrder.get(left.exerciseId) ?? Number.MAX_SAFE_INTEGER;
            const rightOrder = exerciseOrder.get(right.exerciseId) ?? Number.MAX_SAFE_INTEGER;
            if (leftOrder !== rightOrder) {
              return leftOrder - rightOrder;
            }

            return left.setNumber - right.setNumber;
          }),
        };
      }
    }

    const referencedExerciseIds = [
      ...(body.sets?.map((set) => set.exerciseId) ?? []),
      ...(body.addExercises?.map((exercise) => exercise.exerciseId) ?? []),
      ...(body.exercises?.map((exercise) => exercise.exerciseId) ?? []),
    ];
    if (referencedExerciseIds.length > 0) {
      const invalidExerciseIds = await findInvalidSessionExerciseIds({
        userId: request.userId,
        exerciseIds: referencedExerciseIds,
      });
      if (invalidExerciseIds.length > 0) {
        return sendError(
          reply,
          400,
          INVALID_SESSION_EXERCISE_RESPONSE.code,
          buildInvalidExerciseMessage(invalidExerciseIds),
        );
      }
    }

    if (body.addExercises) {
      const exerciseSectionOrder = buildExerciseSectionOrder(merged.sets);
      const nextOrderIndexBySection = new Map<SessionSetInput['section'], number>();

      for (const metadata of exerciseSectionOrder.values()) {
        const current = nextOrderIndexBySection.get(metadata.section) ?? 0;
        nextOrderIndexBySection.set(metadata.section, Math.max(current, metadata.orderIndex + 1));
      }

      for (const exercise of body.addExercises) {
        const exerciseId = exercise.exerciseId;
        const targetSection = exercise.section;
        const exerciseSectionKey = toExerciseSectionKey(exerciseId, targetSection);
        const existingMetadata = exerciseSectionOrder.get(exerciseSectionKey);
        const orderIndex =
          existingMetadata?.orderIndex ?? nextOrderIndexBySection.get(targetSection) ?? 0;
        const maxSetNumber = merged.sets
          .filter((set) => set.exerciseId === exerciseId && set.section === targetSection)
          .reduce((maxValue, set) => Math.max(maxValue, set.setNumber), 0);

        for (let setOffset = 1; setOffset <= exercise.sets; setOffset += 1) {
          merged.sets.push({
            exerciseId,
            orderIndex,
            setNumber: maxSetNumber + setOffset,
            weight: exercise.weight ?? null,
            reps: exercise.reps ?? null,
            completed: false,
            skipped: false,
            supersetGroup: null,
            section: targetSection,
            notes: null,
          });
        }

        if (!existingMetadata) {
          exerciseSectionOrder.set(exerciseSectionKey, {
            section: targetSection,
            orderIndex,
          });
          nextOrderIndexBySection.set(targetSection, orderIndex + 1);
        }
      }
    }

    if (body.removeExercises) {
      const removeExerciseSectionKeys = new Set(
        body.removeExercises.map((exercise) =>
          toExerciseSectionKey(exercise.exerciseId, exercise.section),
        ),
      );
      const hasLoggedSets = merged.sets.some(
        (set) =>
          removeExerciseSectionKeys.has(toExerciseSectionKey(set.exerciseId, set.section)) &&
          set.completed,
      );
      if (hasLoggedSets && !body.force) {
        return sendError(
          reply,
          409,
          WORKOUT_SESSION_EXERCISE_HAS_LOGGED_SETS_RESPONSE.code,
          WORKOUT_SESSION_EXERCISE_HAS_LOGGED_SETS_RESPONSE.message,
        );
      }

      merged = {
        ...merged,
        sets: merged.sets.filter(
          (set) =>
            !removeExerciseSectionKeys.has(toExerciseSectionKey(set.exerciseId, set.section)),
        ),
      };
    }

    if (body.reorderExercises) {
      const currentExerciseIds = new Set(merged.sets.map((set) => set.exerciseId));
      const hasUnknownExercise = body.reorderExercises.some(
        (exerciseId) => !currentExerciseIds.has(exerciseId),
      );
      if (hasUnknownExercise) {
        return sendError(
          reply,
          400,
          'VALIDATION_ERROR',
          'reorderExercises contains unknown exercise ids',
        );
      }

      merged = {
        ...merged,
        sets: reorderSessionSetsByExercise(merged.sets, body.reorderExercises),
      };
    }

    if (body.exercises) {
      const currentExerciseIds = new Set(merged.sets.map((set) => set.exerciseId));
      const hasUnknownExercise = body.exercises.some(
        (exercise) => !currentExerciseIds.has(exercise.exerciseId),
      );
      if (hasUnknownExercise) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'exercises contains unknown exercise ids');
      }

      const supersetGroupEntries = body.exercises.flatMap((exercise) =>
        exercise.supersetGroup === undefined
          ? []
          : ([[exercise.exerciseId, exercise.supersetGroup]] as const),
      );
      const supersetGroupByExerciseId = new Map(supersetGroupEntries);
      merged = {
        ...merged,
        sets: merged.sets.map((set) =>
          supersetGroupByExerciseId.has(set.exerciseId)
            ? {
                ...set,
                supersetGroup: supersetGroupByExerciseId.get(set.exerciseId) ?? null,
              }
            : set,
        ),
      };
    }

    const { exerciseNotes, ...baseUpdates } = body;
    const basePayload: CreateWorkoutSessionInput = {
      ...merged,
      ...baseUpdates,
      sets: merged.sets,
    };

    if (
      body.startedAt !== undefined &&
      basePayload.timeSegments.length > 0 &&
      basePayload.timeSegments[0].start !== toIsoString(body.startedAt)
    ) {
      basePayload.timeSegments = [
        { ...basePayload.timeSegments[0], start: toIsoString(body.startedAt) },
        ...basePayload.timeSegments.slice(1),
      ];
    }

    const transitionStatus = body.status ?? existingSession.status;
    const transitionResult = resolveSessionTransition({
      existingStatus: existingSession.status,
      requestedStatus: transitionStatus,
      currentTimeSegments: basePayload.timeSegments,
      requestedCompletedAt: basePayload.completedAt,
      requestedDuration: basePayload.duration,
      requestedActiveSection: body.activeSection,
    });
    if (!transitionResult.ok) {
      return sendError(
        reply,
        transitionResult.statusCode,
        transitionResult.code,
        transitionResult.message,
      );
    }

    const mergedPayload = createWorkoutSessionInputSchema.safeParse({
      ...basePayload,
      completedAt: transitionResult.completedAt,
      duration: transitionResult.duration,
      status: transitionStatus,
      timeSegments: transitionResult.timeSegments,
    });
    if (!mergedPayload.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
    }

    const input =
      exerciseNotes && Object.keys(exerciseNotes).length > 0
        ? {
            ...mergedPayload.data,
            sets: applyExerciseNotesToSets({
              sets: mergedPayload.data.sets,
              exerciseNotes,
            }),
          }
        : mergedPayload.data;

    if (input.templateId !== null) {
      const templateAccessible = await templateBelongsToUser(input.templateId, request.userId);
      if (!templateAccessible) {
        return sendError(
          reply,
          404,
          WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
          WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
        );
      }
    }

    const session = await updateWorkoutSession({
      id: params.id,
      userId: request.userId,
      input,
    });
    if (!session) {
      return sendError(
        reply,
        404,
        WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
        WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
      );
    }

    setAgentEnrichmentContext(request, {
      endpoint: 'workout-session.mutation',
      action: 'update',
      session,
    });

    return reply.send({
      data: session,
    });
  };

  typedApp.patch(
    '/:id/time-segments',
    {
      schema: {
        params: idParamsSchema,
        body: updateWorkoutSessionTimeSegmentsInputSchema,
        response: {
          200: apiDataResponseSchema(workoutSessionSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'Replace workout session time segments',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const existingSession = await findWorkoutSessionById(request.params.id, request.userId);
      if (!existingSession) {
        return sendError(
          reply,
          404,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
        );
      }

      const payload = createWorkoutSessionInputSchema.safeParse({
        ...toCreateWorkoutSessionInput(existingSession),
        duration: calculateActiveDuration(request.body.timeSegments),
        timeSegments: request.body.timeSegments,
      });
      if (!payload.success) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
      }

      const updated = await updateWorkoutSession({
        id: request.params.id,
        userId: request.userId,
        input: payload.data,
      });
      if (!updated) {
        return sendError(
          reply,
          404,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
        );
      }

      return reply.send(
        buildDataResponse(request, updated, {
          endpoint: 'workout-session.mutation',
          action: 'time-segments',
          session: updated,
        }),
      );
    },
  );

  typedApp.patch(
    '/:id/section-timer',
    {
      schema: {
        params: idParamsSchema,
        body: updateWorkoutSessionSectionTimerInputSchema,
        response: {
          200: apiDataResponseSchema(workoutSessionSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'Start or pause a workout section timer',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const existingSession = await findWorkoutSessionById(request.params.id, request.userId);
      if (!existingSession) {
        return sendError(
          reply,
          404,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
        );
      }

      if (existingSession.status !== 'in-progress') {
        return sendError(
          reply,
          409,
          WORKOUT_SESSION_SECTION_TIMER_REQUIRES_IN_PROGRESS_RESPONSE.code,
          WORKOUT_SESSION_SECTION_TIMER_REQUIRES_IN_PROGRESS_RESPONSE.message,
        );
      }

      const basePayload = toCreateWorkoutSessionInput(existingSession);
      const actionedAt = nowIsoString();
      const openSegment = findOpenTimeSegment(basePayload.timeSegments);
      let nextTimeSegments = basePayload.timeSegments;

      if (request.body.action === 'start') {
        nextTimeSegments = closeOpenTimeSegment(nextTimeSegments, actionedAt);
        nextTimeSegments = openTimeSegment(nextTimeSegments, actionedAt, request.body.section);
      } else {
        if (!openSegment || openSegment.segment.section !== request.body.section) {
          return sendError(
            reply,
            409,
            WORKOUT_SESSION_SECTION_TIMER_PAUSE_MISMATCH_RESPONSE.code,
            WORKOUT_SESSION_SECTION_TIMER_PAUSE_MISMATCH_RESPONSE.message,
          );
        }

        nextTimeSegments = closeOpenTimeSegment(nextTimeSegments, actionedAt);
      }

      const payload = createWorkoutSessionInputSchema.safeParse({
        ...basePayload,
        status: 'in-progress',
        timeSegments: nextTimeSegments,
        duration: calculateActiveDuration(nextTimeSegments),
      });
      if (!payload.success) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
      }

      const updated = await updateWorkoutSession({
        id: request.params.id,
        userId: request.userId,
        input: payload.data,
      });
      if (!updated) {
        return sendError(
          reply,
          404,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
        );
      }

      return reply.send(
        buildDataResponse(request, updated, {
          endpoint: 'workout-session.mutation',
          action: 'section-timer',
          session: updated,
        }),
      );
    },
  );

  typedApp.patch(
    '/:id/reorder',
    {
      schema: {
        params: idParamsSchema,
        body: reorderWorkoutSessionExercisesInputSchema,
        response: {
          200: apiDataResponseSchema(workoutSessionSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'Reorder exercises in a workout session section',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const existingSession = await findWorkoutSessionById(request.params.id, request.userId);
      if (!existingSession) {
        return sendError(
          reply,
          404,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
        );
      }

      if (existingSession.status !== 'in-progress' && existingSession.status !== 'paused') {
        return sendError(
          reply,
          409,
          WORKOUT_SESSION_NOT_ACTIVE_RESPONSE.code,
          WORKOUT_SESSION_NOT_ACTIVE_RESPONSE.message,
        );
      }

      const currentExerciseIds = Array.from(
        new Set(
          existingSession.sets
            .filter((set) => set.section === request.body.section)
            .sort((left, right) => {
              if ((left.orderIndex ?? 0) !== (right.orderIndex ?? 0)) {
                return (left.orderIndex ?? 0) - (right.orderIndex ?? 0);
              }

              return (left.exerciseId ?? '').localeCompare(right.exerciseId ?? '');
            })
            .map((set) => set.exerciseId)
            .filter((exerciseId): exerciseId is string => typeof exerciseId === 'string'),
        ),
      );
      const requestedIds = request.body.exerciseIds;
      const hasSameMembership =
        currentExerciseIds.length === requestedIds.length &&
        currentExerciseIds.every((exerciseId) => requestedIds.includes(exerciseId));
      if (!hasSameMembership) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
      }

      const reordered = await reorderWorkoutSessionExercises({
        sessionId: request.params.id,
        userId: request.userId,
        section: request.body.section,
        exerciseIds: requestedIds,
      });
      if (!reordered) {
        return sendError(
          reply,
          404,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
        );
      }

      return reply.send(
        buildDataResponse(request, reordered, {
          endpoint: 'workout-session.mutation',
          action: 'reorder',
          session: reordered,
        }),
      );
    },
  );

  typedApp.patch(
    '/:id/exercises/:exerciseId/swap',
    {
      schema: {
        params: sessionExerciseParamsSchema,
        body: swapWorkoutSessionExerciseInputSchema,
        response: {
          200: swapWorkoutSessionResponseSchema,
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'Swap an exercise in a workout session',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const existingSession = await findWorkoutSessionById(request.params.id, request.userId);
      if (!existingSession) {
        return sendError(
          reply,
          404,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
        );
      }

      if (
        existingSession.status !== 'scheduled' &&
        existingSession.status !== 'in-progress' &&
        existingSession.status !== 'paused'
      ) {
        return sendError(
          reply,
          409,
          WORKOUT_SESSION_NOT_SWAPPABLE_RESPONSE.code,
          WORKOUT_SESSION_NOT_SWAPPABLE_RESPONSE.message,
        );
      }

      const sessionExercises = existingSession.exercises ?? [];

      const existingExercise = sessionExercises.find(
        (exercise) => exercise.exerciseId === request.params.exerciseId,
      );
      if (!existingExercise) {
        return sendError(
          reply,
          404,
          WORKOUT_SESSION_EXERCISE_NOT_FOUND_RESPONSE.code,
          WORKOUT_SESSION_EXERCISE_NOT_FOUND_RESPONSE.message,
        );
      }

      if (
        request.params.exerciseId !== request.body.newExerciseId &&
        sessionExercises.some((exercise) => exercise.exerciseId === request.body.newExerciseId)
      ) {
        return sendError(
          reply,
          409,
          WORKOUT_SESSION_DUPLICATE_EXERCISE_RESPONSE.code,
          WORKOUT_SESSION_DUPLICATE_EXERCISE_RESPONSE.message,
        );
      }

      const hasValidSwapTarget = await allRelatedExercisesOwned({
        userId: request.userId,
        exerciseIds: [request.body.newExerciseId],
      });
      if (!hasValidSwapTarget) {
        return sendError(
          reply,
          400,
          INVALID_SESSION_EXERCISE_RESPONSE.code,
          INVALID_SESSION_EXERCISE_RESPONSE.message,
        );
      }

      const swapped = await swapWorkoutSessionExercise({
        sessionId: request.params.id,
        userId: request.userId,
        exerciseId: request.params.exerciseId,
        newExerciseId: request.body.newExerciseId,
      });
      if (!swapped) {
        return sendError(
          reply,
          404,
          WORKOUT_SESSION_EXERCISE_NOT_FOUND_RESPONSE.code,
          WORKOUT_SESSION_EXERCISE_NOT_FOUND_RESPONSE.message,
        );
      }

      const swappedExercises = swapped.exercises ?? [];
      const swappedExercise = swappedExercises.find(
        (exercise) => exercise.exerciseId === request.body.newExerciseId,
      );
      const hasTrackingTypeWarning =
        swappedExercise?.trackingType !== undefined &&
        existingExercise.trackingType !== swappedExercise.trackingType;

      return reply.send({
        ...buildDataResponse(request, swapped, {
          endpoint: 'workout-session.mutation',
          action: 'swap',
          session: swapped,
        }),
        ...(hasTrackingTypeWarning
          ? {
              meta: {
                warning:
                  'Swapped to an exercise with a different tracking type. Review entered sets and targets.',
              },
            }
          : {}),
      });
    },
  );

  typedApp.put(
    '/:id',
    {
      preHandler: agentRequestTransform,
      onSend: agentEnrichmentOnSend,
      schema: {
        params: idParamsSchema,
        body: updateWorkoutSessionInputSchema,
        response: {
          200: apiDataResponseSchema(workoutSessionSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'Replace a workout session',
        security: authSecurity,
      },
    },
    updateSessionById,
  );

  typedApp.patch(
    '/:id',
    {
      preHandler: agentRequestTransform,
      onSend: agentEnrichmentOnSend,
      schema: {
        params: idParamsSchema,
        body: updateWorkoutSessionInputSchema,
        response: {
          200: apiDataResponseSchema(workoutSessionSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'Update a workout session',
        security: authSecurity,
      },
    },
    updateSessionById,
  );

  const cancelSessionResponseSchema = z.object({
    revertedToSchedule: z.boolean(),
  });

  typedApp.post(
    '/:id/cancel',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(cancelSessionResponseSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'Cancel a workout session, reverting to scheduled if applicable',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const session = await findWorkoutSessionAccess(request.params.id, request.userId);
      if (!session) {
        return sendError(
          reply,
          404,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
        );
      }

      if (session.status !== 'in-progress' && session.status !== 'paused') {
        return sendError(
          reply,
          409,
          WORKOUT_SESSION_NOT_ACTIVE_RESPONSE.code,
          'Only in-progress or paused sessions can be cancelled',
        );
      }

      const linkedScheduledWorkout = await findScheduledWorkoutBySessionId(
        request.params.id,
        request.userId,
      );

      if (linkedScheduledWorkout) {
        await unlinkScheduledWorkoutSession(linkedScheduledWorkout.id, request.userId);
        await hardDeleteWorkoutSession(request.params.id, request.userId);

        return reply.send({
          data: { revertedToSchedule: true },
        });
      }

      await deleteWorkoutSession(request.params.id, request.userId);

      return reply.send({
        data: { revertedToSchedule: false },
      });
    },
  );

  typedApp.delete(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(successFlagSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['workout-sessions'],
        summary: 'Delete a workout session',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const linkedScheduledWorkout = await findScheduledWorkoutBySessionId(
        request.params.id,
        request.userId,
      );
      if (linkedScheduledWorkout) {
        await deleteScheduledWorkout(linkedScheduledWorkout.id, request.userId);
      }

      const deleted = await deleteWorkoutSession(request.params.id, request.userId);
      if (!deleted) {
        return sendError(
          reply,
          404,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
        );
      }

      return reply.send({
        data: {
          success: true,
        },
      });
    },
  );
};
