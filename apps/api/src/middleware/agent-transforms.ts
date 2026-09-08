import { planMealFood, trackFoodCreation } from '../routes/meals/food-plans.js';
import { randomUUID } from 'node:crypto';

import type { ExerciseCategory, ExerciseTrackingType } from '@pulse/shared';
import type { FastifyRequest, preHandlerHookHandler } from 'fastify';

import { sendError } from '../lib/reply.js';
import { isAgentRequest } from './auth.js';
import {
  createExercise,
  findVisibleExerciseById,
  findVisibleExerciseByName,
  type ExerciseDedupCandidate,
  findExerciseDedupCandidates,
} from '../routes/exercises/store.js';
import { findFoodById, findFoodByName } from '../routes/foods/store.js';
import { findMealById } from '../routes/nutrition/store.js';
import { findWorkoutTemplateByName } from '../routes/workout-templates/store.js';

const DEFAULT_EXERCISE_CATEGORY: ExerciseCategory = 'compound';
const DEFAULT_EXERCISE_TRACKING_TYPE: ExerciseTrackingType = 'weight_reps';

type ResolvedFood = NonNullable<Awaited<ReturnType<typeof findFoodByName>>>;
type ResolvedExercise = NonNullable<Awaited<ReturnType<typeof findVisibleExerciseByName>>>;
type MutableRecord = Record<string, unknown>;

type ExerciseAutoCreateInput = {
  name: string;
  category?: ExerciseCategory;
  trackingType?: ExerciseTrackingType;
  muscleGroups?: string[];
  equipment?: string;
  tags?: string[];
  formCues?: string[];
  instructions?: string | null;
  coachingNotes?: string | null;
  relatedExerciseIds?: string[];
};

const isRecord = (value: unknown): value is MutableRecord =>
  typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const trimNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries = value
    .map(trimNonEmptyString)
    .filter((entry): entry is string => entry !== undefined);
  return entries.length > 0 ? entries : undefined;
};

const hasInlineFoodMacros = (
  value: MutableRecord,
): value is MutableRecord & {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} =>
  isFiniteNumber(value.calories) &&
  isFiniteNumber(value.protein) &&
  isFiniteNumber(value.carbs) &&
  isFiniteNumber(value.fat);

const resolveMealAmount = (item: MutableRecord): number | undefined => {
  if (isFiniteNumber(item.amount) && item.amount > 0) {
    return item.amount;
  }

  if (isFiniteNumber(item.quantity) && item.quantity > 0) {
    item.amount = item.quantity;
    return item.quantity;
  }

  return undefined;
};

const applyResolvedFoodMacros = ({
  item,
  amount,
  food,
}: {
  item: MutableRecord;
  amount: number;
  food: ResolvedFood;
}) => {
  item.foodId = food.id;
  item.name = food.name;
  item.calories = food.calories * amount;
  item.protein = food.protein * amount;
  item.carbs = food.carbs * amount;
  item.fat = food.fat * amount;
  item.fiber = food.fiber == null ? undefined : food.fiber * amount;
  item.sugar = food.sugar == null ? undefined : food.sugar * amount;
};

// This intentionally accepts several non-rep fields because some valid
// agent exercise inputs are time-based or metadata-driven and omit `reps`.
const isAgentExerciseInput = (value: MutableRecord) =>
  trimNonEmptyString(value.name) !== undefined &&
  isFiniteNumber(value.sets) &&
  (typeof value.reps === 'string' ||
    isFiniteNumber(value.reps) ||
    value.reps === null ||
    'section' in value ||
    'restSeconds' in value ||
    'tags' in value ||
    'cues' in value ||
    'formCues' in value);

const hasTemplateExerciseFields = (value: MutableRecord) =>
  'sets' in value ||
  'repsMin' in value ||
  'repsMax' in value ||
  'tempo' in value ||
  'restSeconds' in value ||
  'supersetGroup' in value ||
  'setTargets' in value ||
  'programmingNotes' in value;

