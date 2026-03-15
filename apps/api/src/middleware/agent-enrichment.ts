import type {
  AgentEnrichment,
  BodyWeightEntry,
  HabitEntry,
  HabitTrackingType,
  WorkoutSession,
} from '@pulse/shared';
import type { FastifyRequest } from 'fastify';

import { isAgentRequest } from './auth.js';

type MacroSummary = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type FoodSummary = {
  id: string;
  name: string;
  brand?: string | null;
  servingSize?: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type HabitSummary = {
  id: string;
  name: string;
  trackingType: HabitTrackingType;
  target?: number | null;
  unit?: string | null;
  referenceSource?: string | null;
};

export type AgentEnrichmentContext =
  | {
      endpoint: 'meal.create' | 'meal.update';
      mealDate?: string;
      mealName?: string | null;
      itemCount?: number;
      mealMacros?: MacroSummary;
    }
  | {
      endpoint: 'workout-session.mutation';
      action: 'create' | 'update' | 'reorder' | 'swap' | 'time-segments' | 'set';
      session?: WorkoutSession;
    }
  | {
      endpoint: 'habit-entry.mutation';
      habit: HabitSummary;
      previousEntry?: Pick<HabitEntry, 'completed' | 'value'>;
    }
  | {
      endpoint: 'weight.mutation';
      previousEntry?: BodyWeightEntry | null;
    }
  | {
      endpoint: 'food.create';
      similarFoods?: Array<Pick<FoodSummary, 'id' | 'name' | 'brand'>>;
    };

const formatNumber = (value: number) => {
  if (Number.isInteger(value)) {
    return `${value}`;
  }

  return value.toFixed(1).replace(/\.0$/, '');
};

const compactStrings = (values: Array<string | undefined>) =>
  values.filter((value): value is string => typeof value === 'string' && value.length > 0);

const compactRecord = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isWorkoutSession = (value: unknown): value is WorkoutSession =>
  isRecord(value) && Array.isArray(value.sets) && typeof value.status === 'string';

const isHabitEntry = (value: unknown): value is HabitEntry =>
  isRecord(value) &&
  typeof value.habitId === 'string' &&
  typeof value.date === 'string' &&
  typeof value.completed === 'boolean';

const isWeightEntry = (value: unknown): value is BodyWeightEntry =>
  isRecord(value) &&
  typeof value.date === 'string' &&
  typeof value.weight === 'number' &&
  typeof value.id === 'string';

const isFoodSummary = (value: unknown): value is FoodSummary =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.calories === 'number' &&
  typeof value.protein === 'number' &&
  typeof value.carbs === 'number' &&
  typeof value.fat === 'number';

const deriveMealMacros = (responseData: unknown): MacroSummary | undefined => {
  if (!isRecord(responseData)) {
    return undefined;
  }

  if (
    isRecord(responseData.macros) &&
    typeof responseData.macros.calories === 'number' &&
    typeof responseData.macros.protein === 'number' &&
    typeof responseData.macros.carbs === 'number' &&
    typeof responseData.macros.fat === 'number'
  ) {
    return responseData.macros as MacroSummary;
  }

  if (!Array.isArray(responseData.items)) {
    return undefined;
  }

  const itemTotals = responseData.items.filter(isRecord);
  if (itemTotals.length === 0) {
    return undefined;
  }

  return itemTotals.reduce<MacroSummary>(
    (totals, item) => ({
      calories: totals.calories + (typeof item.calories === 'number' ? item.calories : 0),
      protein: totals.protein + (typeof item.protein === 'number' ? item.protein : 0),
      carbs: totals.carbs + (typeof item.carbs === 'number' ? item.carbs : 0),
      fat: totals.fat + (typeof item.fat === 'number' ? item.fat : 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
};

const buildMealEnrichment = (
  responseData: unknown,
  context: Extract<AgentEnrichmentContext, { endpoint: 'meal.create' | 'meal.update' }>,
): AgentEnrichment => {
  const mealMacros = context.mealMacros ?? deriveMealMacros(responseData);
  const record = isRecord(responseData) ? responseData : undefined;
  const mealName =
    context.mealName ??
    (record && isRecord(record.meal) && typeof record.meal.name === 'string'
      ? record.meal.name
      : record && typeof record.name === 'string'
        ? record.name
        : 'meal');
  const itemCount =
    context.itemCount ??
    (record && Array.isArray(record.items) ? record.items.length : undefined);

  return {
    hints: compactStrings([
      mealMacros
        ? `${mealName} adds ${formatNumber(mealMacros.calories)} kcal, ${formatNumber(mealMacros.protein)}g protein, ${formatNumber(mealMacros.carbs)}g carbs, and ${formatNumber(mealMacros.fat)}g fat.`
        : undefined,
      'Use the day nutrition summary to judge what macros remain before the next meal.',
    ]),
    suggestedActions: compactStrings([
      'Log the next meal or snack when it happens.',
      "Review today's nutrition summary if you need remaining macro targets.",
    ]),
    relatedState: compactRecord({
      date: context.mealDate,
      mealName,
      itemCount,
      mealMacros,
    }),
  };
};

const buildWorkoutSessionEnrichment = (
  responseData: unknown,
  context: Extract<AgentEnrichmentContext, { endpoint: 'workout-session.mutation' }>,
): AgentEnrichment | undefined => {
  const session = context.session ?? (isWorkoutSession(responseData) ? responseData : undefined);
  if (!session) {
    return undefined;
  }

  const sortedSets = [...session.sets].sort((left, right) => {
    const leftOrder = left.orderIndex ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.orderIndex ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.setNumber - right.setNumber;
  });
  const totalSets = sortedSets.length;
  const completedSets = sortedSets.filter((set) => set.completed).length;
  const openSets = sortedSets.filter((set) => !set.completed && !set.skipped);
  const exerciseIds = new Set(sortedSets.map((set) => set.exerciseId));
  const remainingExerciseIds = new Set(openSets.map((set) => set.exerciseId));
  const nextSet = openSets[0];
  const nextExercise = session.exercises?.find((exercise) => exercise.exerciseId === nextSet?.exerciseId);

  return {
    hints: compactStrings([
      `Session progress is ${completedSets}/${totalSets} completed sets across ${exerciseIds.size} exercises.`,
      remainingExerciseIds.size > 0
        ? `${pluralize(remainingExerciseIds.size, 'exercise')} still ${remainingExerciseIds.size === 1 ? 'has' : 'have'} unfinished work.`
        : 'All planned exercises are complete, so the session can be wrapped up whenever you are ready.',
    ]),
    suggestedActions: compactStrings([
      nextSet
        ? `Log set ${nextSet.setNumber} for ${nextExercise?.exerciseName ?? nextSet.exerciseId}.`
        : session.status === 'in-progress'
          ? 'Mark the session completed or add a finisher set if more work is needed.'
          : 'Review notes and confirm the session status is final.',
      session.status === 'in-progress' ? 'Pause or complete the session when the workout ends.' : undefined,
    ]),
    relatedState: compactRecord({
      action: context.action,
      status: session.status,
      totalSets,
      completedSets,
      remainingSets: openSets.length,
      remainingExercises: remainingExerciseIds.size,
      nextSet: nextSet
        ? {
            exerciseId: nextSet.exerciseId,
            exerciseName: nextExercise?.exerciseName ?? null,
            setNumber: nextSet.setNumber,
          }
        : null,
    }),
  };
};

const buildHabitEntryEnrichment = (
  responseData: unknown,
  context: Extract<AgentEnrichmentContext, { endpoint: 'habit-entry.mutation' }>,
): AgentEnrichment | undefined => {
  if (!isHabitEntry(responseData)) {
    return undefined;
  }

  const targetSummary =
    context.habit.target !== undefined && context.habit.target !== null
      ? `${formatNumber(context.habit.target)}${context.habit.unit ? ` ${context.habit.unit}` : ''}`
      : undefined;

  return {
    hints: compactStrings([
      responseData.completed
        ? targetSummary && responseData.value !== null
          ? `${context.habit.name} is complete with ${formatNumber(responseData.value)}${context.habit.unit ? ` ${context.habit.unit}` : ''} logged against the ${targetSummary} target.`
          : `${context.habit.name} is marked complete for ${responseData.date}.`
        : `${context.habit.name} is still incomplete for ${responseData.date}.`,
      responseData.completed
        ? 'This check-in keeps the habit chain active for today.'
        : 'If you still plan to do it today, the habit remains available for a later check-in.',
    ]),
    suggestedActions: compactStrings([
      responseData.completed
        ? 'Review other habits that are still open for today.'
        : 'Revisit this habit later today if you still intend to complete it.',
    ]),
    relatedState: compactRecord({
      habitId: context.habit.id,
      habitName: context.habit.name,
      trackingType: context.habit.trackingType,
      date: responseData.date,
      completed: responseData.completed,
      value: responseData.value,
      target: context.habit.target ?? null,
      unit: context.habit.unit ?? null,
      referenceSource: context.habit.referenceSource ?? null,
      wasPreviouslyCompleted: context.previousEntry?.completed,
    }),
  };
};

const buildWeightEnrichment = (
  responseData: unknown,
  context: Extract<AgentEnrichmentContext, { endpoint: 'weight.mutation' }>,
): AgentEnrichment | undefined => {
  if (!isWeightEntry(responseData)) {
    return undefined;
  }

  const previousWeight = context.previousEntry?.weight;
  const delta = previousWeight === undefined ? undefined : responseData.weight - previousWeight;
  const trendDirection =
    delta === undefined ? 'unknown' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';

  return {
    hints: compactStrings([
      delta === undefined
        ? `Logged ${formatNumber(responseData.weight)} for ${responseData.date}. Another check-in later this week will help establish direction.`
        : `Weight is ${trendDirection} by ${formatNumber(Math.abs(delta))} compared with the prior saved reading.`,
      'Consistent check-ins under similar conditions make the trend easier to interpret.',
    ]),
    suggestedActions: ['Keep a steady weigh-in cadence, ideally daily or several times per week.'],
    relatedState: compactRecord({
      date: responseData.date,
      weight: responseData.weight,
      previousWeight,
      trendDirection,
      delta,
    }),
  };
};

const buildFoodEnrichment = (
  responseData: unknown,
  context: Extract<AgentEnrichmentContext, { endpoint: 'food.create' }>,
): AgentEnrichment | undefined => {
  if (!isFoodSummary(responseData)) {
    return undefined;
  }

  return {
    hints: compactStrings([
      context.similarFoods && context.similarFoods.length > 0
        ? `${context.similarFoods.length} similarly named foods already exist, so double-check that this entry is not a duplicate.`
        : 'Search for similarly named foods before creating another branded variant to avoid duplicates.',
    ]),
    suggestedActions: compactStrings([
      'Reuse this food in the next meal log when it matches the serving.',
    ]),
    relatedState: compactRecord({
      id: responseData.id,
      name: responseData.name,
      brand: responseData.brand ?? null,
      calories: responseData.calories,
      protein: responseData.protein,
      carbs: responseData.carbs,
      fat: responseData.fat,
      similarFoods:
        context.similarFoods?.map((food) => ({
          id: food.id,
          name: food.name,
          brand: food.brand ?? null,
        })) ?? [],
    }),
  };
};

export const buildAgentEnrichment = (
  request: FastifyRequest,
  responseData: unknown,
  context?: AgentEnrichmentContext,
): AgentEnrichment | undefined => {
  if (!isAgentRequest(request) || !context) {
    return undefined;
  }

  switch (context.endpoint) {
    case 'meal.create':
    case 'meal.update':
      return buildMealEnrichment(responseData, context);
    case 'workout-session.mutation':
      return buildWorkoutSessionEnrichment(responseData, context);
    case 'habit-entry.mutation':
      return buildHabitEntryEnrichment(responseData, context);
    case 'weight.mutation':
      return buildWeightEnrichment(responseData, context);
    case 'food.create':
      return buildFoodEnrichment(responseData, context);
    default:
      return undefined;
  }
};

export const buildDataResponse = <T>(
  request: FastifyRequest,
  data: T,
  context?: AgentEnrichmentContext,
) => {
  const agent = buildAgentEnrichment(request, data, context);

  return agent ? { data, agent } : { data };
};
