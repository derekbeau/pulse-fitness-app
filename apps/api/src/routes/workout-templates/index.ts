import { randomUUID } from 'node:crypto';

import {
  agentCreateWorkoutTemplateInputSchema,
  agentTemplateNewExerciseSchema,
  agentUpdateWorkoutTemplateInputSchema,
  apiDataResponseSchema,
  createWorkoutTemplateInputSchema,
  reorderWorkoutTemplateExercisesInputSchema,
  swapWorkoutTemplateExerciseInputSchema,
  type UpdateWorkoutTemplateInput,
  updateWorkoutTemplateInputSchema,
  workoutTemplateSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { sendError } from '../../lib/reply.js';
import { isAgentRequest, requireAuth } from '../../middleware/auth.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
  opaqueIdParamSchema,
  successFlagSchema,
} from '../../openapi.js';
import { allRelatedExercisesOwned } from '../exercises/store.js';
import { buildTemplateSections } from '../workout-agent.js';

import {
  allTemplateExercisesAccessible,
  createWorkoutTemplate,
  deleteWorkoutTemplate,
  findWorkoutTemplateById,
  listWorkoutTemplates,
  reorderWorkoutTemplateExercises,
  swapWorkoutTemplateExercise,
  updateWorkoutTemplate,
} from './store.js';

const createWorkoutTemplateRequestSchema = z.union([
  createWorkoutTemplateInputSchema.transform((data) => ({
    mode: 'standard' as const,
    data,
  })),
  agentCreateWorkoutTemplateInputSchema.transform((data) => ({
    mode: 'agent' as const,
    data,
  })),
]);

const updateWorkoutTemplateRequestSchema = z.union([
  updateWorkoutTemplateInputSchema.transform((data) => ({
    mode: 'standard' as const,
    data,
  })),
  agentUpdateWorkoutTemplateInputSchema.transform((data) => ({
    mode: 'agent' as const,
    data,
  })),
]);

const agentWorkoutTemplateMutationSchema = z.object({
  template: workoutTemplateSchema,
  newExercises: z.array(agentTemplateNewExerciseSchema),
});

const templateExerciseParamsSchema = idParamsSchema.extend({
  exerciseId: opaqueIdParamSchema,
});

const warningMetaSchema = z.object({
  warning: z.string(),
});

const workoutTemplateMutationResponseSchema = z.union([
  apiDataResponseSchema(workoutTemplateSchema),
  apiDataResponseSchema(agentWorkoutTemplateMutationSchema),
]);

const swapWorkoutTemplateResponseSchema = apiDataResponseSchema(workoutTemplateSchema).extend({
  meta: warningMetaSchema.optional(),
});

type UpdateTemplateRequest = {
  body: z.infer<typeof updateWorkoutTemplateRequestSchema>;
  params: z.infer<typeof idParamsSchema>;
  userId: string;
  authType?: string;
};

const WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE = {
  code: 'WORKOUT_TEMPLATE_NOT_FOUND',
  message: 'Workout template not found',
} as const;

const INVALID_TEMPLATE_EXERCISE_RESPONSE = {
  code: 'INVALID_TEMPLATE_EXERCISE',
  message: 'Template references one or more unavailable exercises',
} as const;

const WORKOUT_TEMPLATE_EXERCISE_NOT_FOUND_RESPONSE = {
  code: 'WORKOUT_TEMPLATE_EXERCISE_NOT_FOUND',
  message: 'Template exercise not found',
} as const;

const WORKOUT_TEMPLATE_DUPLICATE_EXERCISE_RESPONSE = {
  code: 'WORKOUT_TEMPLATE_DUPLICATE_EXERCISE',
  message: 'Template already contains the replacement exercise',
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
          setTargets: exercise.setTargets ?? [],
          programmingNotes: exercise.programmingNotes ?? null,
        })),
      })),
  };
};

