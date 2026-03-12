import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { AgentContextResponse } from '@pulse/shared';

import {
  bodyWeight,
  exercises,
  habitEntries,
  habits,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargets,
  scheduledWorkouts,
  sessionSets,
  users,
  workoutSessions,
  workoutTemplates,
} from '../../db/schema/index.js';
import { shiftDate } from './date-utils.js';

type AgentContextUser = AgentContextResponse['user'];
type AgentContextRecentWorkout = AgentContextResponse['recentWorkouts'][number];
type AgentContextMeal = AgentContextResponse['todayNutrition']['meals'][number];
type AgentContextWeight = AgentContextResponse['weight'];
type AgentContextHabit = AgentContextResponse['habits'][number];
type AgentContextScheduledWorkout = AgentContextResponse['scheduledWorkouts'][number];

const toNumber = (value: number | null | undefined) => Number(value ?? 0);

export const findAgentContextUser = async (userId: string): Promise<AgentContextUser> => {
  const { db } = await import('../../db/index.js');

  const user =
    db
      .select({
        name: users.name,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .get() ?? null;

  return {
    name: user?.name ?? null,
  };
};

export const listAgentContextRecentWorkouts = async (
  userId: string,
  limit = 5,
): Promise<AgentContextRecentWorkout[]> => {
  const { db } = await import('../../db/index.js');

  const recentSessions = db
    .select({
      id: workoutSessions.id,
      name: workoutSessions.name,
      date: workoutSessions.date,
      completedAt: workoutSessions.completedAt,
      startedAt: workoutSessions.startedAt,
      createdAt: workoutSessions.createdAt,
    })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        isNull(workoutSessions.deletedAt),
        eq(workoutSessions.status, 'completed'),
      ),
    )
    .orderBy(
      desc(workoutSessions.date),
      desc(workoutSessions.completedAt),
      desc(workoutSessions.startedAt),
      desc(workoutSessions.createdAt),
    )
    .limit(limit)
    .all();

  if (recentSessions.length === 0) {
    return [];
  }

  const sessionIds = recentSessions.map((session) => session.id);
  const setRows = db
    .select({
      sessionId: sessionSets.sessionId,
      exerciseName: exercises.name,
      completed: sessionSets.completed,
      skipped: sessionSets.skipped,
      createdAt: sessionSets.createdAt,
      setNumber: sessionSets.setNumber,
    })
    .from(sessionSets)
    .innerJoin(exercises, eq(exercises.id, sessionSets.exerciseId))
    .where(
      and(
        inArray(sessionSets.sessionId, sessionIds),
        or(
          isNull(exercises.userId),
          and(eq(exercises.userId, userId), isNull(exercises.deletedAt)),
        ),
      ),
    )
    .orderBy(asc(sessionSets.createdAt), asc(sessionSets.setNumber))
    .all();

  const setsBySession = new Map<
    string,
    Array<{
      name: string;
      sets: {
        total: number;
        completed: number;
        skipped: number;
      };
    }>
  >();
  const exerciseIndexBySession = new Map<string, Map<string, number>>();

  for (const row of setRows) {
    const existingSessionRows = setsBySession.get(row.sessionId) ?? [];
    const exerciseIndex = exerciseIndexBySession.get(row.sessionId) ?? new Map<string, number>();
    const existingIndex = exerciseIndex.get(row.exerciseName);

    if (existingIndex === undefined) {
      existingSessionRows.push({
        name: row.exerciseName,
        sets: {
          total: 1,
          completed: row.completed ? 1 : 0,
          skipped: row.skipped ? 1 : 0,
        },
      });
      exerciseIndex.set(row.exerciseName, existingSessionRows.length - 1);
      setsBySession.set(row.sessionId, existingSessionRows);
      exerciseIndexBySession.set(row.sessionId, exerciseIndex);
      continue;
    }

    const existingExercise = existingSessionRows[existingIndex];
    existingExercise.sets.total += 1;
    if (row.completed) {
      existingExercise.sets.completed += 1;
    }
    if (row.skipped) {
      existingExercise.sets.skipped += 1;
    }
  }

  return recentSessions.map((session) => ({
    id: session.id,
    name: session.name,
    date: session.date,
    completedAt: session.completedAt,
    exercises: setsBySession.get(session.id) ?? [],
  }));
};