const parseJsonNumberish = (raw: string) => {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function resolveByName(
  entityType: 'food',
  name: string,
  userId: string,
): Promise<ResolvedFood | undefined>;
export function resolveByName(
  entityType: 'exercise',
  name: string,
  userId: string,
): Promise<ResolvedExercise | undefined>;
export async function resolveByName(entityType: 'food' | 'exercise', name: string, userId: string) {
  if (entityType === 'food') {
    return findFoodByName(userId, name);
  }

  return findVisibleExerciseByName({ name, userId });
}

export function autoCreateIfMissing(
  entityType: 'exercise',
  data: ExerciseAutoCreateInput,
  userId: string,
): Promise<{
  created: boolean;
  entity: ResolvedExercise;
  possibleDuplicates: ExerciseDedupCandidate[];
}>;
export async function autoCreateIfMissing(
  entityType: 'exercise',
  data: ExerciseAutoCreateInput,
  userId: string,
) {
  const exerciseData = data as ExerciseAutoCreateInput;
  const existingExercise = await findVisibleExerciseByName({ name: exerciseData.name, userId });
  if (existingExercise) {
    return {
      created: false,
      entity: existingExercise,
      possibleDuplicates: [],
    };
  }

  const possibleDuplicates = await findExerciseDedupCandidates({
    userId,
    name: exerciseData.name,
  });
  const createdExercise = await createExercise({
    id: randomUUID(),
    userId,
    name: exerciseData.name,
    category: exerciseData.category ?? DEFAULT_EXERCISE_CATEGORY,
    trackingType: exerciseData.trackingType ?? DEFAULT_EXERCISE_TRACKING_TYPE,
    muscleGroups: exerciseData.muscleGroups ?? [],
    equipment: exerciseData.equipment ?? '',
    tags: exerciseData.tags ?? [],
    formCues: exerciseData.formCues ?? [],
    instructions: exerciseData.instructions ?? null,
    coachingNotes: exerciseData.coachingNotes ?? null,
    relatedExerciseIds: exerciseData.relatedExerciseIds ?? [],
  });

  return {
    created: true,
    entity: createdExercise,
    possibleDuplicates,
  };
}

export function parseRepsInput(
  reps: number | string,
): { repsMin: number; repsMax: number } | undefined {
  if (typeof reps === 'number') {
    return { repsMin: reps, repsMax: reps };
  }

  const rangeMatch = reps.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const min = parseJsonNumberish(rangeMatch[1]);
    const max = parseJsonNumberish(rangeMatch[2]);
    if (min !== undefined && max !== undefined) {
      return { repsMin: min, repsMax: max };
    }
  }

  const singleMatch = reps.match(/^(\d+)$/);
  if (singleMatch) {
    const value = parseJsonNumberish(singleMatch[1]);
    if (value !== undefined) {
      return { repsMin: value, repsMax: value };
    }
  }

  return undefined;
}

const resolveExerciseIdFromName = async ({
  name,
  userId,
  source,
}: {
  name: string;
  userId: string;
  source: MutableRecord;
}): Promise<string | undefined> => {
  const resolved = await resolveByName('exercise', name, userId);
  if (resolved) {
    return resolved.id;
  }

  const created = await autoCreateIfMissing(
    'exercise',
    {
      name,
      tags: toStringArray(source.tags),
      formCues: toStringArray(source.formCues),
      muscleGroups: [],
      equipment: '',
      instructions: null,
      coachingNotes: null,
      relatedExerciseIds: [],
    },
    userId,
  );
  return created.entity.id;
};

const transformFoodItem = async ({
  item,
  userId,
  createdFoodIds,
}: {
  item: MutableRecord;
  userId: string;
  createdFoodIds: Set<string>;
}) => {
  const foodName = trimNonEmptyString(item.foodName);
  const amount = resolveMealAmount(item);
  if (amount === undefined) return;
  if (item.adhoc === true || item.saveToFoods === false) {
    // Contradictions are rejected by the shared schema before this pre-handler.
    if (item.foodId == null) item.foodId = null;
    return;
  }
  if (typeof item.foodId === 'string') {
    const food = await findFoodById(item.foodId, userId);
    if (food) applyResolvedFoodMacros({ item, amount, food });
    return;
  }
  if (!foodName) return;
  if (trimNonEmptyString(item.unit) === undefined) item.unit = 'serving';
  if (trimNonEmptyString(item.name) === undefined) item.name = foodName;
  const brand = trimNonEmptyString(item.brand);
  const resolved = await findFoodByName(userId, foodName, brand);
  if (resolved) {
    applyResolvedFoodMacros({ item, amount, food: resolved });
    return;
  }
  if (hasInlineFoodMacros(item)) {
    planMealFood(item, {
      userId,
      createdFoodIds,
      food: {
        name: foodName,
        brand,
        servingSize: trimNonEmptyString(item.servingSize) ?? trimNonEmptyString(item.unit),
        servingGrams: isFiniteNumber(item.servingGrams) ? item.servingGrams : null,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        fiber: isFiniteNumber(item.fiber) ? item.fiber : null,
        sugar: isFiniteNumber(item.sugar) ? item.sugar : null,
        source: trimNonEmptyString(item.source),
        notes: trimNonEmptyString(item.notes),
        verified: item.verified === true,
        tags: toStringArray(item.tags) ?? [],
      },
    });
  }
};

