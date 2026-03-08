import { randomUUID } from 'node:crypto';

import {
  createHabitEntryInputSchema,
  habitEntryQueryParamsSchema,
  updateHabitEntryInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import { findHabitById } from '../habits/store.js';

import {
  updateHabitEntry,
  upsertHabitEntry,
  listHabitEntriesByDateRange,
  listHabitEntriesForHabitByDateRange,
} from './store.js';

const parseId = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const sendHabitNotFound = (reply: Parameters<typeof sendError>[0]) =>
  sendError(reply, 404, 'HABIT_NOT_FOUND', 'Habit not found');

const sendHabitEntryNotFound = (reply: Parameters<typeof sendError>[0]) =>
  sendError(reply, 404, 'HABIT_ENTRY_NOT_FOUND', 'Habit entry not found');

export const habitEntryNestedRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { id: string } }>('/:id/entries', async (request, reply) => {
    const habitId = parseId(request.params.id);
    if (!habitId) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit id');
    }

    const parsedBody = createHabitEntryInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit entry payload');
    }

    const habit = await findHabitById(habitId, request.userId);
    if (!habit) {
      return sendHabitNotFound(reply);
    }

    const entry = await upsertHabitEntry({
      id: randomUUID(),
      habitId,
      userId: request.userId,
      ...parsedBody.data,
    });

    return reply.code(201).send({
      data: entry,
    });
  });

  app.get<{ Params: { id: string } }>('/:id/entries', async (request, reply) => {
    const habitId = parseId(request.params.id);
    if (!habitId) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit id');
    }

    const parsedQuery = habitEntryQueryParamsSchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit entry query params');
    }

    const habit = await findHabitById(habitId, request.userId);
    if (!habit) {
      return sendHabitNotFound(reply);
    }

    const entries = await listHabitEntriesForHabitByDateRange(
      habitId,
      request.userId,
      parsedQuery.data.from,
      parsedQuery.data.to,
    );

    return reply.send({
      data: entries,
    });
  });
};

export const habitEntryCollectionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/', async (request, reply) => {
    const parsedQuery = habitEntryQueryParamsSchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit entry query params');
    }

    const entries = await listHabitEntriesByDateRange(
      request.userId,
      parsedQuery.data.from,
      parsedQuery.data.to,
    );

    return reply.send({
      data: entries,
    });
  });

  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const entryId = parseId(request.params.id);
    if (!entryId) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit entry id');
    }

    const parsedBody = updateHabitEntryInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid habit entry payload');
    }

    const entry = await updateHabitEntry(entryId, request.userId, parsedBody.data);
    if (!entry) {
      return sendHabitEntryNotFound(reply);
    }

    return reply.send({
      data: entry,
    });
  });
};
