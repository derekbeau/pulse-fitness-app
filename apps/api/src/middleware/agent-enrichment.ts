import type {
  AgentEnrichment,
  BodyWeightEntry,
  HabitEntry,
  HabitTrackingType,
  ScheduledWorkoutDetail,
  WorkoutSession,
} from '@pulse/shared';
import type { FastifyRequest, onSendHookHandler } from 'fastify';

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
      endpoint: 'nutrition.summary';
      date: string;
    }
  | {
      endpoint: 'workout-session.mutation';
      action: 'create' | 'update' | 'reorder' | 'swap' | 'time-segments' | 'section-timer' | 'set';
      session?: WorkoutSession;
    }
  | {
      endpoint: 'habit.list';
      date: string;
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
    }
  | {
      endpoint: 'workout-template.mutation';
      action: 'create' | 'update';
    }
  | {
      endpoint: 'scheduled-workout.mutation';
      action: 'reorder' | 'exercises' | 'exercise-sets';
    };

const requestEnrichmentContext = new WeakMap<FastifyRequest, AgentEnrichmentContext>();

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

const isScheduledWorkoutDetail = (value: unknown): value is ScheduledWorkoutDetail =>
  isRecord(value) &&
  Array.isArray(value.exercises) &&
  typeof value.date === 'string' &&
  value.exercises.every(
    (exercise) =>
      isRecord(exercise) &&
      typeof exercise.exerciseId === 'string' &&
      Array.isArray(exercise.sets),
  );

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

const isMacroSummary = (value: unknown): value is MacroSummary =>
  isRecord(value) &&
  typeof value.calories === 'number' &&
  typeof value.protein === 'number' &&
  typeof value.carbs === 'number' &&
  typeof value.fat === 'number';

const isNutritionSummary = (
  value: unknown,
): value is {
  date: string;
  meals: number;
  actual: MacroSummary;
  target: MacroSummary | null;
} =>
  isRecord(value) &&
  typeof value.date === 'string' &&
  typeof value.meals === 'number' &&
  isMacroSummary(value.actual) &&
  (value.target === null || isMacroSummary(value.target));

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
    context.itemCount ?? (record && Array.isArray(record.items) ? record.items.length : undefined);

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

const buildNutritionSummaryEnrichment = (
  responseData: unknown,
  context: Extract<AgentEnrichmentContext, { endpoint: 'nutrition.summary' }>,
): AgentEnrichment | undefined => {
  if (!isNutritionSummary(responseData)) {
    return undefined;
  }

  const remainingMacros = responseData.target
    ? {
        calories: responseData.target.calories - responseData.actual.calories,
        protein: responseData.target.protein - responseData.actual.protein,
        carbs: responseData.target.carbs - responseData.actual.carbs,
        fat: responseData.target.fat - responseData.actual.fat,
      }
    : undefined;

  return {
    hints: compactStrings([
      `${pluralize(responseData.meals, 'meal')} logged for ${responseData.date}, totaling ${formatNumber(responseData.actual.calories)} kcal and ${formatNumber(responseData.actual.protein)}g protein.`,
      remainingMacros
        ? `Remaining target is ${formatNumber(remainingMacros.calories)} kcal, ${formatNumber(remainingMacros.protein)}g protein, ${formatNumber(remainingMacros.carbs)}g carbs, and ${formatNumber(remainingMacros.fat)}g fat.`
        : 'No nutrition target is configured for this date.',
    ]),
    suggestedActions: compactStrings([
      'Log the next meal when nutrition changes.',
      responseData.target ? 'Use remaining macros to guide your next meal choice.' : undefined,
    ]),
    relatedState: compactRecord({
      date: context.date,
      meals: responseData.meals,
      actual: responseData.actual,
      target: responseData.target,
      remaining: remainingMacros,
    }),
  };
};

