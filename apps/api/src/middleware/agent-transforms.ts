import { randomUUID } from 'node:crypto';

import type { ExerciseCategory, ExerciseTrackingType } from '@pulse/shared';
import type { FastifyRequest, preHandlerHookHandler } from 'fastify';

import { isAgentRequest } from './auth.js';
import {
  createExercise,
  findVisibleExerciseByName,
  type ExerciseDedupCandidate,
  findExerciseDedupCandidates,
} from '../routes/exercises/store.js';
import { createFood, findFoodByName } from '../routes/foods/store.js';
import { findWorkoutTemplateByName } from '../routes/workout-templates/store.js';

const DEFAULT_EXERCISE_CATEGORY: ExerciseCategory = 'compound';
const DEFAULT_EXERCISE_TRACKING_TYPE: ExerciseTrackingType = 'weight_reps';
const DEFAULT_REP_TARGET = 10;

type ResolvedFood = NonNullable<Awaited<ReturnType<typeof findFoodByName>>>;
type ResolvedExercise = NonNullable<Awaited<ReturnType<typeof findVisibleExerciseByName>>>;
type MutableRecord = Record<string, unknown>;

type FoodAutoCreateInput = {
  name: string;
  brand?: string | null;
  servingSize?: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source?: string | null;
  notes?: string | null;
};

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
};

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
  entityType: 'food',
  data: FoodAutoCreateInput,
  userId: string,
): Promise<{ created: boolean; entity: ResolvedFood }>;
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
  entityType: 'food' | 'exercise',
  data: FoodAutoCreateInput | ExerciseAutoCreateInput,
  userId: string,
) {
  if (entityType === 'food') {
    const foodData = data as FoodAutoCreateInput;
    const existingFood = await findFoodByName(userId, foodData.name);
    if (existingFood) {
      return { created: false, entity: existingFood };
    }

    const createdFood = await createFood({
      id: randomUUID(),
      userId,
      name: foodData.name,
      brand: foodData.brand ?? null,
      servingSize: foodData.servingSize ?? null,
      servingGrams: null,
      calories: foodData.calories,
      protein: foodData.protein,
      carbs: foodData.carbs,
      fat: foodData.fat,
      fiber: null,
      sugar: null,
      verified: false,
      source: foodData.source ?? null,
      notes: foodData.notes ?? null,
      tags: [],
    });

    return {
      created: true,
      entity: {
        id: createdFood.id,
        name: createdFood.name,
        brand: createdFood.brand,
        servingSize: createdFood.servingSize,
        calories: createdFood.calories,
        protein: createdFood.protein,
        carbs: createdFood.carbs,
        fat: createdFood.fat,
      },
    };
  }

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

export function parseRepsInput(reps: number | string): { repsMin: number; repsMax: number } {
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

  return { repsMin: DEFAULT_REP_TARGET, repsMax: DEFAULT_REP_TARGET };
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

const transformFoodItem = async ({ item, userId }: { item: MutableRecord; userId: string }) => {
  const foodName = trimNonEmptyString(item.foodName);
  if (!foodName) {
    return;
  }

  const amount = resolveMealAmount(item);
  if (amount === undefined) {
    return;
  }

  if (trimNonEmptyString(item.unit) === undefined) {
    item.unit = 'serving';
  }

  if (trimNonEmptyString(item.name) === undefined) {
    item.name = foodName;
  }

  const isAdhoc = item.adhoc === true || item.saveToFoods === false;
  if (isAdhoc) {
    if (typeof item.foodId !== 'string') {
      item.foodId = null;
    }
    return;
  }

  if (typeof item.foodId !== 'string') {
    if (hasInlineFoodMacros(item)) {
      const created = await autoCreateIfMissing(
        'food',
        {
          name: foodName,
          servingSize: trimNonEmptyString(item.unit) ?? null,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
        },
        userId,
      );
      applyResolvedFoodMacros({
        item,
        amount,
        food: created.entity,
      });
      return;
    }

    const resolved = await resolveByName('food', foodName, userId);
    if (resolved) {
      applyResolvedFoodMacros({
        item,
        amount,
        food: resolved,
      });
    }
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
  if (
    exerciseName &&
    (typeof input.exerciseId !== 'string' ||
      trimNonEmptyString(input.exerciseId) === exerciseName)
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

  const shouldExpandTemplateReps =
    hasTemplateExerciseFields(input) &&
    (exerciseName !== undefined || typeof input.exerciseId === 'string');
  const isAgentExerciseMutation = isAgentExerciseInput(input);

  if (isAgentExerciseMutation) {
    const namedExercise = trimNonEmptyString(input.name);
    const currentExerciseId = trimNonEmptyString(input.exerciseId);
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
    const { repsMin, repsMax } = parseRepsInput(input.reps);
    input.repsMin = repsMin;
    input.repsMax = repsMax;
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
  const visit = async (value: unknown): Promise<void> => {
    if (Array.isArray(value)) {
      for (const entry of value) {
        await visit(entry);
      }
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    await transformFoodItem({ item: value, userId });
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
): Promise<void> => {
  if (!isAgentRequest(request)) {
    return;
  }

  await transformAgentRequestBody({
    body: request.body,
    userId: request.userId,
  });
};
