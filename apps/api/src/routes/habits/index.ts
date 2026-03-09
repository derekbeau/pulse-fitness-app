import { randomUUID } from 'node:crypto';

import {
  createHabitInputSchema,
  reorderHabitsInputSchema,
  updateHabitInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import { habitEntryNestedRoutes } from '../habit-entries/index.js';

import {
  createHabit,
  findHabitById,
  getNextHabitSortOrder,
  listActiveHabits,
  reorderHabits,
  softDeleteHabit,
  updateHabit,
} from './store.js';

const habitParamsSchema = {
  id: (value: unknown) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined,
};

const sendNotFound = (reply: Parameters<typeof sendError>[0]) =>
  sendError(reply, 404, 'HABIT_NOT_FOUND', 'Habit not found');

export const habitRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  app.register(habitEntryNestedRoutes);

  app.post('/', async (request, reply) => {
    const parsedBody = createHabitInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit payload');
    }

    const sortOrder = await getNextHabitSortOrder(request.userId);
    const habit = await createHabit({
      id: randomUUID(),
      userId: request.userId,
      sortOrder,
      ...parsedBody.data,
    });

    return reply.code(201).send({
      data: habit,
    });
  });

  app.get('/', async (request, reply) => {
    const habits = await listActiveHabits(request.userId);

    return reply.send({
      data: habits,
    });
  });

  app.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const habitId = habitParamsSchema.id(request.params.id);
    if (!habitId) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit id');
    }

    const parsedBody = updateHabitInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit payload');
    }

    const existingHabit = await findHabitById(habitId, request.userId);
    if (!existingHabit) {
      return sendNotFound(reply);
    }

    const mergedHabitInput = createHabitInputSchema.safeParse({
      name: parsedBody.data.name === undefined ? existingHabit.name : parsedBody.data.name,
      emoji: parsedBody.data.emoji === undefined ? existingHabit.emoji : parsedBody.data.emoji,
      trackingType:
        parsedBody.data.trackingType === undefined
          ? existingHabit.trackingType
          : parsedBody.data.trackingType,
      target: parsedBody.data.target === undefined ? existingHabit.target : parsedBody.data.target,
      unit: parsedBody.data.unit === undefined ? existingHabit.unit : parsedBody.data.unit,
    });

    if (!mergedHabitInput.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit payload');
    }

    const habit = await updateHabit(habitId, request.userId, mergedHabitInput.data);
    if (!habit) {
      return sendNotFound(reply);
    }

    return reply.send({
      data: habit,
    });
  });

  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const habitId = habitParamsSchema.id(request.params.id);
    if (!habitId) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit id');
    }

    const deleted = await softDeleteHabit(habitId, request.userId);
    if (!deleted) {
      return sendNotFound(reply);
    }

    return reply.send({
      data: {
        success: true,
      },
    });
  });

  app.patch('/reorder', async (request, reply) => {
    const parsedBody = reorderHabitsInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid reorder payload');
    }

    const reordered = await reorderHabits(request.userId, parsedBody.data.items);
    if (!reordered) {
      return sendNotFound(reply);
    }

    return reply.send({
      data: {
        success: true,
      },
    });
  });
};
