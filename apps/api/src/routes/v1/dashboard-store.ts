import { and, asc, between, desc, eq, isNull, lte, sql } from 'drizzle-orm';

import type {
  DashboardConfig,
  DashboardConsistencyTrendPoint,
  DashboardHabitsSnapshot,
  DashboardMacrosTrendPoint,
  DashboardMacroTotals,
  DashboardSnapshot,
  DashboardTrendMetric,
  DashboardWeightSnapshot,
  DashboardWeightTrendPoint,
  DashboardWorkoutSnapshot,
} from '@pulse/shared';
import { dashboardConfigSchema } from '@pulse/shared';

import { db } from '../../db/index.js';
import {
  bodyWeight,
  dashboardConfig as dashboardConfigTable,
  habitEntries,
  habits,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargets,
  workoutSessions,
} from '../../db/schema/index.js';
import { getDatesInRange } from './dashboard-utils.js';

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

const weightTrendSelection = {
  date: bodyWeight.date,
  value: bodyWeight.weight,
};

const macrosTrendSelection = {
  date: nutritionLogs.date,
  calories: sql<number>`coalesce(sum(${mealItems.calories}), 0)`,
  protein: sql<number>`coalesce(sum(${mealItems.protein}), 0)`,
  carbs: sql<number>`coalesce(sum(${mealItems.carbs}), 0)`,
  fat: sql<number>`coalesce(sum(${mealItems.fat}), 0)`,
};

const consistencyTrendSelection = {
  date: workoutSessions.date,
};

const dashboardConfigSelection = {
  habitChainIds: dashboardConfigTable.habitChainIds,
  trendMetrics: dashboardConfigTable.trendMetrics,
  visibleWidgets: dashboardConfigTable.visibleWidgets,
  widgetOrder: dashboardConfigTable.widgetOrder,
};

const activeHabitIdsSelection = {
  id: habits.id,
};

// TODO: Source this from user preferences once kg/lb switching is introduced.
const DEFAULT_WEIGHT_UNIT: DashboardWeightSnapshot['unit'] = 'lb';
const DEFAULT_DASHBOARD_TREND_METRICS: DashboardTrendMetric[] = ['weight', 'calories', 'protein'];

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

const toMacroTrendPoint = (
  date: string,
  value:
    | {
        calories: number | null;
        protein: number | null;
        carbs: number | null;
        fat: number | null;
      }
    | undefined,
): DashboardMacrosTrendPoint => ({
  date,
  ...toMacroTotals(value),
});

const trendMetricSet = new Set<DashboardTrendMetric>(DEFAULT_DASHBOARD_TREND_METRICS);

const isDashboardTrendMetric = (value: string): value is DashboardTrendMetric =>
  trendMetricSet.has(value as DashboardTrendMetric);

const toDashboardTrendMetrics = (metrics: string[] | null | undefined): DashboardTrendMetric[] => {
  if (!metrics) {
    return DEFAULT_DASHBOARD_TREND_METRICS;
  }

  if (metrics.length === 0) {
    return [];
  }

  const validMetrics = metrics.filter(isDashboardTrendMetric);
  // Preserve explicit but stale/unknown values as "no selected metrics" instead of
  // surprising callers with defaults they did not choose.
  return validMetrics.length > 0 ? validMetrics : [];
};

const toDashboardConfig = (value: {
  habitChainIds: string[] | null;
  trendMetrics: string[] | null;
  visibleWidgets: string[] | null;
  widgetOrder: string[] | null;
}): DashboardConfig => {
  const parsed = dashboardConfigSchema.parse({
    habitChainIds: value.habitChainIds ?? [],
    trendMetrics: toDashboardTrendMetrics(value.trendMetrics),
    visibleWidgets: value.visibleWidgets ?? undefined,
    widgetOrder: value.widgetOrder ?? undefined,
  });

  return parsed;
};

export const getDashboardSnapshot = async (
  userId: string,
  date: string,
): Promise<DashboardSnapshot> => {
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
        isNull(workoutSessions.deletedAt),
        eq(workoutSessions.date, date),
      ),
    )
    .orderBy(desc(workoutSessions.completedAt), desc(workoutSessions.startedAt))
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

