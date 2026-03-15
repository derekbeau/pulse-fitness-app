import { randomUUID } from 'node:crypto';

import {
  agentUpdateHabitEntryInputSchema,
  apiDataResponseSchema,
  createHabitEntryInputSchema,
  habitEntryQueryParamsSchema,
  habitEntrySchema,
  updateHabitEntryInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import { buildDataResponse } from '../../middleware/agent-enrichment.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
} from '../../openapi.js';
import { findHabitById } from '../habits/store.js';

import {
  findHabitEntryByHabitAndDate,
  listHabitEntriesByDateRange,
  listHabitEntriesForHabitByDateRange,
  updateHabitEntry,
  upsertHabitEntry,
} from './store.js';

const habitEntriesResponseSchema = apiDataResponseSchema(z.array(habitEntrySchema));

const sendHabitNotFound = (reply: Parameters<typeof sendError>[0]) =>
  sendError(reply, 404, 'HABIT_NOT_FOUND', 'Habit not found');

const sendHabitEntryNotFound = (reply: Parameters<typeof sendError>[0]) =>
  sendError(reply, 404, 'HABIT_ENTRY_NOT_FOUND', 'Habit entry not found');

export const habitEntryNestedRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/:id/entries',
    {
      schema: {
        params: idParamsSchema,
        body: createHabitEntryInputSchema,
        response: {
          201: apiDataResponseSchema(habitEntrySchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['habit-entries'],
        summary: 'Create or replace a habit entry',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const habit = await findHabitById(request.params.id, request.userId);
      if (!habit) {
        return sendHabitNotFound(reply);
      }

      const entry = await upsertHabitEntry({
        id: randomUUID(),
        habitId: request.params.id,
        userId: request.userId,
        ...request.body,
        isOverride: request.body.isOverride,
      });

      return reply.code(201).send(
        buildDataResponse(request, entry, {
          endpoint: 'habit-entry.mutation',
          habit,
        }),
      );
    },
  );

  typedApp.patch(
    '/:id/entries',
    {
      schema: {
        params: idParamsSchema,
        body: agentUpdateHabitEntryInputSchema,
        response: {
          200: apiDataResponseSchema(habitEntrySchema),
          201: apiDataResponseSchema(habitEntrySchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['habit-entries'],
        summary: 'Update a habit entry by date for agent workflows',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const habit = await findHabitById(request.params.id, request.userId);
      if (!habit) {
        return sendHabitNotFound(reply);
      }

      const existingEntry = await findHabitEntryByHabitAndDate(
        request.params.id,
        request.userId,
        request.body.date,
      );
      const entry = await upsertHabitEntry({
        id: existingEntry?.id ?? randomUUID(),
        habitId: request.params.id,
        userId: request.userId,
        date: request.body.date,
        completed: request.body.completed ?? existingEntry?.completed ?? false,
        value: request.body.value ?? existingEntry?.value ?? undefined,
        isOverride: habit.referenceSource != null,
      });

      return reply.code(existingEntry ? 200 : 201).send(
        buildDataResponse(request, entry, {
          endpoint: 'habit-entry.mutation',
          habit,
          previousEntry: existingEntry
            ? {
                completed: existingEntry.completed,
                value: existingEntry.value ?? null,
              }
            : undefined,
        }),
      );
    },
  );

  typedApp.get(
    '/:id/entries',
    {
      schema: {
        params: idParamsSchema,
        querystring: habitEntryQueryParamsSchema,
        response: {
          200: habitEntriesResponseSchema,
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['habit-entries'],
        summary: 'List entries for a habit',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const habit = await findHabitById(request.params.id, request.userId);
      if (!habit) {
        return sendHabitNotFound(reply);
      }

      const entries = await listHabitEntriesForHabitByDateRange(
        request.params.id,
        request.userId,
        request.query.from,
        request.query.to,
      );

      return reply.send({
        data: entries,
      });
    },
  );
};

export const habitEntryCollectionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/',
    {
      schema: {
        querystring: habitEntryQueryParamsSchema,
        response: {
          200: habitEntriesResponseSchema,
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['habit-entries'],
        summary: 'List habit entries in a date range',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const entries = await listHabitEntriesByDateRange(
        request.userId,
        request.query.from,
        request.query.to,
      );

      return reply.send({
        data: entries,
      });
    },
  );

  typedApp.patch(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateHabitEntryInputSchema,
        response: {
          200: apiDataResponseSchema(habitEntrySchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['habit-entries'],
        summary: 'Update a habit entry',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const entry = await updateHabitEntry(request.params.id, request.userId, request.body);
      if (!entry) {
        return sendHabitEntryNotFound(reply);
      }

      return reply.send({
        data: entry,
      });
    },
  );
};
