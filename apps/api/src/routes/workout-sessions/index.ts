import { randomUUID } from 'node:crypto';

import {
  batchUpsertSetsSchema,
  createSetSchema,
  saveWorkoutSessionAsTemplateInputSchema,
  createWorkoutSessionInputSchema,
  type CreateWorkoutSessionInput,
  type SessionSetInput,
  updateSetSchema,
  updateWorkoutSessionInputSchema,
  updateWorkoutSessionTimeSegmentsInputSchema,
  workoutSessionQueryParamsSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireUserAuth } from '../../middleware/auth.js';
import { templateBelongsToUser } from '../workout-templates/template-access.js';

import {
  allSessionExercisesAccessible,
  batchUpsertSessionSets,
  createSessionSet,
  createWorkoutSession,
  deleteWorkoutSession,
  findWorkoutSessionAccess,
  findWorkoutSessionById,
  listSessionSetGroups,
  SessionSetNotFoundError,
  listWorkoutSessions,
  saveCompletedSessionAsTemplate,
  updateSessionSet,
  updateWorkoutSession,
} from './store.js';
import { calculateActiveDuration, closeOpenTimeSegment, openTimeSegment } from './time-segments.js';

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

const WORKOUT_SESSION_INVALID_TRANSITION_RESPONSE = {
  code: 'WORKOUT_SESSION_INVALID_TRANSITION',
  message: 'Invalid workout session status transition',
} as const;

