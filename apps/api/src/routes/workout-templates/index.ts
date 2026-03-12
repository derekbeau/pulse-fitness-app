import { randomUUID } from 'node:crypto';

import {
  createWorkoutTemplateInputSchema,
  reorderWorkoutTemplateExercisesInputSchema,
  type UpdateWorkoutTemplateInput,
  updateWorkoutTemplateInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireUserAuth } from '../../middleware/auth.js';

import {
  allTemplateExercisesAccessible,
  createWorkoutTemplate,
  deleteWorkoutTemplate,
  findWorkoutTemplateById,
  listWorkoutTemplates,
  reorderWorkoutTemplateExercises,
  updateWorkoutTemplate,
} from './store.js';

const WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE = {
  code: 'WORKOUT_TEMPLATE_NOT_FOUND',
  message: 'Workout template not found',
} as const;

const INVALID_TEMPLATE_EXERCISE_RESPONSE = {
  code: 'INVALID_TEMPLATE_EXERCISE',
  message: 'Template references one or more unavailable exercises',
} as const;

const getReferencedExerciseIds = (
  sections: Array<{ exercises: Array<{ exerciseId: string }> }>,
): string[] =>
  sections.flatMap((section) => section.exercises.map((exercise) => exercise.exerciseId));

const resolveTemplateUpdateInput = ({
  existingTemplate,
  update,
}: {
  existingTemplate: Awaited<ReturnType<typeof findWorkoutTemplateById>>;
  update: UpdateWorkoutTemplateInput;
}) => {
  if (!existingTemplate) {
    throw new Error('existingTemplate is required to resolve updates');
  }

  return {
    name: update.name ?? existingTemplate.name,
    description:
      update.description !== undefined ? update.description : existingTemplate.description,
    tags: update.tags ?? existingTemplate.tags,
    sections:
      update.sections ??
      existingTemplate.sections.map((section) => ({
        type: section.type,
        exercises: section.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          sets: exercise.sets,
          repsMin: exercise.repsMin,
          repsMax: exercise.repsMax,
          tempo: exercise.tempo,
          restSeconds: exercise.restSeconds,
          supersetGroup: exercise.supersetGroup,
          notes: exercise.notes,
          cues: exercise.cues,
        })),
      })),
  };
};

export const workoutTemplateRoutes: FastifyPluginAsync = async (app) => {
  // All /api/v1 workout routes are user-session only; agent tokens are reserved for /api/agent.
  app.addHook('onRequest', requireUserAuth);

  app.get('/', async (request, reply) => {
    const templates = await listWorkoutTemplates(request.userId);

    return reply.send({
      data: templates,
    });
  });

  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const template = await findWorkoutTemplateById(request.params.id, request.userId);
    if (!template) {
      return sendError(
        reply,
        404,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
      );
    }

    return reply.send({
      data: template,
    });
  });

  app.post('/', async (request, reply) => {
    const parsedBody = createWorkoutTemplateInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout template payload');
    }

    const exerciseIds = getReferencedExerciseIds(parsedBody.data.sections);
    const exercisesAccessible = await allTemplateExercisesAccessible({
      userId: request.userId,
      exerciseIds,
    });
    if (!exercisesAccessible) {
      return sendError(
        reply,
        400,
        INVALID_TEMPLATE_EXERCISE_RESPONSE.code,
        INVALID_TEMPLATE_EXERCISE_RESPONSE.message,
      );
    }

    const template = await createWorkoutTemplate({
      id: randomUUID(),
      userId: request.userId,
      input: parsedBody.data,
    });

    return reply.code(201).send({
      data: template,
    });
  });

  const updateTemplateById = async (
    request: { body: unknown; params: { id: string }; userId: string },
    reply: FastifyReply,
  ) => {
    const parsedBody = updateWorkoutTemplateInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout template payload');
    }

    const existingTemplate = await findWorkoutTemplateById(request.params.id, request.userId);
    if (!existingTemplate) {
      return sendError(
        reply,
        404,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
      );
    }

    const resolvedInput = resolveTemplateUpdateInput({
      existingTemplate,
      update: parsedBody.data,
    });

    const exerciseIds = getReferencedExerciseIds(resolvedInput.sections);
    const exercisesAccessible = await allTemplateExercisesAccessible({
      userId: request.userId,
      exerciseIds,
    });
    if (!exercisesAccessible) {
      return sendError(
        reply,
        400,
        INVALID_TEMPLATE_EXERCISE_RESPONSE.code,
        INVALID_TEMPLATE_EXERCISE_RESPONSE.message,
      );
    }

    const template = await updateWorkoutTemplate({
      id: request.params.id,
      userId: request.userId,
      input: resolvedInput,
    });
    if (!template) {
      return sendError(
        reply,
        404,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
      );
    }

    return reply.send({
      data: template,
    });
  };

  app.put<{ Params: { id: string } }>('/:id', updateTemplateById);
  app.patch<{ Params: { id: string } }>('/:id', updateTemplateById);

  app.patch<{ Params: { id: string } }>('/:id/reorder', async (request, reply) => {
    const parsedBody = reorderWorkoutTemplateExercisesInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout template payload');
    }

    const existingTemplate = await findWorkoutTemplateById(request.params.id, request.userId);
    if (!existingTemplate) {
      return sendError(
        reply,
        404,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
      );
    }

    const currentSection = existingTemplate.sections.find(
      (section) => section.type === parsedBody.data.section,
    );
    const currentExerciseIds = currentSection?.exercises.map((exercise) => exercise.id) ?? [];
    const requestedIds = parsedBody.data.exerciseIds;
    const hasSameMembership =
      currentExerciseIds.length === requestedIds.length &&
      currentExerciseIds.every((exerciseId) => requestedIds.includes(exerciseId));
    if (!hasSameMembership) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout template payload');
    }

    const reordered = await reorderWorkoutTemplateExercises({
      templateId: request.params.id,
      userId: request.userId,
      section: parsedBody.data.section,
      exerciseIds: requestedIds,
    });
    if (!reordered) {
      return sendError(
        reply,
        404,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
      );
    }

    const template = await findWorkoutTemplateById(request.params.id, request.userId);
    if (!template) {
      return sendError(
        reply,
        404,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
      );
    }

    return reply.send({ data: template });
  });

  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const deleted = await deleteWorkoutTemplate(request.params.id, request.userId);
    if (!deleted) {
      return sendError(
        reply,
        404,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
      );
    }

    return reply.send({
      data: {
        success: true,
      },
    });
  });
};
