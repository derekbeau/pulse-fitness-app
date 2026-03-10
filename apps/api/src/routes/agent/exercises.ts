import { randomUUID } from 'node:crypto';

import { agentCreateExerciseInputSchema, agentExerciseSearchParamsSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { createExercise, listExercises } from '../exercises/store.js';

const DEFAULT_MUSCLE_GROUPS = ['Full Body'];
const DEFAULT_EQUIPMENT = 'Bodyweight';
const DEFAULT_CATEGORY = 'compound' as const;

export const agentExerciseRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', async (request, reply) => {
    const parsed = agentCreateExerciseInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid exercise payload');
    }

    const exercise = await createExercise({
      id: randomUUID(),
      userId: request.userId,
      name: parsed.data.name,
      category: parsed.data.category ?? DEFAULT_CATEGORY,
      muscleGroups: parsed.data.muscleGroups ?? DEFAULT_MUSCLE_GROUPS,
      equipment: parsed.data.equipment ?? DEFAULT_EQUIPMENT,
      instructions: null,
    });

    return reply.code(201).send({
      data: {
        id: exercise.id,
        name: exercise.name,
        category: exercise.category,
        muscleGroups: exercise.muscleGroups,
        equipment: exercise.equipment,
      },
    });
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