export const workoutTemplateRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/',
    {
      schema: {
        response: {
          200: apiDataResponseSchema(z.array(workoutTemplateSchema)),
          401: apiErrorResponseSchema,
        },
        tags: ['workout-templates'],
        summary: 'List workout templates',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const templates = await listWorkoutTemplates(request.userId);

      return reply.send({
        data: templates,
      });
    },
  );

  typedApp.get(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(workoutTemplateSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['workout-templates'],
        summary: 'Get a workout template',
        security: authSecurity,
      },
    },
    async (request, reply) => {
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
    },
  );

  typedApp.post(
    '/',
    {
      schema: {
        body: createWorkoutTemplateRequestSchema,
        response: {
          201: workoutTemplateMutationResponseSchema,
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['workout-templates'],
        summary: 'Create a workout template',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      if (isAgentRequest(request) && request.body.mode !== 'agent') {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout template payload');
      }

      if (!isAgentRequest(request) && request.body.mode !== 'standard') {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout template payload');
      }

      if (request.body.mode === 'agent') {
        const { sections, newExercises } = await buildTemplateSections({
          sections: request.body.data.sections,
          userId: request.userId,
        });
        const template = await createWorkoutTemplate({
          id: randomUUID(),
          userId: request.userId,
          input: {
            name: request.body.data.name,
            description: null,
            tags: [],
            sections,
          },
        });

        return reply.code(201).send({
          data: {
            template,
            newExercises,
          },
        });
      }

      const exerciseIds = getReferencedExerciseIds(request.body.data.sections);
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
        input: request.body.data,
      });

      return reply.code(201).send({
        data: template,
      });
    },
  );

  const updateTemplateById = async (request: UpdateTemplateRequest, reply: FastifyReply) => {
    if (request.authType === 'agent-token') {
      if (request.body.mode !== 'agent') {
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

      const { sections, newExercises } = await buildTemplateSections({
        sections: request.body.data.sections,
        userId: request.userId,
      });
      const template = await updateWorkoutTemplate({
        id: request.params.id,
        userId: request.userId,
        input: {
          name: request.body.data.name,
          description: null,
          tags: [],
          sections,
        },
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
        data: {
          template,
          newExercises,
        },
      });
    }

    if (request.body.mode !== 'standard') {
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
      update: request.body.data,
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

  typedApp.put(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateWorkoutTemplateRequestSchema,
        response: {
          200: workoutTemplateMutationResponseSchema,
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['workout-templates'],
        summary: 'Replace a workout template',
        security: authSecurity,
      },
    },
    updateTemplateById,
  );

  typedApp.patch(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateWorkoutTemplateRequestSchema,
        response: {
          200: workoutTemplateMutationResponseSchema,
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['workout-templates'],
        summary: 'Update a workout template',
        security: authSecurity,
      },
    },
    updateTemplateById,
  );

  typedApp.patch(
    '/:id/reorder',
    {
      schema: {
        params: idParamsSchema,
        body: reorderWorkoutTemplateExercisesInputSchema,
        response: {
          200: apiDataResponseSchema(workoutTemplateSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['workout-templates'],
        summary: 'Reorder exercises in a workout template section',
        security: authSecurity,
      },
    },
    async (request, reply) => {
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
        (section) => section.type === request.body.section,
      );
      const currentExerciseIds = currentSection?.exercises.map((exercise) => exercise.id) ?? [];
      const requestedIds = request.body.exerciseIds;
      const hasSameMembership =
        currentExerciseIds.length === requestedIds.length &&
        currentExerciseIds.every((exerciseId) => requestedIds.includes(exerciseId));
      if (!hasSameMembership) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout template payload');
      }

      const reordered = await reorderWorkoutTemplateExercises({
        templateId: request.params.id,
        userId: request.userId,
        section: request.body.section,
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
    },
  );

  typedApp.patch(
    '/:id/exercises/:exerciseId/swap',
    {
      schema: {
        params: templateExerciseParamsSchema,
        body: swapWorkoutTemplateExerciseInputSchema,
        response: {
          200: swapWorkoutTemplateResponseSchema,
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['workout-templates'],
        summary: 'Swap an exercise in a workout template',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const existingTemplate = await findWorkoutTemplateById(request.params.id, request.userId);
      if (!existingTemplate) {
        return sendError(
          reply,
          404,
          WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
          WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
        );
      }

      const sourceExercise = existingTemplate.sections
        .flatMap((section) => section.exercises)
        .find((exercise) => exercise.exerciseId === request.params.exerciseId);
      if (!sourceExercise) {
        return sendError(
          reply,
          404,
          WORKOUT_TEMPLATE_EXERCISE_NOT_FOUND_RESPONSE.code,
          WORKOUT_TEMPLATE_EXERCISE_NOT_FOUND_RESPONSE.message,
        );
      }

      if (
        request.params.exerciseId !== request.body.newExerciseId &&
        existingTemplate.sections
          .flatMap((section) => section.exercises)
          .some((exercise) => exercise.exerciseId === request.body.newExerciseId)
      ) {
        return sendError(
          reply,
          409,
          WORKOUT_TEMPLATE_DUPLICATE_EXERCISE_RESPONSE.code,
          WORKOUT_TEMPLATE_DUPLICATE_EXERCISE_RESPONSE.message,
        );
      }

      const hasValidSwapTarget = await allRelatedExercisesOwned({
        userId: request.userId,
        exerciseIds: [request.body.newExerciseId],
      });
      if (!hasValidSwapTarget) {
        return sendError(
          reply,
          400,
          INVALID_TEMPLATE_EXERCISE_RESPONSE.code,
          INVALID_TEMPLATE_EXERCISE_RESPONSE.message,
        );
      }

      const swapped = await swapWorkoutTemplateExercise({
        templateId: request.params.id,
        userId: request.userId,
        exerciseId: request.params.exerciseId,
        newExerciseId: request.body.newExerciseId,
      });
      if (!swapped) {
        return sendError(
          reply,
          404,
          WORKOUT_TEMPLATE_EXERCISE_NOT_FOUND_RESPONSE.code,
          WORKOUT_TEMPLATE_EXERCISE_NOT_FOUND_RESPONSE.message,
        );
      }

      const swappedExercise = swapped.sections
        .flatMap((section) => section.exercises)
        .find((exercise) => exercise.exerciseId === request.body.newExerciseId);
      const hasTrackingTypeWarning =
        swappedExercise?.trackingType !== undefined &&
        sourceExercise.trackingType !== swappedExercise.trackingType;

      return reply.send({
        data: swapped,
        ...(hasTrackingTypeWarning
          ? {
              meta: {
                warning:
                  'Swapped to an exercise with a different tracking type. Review set targets and expectations.',
              },
            }
          : {}),
      });
    },
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
        tags: ['workout-templates'],
        summary: 'Delete a workout template',
        security: authSecurity,
      },
    },
    async (request, reply) => {
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
    },
  );
};
