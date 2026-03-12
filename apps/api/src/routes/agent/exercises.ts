import { randomUUID } from 'node:crypto';

import {
  agentCreateExerciseInputSchema,
  agentExerciseSearchParamsSchema,
  agentPatchExerciseInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import {
  createExercise,
  findExerciseDedupCandidates,
  findExerciseOwnership,
  listExercises,
  updateOwnedExercise,
} from '../exercises/store.js';

const DEFAULT_CATEGORY = 'compound' as const;
const DEFAULT_TRACKING_TYPE = 'weight_reps' as const;

const EXERCISE_NOT_FOUND_RESPONSE = {
  code: 'EXERCISE_NOT_FOUND',
  message: 'Exercise not found',
} as const;

const GLOBAL_EXERCISE_READ_ONLY_RESPONSE = {
  code: 'GLOBAL_EXERCISE_READ_ONLY',
  message: 'Global exercises cannot be modified',
} as const;

export const agentExerciseRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', async (request, reply) => {
    const parsed = agentCreateExerciseInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid exercise payload');
    }

    const dedupCandidates = await findExerciseDedupCandidates({
      userId: request.userId,
      name: parsed.data.name,
    });

    if (dedupCandidates.length > 0 && !parsed.data.force) {
      return reply.send({
        data: {
          created: false,
          candidates: dedupCandidates,
        },
      });
    }

    const exercise = await createExercise({
      id: randomUUID(),
      userId: request.userId,
      name: parsed.data.name,
      category: parsed.data.category ?? DEFAULT_CATEGORY,
      trackingType: DEFAULT_TRACKING_TYPE,
      muscleGroups: parsed.data.muscleGroups ?? [],
      equipment: parsed.data.equipment ?? '',
      tags: [],
      formCues: [],
      instructions: null,
    });

    return reply.code(201).send({
      data: {
        created: true,
        exercise: {
          id: exercise.id,
          name: exercise.name,
          category: exercise.category,
          trackingType: exercise.trackingType,
          muscleGroups: exercise.muscleGroups,
          equipment: exercise.equipment,
          instructions: exercise.instructions,
          tags: exercise.tags,
          formCues: exercise.formCues,
        },
      },
    });
  });

  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = agentPatchExerciseInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid exercise payload');
    }

    const updated = await updateOwnedExercise({
      id: request.params.id,
      userId: request.userId,
      changes: parsed.data,
    });

    if (updated) {
      return reply.send({ data: updated });
    }

    const ownership = await findExerciseOwnership(request.params.id, request.userId);
    if (!ownership) {
      return sendError(
        reply,
        404,
        EXERCISE_NOT_FOUND_RESPONSE.code,
        EXERCISE_NOT_FOUND_RESPONSE.message,
      );
    }

    if (ownership.userId === null) {
      return sendError(
        reply,
        403,
        GLOBAL_EXERCISE_READ_ONLY_RESPONSE.code,
        GLOBAL_EXERCISE_READ_ONLY_RESPONSE.message,
      );
    }

    if (ownership.userId !== request.userId) {
      return sendError(
        reply,
        404,
        EXERCISE_NOT_FOUND_RESPONSE.code,
        EXERCISE_NOT_FOUND_RESPONSE.message,
      );
    }

    return sendError(
      reply,
      404,
      EXERCISE_NOT_FOUND_RESPONSE.code,
      EXERCISE_NOT_FOUND_RESPONSE.message,
    );
  });

  app.get('/search', async (request, reply) => {
    const parsed = agentExerciseSearchParamsSchema.safeParse(request.query);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid exercise search query');
    }

    const result = await listExercises({
      userId: request.userId,
      q: parsed.data.q,
      page: 1,
      limit: parsed.data.limit,
    });

    return reply.send({
      data: result.data.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        category: exercise.category,
        muscleGroups: exercise.muscleGroups,
        equipment: exercise.equipment,
      })),
    });
  });
};