const buildHabitListEnrichment = (
  responseData: unknown,
  context: Extract<AgentEnrichmentContext, { endpoint: 'habit.list' }>,
): AgentEnrichment | undefined => {
  if (!Array.isArray(responseData)) {
    return undefined;
  }

  const completedHabits = responseData.reduce((count, habit) => {
    if (!isRecord(habit) || !isRecord(habit.todayEntry)) {
      return count;
    }

    return habit.todayEntry.completed === true ? count + 1 : count;
  }, 0);
  const totalHabits = responseData.length;
  const remainingHabits = Math.max(0, totalHabits - completedHabits);

  return {
    hints: compactStrings([
      totalHabits === 0
        ? `No active habits are configured for ${context.date}.`
        : `${completedHabits}/${totalHabits} habits are complete for ${context.date}.`,
      remainingHabits > 0
        ? `${pluralize(remainingHabits, 'habit')} still ${remainingHabits === 1 ? 'needs' : 'need'} attention.`
        : totalHabits > 0
          ? 'All active habits are complete for today.'
          : undefined,
    ]),
    suggestedActions: compactStrings([
      remainingHabits > 0
        ? 'Update any remaining habits as you complete them.'
        : totalHabits > 0
          ? "Review tomorrow's habit plan and targets."
          : 'Create or restore habits to start tracking daily progress.',
    ]),
    relatedState: {
      date: context.date,
      totalHabits,
      completedHabits,
      remainingHabits,
    },
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
  const exerciseIds = new Set(
    sortedSets
      .map((set) => set.exerciseId)
      .filter((exerciseId): exerciseId is string => typeof exerciseId === 'string'),
  );
  const remainingExerciseIds = new Set(
    openSets
      .map((set) => set.exerciseId)
      .filter((exerciseId): exerciseId is string => typeof exerciseId === 'string'),
  );
  const nextSet = openSets[0];
  const nextExercise = session.exercises?.find(
    (exercise) => exercise.exerciseId === nextSet?.exerciseId,
  );

  return {
    hints: compactStrings([
      `Session progress is ${completedSets}/${totalSets} completed sets across ${exerciseIds.size} exercises.`,
      remainingExerciseIds.size > 0
        ? `${pluralize(remainingExerciseIds.size, 'exercise')} still ${remainingExerciseIds.size === 1 ? 'has' : 'have'} unfinished work.`
        : 'All planned exercises are complete, so the session can be wrapped up whenever you are ready.',
    ]),
    suggestedActions: compactStrings([
      nextSet
        ? `Log set ${nextSet.setNumber} for ${nextExercise?.exerciseName ?? nextSet.exerciseId ?? 'Deleted exercise'}.`
        : session.status === 'in-progress'
          ? 'Mark the session completed or add a finisher set if more work is needed.'
          : 'Review notes and confirm the session status is final.',
      session.status === 'in-progress'
        ? 'Pause or complete the session when the workout ends.'
        : undefined,
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

const buildWorkoutTemplateEnrichment = (
  responseData: unknown,
  context: Extract<AgentEnrichmentContext, { endpoint: 'workout-template.mutation' }>,
): AgentEnrichment | undefined => {
  if (!isRecord(responseData) || !Array.isArray(responseData.sections)) {
    return undefined;
  }

  const sectionCount = responseData.sections.length;
  const exerciseCount = responseData.sections
    .filter(isRecord)
    .reduce((count, section) => count + (Array.isArray(section.exercises) ? section.exercises.length : 0), 0);
  const templateName = typeof responseData.name === 'string' ? responseData.name : 'Template';

  return {
    hints: compactStrings([
      `${templateName} now has ${pluralize(exerciseCount, 'exercise')} across ${pluralize(sectionCount, 'section')}.`,
      context.action === 'create'
        ? 'Use this template to start a session when you are ready to train.'
        : 'Review targets and notes to confirm the update reflects the intended workout plan.',
    ]),
    suggestedActions: compactStrings([
      'Start a workout session from this template when needed.',
      context.action === 'update' ? 'Re-check set targets for time- and load-based movements.' : undefined,
    ]),
    relatedState: compactRecord({
      action: context.action,
      templateName,
      sectionCount,
      exerciseCount,
    }),
  };
};

const buildScheduledWorkoutEnrichment = (
  responseData: unknown,
  context: Extract<AgentEnrichmentContext, { endpoint: 'scheduled-workout.mutation' }>,
): AgentEnrichment | undefined => {
  if (!isScheduledWorkoutDetail(responseData)) {
    return undefined;
  }

  const exerciseCount = responseData.exercises.length;
  const setCount = responseData.exercises.reduce(
    (count, exercise) => count + exercise.sets.length,
    0,
  );
  const supersetGroupCount = new Set(
    responseData.exercises
      .map((exercise) => exercise.supersetGroup)
      .filter((group): group is string => typeof group === 'string' && group.length > 0),
  ).size;

  return {
    hints: compactStrings([
      `${pluralize(exerciseCount, 'exercise')} and ${pluralize(setCount, 'planned set')} are configured for ${responseData.date}.`,
      supersetGroupCount > 0
        ? `${pluralize(supersetGroupCount, 'superset group')} currently organize this workout.`
        : 'No supersets are currently configured.',
    ]),
    suggestedActions: compactStrings([
      'Start the scheduled workout when you are ready to train.',
      'Re-open the scheduled workout detail to confirm the snapshot structure.',
    ]),
    relatedState: {
      action: context.action,
      date: responseData.date,
      exerciseCount,
      setCount,
      supersetGroupCount,
    },
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
    case 'nutrition.summary':
      return buildNutritionSummaryEnrichment(responseData, context);
    case 'workout-session.mutation':
      return buildWorkoutSessionEnrichment(responseData, context);
    case 'habit.list':
      return buildHabitListEnrichment(responseData, context);
    case 'habit-entry.mutation':
      return buildHabitEntryEnrichment(responseData, context);
    case 'weight.mutation':
      return buildWeightEnrichment(responseData, context);
    case 'food.create':
      return buildFoodEnrichment(responseData, context);
    case 'workout-template.mutation':
      return buildWorkoutTemplateEnrichment(responseData, context);
    case 'scheduled-workout.mutation':
      return buildScheduledWorkoutEnrichment(responseData, context);
    default:
      return undefined;
  }
};

export const setAgentEnrichmentContext = (
  request: FastifyRequest,
  context?: AgentEnrichmentContext,
) => {
  if (context) {
    requestEnrichmentContext.set(request, context);
    return;
  }

  requestEnrichmentContext.delete(request);
};

const parseJsonPayload = (payload: string | Buffer): unknown => {
  try {
    return JSON.parse(typeof payload === 'string' ? payload : payload.toString('utf-8'));
  } catch {
    return undefined;
  }
};

const isResponseEnvelope = (
  value: unknown,
): value is {
  data: unknown;
  agent?: AgentEnrichment;
} => isRecord(value) && 'data' in value;

const enrichResponseEnvelope = (
  request: FastifyRequest,
  envelope: { data: unknown; agent?: AgentEnrichment },
) => {
  const context = requestEnrichmentContext.get(request);
  if (!context || envelope.agent !== undefined) {
    return envelope;
  }

  const agent = buildAgentEnrichment(request, envelope.data, context);
  return agent ? { ...envelope, agent } : envelope;
};

export const agentEnrichmentOnSend: onSendHookHandler = async (request, _reply, payload) => {
  if (!isAgentRequest(request)) {
    requestEnrichmentContext.delete(request);
    return payload;
  }

  if (!requestEnrichmentContext.has(request)) {
    return payload;
  }

  if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
    const parsed = parseJsonPayload(payload);
    if (!isResponseEnvelope(parsed)) {
      requestEnrichmentContext.delete(request);
      return payload;
    }

    const enriched = enrichResponseEnvelope(request, parsed);
    requestEnrichmentContext.delete(request);
    const serialized = JSON.stringify(enriched);
    return typeof payload === 'string' ? serialized : Buffer.from(serialized);
  }

  if (isResponseEnvelope(payload)) {
    const enriched = enrichResponseEnvelope(request, payload);
    requestEnrichmentContext.delete(request);
    return enriched;
  }

  requestEnrichmentContext.delete(request);
  return payload;
};

export const buildDataResponse = <T>(
  request: FastifyRequest,
  data: T,
  context?: AgentEnrichmentContext,
) => {
  const agent = buildAgentEnrichment(request, data, context);

  return agent ? { data, agent } : { data };
};
