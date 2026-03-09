import { and, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';

import type {
  DashboardHabitsSnapshot,
  DashboardMacroTotals,
  DashboardSnapshot,
  DashboardWeightSnapshot,
  DashboardWorkoutSnapshot,
} from '@pulse/shared';

import { db } from '../../db/index.js';
import {
  bodyWeight,
  habitEntries,
  habits,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargets,
  workoutSessions,
} from '../../db/schema/index.js';

const weightSelection = {
  value: bodyWeight.weight,
  date: bodyWeight.date,
};

const macroActualSelection = {
  calories: sql<number>`coalesce(sum(${mealItems.calories}), 0)`,
  protein: sql<number>`coalesce(sum(${mealItems.protein}), 0)`,
  carbs: sql<number>`coalesce(sum(${mealItems.carbs}), 0)`,
  fat: sql<number>`coalesce(sum(${mealItems.fat}), 0)`,
};

const macroTargetSelection = {
  calories: nutritionTargets.calories,
  protein: nutritionTargets.protein,
  carbs: nutritionTargets.carbs,
  fat: nutritionTargets.fat,
};

const workoutSelection = {
  name: workoutSessions.name,
  status: workoutSessions.status,
  duration: workoutSessions.duration,
};

const habitSummarySelection = {
  total: sql<number>`count(${habits.id})`,
  completed: sql<number>`coalesce(sum(case when ${habitEntries.completed} then 1 else 0 end), 0)`,
};

const getDateRangeForUtcDay = (date: string) => {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    start: start.getTime(),
    end: end.getTime(),
  };
};

// TODO: Source this from user preferences once kg/lb switching is introduced.
const DEFAULT_WEIGHT_UNIT: DashboardWeightSnapshot['unit'] = 'lb';

const toMacroTotals = (
  value:
    | {
        calories: number | null;
        protein: number | null;
        carbs: number | null;
        fat: number | null;
      }
    | undefined,
): DashboardMacroTotals => ({
  calories: Number(value?.calories ?? 0),
  protein: Number(value?.protein ?? 0),
  carbs: Number(value?.carbs ?? 0),
  fat: Number(value?.fat ?? 0),
});

const toWeightSnapshot = (
  value: {
    value: number;
    date: string;
  } | null,
): DashboardWeightSnapshot | null => {
  if (!value) {
    return null;
  }

  return {
    value: Number(value.value),
    date: value.date,
    unit: DEFAULT_WEIGHT_UNIT,
  };
};

const toWorkoutSnapshot = (
  value:
    | {
        name: string;
        status: DashboardWorkoutSnapshot['status'];
        duration: number | null;
      }
    | undefined,
): DashboardWorkoutSnapshot | null => {
  if (!value) {
    return null;
  }

  return {
    name: value.name,
    status: value.status,
    duration: value.duration === null ? null : Number(value.duration),
  };
};

const toHabitSnapshot = (
  value:
    | {
        total: number;
        completed: number;
      }
    | undefined,
): DashboardHabitsSnapshot => {
  const total = Number(value?.total ?? 0);
  const completed = Number(value?.completed ?? 0);
  const percentage = total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0;

  return {
    total,
    completed,
    percentage,
  };
};

export const getDashboardSnapshot = async (
  userId: string,
  date: string,
): Promise<DashboardSnapshot> => {
  const dayRange = getDateRangeForUtcDay(date);

  const weight =
    db
      .select(weightSelection)
      .from(bodyWeight)
      .where(and(eq(bodyWeight.userId, userId), lte(bodyWeight.date, date)))
      .orderBy(desc(bodyWeight.date))
      .limit(1)
      .get() ?? null;

  const macrosActual =
    db
      .select(macroActualSelection)
      .from(nutritionLogs)
      .leftJoin(meals, eq(meals.nutritionLogId, nutritionLogs.id))
      .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
      .where(and(eq(nutritionLogs.userId, userId), eq(nutritionLogs.date, date)))
      .get() ?? undefined;

  const macrosTarget =
    db
      .select(macroTargetSelection)
      .from(nutritionTargets)
      .where(and(eq(nutritionTargets.userId, userId), lte(nutritionTargets.effectiveDate, date)))
      .orderBy(desc(nutritionTargets.effectiveDate))
      .limit(1)
      .get() ?? undefined;

  const workout = db
    .select(workoutSelection)
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.startedAt, dayRange.start),
        lt(workoutSessions.startedAt, dayRange.end),
      ),
    )
    .orderBy(desc(workoutSessions.startedAt))
    .limit(1)
    .get();

  const habitsSummary =
    db
      .select(habitSummarySelection)
      .from(habits)
      .leftJoin(
        habitEntries,
        and(
          eq(habitEntries.habitId, habits.id),
          eq(habitEntries.userId, userId),
          eq(habitEntries.date, date),
        ),
      )
      .where(and(eq(habits.userId, userId), eq(habits.active, true)))
      .get() ?? undefined;

  return {
    date,
    weight: toWeightSnapshot(weight),
    macros: {
      actual: toMacroTotals(macrosActual),
      target: toMacroTotals(macrosTarget),
    },
    workout: toWorkoutSnapshot(workout),
    habits: toHabitSnapshot(habitsSummary),
  };
};