export const getDashboardWeightTrend = async (
  userId: string,
  from: string,
  to: string,
): Promise<DashboardWeightTrendPoint[]> => {
  const entries = db
    .select(weightTrendSelection)
    .from(bodyWeight)
    .where(and(eq(bodyWeight.userId, userId), between(bodyWeight.date, from, to)))
    .orderBy(asc(bodyWeight.date))
    .all();

  return entries.map((entry) => ({
    date: entry.date,
    value: Number(entry.value),
  }));
};

export const getDashboardMacrosTrend = async (
  userId: string,
  from: string,
  to: string,
): Promise<DashboardMacrosTrendPoint[]> => {
  const rows = db
    .select(macrosTrendSelection)
    .from(nutritionLogs)
    .leftJoin(meals, eq(meals.nutritionLogId, nutritionLogs.id))
    .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
    .where(and(eq(nutritionLogs.userId, userId), between(nutritionLogs.date, from, to)))
    .groupBy(nutritionLogs.date)
    .orderBy(asc(nutritionLogs.date))
    .all();

  const rowsByDate = new Map(
    rows.map((row) => [
      row.date,
      {
        calories: row.calories,
        protein: row.protein,
        carbs: row.carbs,
        fat: row.fat,
      },
    ]),
  );

  return getDatesInRange(from, to).map((date) => toMacroTrendPoint(date, rowsByDate.get(date)));
};

export const getDashboardConsistencyTrend = async (
  userId: string,
  from: string,
  to: string,
): Promise<DashboardConsistencyTrendPoint[]> => {
  const completedRows = db
    .select(consistencyTrendSelection)
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.status, 'completed'),
        isNull(workoutSessions.deletedAt),
        between(workoutSessions.date, from, to),
      ),
    )
    .groupBy(workoutSessions.date)
    .orderBy(asc(workoutSessions.date))
    .all();

  const completedDates = new Set(completedRows.map((row) => row.date));

  return getDatesInRange(from, to).map((date) => ({
    date,
    completed: completedDates.has(date),
  }));
};

export const getDashboardConfig = async (userId: string): Promise<DashboardConfig> => {
  const configRow =
    db
      .select(dashboardConfigSelection)
      .from(dashboardConfigTable)
      .where(eq(dashboardConfigTable.userId, userId))
      .limit(1)
      .get() ?? null;

  if (configRow) {
    return toDashboardConfig(configRow);
  }

  const activeHabitIds = db
    .select(activeHabitIdsSelection)
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.active, true)))
    .orderBy(asc(habits.sortOrder), asc(habits.createdAt))
    .all()
    .map((habit) => habit.id);

  return dashboardConfigSchema.parse({
    habitChainIds: activeHabitIds,
    trendMetrics: DEFAULT_DASHBOARD_TREND_METRICS,
  });
};

export const upsertDashboardConfig = async (
  userId: string,
  input: DashboardConfig,
): Promise<DashboardConfig> => {
  db.insert(dashboardConfigTable)
    .values({
      userId,
      habitChainIds: input.habitChainIds,
      trendMetrics: input.trendMetrics,
      visibleWidgets: input.visibleWidgets ?? null,
      widgetOrder: input.widgetOrder ?? null,
    })
    .onConflictDoUpdate({
      target: dashboardConfigTable.userId,
      set: {
        habitChainIds: input.habitChainIds,
        trendMetrics: input.trendMetrics,
        visibleWidgets: input.visibleWidgets ?? null,
        widgetOrder: input.widgetOrder ?? null,
        updatedAt: Date.now(),
      },
    })
    .run();

  const persisted =
    db
      .select(dashboardConfigSelection)
      .from(dashboardConfigTable)
      .where(eq(dashboardConfigTable.userId, userId))
      .limit(1)
      .get() ?? null;

  if (!persisted) {
    throw new Error('Upserted dashboard config could not be loaded');
  }

  return toDashboardConfig(persisted);
};
