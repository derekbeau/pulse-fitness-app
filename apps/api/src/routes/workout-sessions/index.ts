import { randomUUID } from 'node:crypto';

import {
  agentCreateWorkoutSessionInputSchema,
  agentUpdateWorkoutSessionInputSchema,
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
import { buildDataResponse } from '../../middleware/agent-enrichment.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
  opaqueIdParamSchema,
  successFlagSchema,
} from '../../openapi.js';
import { allRelatedExercisesOwned } from '../exercises/store.js';
import { linkTodayScheduledWorkoutToSession } from '../scheduled-workouts/store.js';
import { templateBelongsToUser } from '../workout-templates/template-access.js';
import {
  applyExerciseNotesToSets,
  buildExerciseSectionOrder,
  buildInitialSessionSets,
  reorderSessionSetsByExercise,
  resolveExerciseIdByName,
} from '../workout-agent.js';

import {
  applySessionCorrections,
  batchUpsertSessionSets,
  createSessionSet,
  createWorkoutSession,
  deleteWorkoutSession,
  findInvalidSessionExerciseIds,
  findWorkoutSessionAccess,
  findWorkoutSessionById,
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
import { calculateActiveDuration, closeOpenTimeSegment, openTimeSegment } from './time-segments.js';

const createWorkoutSessionRequestSchema = z.union([
  createWorkoutSessionInputSchema.transform((data) => ({
    mode: 'standard' as const,
    data,
  })),
  agentCreateWorkoutSessionInputSchema.transform((data) => ({
    mode: 'agent' as const,
    data,
  })),
]);

const updateWorkoutSessionRequestSchema = z.union([
  updateWorkoutSessionInputSchema.transform((data) => ({
    mode: 'standard' as const,
    data,
  })),
  agentUpdateWorkoutSessionInputSchema.transform((data) => ({
    mode: 'agent' as const,
    data,
  })),
]);

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
  exerciseId: z.string(),
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
  message: 'Workout session corrections must include weight or reps. Set-level RPE corrections are not persisted yet',
} as const;

