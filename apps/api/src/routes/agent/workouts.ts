import { randomUUID } from 'node:crypto';

import {
  agentCreateWorkoutSessionInputSchema,
  agentCreateWorkoutTemplateInputSchema,
  agentUpdateWorkoutSessionInputSchema,
  agentUpdateWorkoutTemplateInputSchema,
  createWorkoutSessionInputSchema,
  type CreateWorkoutTemplateInput,
  type CreateWorkoutSessionInput,
  type WorkoutSession,
  type WorkoutTemplateSectionType,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { createExercise, findVisibleExerciseByName } from '../exercises/store.js';
import {
  createWorkoutSession,
  findWorkoutSessionById,
  updateWorkoutSession,
} from '../workout-sessions/store.js';
import {
  createWorkoutTemplate,
  findWorkoutTemplateById,
  updateWorkoutTemplate,
} from '../workout-templates/store.js';

const SECTION_ORDER: WorkoutTemplateSectionType[] = ['warmup', 'main', 'cooldown'];

const WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE = {
  code: 'WORKOUT_TEMPLATE_NOT_FOUND',
  message: 'Workout template not found',
} as const;

const WORKOUT_SESSION_NOT_FOUND_RESPONSE = {
  code: 'WORKOUT_SESSION_NOT_FOUND',
  message: 'Workout session not found',
} as const;

const DEFAULT_EXERCISE_CATEGORY = 'compound' as const;
const DEFAULT_EXERCISE_MUSCLE_GROUPS = ['Full Body'];
const DEFAULT_EXERCISE_EQUIPMENT = 'Bodyweight';
const DEFAULT_EXERCISE_TRACKING_TYPE = 'weight_reps' as const;

const inferSectionType = (name: string): WorkoutTemplateSectionType => {
  const normalized = name.trim().toLowerCase();

  if (normalized.includes('warm')) {
    return 'warmup';
  }

  if (normalized.includes('cool')) {
    return 'cooldown';
  }

  return 'main';
};

const resolveExerciseIdByName = async ({
  name,
  userId,
  tags,
  formCues,
}: {
  name: string;
  userId: string;
  tags?: string[];
  formCues?: string[];
}): Promise<string> => {
  const existingExercise = await findVisibleExerciseByName({ name, userId });
  if (existingExercise) {
    return existingExercise.id;
  }

  const createdExercise = await createExercise({
    id: randomUUID(),
    userId,
    name,
    category: DEFAULT_EXERCISE_CATEGORY,
    trackingType: DEFAULT_EXERCISE_TRACKING_TYPE,
    muscleGroups: DEFAULT_EXERCISE_MUSCLE_GROUPS,
    equipment: DEFAULT_EXERCISE_EQUIPMENT,
    tags,
    formCues,
    instructions: null,
  });

  return createdExercise.id;
};

const buildTemplateSections = async ({
  sections,
  userId,
}: {
  sections: Array<{
    name: string;
    exercises: Array<{
      name: string;
      sets: number;
      reps: number;
      restSeconds?: number;
      tags?: string[];
      formCues?: string[];
    }>;
  }>;
  userId: string;
}) => {
  const groupedByType = new Map<
    WorkoutTemplateSectionType,
    CreateWorkoutTemplateInput['sections'][number]['exercises']
  >();
  // Intentionally merge repeated agent sections that map to the same canonical type.
  // The template model stores a single section per type (`warmup`/`main`/`cooldown`).
  groupedByType.set('warmup', []);
  groupedByType.set('main', []);
  groupedByType.set('cooldown', []);

  for (const section of sections) {
    const sectionType = inferSectionType(section.name);
    const existingExercises = groupedByType.get(sectionType);
    if (!existingExercises) {
      continue;
    }

    for (const exercise of section.exercises) {
      const exerciseId = await resolveExerciseIdByName({
        name: exercise.name,
        userId,
        tags: exercise.tags,
        formCues: exercise.formCues,
      });

      existingExercises.push({
        exerciseId,
        sets: exercise.sets,
        repsMin: exercise.reps,
        repsMax: exercise.reps,
        tempo: null,
        restSeconds: exercise.restSeconds ?? null,
        supersetGroup: null,
        notes: null,
        cues: [],
      });
    }
  }

  return SECTION_ORDER.flatMap((type) => {
    const exercises = groupedByType.get(type) ?? [];
    return exercises.length > 0 ? [{ type, exercises }] : [];
  });
};

const toCreateWorkoutSessionInput = (session: WorkoutSession): CreateWorkoutSessionInput => ({
  templateId: session.templateId,
  name: session.name,
  date: session.date,
  status: session.status,
  startedAt: session.startedAt,
  completedAt: session.completedAt,
  duration: session.duration,
  feedback: session.feedback,
  notes: session.notes,
  sets: session.sets.map((set) => ({
    exerciseId: set.exerciseId,
    setNumber: set.setNumber,
    weight: set.weight,
    reps: set.reps,
    completed: set.completed,
    skipped: set.skipped,
    section: set.section,
    notes: set.notes,
  })),
});

const buildInitialSessionSets = (
  sections: Array<{
    type: WorkoutTemplateSectionType;
    exercises: Array<{ exerciseId: string; sets: number | null }>;
  }>,
): CreateWorkoutSessionInput['sets'] => {
  const sets: CreateWorkoutSessionInput['sets'] = [];

  for (const section of sections) {
    for (const exercise of section.exercises) {
      const setCount = exercise.sets ?? 1;

      for (let setNumber = 1; setNumber <= setCount; setNumber += 1) {
        sets.push({
          exerciseId: exercise.exerciseId,
          setNumber,
          weight: null,
          reps: null,
          completed: false,
          skipped: false,
          section: section.type,
          notes: null,
        });
      }
    }
  }

  return sets;
};

export const agentWorkoutRoutes: FastifyPluginAsync = async (app) => {
  app.post('/workout-templates', async (request, reply) => {
    const parsed = agentCreateWorkoutTemplateInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout template payload');
    }

    const sections = await buildTemplateSections({
      sections: parsed.data.sections,
      userId: request.userId,
    });

    const template = await createWorkoutTemplate({
      id: randomUUID(),
      userId: request.userId,
      input: {
        name: parsed.data.name,
        description: null,
        tags: [],
        sections,
      },
    });

    return reply.code(201).send({ data: template });
  });

  app.put<{ Params: { id: string } }>('/workout-templates/:id', async (request, reply) => {
    const parsed = agentUpdateWorkoutTemplateInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout template payload');
    }

    const existing = await findWorkoutTemplateById(request.params.id, request.userId);
    if (!existing) {
      return sendError(
        reply,
        404,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
      );
    }

    const sections = await buildTemplateSections({
      sections: parsed.data.sections,
      userId: request.userId,
    });

    const template = await updateWorkoutTemplate({
      id: request.params.id,
      userId: request.userId,
      input: {
        name: parsed.data.name,
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

    return reply.send({ data: template });
  });

  app.post('/workout-sessions', async (request, reply) => {
    const parsed = agentCreateWorkoutSessionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
    }

    const startedAt = Date.now();
    const date = new Date(startedAt).toISOString().slice(0, 10);

    const templateId: string | null = parsed.data.templateId ?? null;
    let name = parsed.data.name;
    let sets: CreateWorkoutSessionInput['sets'] = [];

    if (templateId) {
      const template = await findWorkoutTemplateById(templateId, request.userId);
      if (!template) {
        return sendError(
          reply,
          404,
          WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
          WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
        );
      }

      name = name ?? template.name;
      sets = buildInitialSessionSets(template.sections);
    }

    const payload = createWorkoutSessionInputSchema.safeParse({
      templateId,
      name,
      date,
      status: 'in-progress',
      startedAt,
      completedAt: null,
      duration: null,
      feedback: null,
      notes: null,
      sets,
    });

    if (!payload.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
    }

    const session = await createWorkoutSession({
      id: randomUUID(),
      userId: request.userId,
      input: payload.data,
    });

    return reply.code(201).send({ data: session });
  });

  app.patch<{ Params: { id: string } }>('/workout-sessions/:id', async (request, reply) => {
    const parsed = agentUpdateWorkoutSessionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
    }

    const existing = await findWorkoutSessionById(request.params.id, request.userId);
    if (!existing) {
      return sendError(
        reply,
        404,
        WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
        WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
      );
    }

    const merged = toCreateWorkoutSessionInput(existing);

    if (parsed.data.sets) {
      const setMap = new Map(
        merged.sets.map((set) => [`${set.exerciseId}:${set.setNumber}`, { ...set }]),
      );
      const exerciseOrder = new Map<string, number>();
      for (const set of merged.sets) {
        if (!exerciseOrder.has(set.exerciseId)) {
          exerciseOrder.set(set.exerciseId, exerciseOrder.size);
        }
      }

      for (const set of parsed.data.sets) {
        const exerciseId = await resolveExerciseIdByName({
          name: set.exerciseName,
          userId: request.userId,
        });
        if (!exerciseOrder.has(exerciseId)) {
          exerciseOrder.set(exerciseId, exerciseOrder.size);
        }

        const key = `${exerciseId}:${set.setNumber}`;
        const previous = setMap.get(key);

        if (previous) {
          setMap.set(key, {
            ...previous,
            weight: set.weight,
            reps: set.reps,
            completed: true,
            skipped: false,
          });
          continue;
        }

        setMap.set(key, {
          exerciseId,
          setNumber: set.setNumber,
          weight: set.weight,
          reps: set.reps,
          completed: true,
          skipped: false,
          section: null,
          notes: null,
        });
      }

      merged.sets = Array.from(setMap.values()).sort((left, right) => {
        const leftOrder = exerciseOrder.get(left.exerciseId) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = exerciseOrder.get(right.exerciseId) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return left.setNumber - right.setNumber;
      });
    }

    if (parsed.data.status !== undefined) {
      merged.status = parsed.data.status;

      if (parsed.data.status === 'completed') {
        const completedAt = Date.now();
        merged.completedAt = completedAt;
        merged.duration = Math.max(0, completedAt - merged.startedAt);
      } else {
        merged.completedAt = null;
        merged.duration = null;
      }
    }

    if (parsed.data.notes !== undefined) {
      merged.notes = parsed.data.notes;
    }

    const payload = createWorkoutSessionInputSchema.safeParse(merged);
    if (!payload.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout session payload');
    }

    const session = await updateWorkoutSession({
      id: request.params.id,
      userId: request.userId,
      input: payload.data,
    });
    if (!session) {
      return sendError(
        reply,
        404,
        WORKOUT_SESSION_NOT_FOUND_RESPONSE.code,
        WORKOUT_SESSION_NOT_FOUND_RESPONSE.message,
      );
    }

    return reply.send({ data: session });
  });
};
