import { randomUUID } from 'node:crypto';

import {
  agentCreateWeightInputSchema,
  agentNutritionSummaryParamsSchema,
  agentUpdateHabitEntryInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { findHabitEntryByHabitAndDate, listHabitEntriesByDateRange, upsertHabitEntry } from '../habit-entries/store.js';
import { findHabitById, listActiveHabits } from '../habits/store.js';
import { getDailyNutritionForDate, getDailyNutritionSummaryForDate } from '../nutrition/store.js';
import { findBodyWeightEntryByDate, upsertBodyWeightEntry } from '../weight/store.js';

import { getTodayDate, isValidDate } from './date-utils.js';

const parseId = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

export const agentDailyRoutes: FastifyPluginAsync = async (app) => {
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

    return reply.send({
      data: habits.map((habit) => {
        const entry = entriesByHabitId.get(habit.id);

        return {
          id: habit.id,
          name: habit.name,
          trackingType: habit.trackingType,
          todayEntry: entry
            ? {
                value: entry.value,
                completed: entry.completed,
              }
            : null,
        };
      }),
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
