import { randomUUID } from 'node:crypto';

import {
  type AgentTemplateNewExercise,
  agentCreateWorkoutSessionInputSchema,
  agentCreateWorkoutTemplateInputSchema,
  agentUpdateWorkoutSessionInputSchema,
  agentUpdateWorkoutTemplateInputSchema,
  createScheduledWorkoutInputSchema,
  createWorkoutSessionInputSchema,
  type CreateWorkoutTemplateInput,
  type CreateWorkoutSessionInput,
  scheduledWorkoutQueryParamsSchema,
  type WorkoutSession,
  type WorkoutTemplateSectionType,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { createScheduledWorkout, listScheduledWorkouts } from '../scheduled-workouts/store.js';
import {
  createExercise,
  findExerciseDedupCandidates,
  findVisibleExerciseByName,
  updateOwnedExercise,
} from '../exercises/store.js';
import { templateBelongsToUser } from '../workout-templates/template-access.js';
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
const DEFAULT_EXERCISE_TRACKING_TYPE = 'weight_reps' as const;
const SITUATIONAL_CUE_PATTERN =
  /\b(today|tonight|tomorrow|this week|next week|week \d+|day \d+|block|phase|cycle|mesocycle|deload|amrap|top set|backoff|back-off|drop set|rpe|rir|percent|%|heavy|light)\b/i;

const dedupeStrings = (values: string[] | undefined): string[] =>
  values ? [...new Set(values)] : [];

const classifyCues = ({
  cues,
  formCues,
}: {
  cues?: string[];
  formCues?: string[];
}): { durable: string[]; situational: string[] } => {
  const durable = [...(formCues ?? [])];
  const situational: string[] = [];

  for (const cue of cues ?? []) {
    if (SITUATIONAL_CUE_PATTERN.test(cue)) {
      situational.push(cue);
      continue;
    }

    durable.push(cue);
  }

  return {
    durable: dedupeStrings(durable),
    situational: dedupeStrings(situational),
  };
};

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
  cues,
  formCues,
}: {
  name: string;
  userId: string;
  tags?: string[];
  cues?: string[];
  formCues?: string[];
}): Promise<{
  exerciseId: string;
  newExercise: AgentTemplateNewExercise | null;
  templateCues: string[];
}> => {
  const classifiedCues = classifyCues({ cues, formCues });
  const existingExercise = await findVisibleExerciseByName({ name, userId });
  if (existingExercise) {
    if (existingExercise.userId === userId && classifiedCues.durable.length > 0) {
      const mergedFormCues = dedupeStrings([
        ...(existingExercise.formCues ?? []),
        ...classifiedCues.durable,
      ]);
      if (mergedFormCues.length !== (existingExercise.formCues ?? []).length) {
        await updateOwnedExercise({
          id: existingExercise.id,
          userId,
          changes: { formCues: mergedFormCues },
        });
      }
    }

    return {
      exerciseId: existingExercise.id,
      newExercise: null,
      templateCues: classifiedCues.situational,
    };
  }

  const possibleDuplicates = await findExerciseDedupCandidates({
    userId,
    name,
  });

  const createdExercise = await createExercise({
    id: randomUUID(),
    userId,
    name,
    category: DEFAULT_EXERCISE_CATEGORY,
    trackingType: DEFAULT_EXERCISE_TRACKING_TYPE,
    muscleGroups: [],
    equipment: '',
    tags,
    formCues: classifiedCues.durable,
    instructions: null,
  });

  return {
    exerciseId: createdExercise.id,
    templateCues: classifiedCues.situational,
    newExercise: {
      id: createdExercise.id,
      name: createdExercise.name,
      possibleDuplicates: possibleDuplicates.map((candidate) => candidate.id),
    },
  };
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
      cues?: string[];
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
  const newExercises: AgentTemplateNewExercise[] = [];

  for (const section of sections) {
    const sectionType = inferSectionType(section.name);
    const existingExercises = groupedByType.get(sectionType);
    if (!existingExercises) {
      continue;
    }

    for (const exercise of section.exercises) {
      const resolvedExercise = await resolveExerciseIdByName({
        name: exercise.name,
        userId,
        tags: exercise.tags,
        cues: exercise.cues,
        formCues: exercise.formCues,
      });
      if (resolvedExercise.newExercise) {
        newExercises.push(resolvedExercise.newExercise);
      }

      existingExercises.push({
        exerciseId: resolvedExercise.exerciseId,
        sets: exercise.sets,
        repsMin: exercise.reps,
        repsMax: exercise.reps,
        tempo: null,
        restSeconds: exercise.restSeconds ?? null,
        supersetGroup: null,
        notes: null,
        cues: resolvedExercise.templateCues,
      });
    }
  }

  return {
    sections: SECTION_ORDER.flatMap((type) => {
      const exercises = groupedByType.get(type) ?? [];
      return exercises.length > 0 ? [{ type, exercises }] : [];
    }),
    newExercises,
  };
};

const toCreateWorkoutSessionInput = (session: WorkoutSession): CreateWorkoutSessionInput => ({
  templateId: session.templateId,
  name: session.name,
  date: session.date,
  status: session.status,
  startedAt: session.startedAt,
  completedAt: session.completedAt,
  duration: session.duration,
  timeSegments: session.timeSegments,
  feedback: session.feedback,
  notes: session.notes,
  sets: session.sets.map((set) => ({
    exerciseId: set.exerciseId,
    orderIndex: set.orderIndex ?? 0,
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
    for (const [exerciseIndex, exercise] of section.exercises.entries()) {
      const setCount = exercise.sets ?? 1;

      for (let setNumber = 1; setNumber <= setCount; setNumber += 1) {
        sets.push({
          exerciseId: exercise.exerciseId,
          orderIndex: exerciseIndex,
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
  app.post('/scheduled-workouts', async (request, reply) => {
    const parsedBody = createScheduledWorkoutInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid scheduled workout payload');
    }

    const templateAccessible = await templateBelongsToUser(
      parsedBody.data.templateId,
      request.userId,
    );
    if (!templateAccessible) {
      return sendError(
        reply,
        404,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
        WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
      );
    }

    const scheduledWorkout = await createScheduledWorkout({
      id: randomUUID(),
      userId: request.userId,
      input: parsedBody.data,
    });

    return reply.code(201).send({
      data: scheduledWorkout,
    });
  });

  app.get('/scheduled-workouts', async (request, reply) => {
    const parsedQuery = scheduledWorkoutQueryParamsSchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid scheduled workout query');
    }

    const scheduledWorkoutItems = await listScheduledWorkouts({
      userId: request.userId,
      ...parsedQuery.data,
    });

    return reply.send({
      data: scheduledWorkoutItems,
    });
  });

  app.post('/workout-templates', async (request, reply) => {
    const parsed = agentCreateWorkoutTemplateInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid workout template payload');
    }

    const { sections, newExercises } = await buildTemplateSections({
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

    return reply.code(201).send({
      data: {
        template,
        newExercises,
      },
    });
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

    const { sections, newExercises } = await buildTemplateSections({
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

    return reply.send({
      data: {
        template,
        newExercises,
      },
    });
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
        const resolvedExercise = await resolveExerciseIdByName({
          name: set.exerciseName,
          userId: request.userId,
        });
        const exerciseId = resolvedExercise.exerciseId;
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
          orderIndex: exerciseOrder.get(exerciseId) ?? 0,
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
