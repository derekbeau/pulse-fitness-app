import { randomUUID } from 'node:crypto';

import {
  createHabitInputSchema,
  agentCreateWeightInputSchema,
  agentNutritionSummaryParamsSchema,
  agentUpdateHabitEntryInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { resolveHabitCompletion } from '../../lib/habit-resolvers.js';
import { sendError } from '../../lib/reply.js';
import {
  findHabitEntryByHabitAndDate,
  listHabitEntriesByDateRange,
  upsertHabitEntry,
} from '../habit-entries/store.js';
import {
  createHabit,
  findHabitById,
  getNextHabitSortOrder,
  listActiveHabits,
} from '../habits/store.js';
import { getDailyNutritionForDate, getDailyNutritionSummaryForDate } from '../nutrition/store.js';
import { findBodyWeightEntryByDate, upsertBodyWeightEntry } from '../weight/store.js';

import { getTodayDate, isValidDate } from './date-utils.js';

const parseId = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
const buildResolutionCacheKey = (source: string, config: unknown) =>
  `${source}:${JSON.stringify(config)}`;

export const agentDailyRoutes: FastifyPluginAsync = async (app) => {
  app.post('/habits', async (request, reply) => {
    const parsed = createHabitInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit payload');
    }

    const sortOrder = await getNextHabitSortOrder(request.userId);
    const habit = await createHabit({
      id: randomUUID(),
      userId: request.userId,
      sortOrder,
      ...parsed.data,
    });

    return reply.code(201).send({ data: habit });
  });

  app.post('/weight', async (request, reply) => {
    const parsed = agentCreateWeightInputSchema.safeParse(request.body);
    if (!parsed.success || !isValidDate(parsed.data.date)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid weight payload');
    }

    const existing = await findBodyWeightEntryByDate(request.userId, parsed.data.date);
    const entry = await upsertBodyWeightEntry(request.userId, parsed.data);

    return reply.code(existing ? 200 : 201).send({ data: entry });
  });

  app.get('/habits', async (request, reply) => {
    const habits = await listActiveHabits(request.userId);
    if (habits.length === 0) {
      return reply.send({ data: [] });
    }

    const today = getTodayDate();
    const entries = await listHabitEntriesByDateRange(request.userId, today, today);
    const entriesByHabitId = new Map(entries.map((entry) => [entry.habitId, entry]));
    const resolutionByKey = new Map<ReturnType<typeof buildResolutionCacheKey>, Promise<{
      completed: boolean;
      value?: number;
    }>>();

    return reply.send({
      data: await Promise.all(habits.map(async (habit) => {
        const entry = entriesByHabitId.get(habit.id);

        if (habit.referenceSource != null && !entry?.isOverride) {
          const resolutionKey = buildResolutionCacheKey(habit.referenceSource, habit.referenceConfig);
          const existingResolution = resolutionByKey.get(resolutionKey);
          const resolutionPromise =
            existingResolution ?? resolveHabitCompletion(habit, request.userId, today);
          if (!existingResolution) {
            resolutionByKey.set(resolutionKey, resolutionPromise);
          }

          const resolved = await resolutionPromise;
          return {
            id: habit.id,
            name: habit.name,
            trackingType: habit.trackingType,
            todayEntry: {
              value: resolved.value ?? null,
              completed: resolved.completed,
              isOverride: false,
            },
          };
        }

        return {
          id: habit.id,
          name: habit.name,
          trackingType: habit.trackingType,
          todayEntry: entry
            ? {
                value: entry.value,
                completed: entry.completed,
                isOverride: entry.isOverride,
              }
            : null,
        };
      })),
    });
  });

  app.patch<{ Params: { id: string } }>('/habits/:id/entries', async (request, reply) => {
    const habitId = parseId(request.params.id);
    if (!habitId) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit id');
    }

    const parsed = agentUpdateHabitEntryInputSchema.safeParse(request.body);
    if (!parsed.success || !isValidDate(parsed.data.date)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit entry payload');
    }

    const habit = await findHabitById(habitId, request.userId);
    if (!habit) {
      return sendError(reply, 404, 'HABIT_NOT_FOUND', 'Habit not found');
    }

    const existing = await findHabitEntryByHabitAndDate(habitId, request.userId, parsed.data.date);
    const entry = await upsertHabitEntry({
      id: existing?.id ?? randomUUID(),
      habitId,
      userId: request.userId,
      date: parsed.data.date,
      completed: parsed.data.completed ?? existing?.completed ?? false,
      value: parsed.data.value ?? existing?.value ?? undefined,
      isOverride: habit.referenceSource != null,
    });

    return reply.code(existing ? 200 : 201).send({ data: entry });
  });

  app.get<{ Params: { date: string } }>('/nutrition/:date/summary', async (request, reply) => {
    const parsedParams = agentNutritionSummaryParamsSchema.safeParse(request.params);
    if (!parsedParams.success || !isValidDate(parsedParams.data.date)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid nutrition date');
    }

    const [summary, dailyNutrition] = await Promise.all([
      getDailyNutritionSummaryForDate(request.userId, parsedParams.data.date),
      getDailyNutritionForDate(request.userId, parsedParams.data.date),
    ]);

    return reply.send({
      data: {
        summary,
        meals: dailyNutrition?.meals ?? [],
      },
    });
  });
};
