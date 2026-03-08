import { randomUUID } from 'node:crypto';

import {
  createWorkoutSessionInputSchema,
  type CreateWorkoutSessionInput,
  updateWorkoutSessionInputSchema,
  workoutSessionQueryParamsSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';

import {
  allSessionExercisesAccessible,
  createWorkoutSession,
  deleteWorkoutSession,
  findWorkoutSessionById,
  listWorkoutSessions,
  templateBelongsToUser,
  updateWorkoutSession,
} from './store.js';

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

export const workoutSessionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

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

    const session = await createWorkoutSession({
      id: randomUUID(),
      userId: request.userId,
      input: parsedBody.data,
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

  app.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsedBody = updateWorkoutSessionInputSchema.safeParse(request.body);
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

    const mergedPayload = createWorkoutSessionInputSchema.safeParse({
      ...toCreateWorkoutSessionInput(existingSession),
      ...parsedBody.data,
    });
    if (!mergedPayload.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
    }

    if (mergedPayload.data.templateId !== null) {
      const templateAccessible = await templateBelongsToUser(
        mergedPayload.data.templateId,
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
      exerciseIds: getReferencedExerciseIds(mergedPayload.data.sets),
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
      input: mergedPayload.data,
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
  });

  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
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
  });
};