const transformExerciseMutation = async ({
  input,
  userId,
}: {
  input: MutableRecord;
  userId: string;
}) => {
  const exerciseName = trimNonEmptyString(input.exerciseName);
  const namedExercise = trimNonEmptyString(input.name);
  const currentExerciseId = trimNonEmptyString(input.exerciseId);
  if (
    exerciseName &&
    (typeof input.exerciseId !== 'string' || currentExerciseId === exerciseName)
  ) {
    const resolvedId = await resolveExerciseIdFromName({
      name: exerciseName,
      userId,
      source: input,
    });
    if (resolvedId) {
      input.exerciseId = resolvedId;
    }
  }

  const isSetUpsertInput = isFiniteNumber(input.setNumber);
  const isExerciseMutationInput = isFiniteNumber(input.sets);
  if (
    !exerciseName &&
    !namedExercise &&
    currentExerciseId &&
    (isSetUpsertInput || isExerciseMutationInput)
  ) {
    const existingById = await findVisibleExerciseById({
      id: currentExerciseId,
      userId,
    });
    if (!existingById) {
      const resolvedId = await resolveExerciseIdFromName({
        name: currentExerciseId,
        userId,
        source: input,
      });
      if (resolvedId) {
        input.exerciseId = resolvedId;
      }
    }
  }

  const shouldExpandTemplateReps =
    hasTemplateExerciseFields(input) &&
    (exerciseName !== undefined || typeof input.exerciseId === 'string');
  const isAgentExerciseMutation = isAgentExerciseInput(input);

  if (isAgentExerciseMutation) {
    if (
      namedExercise &&
      (typeof input.exerciseId !== 'string' || currentExerciseId === namedExercise)
    ) {
      const resolvedId = await resolveExerciseIdFromName({
        name: namedExercise,
        userId,
        source: input,
      });
      if (resolvedId) {
        input.exerciseId = resolvedId;
      }
    }
  }

  if (
    (isAgentExerciseMutation || shouldExpandTemplateReps) &&
    (typeof input.reps === 'string' || typeof input.reps === 'number') &&
    (input.repsMin === undefined || input.repsMin === null) &&
    (input.repsMax === undefined || input.repsMax === null)
  ) {
    const parsedReps = parseRepsInput(input.reps);
    if (parsedReps) {
      input.repsMin = parsedReps.repsMin;
      input.repsMax = parsedReps.repsMax;
    }
  }
};

const transformTemplateReference = async ({
  input,
  userId,
}: {
  input: MutableRecord;
  userId: string;
}) => {
  const templateName = trimNonEmptyString(input.templateName);
  if (!templateName) {
    return;
  }

  const currentTemplateId = trimNonEmptyString(input.templateId);
  if (currentTemplateId && currentTemplateId !== templateName) {
    return;
  }

  const resolvedTemplate = await findWorkoutTemplateByName({
    name: templateName,
    userId,
  });
  if (resolvedTemplate) {
    input.templateId = resolvedTemplate.id;
  }
};

export const transformAgentRequestBody = async ({
  body,
  userId,
}: {
  body: unknown;
  userId: string;
}): Promise<void> => {
  const createdFoodIds = isRecord(body) ? trackFoodCreation(body) : new Set<string>();
  const visit = async (value: unknown): Promise<void> => {
    if (Array.isArray(value)) {
      for (const entry of value) await visit(entry);
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    await transformFoodItem({ item: value, userId, createdFoodIds });
    await transformExerciseMutation({ input: value, userId });
    await transformTemplateReference({ input: value, userId });

    for (const nestedValue of Object.values(value)) {
      await visit(nestedValue);
    }
  };

  await visit(body);
};

export const agentRequestTransform: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply,
): Promise<void> => {
  if (!isAgentRequest(request)) {
    return;
  }

  try {
    if (
      request.method === 'POST' &&
      request.routeOptions.url?.endsWith('/:id/items') &&
      isRecord(request.params) &&
      typeof request.params.id === 'string'
    ) {
      if (!(await findMealById(request.userId, request.params.id))) {
        throw Object.assign(new Error('Meal not found'), {
          statusCode: 404,
          code: 'MEAL_NOT_FOUND',
        });
      }
    }
    if (isRecord(request.body) && Array.isArray(request.body.items)) {
      for (const item of request.body.items) {
        if (!isRecord(item)) continue;
        if (typeof item.foodId === 'string' && !(await findFoodById(item.foodId, request.userId))) {
          throw Object.assign(new Error('One or more meal items reference unavailable foods'), {
            statusCode: 422,
            code: 'INVALID_MEAL_ITEMS',
          });
        }
        if (
          item.foodId == null &&
          item.adhoc !== true &&
          item.saveToFoods !== false &&
          typeof item.foodName === 'string'
        ) {
          const exact = await findFoodByName(
            request.userId,
            item.foodName,
            trimNonEmptyString(item.brand),
          );
          if (!exact && !hasInlineFoodMacros(item))
            throw Object.assign(
              new Error(
                'Could not resolve food; specify an owned foodId or complete inline macros',
              ),
              { statusCode: 422, code: 'UNRESOLVED_FOODS' },
            );
        }
      }
    }
    await transformAgentRequestBody({
      body: request.body,
      userId: request.userId,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      ['UNRESOLVED_FOODS', 'INVALID_MEAL_ITEMS', 'MEAL_NOT_FOUND'].includes(String(error.code))
    ) {
      sendError(
        reply,
        error.code === 'MEAL_NOT_FOUND' ? 404 : 422,
        String(error.code),
        error.message,
      );
      return;
    }
    throw error;
  }
};