const toCreateWorkoutSessionInput = (
  session: Awaited<ReturnType<typeof findWorkoutSessionById>>,
): CreateWorkoutSessionInput => {
  if (!session) {
    throw new Error('Workout session must exist to build an update payload');
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
    sets: session.sets.map((set) => ({
      exerciseId: set.exerciseId,
      orderIndex: set.orderIndex ?? 0,
      setNumber: set.setNumber,
      weight: set.weight,
      reps: set.reps,
      completed: set.completed,
      skipped: set.skipped,
      section: set.section,
      notes: set.notes,
    })),
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
      schema: {
        body: createWorkoutSessionRequestSchema,
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
      if (isAgentRequest(request) && request.body.mode !== 'agent') {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
      }

      if (!isAgentRequest(request) && request.body.mode !== 'standard') {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
      }

      if (request.body.mode === 'agent') {
        const startedAt = Date.now();
        const date = new Date(startedAt).toISOString().slice(0, 10);
        const templateId = request.body.data.templateId ?? null;
        let name = request.body.data.name;
        let sets: CreateWorkoutSessionInput['sets'] = [];

        if (templateId) {
          const { findWorkoutTemplateById } = await import('../workout-templates/store.js');
          const template = await findWorkoutTemplateById(templateId, request.userId);
          if (!template) {
            return sendError(
              reply,
              404,
              WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
              WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
            );
          }

          name = name ?? template.name;
          sets = buildInitialSessionSets(template.sections);
        }

        const payload = createWorkoutSessionInputSchema.safeParse({
          templateId,
          name,
          date,
          status: 'in-progress',
          startedAt,
          completedAt: null,
          duration: null,
          feedback: null,
          notes: null,
          sets,
        });
        if (!payload.success) {
          return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
        }

        const session = await createWorkoutSession({
          id: randomUUID(),
          userId: request.userId,
          input: payload.data,
        });

        if (payload.data.templateId !== null) {
          await linkTodayScheduledWorkoutToSession({
            userId: request.userId,
            templateId: payload.data.templateId,
            date: payload.data.date,
            sessionId: session.id,
          });
        }

        return reply.code(201).send(
          buildDataResponse(request, session, {
            endpoint: 'workout-session.mutation',
            action: 'create',
            session,
          }),
        );
      }

      if (request.body.data.templateId !== null) {
        const templateAccessible = await templateBelongsToUser(
          request.body.data.templateId,
          request.userId,
        );
        if (!templateAccessible) {
          return sendError(
            reply,
            404,
            WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
            WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
          );
        }
      }

      const invalidExerciseIds = await findInvalidSessionExerciseIds({
        userId: request.userId,
        exerciseIds: getReferencedExerciseIds(request.body.data.sets),
      });
      if (invalidExerciseIds.length > 0) {
        return sendError(
          reply,
          400,
          INVALID_SESSION_EXERCISE_RESPONSE.code,
          buildInvalidExerciseMessage(invalidExerciseIds),
        );
      }

      const inputWithInitialSegment =
        request.body.data.status === 'in-progress' && request.body.data.timeSegments.length === 0
          ? {
              ...request.body.data,
              timeSegments: [{ start: toIsoString(request.body.data.startedAt), end: null }],
            }
          : request.body.data;

      const session = await createWorkoutSession({
        id: randomUUID(),
        userId: request.userId,
        input: inputWithInitialSegment,
      });

      if (inputWithInitialSegment.templateId !== null) {
        await linkTodayScheduledWorkoutToSession({
          userId: request.userId,
          templateId: inputWithInitialSegment.templateId,
          date: inputWithInitialSegment.date,
          sessionId: session.id,
        });
      }

      return reply.code(201).send(buildDataResponse(request, session));
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
  }: {
    existingStatus: CreateWorkoutSessionInput['status'];
    requestedStatus: CreateWorkoutSessionInput['status'];
    currentTimeSegments: CreateWorkoutSessionInput['timeSegments'];
    requestedCompletedAt: number | null;
    requestedDuration: number | null;
  }) => {
    let nextTimeSegments = currentTimeSegments;
    let nextDuration = requestedDuration;

    if (requestedStatus === 'paused' && existingStatus !== 'in-progress') {
      return {
        ok: false as const,
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
      };
    }

    if (requestedStatus === 'completed' && existingStatus === 'cancelled') {
      return {
        ok: false as const,
      };
    }

    if (requestedStatus === 'cancelled' && existingStatus === 'completed') {
      return {
        ok: false as const,
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
      nextTimeSegments = openTimeSegment(nextTimeSegments, nowIsoString());
      return {
        ok: true as const,
        completedAt: null,
        duration: nextDuration,
        timeSegments: nextTimeSegments,
      };
    }

    if (requestedStatus === 'in-progress' && existingStatus === 'scheduled') {
      if (!nextTimeSegments.some((segment) => segment.end === null)) {
        nextTimeSegments = openTimeSegment(nextTimeSegments, nowIsoString());
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

    return {
      ok: true as const,
      completedAt: requestedCompletedAt,
      duration: nextDuration,
      timeSegments: nextTimeSegments,
    };
  };

  const updateSessionById = async (
    request: FastifyRequest<{
      Body: z.infer<typeof updateWorkoutSessionRequestSchema>;
      Params: z.infer<typeof idParamsSchema>;
    }>,
    reply: FastifyReply,
  ) => {
    if (request.authType === 'agent-token') {
      if (request.body.mode !== 'agent') {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
      }

      const existingSession = await findWorkoutSessionById(request.params.id, request.userId);
      if (!existingSession) {
        return sendError(
          reply,
          404,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
        );
      }

      const merged = toCreateWorkoutSessionInput(existingSession);

      if (request.body.data.sets) {
        const setMap = new Map(
          merged.sets.map((set) => [`${set.exerciseId}:${set.setNumber}`, { ...set }]),
        );
        const exerciseOrder = new Map<string, number>();
        for (const set of merged.sets) {
          if (!exerciseOrder.has(set.exerciseId)) {
            exerciseOrder.set(set.exerciseId, exerciseOrder.size);
          }
        }

        for (const set of request.body.data.sets) {
          const resolvedExercise = await resolveExerciseIdByName({
            name: set.exerciseName,
            userId: request.userId,
          });
          const exerciseId = resolvedExercise.exerciseId;
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
            section: null,
            notes: null,
          });
        }

        merged.sets = Array.from(setMap.values()).sort((left, right) => {
          const leftOrder = exerciseOrder.get(left.exerciseId) ?? Number.MAX_SAFE_INTEGER;
          const rightOrder = exerciseOrder.get(right.exerciseId) ?? Number.MAX_SAFE_INTEGER;
          if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
          }

          return left.setNumber - right.setNumber;
        });
      }

      if (request.body.data.addExercises) {
        const exerciseSectionOrder = buildExerciseSectionOrder(merged.sets);
        const nextOrderIndexBySection = new Map<SessionSetInput['section'], number>();

        for (const metadata of exerciseSectionOrder.values()) {
          const current = nextOrderIndexBySection.get(metadata.section) ?? 0;
          nextOrderIndexBySection.set(metadata.section, Math.max(current, metadata.orderIndex + 1));
        }

        for (const exercise of request.body.data.addExercises) {
          const resolvedExercise = await resolveExerciseIdByName({
            name: exercise.name,
            userId: request.userId,
          });
          const existingMetadata = exerciseSectionOrder.get(resolvedExercise.exerciseId);
          const targetSection = existingMetadata?.section ?? exercise.section;
          const orderIndex =
            existingMetadata?.orderIndex ?? nextOrderIndexBySection.get(targetSection) ?? 0;
          const maxSetNumber = merged.sets
            .filter((set) => set.exerciseId === resolvedExercise.exerciseId)
            .reduce((maxValue, set) => Math.max(maxValue, set.setNumber), 0);

          for (let setOffset = 1; setOffset <= exercise.sets; setOffset += 1) {
            merged.sets.push({
              exerciseId: resolvedExercise.exerciseId,
              orderIndex,
              setNumber: maxSetNumber + setOffset,
              weight: exercise.weight ?? null,
              reps: exercise.reps ?? null,
              completed: false,
              skipped: false,
              section: targetSection,
              notes: null,
            });
          }

          if (!existingMetadata) {
            exerciseSectionOrder.set(resolvedExercise.exerciseId, {
              section: targetSection,
              orderIndex,
            });
            nextOrderIndexBySection.set(targetSection, orderIndex + 1);
          }
        }
      }

      if (request.body.data.removeExercises) {
        const removeExerciseIds = new Set(request.body.data.removeExercises);
        const hasLoggedSets = merged.sets.some(
          (set) => removeExerciseIds.has(set.exerciseId) && set.completed,
        );
        if (hasLoggedSets) {
          return sendError(
            reply,
            409,
            WORKOUT_SESSION_EXERCISE_HAS_LOGGED_SETS_RESPONSE.code,
            WORKOUT_SESSION_EXERCISE_HAS_LOGGED_SETS_RESPONSE.message,
          );
        }

        merged.sets = merged.sets.filter((set) => !removeExerciseIds.has(set.exerciseId));
      }

      if (request.body.data.reorderExercises) {
        const currentExerciseIds = new Set(merged.sets.map((set) => set.exerciseId));
        const hasUnknownExercise = request.body.data.reorderExercises.some(
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

        merged.sets = reorderSessionSetsByExercise(merged.sets, request.body.data.reorderExercises);
      }

      if (request.body.data.status !== undefined) {
        merged.status = request.body.data.status;
        if (request.body.data.status === 'completed') {
          const completedAt = Date.now();
          merged.completedAt = completedAt;
          merged.duration = Math.max(0, completedAt - merged.startedAt);
        } else {
          merged.completedAt = null;
          merged.duration = null;
        }
      }

      if (request.body.data.notes !== undefined) {
        merged.notes = request.body.data.notes;
      }

      const payload = createWorkoutSessionInputSchema.safeParse(merged);
      if (!payload.success) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
      }

      const session = await updateWorkoutSession({
        id: request.params.id,
        userId: request.userId,
        input: payload.data,
      });
      if (!session) {
        return sendError(
          reply,
          404,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
          WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
        );
      }

      return reply.send(
        buildDataResponse(request, session, {
          endpoint: 'workout-session.mutation',
          action: 'update',
          session,
        }),
      );
    }

    if (request.body.mode !== 'standard') {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
    }

    if (request.body.data.startedAt !== undefined) {
      if (!isValidTimestamp(request.body.data.startedAt)) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid startedAt timestamp');
      }

      if (request.body.data.startedAt > Date.now()) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'startedAt cannot be in the future');
      }
    }

    const existingSession = await findWorkoutSessionById(request.params.id, request.userId);
    if (!existingSession) {
      return sendError(
        reply,
        404,
        WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
        WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
      );
    }

    const basePayload = {
      ...toCreateWorkoutSessionInput(existingSession),
      ...request.body.data,
    };

    if (
      request.body.data.startedAt !== undefined &&
      basePayload.timeSegments.length > 0 &&
      basePayload.timeSegments[0].start !== toIsoString(request.body.data.startedAt)
    ) {
      basePayload.timeSegments = [
        { ...basePayload.timeSegments[0], start: toIsoString(request.body.data.startedAt) },
        ...basePayload.timeSegments.slice(1),
      ];
    }

    const transitionStatus = request.body.data.status ?? existingSession.status;
    const transitionResult = resolveSessionTransition({
      existingStatus: existingSession.status,
      requestedStatus: transitionStatus,
      currentTimeSegments: basePayload.timeSegments,
      requestedCompletedAt: basePayload.completedAt,
      requestedDuration: basePayload.duration,
    });
    if (!transitionResult.ok) {
      return sendError(
        reply,
        409,
        WORKOUT_SESSION_INVALID_TRANSITION_RESPONSE.code,
        WORKOUT_SESSION_INVALID_TRANSITION_RESPONSE.message,
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
      request.body.data.exerciseNotes && Object.keys(request.body.data.exerciseNotes).length > 0
        ? {
            ...mergedPayload.data,
            sets: applyExerciseNotesToSets({
              sets: mergedPayload.data.sets,
              exerciseNotes: request.body.data.exerciseNotes,
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

    if (request.body.data.sets !== undefined) {
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
    }

    const session = await updateWorkoutSession({
      id: request.params.id,
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

    return reply.send(
      buildDataResponse(request, session, {
        endpoint: 'workout-session.mutation',
        action: 'update',
        session,
      }),
    );
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

              return left.exerciseId.localeCompare(right.exerciseId);
            })
            .map((set) => set.exerciseId),
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
      schema: {
        params: idParamsSchema,
        body: updateWorkoutSessionRequestSchema,
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
      schema: {
        params: idParamsSchema,
        body: updateWorkoutSessionRequestSchema,
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
