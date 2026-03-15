import { randomUUID } from 'node:crypto';

import type { ExerciseCategory, ExerciseTrackingType } from '@pulse/shared';

import {
  createExercise,
  findVisibleExerciseByName,
  type ExerciseDedupCandidate,
  findExerciseDedupCandidates,
} from './exercises/store.js';
import { createFood, findFoodByName } from './foods/store.js';

const DEFAULT_EXERCISE_CATEGORY: ExerciseCategory = 'compound';
const DEFAULT_EXERCISE_TRACKING_TYPE: ExerciseTrackingType = 'weight_reps';

type ResolvedFood = NonNullable<Awaited<ReturnType<typeof findFoodByName>>>;
type ResolvedExercise = NonNullable<Awaited<ReturnType<typeof findVisibleExerciseByName>>>;

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
export async function resolveByName(
  entityType: 'food' | 'exercise',
  name: string,
  userId: string,
) {
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
