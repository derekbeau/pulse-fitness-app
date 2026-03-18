import { randomUUID } from 'node:crypto';

import {
  apiDataResponseSchema,
  createHabitInputSchema,
  habitSchema,
  reorderHabitsInputSchema,
  updateHabitInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { getTodayDate } from '../../lib/date.js';
import { resolveHabitCompletion } from '../../lib/habit-resolvers.js';
import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import { agentEnrichmentOnSend, setAgentEnrichmentContext } from '../../middleware/agent-enrichment.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
  successFlagSchema,
} from '../../openapi.js';
import { ensureStarterHabitsForUser } from '../auth/store.js';
import { habitEntryNestedRoutes } from '../habit-entries/index.js';
import { listHabitEntriesByDateRange } from '../habit-entries/store.js';

import {
  createHabit,
  findHabitById,
  getNextHabitSortOrder,
  listActiveHabits,
  reorderHabits,
  softDeleteHabit,
  updateHabit,
} from './store.js';

const habitTodayEntrySchema = z.object({
  completed: z.boolean(),
  value: z.number().nullable(),
  isOverride: z.boolean().optional(),
});

const habitWithTodayEntrySchema = habitSchema.extend({
  todayEntry: habitTodayEntrySchema.nullable(),
});

const listHabitsResponseSchema = apiDataResponseSchema(z.array(habitWithTodayEntrySchema));

type UpdateHabitRequest = {
  body: z.infer<typeof updateHabitInputSchema>;
  params: z.infer<typeof idParamsSchema>;
  userId: string;
};

const sendNotFound = (reply: Parameters<typeof sendError>[0]) =>
  sendError(reply, 404, 'HABIT_NOT_FOUND', 'Habit not found');
const shouldEnsureStarterHabits = () => process.env.NODE_ENV !== 'test';
const buildResolutionCacheKey = (source: string, config: unknown) =>
  `${source}:${JSON.stringify(config)}`;

export const habitRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  app.register(habitEntryNestedRoutes);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/',
    {
      schema: {
        body: createHabitInputSchema,
        response: {
          201: apiDataResponseSchema(habitSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['habits'],
        summary: 'Create a habit',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const sortOrder = await getNextHabitSortOrder(request.userId);
      const habit = await createHabit({
        id: randomUUID(),
        userId: request.userId,
        sortOrder,
        ...request.body,
      });

      return reply.code(201).send({
        data: habit,
      });
    },
  );

  typedApp.get(
    '/',
    {
      onSend: agentEnrichmentOnSend,
      schema: {
        response: {
          200: listHabitsResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['habits'],
        summary: 'List active habits with today entry state',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const today = getTodayDate();
      setAgentEnrichmentContext(request, {
        endpoint: 'habit.list',
        date: today,
      });

      if (shouldEnsureStarterHabits()) {
        await ensureStarterHabitsForUser(request.userId);
      }

      const habits = await listActiveHabits(request.userId);
      if (habits.length === 0) {
        return reply.send({ data: [] });
      }

      const todayEntries = await listHabitEntriesByDateRange(request.userId, today, today);
      const todayEntriesByHabitId = new Map(todayEntries.map((entry) => [entry.habitId, entry]));
      const resolutionByKey = new Map<ReturnType<typeof buildResolutionCacheKey>, Promise<{
        completed: boolean;
        value?: number;
      }>>();

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

          const resolutionKey = buildResolutionCacheKey(habit.referenceSource, habit.referenceConfig);
          const existingResolution = resolutionByKey.get(resolutionKey);
          const resolutionPromise =
            existingResolution ?? resolveHabitCompletion(habit, request.userId, today);
          if (!existingResolution) {
            resolutionByKey.set(resolutionKey, resolutionPromise);
          }

          const resolved = await resolutionPromise;
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
    },
  );

  const updateHabitById = async (request: UpdateHabitRequest, reply: FastifyReply) => {
    const existingHabit = await findHabitById(request.params.id, request.userId);
    if (!existingHabit) {
      return sendNotFound(reply);
    }

    const mergedHabitInput = createHabitInputSchema.safeParse({
      name: request.body.name === undefined ? existingHabit.name : request.body.name,
      description:
        request.body.description === undefined
          ? existingHabit.description
          : request.body.description,
      emoji: request.body.emoji === undefined ? existingHabit.emoji : request.body.emoji,
      trackingType:
        request.body.trackingType === undefined
          ? existingHabit.trackingType
          : request.body.trackingType,
      target: request.body.target === undefined ? existingHabit.target : request.body.target,
      unit: request.body.unit === undefined ? existingHabit.unit : request.body.unit,
      frequency:
        request.body.frequency === undefined ? existingHabit.frequency : request.body.frequency,
      frequencyTarget:
        request.body.frequencyTarget === undefined
          ? existingHabit.frequencyTarget
          : request.body.frequencyTarget,
      scheduledDays:
        request.body.scheduledDays === undefined
          ? existingHabit.scheduledDays
          : request.body.scheduledDays,
      pausedUntil:
        request.body.pausedUntil === undefined ? existingHabit.pausedUntil : request.body.pausedUntil,
      referenceSource:
        request.body.referenceSource === undefined
          ? existingHabit.referenceSource
          : request.body.referenceSource,
      referenceConfig:
        request.body.referenceConfig === undefined
          ? existingHabit.referenceConfig
          : request.body.referenceConfig,
    });

    if (!mergedHabitInput.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit payload');
    }

    const habit = await updateHabit(request.params.id, request.userId, {
      ...mergedHabitInput.data,
      ...(request.body.active === undefined ? {} : { active: request.body.active }),
    });
    if (!habit) {
      return sendNotFound(reply);
    }

    return reply.send({
      data: habit,
    });
  };

  typedApp.put(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateHabitInputSchema,
        response: {
          200: apiDataResponseSchema(habitSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['habits'],
        summary: 'Update a habit',
        security: authSecurity,
      },
    },
    updateHabitById,
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
        tags: ['habits'],
        summary: 'Delete a habit',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const deleted = await softDeleteHabit(request.params.id, request.userId);
      if (!deleted) {
        return sendNotFound(reply);
      }

      return reply.send({
        data: {
          success: true,
        },
      });
    },
  );

  typedApp.patch(
    '/reorder',
    {
      schema: {
        body: reorderHabitsInputSchema,
        response: {
          200: apiDataResponseSchema(successFlagSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['habits'],
        summary: 'Reorder habits',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const reordered = await reorderHabits(request.userId, request.body.items);
      if (!reordered) {
        return sendNotFound(reply);
      }

      return reply.send({
        data: {
          success: true,
        },
      });
    },
  );
};