const SESSION_SET_NOT_FOUND_RESPONSE = {
  code: 'SESSION_SET_NOT_FOUND',
  message: 'Session set not found',
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

const applyExerciseNotesToSets = ({
  sets,
  exerciseNotes,
}: {
  sets: SessionSetInput[];
  exerciseNotes: Record<string, string | null>;
}) => {
  const firstSetIndexByExerciseId = new Map<string, number>();

  sets.forEach((set, index) => {
    const existingIndex = firstSetIndexByExerciseId.get(set.exerciseId);
    if (existingIndex === undefined) {
      firstSetIndexByExerciseId.set(set.exerciseId, index);
      return;
    }

    const existingSet = sets[existingIndex];
    if (!existingSet) {
      return;
    }

    if (set.setNumber < existingSet.setNumber) {
      firstSetIndexByExerciseId.set(set.exerciseId, index);
    }
  });

  return sets.map((set, index) => {
    const nextExerciseNote = exerciseNotes[set.exerciseId];

    if (
      firstSetIndexByExerciseId.get(set.exerciseId) !== index ||
      !Object.hasOwn(exerciseNotes, set.exerciseId) ||
      nextExerciseNote === null
    ) {
      return set;
    }

    return {
      ...set,
      notes: nextExerciseNote,
    };
  });
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
  app.addHook('onRequest', requireUserAuth);

  app.post('/', async (request, reply) => {
    const parsedBody = createWorkoutSessionInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
    }

    if (parsedBody.data.templateId !== null) {
      const templateAccessible = await templateBelongsToUser(
        parsedBody.data.templateId,
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

    const exercisesAccessible = await allSessionExercisesAccessible({
      userId: request.userId,
      exerciseIds: getReferencedExerciseIds(parsedBody.data.sets),
    });
    if (!exercisesAccessible) {
      return sendError(
        reply,
        400,
        INVALID_SESSION_EXERCISE_RESPONSE.code,
        INVALID_SESSION_EXERCISE_RESPONSE.message,
      );
    }

    const inputWithInitialSegment =
      parsedBody.data.status === 'in-progress' && parsedBody.data.timeSegments.length === 0
        ? {
            ...parsedBody.data,
            timeSegments: [{ start: toIsoString(parsedBody.data.startedAt), end: null }],
          }
        : parsedBody.data;

    const session = await createWorkoutSession({
      id: randomUUID(),
      userId: request.userId,
      input: inputWithInitialSegment,
    });

    return reply.code(201).send({
      data: session,
    });
  });

  app.get('/', async (request, reply) => {
    const parsedQuery = workoutSessionQueryParamsSchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session query');
    }

    const sessions = await listWorkoutSessions({
      userId: request.userId,
      ...parsedQuery.data,
    });

    return reply.send({
      data: sessions,
    });
  });

  app.post<{ Params: { sessionId: string } }>('/:sessionId/sets', async (request, reply) => {
    const parsedBody = createSetSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid session set payload');
    }

    const session = await ensureOwnedActiveSession({
      sessionId: request.params.sessionId,
      userId: request.userId,
      reply,
    });
    if (!session) {
      return reply;
    }

    const exerciseAccessible = await allSessionExercisesAccessible({
      userId: request.userId,
      exerciseIds: [parsedBody.data.exerciseId],
    });
    if (!exerciseAccessible) {
      return sendError(
        reply,
        400,
        INVALID_SESSION_EXERCISE_RESPONSE.code,
        INVALID_SESSION_EXERCISE_RESPONSE.message,
      );
    }

    const set = await createSessionSet({
      id: randomUUID(),
      sessionId: session.id,
      input: parsedBody.data,
    });

    return reply.code(201).send({
      data: set,
    });
  });

  app.patch<{ Params: { sessionId: string; setId: string } }>(
    '/:sessionId/sets/:setId',
    async (request, reply) => {
      const parsedBody = updateSetSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid session set payload');
      }

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
        input: parsedBody.data,
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

  app.get<{ Params: { sessionId: string } }>('/:sessionId/sets', async (request, reply) => {
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
  });

  app.put<{ Params: { sessionId: string } }>('/:sessionId/sets', async (request, reply) => {
    const parsedBody = batchUpsertSetsSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid session set payload');
    }

    const session = await ensureOwnedActiveSession({
      sessionId: request.params.sessionId,
      userId: request.userId,
      reply,
    });
    if (!session) {
      return reply;
    }

    const exercisesAccessible = await allSessionExercisesAccessible({
      userId: request.userId,
      exerciseIds: parsedBody.data.sets.map((set) => set.exerciseId),
    });
    if (!exercisesAccessible) {
      return sendError(
        reply,
        400,
        INVALID_SESSION_EXERCISE_RESPONSE.code,
        INVALID_SESSION_EXERCISE_RESPONSE.message,
      );
    }

    try {
      const groupedSets = await batchUpsertSessionSets({
        sessionId: session.id,
        input: parsedBody.data,
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
  });

  app.post<{ Params: { id: string } }>('/:id/save-as-template', async (request, reply) => {
    const parsedBody = saveWorkoutSessionAsTemplateInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid save as template payload');
    }

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
      input: parsedBody.data,
      session,
      userId: request.userId,
    });

    return reply.code(201).send({
      data: template,
    });
  });

  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
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
  });

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
    request: { body: unknown; params: { id: string }; userId: string },
    reply: FastifyReply,
  ) => {
    const parsedBody = updateWorkoutSessionInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
    }

    if (parsedBody.data.startedAt !== undefined) {
      if (!isValidTimestamp(parsedBody.data.startedAt)) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid startedAt timestamp');
      }

      if (parsedBody.data.startedAt > Date.now()) {
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

    if (existingSession.status === 'completed' && parsedBody.data.status === 'in-progress') {
      return sendError(
        reply,
        409,
        WORKOUT_SESSION_NOT_ACTIVE_RESPONSE.code,
        'Cannot revert a completed session',
      );
    }

    const basePayload = {
      ...toCreateWorkoutSessionInput(existingSession),
      ...parsedBody.data,
    };
    const transitionStatus = parsedBody.data.status ?? existingSession.status;
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
      parsedBody.data.exerciseNotes && Object.keys(parsedBody.data.exerciseNotes).length > 0
        ? {
            ...mergedPayload.data,
            sets: applyExerciseNotesToSets({
              sets: mergedPayload.data.sets,
              exerciseNotes: parsedBody.data.exerciseNotes,
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

    const exercisesAccessible = await allSessionExercisesAccessible({
      userId: request.userId,
      exerciseIds: getReferencedExerciseIds(input.sets),
    });
    if (!exercisesAccessible) {
      return sendError(
        reply,
        400,
        INVALID_SESSION_EXERCISE_RESPONSE.code,
        INVALID_SESSION_EXERCISE_RESPONSE.message,
      );
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

    return reply.send({
      data: session,
    });
  };

  app.patch<{ Params: { id: string } }>('/:id/time-segments', async (request, reply) => {
    const parsedBody = updateWorkoutSessionTimeSegmentsInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
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

    const payload = createWorkoutSessionInputSchema.parse({
      ...toCreateWorkoutSessionInput(existingSession),
      duration: calculateActiveDuration(parsedBody.data.timeSegments),
      timeSegments: parsedBody.data.timeSegments,
    });

    const updated = await updateWorkoutSession({
      id: request.params.id,
      userId: request.userId,
      input: payload,
    });
    if (!updated) {
      return sendError(
        reply,
        404,
        WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
        WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
      );
    }

    return reply.send({
      data: updated,
    });
  });

  app.put<{ Params: { id: string } }>('/:id', updateSessionById);
  app.patch<{ Params: { id: string } }>('/:id', updateSessionById);

  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const deleted = await deleteWorkoutSession(request.params.id, request.userId);
    if (!deleted) {
      // Return the same 404 for missing and non-owned sessions to avoid leaking ownership.
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
  });
};