export const getAgentContextTodayNutrition = async (
  userId: string,
  date: string,
): Promise<AgentContextResponse['todayNutrition']> => {
  const { db } = await import('../../db/index.js');

  const actual = db
    .select({
      calories: sql<number>`coalesce(sum(${mealItems.calories}), 0)`,
      protein: sql<number>`coalesce(sum(${mealItems.protein}), 0)`,
      carbs: sql<number>`coalesce(sum(${mealItems.carbs}), 0)`,
      fat: sql<number>`coalesce(sum(${mealItems.fat}), 0)`,
    })
    .from(nutritionLogs)
    .leftJoin(meals, eq(meals.nutritionLogId, nutritionLogs.id))
    .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
    .where(and(eq(nutritionLogs.userId, userId), eq(nutritionLogs.date, date)))
    .get() ?? {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  };

  const target =
    db
      .select({
        calories: nutritionTargets.calories,
        protein: nutritionTargets.protein,
        carbs: nutritionTargets.carbs,
        fat: nutritionTargets.fat,
      })
      .from(nutritionTargets)
      .where(and(eq(nutritionTargets.userId, userId), lte(nutritionTargets.effectiveDate, date)))
      .orderBy(desc(nutritionTargets.effectiveDate))
      .limit(1)
      .get() ?? null;

  const nutritionLog =
    db
      .select({
        id: nutritionLogs.id,
      })
      .from(nutritionLogs)
      .where(and(eq(nutritionLogs.userId, userId), eq(nutritionLogs.date, date)))
      .limit(1)
      .get() ?? null;

  let mealsWithItems: AgentContextMeal[] = [];

  if (nutritionLog) {
    const dayMeals = db
      .select({
        id: meals.id,
        name: meals.name,
      })
      .from(meals)
      .where(eq(meals.nutritionLogId, nutritionLog.id))
      .orderBy(asc(meals.createdAt))
      .all();

    if (dayMeals.length > 0) {
      const mealIds = dayMeals.map((meal) => meal.id);
      const items = db
        .select({
          mealId: mealItems.mealId,
          name: mealItems.name,
          amount: mealItems.amount,
          unit: mealItems.unit,
          calories: mealItems.calories,
          protein: mealItems.protein,
          carbs: mealItems.carbs,
          fat: mealItems.fat,
        })
        .from(mealItems)
        .where(inArray(mealItems.mealId, mealIds))
        .orderBy(asc(mealItems.createdAt))
        .all();

      const itemsByMealId = new Map<string, AgentContextMeal['items']>();
      for (const item of items) {
        const mealRows = itemsByMealId.get(item.mealId) ?? [];
        mealRows.push({
          name: item.name,
          amount: toNumber(item.amount),
          unit: item.unit,
          calories: toNumber(item.calories),
          protein: toNumber(item.protein),
          carbs: toNumber(item.carbs),
          fat: toNumber(item.fat),
        });
        itemsByMealId.set(item.mealId, mealRows);
      }

      mealsWithItems = dayMeals.map((meal) => ({
        name: meal.name,
        items: itemsByMealId.get(meal.id) ?? [],
      }));
    }
  }

  return {
    actual: {
      calories: toNumber(actual.calories),
      protein: toNumber(actual.protein),
      carbs: toNumber(actual.carbs),
      fat: toNumber(actual.fat),
    },
    target: target
      ? {
          calories: toNumber(target.calories),
          protein: toNumber(target.protein),
          carbs: toNumber(target.carbs),
          fat: toNumber(target.fat),
        }
      : {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
    meals: mealsWithItems,
  };
};

export const getAgentContextWeight = async (userId: string): Promise<AgentContextWeight> => {
  const { db } = await import('../../db/index.js');

  const latest =
    db
      .select({
        date: bodyWeight.date,
        weight: bodyWeight.weight,
      })
      .from(bodyWeight)
      .where(eq(bodyWeight.userId, userId))
      .orderBy(desc(bodyWeight.date))
      .limit(1)
      .get() ?? null;

  if (!latest) {
    return {
      current: 0,
      trend7d: 0,
    };
  }

  const referenceDate = shiftDate(latest.date, -7);
  const reference =
    db
      .select({
        weight: bodyWeight.weight,
      })
      .from(bodyWeight)
      .where(and(eq(bodyWeight.userId, userId), lte(bodyWeight.date, referenceDate)))
      .orderBy(desc(bodyWeight.date))
      .limit(1)
      .get() ?? null;

  const current = toNumber(latest.weight);
  const trend7d = reference ? Number((current - toNumber(reference.weight)).toFixed(2)) : 0;

  return {
    current,
    trend7d,
  };
};

export const listAgentContextHabits = async (
  userId: string,
  today: string,
): Promise<AgentContextHabit[]> => {
  const { db } = await import('../../db/index.js');

  const activeHabits = db
    .select({
      id: habits.id,
      name: habits.name,
      trackingType: habits.trackingType,
      sortOrder: habits.sortOrder,
      createdAt: habits.createdAt,
    })
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.active, true), isNull(habits.deletedAt)))
    .orderBy(asc(habits.sortOrder), asc(habits.createdAt))
    .all();

  if (activeHabits.length === 0) {
    return [];
  }

  const habitIds = activeHabits.map((habit) => habit.id);
  const completedRows = db
    .select({
      habitId: habitEntries.habitId,
      date: habitEntries.date,
    })
    .from(habitEntries)
    .where(
      and(
        eq(habitEntries.userId, userId),
        eq(habitEntries.completed, true),
        inArray(habitEntries.habitId, habitIds),
        gte(habitEntries.date, shiftDate(today, -365)),
      ),
    )
    .all();

  const completedDatesByHabit = new Map<string, Set<string>>();
  for (const row of completedRows) {
    const existingDates = completedDatesByHabit.get(row.habitId) ?? new Set<string>();
    existingDates.add(row.date);
    completedDatesByHabit.set(row.habitId, existingDates);
  }

  return activeHabits.map((habit) => {
    const completedDates = completedDatesByHabit.get(habit.id) ?? new Set<string>();
    const todayCompleted = completedDates.has(today);
    let streak = 0;
    let cursor = todayCompleted ? today : shiftDate(today, -1);

    while (completedDates.has(cursor)) {
      streak += 1;
      cursor = shiftDate(cursor, -1);
    }

    return {
      name: habit.name,
      trackingType: habit.trackingType,
      streak,
      todayCompleted,
    };
  });
};

export const listAgentContextScheduledWorkouts = async ({
  userId,
  from,
  to,
}: {
  userId: string;
  from: string;
  to: string;
}): Promise<AgentContextScheduledWorkout[]> => {
  const { db } = await import('../../db/index.js');

  const rows = db
    .select({
      date: scheduledWorkouts.date,
      templateName: workoutTemplates.name,
      createdAt: scheduledWorkouts.createdAt,
    })
    .from(scheduledWorkouts)
    .leftJoin(
      workoutTemplates,
      and(
        eq(workoutTemplates.id, scheduledWorkouts.templateId),
        isNull(workoutTemplates.deletedAt),
      ),
    )
    .where(
      and(
        eq(scheduledWorkouts.userId, userId),
        gte(scheduledWorkouts.date, from),
        lte(scheduledWorkouts.date, to),
      ),
    )
    .orderBy(asc(scheduledWorkouts.date), asc(scheduledWorkouts.createdAt))
    .all();

  return rows.map((row) => ({
    date: row.date,
    templateName: row.templateName ?? 'Unknown template',
  }));
};
