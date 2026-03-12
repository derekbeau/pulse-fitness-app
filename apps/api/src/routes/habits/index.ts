import { randomUUID } from 'node:crypto';

import {
  createHabitInputSchema,
  reorderHabitsInputSchema,
  updateHabitInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { getTodayDate } from '../../lib/date.js';
import { resolveHabitCompletion } from '../../lib/habit-resolvers.js';
import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import { listHabitEntriesByDateRange } from '../habit-entries/store.js';
import { habitEntryNestedRoutes } from '../habit-entries/index.js';
import { ensureStarterHabitsForUser } from '../auth/store.js';

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
const shouldEnsureStarterHabits = () => process.env.NODE_ENV !== 'test';

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
    if (shouldEnsureStarterHabits()) {
      await ensureStarterHabitsForUser(request.userId);
    }

    const habits = await listActiveHabits(request.userId);
    if (habits.length === 0) {
      return reply.send({ data: [] });
    }

    const today = getTodayDate();
    const todayEntries = await listHabitEntriesByDateRange(request.userId, today, today);
    const todayEntriesByHabitId = new Map(todayEntries.map((entry) => [entry.habitId, entry]));

    const habitsWithResolvedEntries = await Promise.all(
      habits.map(async (habit) => {
        const todayEntry = todayEntriesByHabitId.get(habit.id);
        if (habit.referenceSource == null) {
          return {
            ...habit,
            todayEntry: todayEntry
              ? {
                  completed: todayEntry.completed,
                  value: todayEntry.value,
                  isOverride: todayEntry.isOverride,
                }
              : null,
          };
        }

        if (todayEntry?.isOverride) {
          return {
            ...habit,
            todayEntry: {
              completed: todayEntry.completed,
              value: todayEntry.value,
              isOverride: true,
            },
          };
        }

        const resolved = await resolveHabitCompletion(habit, request.userId, today);
        return {
          ...habit,
          todayEntry: {
            completed: resolved.completed,
            value: resolved.value ?? null,
            isOverride: false,
          },
        };
      }),
    );

    return reply.send({
      data: habitsWithResolvedEntries,
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
      description:
        parsedBody.data.description === undefined
          ? existingHabit.description
          : parsedBody.data.description,
      emoji: parsedBody.data.emoji === undefined ? existingHabit.emoji : parsedBody.data.emoji,
      trackingType:
        parsedBody.data.trackingType === undefined
          ? existingHabit.trackingType
          : parsedBody.data.trackingType,
      target: parsedBody.data.target === undefined ? existingHabit.target : parsedBody.data.target,
      unit: parsedBody.data.unit === undefined ? existingHabit.unit : parsedBody.data.unit,
      frequency:
        parsedBody.data.frequency === undefined
          ? existingHabit.frequency
          : parsedBody.data.frequency,
      frequencyTarget:
        parsedBody.data.frequencyTarget === undefined
          ? existingHabit.frequencyTarget
          : parsedBody.data.frequencyTarget,
      scheduledDays:
        parsedBody.data.scheduledDays === undefined
          ? existingHabit.scheduledDays
          : parsedBody.data.scheduledDays,
      pausedUntil:
        parsedBody.data.pausedUntil === undefined
          ? existingHabit.pausedUntil
          : parsedBody.data.pausedUntil,
      referenceSource:
        parsedBody.data.referenceSource === undefined
          ? existingHabit.referenceSource
          : parsedBody.data.referenceSource,
      referenceConfig:
        parsedBody.data.referenceConfig === undefined
          ? existingHabit.referenceConfig
          : parsedBody.data.referenceConfig,
    });

    if (!mergedHabitInput.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit payload');
    }

    const habit = await updateHabit(habitId, request.userId, {
      ...mergedHabitInput.data,
      ...(parsedBody.data.active === undefined ? {} : { active: parsedBody.data.active }),
    });
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
