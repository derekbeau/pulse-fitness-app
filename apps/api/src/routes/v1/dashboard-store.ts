import { and, asc, between, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';

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
import { computeEWMA, dashboardConfigSchema } from '@pulse/shared';

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
  scheduledWorkouts,
  workoutSessions,
  workoutTemplates,
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

const scheduledWorkoutSelection = {
  scheduledWorkoutId: scheduledWorkouts.id,
  scheduledTemplateId: scheduledWorkouts.templateId,
  linkedSessionId: scheduledWorkouts.sessionId,
  scheduledTemplateName: workoutTemplates.name,
  scheduledCreatedAt: scheduledWorkouts.createdAt,
  linkedSessionName: workoutSessions.name,
  linkedSessionStatus: workoutSessions.status,
  linkedSessionDuration: workoutSessions.duration,
  linkedSessionTemplateId: workoutSessions.templateId,
  linkedSessionStartedAt: workoutSessions.startedAt,
  linkedSessionCompletedAt: workoutSessions.completedAt,
};

const standaloneSessionSelection = {
  sessionId: workoutSessions.id,
  sessionName: workoutSessions.name,
  sessionStatus: workoutSessions.status,
  sessionDuration: workoutSessions.duration,
  sessionTemplateId: workoutSessions.templateId,
  sessionStartedAt: workoutSessions.startedAt,
  sessionCompletedAt: workoutSessions.completedAt,
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
  trendValue: number | null,
): DashboardWeightSnapshot | null => {
  if (!value) {
    return null;
  }

  return {
    value: Number(value.value),
    trendValue,
    date: value.date,
    unit: DEFAULT_WEIGHT_UNIT,
  };
};

const toWorkoutSnapshot = (
  value:
    | {
        name: string;
        status: DashboardWorkoutSnapshot['status'];
        templateId: string | null;
        sessionId: string | null;
        duration: number | null;
      }
    | null
    | undefined,
): DashboardWorkoutSnapshot | null => {
  if (!value) {
    return null;
  }

  return {
    name: value.name,
    status: value.status,
    templateId: value.templateId,
    sessionId: value.sessionId,
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

type DashboardWorkoutCandidate = {
  name: string;
  status: DashboardWorkoutSnapshot['status'];
  templateId: string | null;
  sessionId: string | null;
  duration: number | null;
  sortTime: number;
};

const workoutStatusToDashboardState = (
  status: 'scheduled' | 'in-progress' | 'paused' | 'completed',
): DashboardWorkoutSnapshot['status'] => {
  switch (status) {
    case 'in-progress':
    case 'paused':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'scheduled':
    default:
      return 'scheduled';
  }
};

const workoutPriority = (status: DashboardWorkoutSnapshot['status']) => {
  switch (status) {
    case 'in_progress':
      return 0;
    case 'scheduled':
      return 1;
    case 'completed':
      return 2;
    default:
      return 3;
  }
};

const selectTodayWorkoutCandidate = (
  scheduledRows: Array<{
    scheduledWorkoutId: string;
    scheduledTemplateId: string | null;
    linkedSessionId: string | null;
    scheduledTemplateName: string | null;
    scheduledCreatedAt: number;
    linkedSessionName: string | null;
    linkedSessionStatus: 'scheduled' | 'in-progress' | 'paused' | 'cancelled' | 'completed' | null;
    linkedSessionDuration: number | null;
    linkedSessionTemplateId: string | null;
    linkedSessionStartedAt: number | null;
    linkedSessionCompletedAt: number | null;
  }>,
  standaloneSessions: Array<{
    sessionId: string;
    sessionName: string;
    sessionStatus: 'scheduled' | 'in-progress' | 'paused' | 'cancelled' | 'completed';
    sessionDuration: number | null;
    sessionTemplateId: string | null;
    sessionStartedAt: number;
    sessionCompletedAt: number | null;
  }>,
): DashboardWorkoutCandidate | null => {
  const candidates: DashboardWorkoutCandidate[] = [];
  const consumedSessionIds = new Set<string>();

  for (const scheduledWorkout of scheduledRows) {
    if (scheduledWorkout.linkedSessionId && scheduledWorkout.linkedSessionStatus) {
      const linkedStatus = scheduledWorkout.linkedSessionStatus;
      if (linkedStatus !== 'cancelled') {
        candidates.push({
          name:
            scheduledWorkout.linkedSessionName ??
            scheduledWorkout.scheduledTemplateName ??
            'Workout unavailable',
          status: workoutStatusToDashboardState(linkedStatus),
          templateId:
            scheduledWorkout.linkedSessionTemplateId ??
            scheduledWorkout.scheduledTemplateId ??
            null,
          sessionId: scheduledWorkout.linkedSessionId,
          duration: scheduledWorkout.linkedSessionDuration,
          sortTime:
            Number(
              scheduledWorkout.linkedSessionCompletedAt ??
                scheduledWorkout.linkedSessionStartedAt ??
                scheduledWorkout.scheduledCreatedAt,
            ) || 0,
        });
      } else {
        candidates.push({
          name: scheduledWorkout.scheduledTemplateName ?? 'Workout unavailable',
          status: 'scheduled',
          templateId: scheduledWorkout.scheduledTemplateId,
          sessionId: null,
          duration: null,
          sortTime: Number(scheduledWorkout.scheduledCreatedAt) || 0,
        });
      }
      consumedSessionIds.add(scheduledWorkout.linkedSessionId);
      continue;
    }

    candidates.push({
      name: scheduledWorkout.scheduledTemplateName ?? 'Workout unavailable',
      status: 'scheduled',
      templateId: scheduledWorkout.scheduledTemplateId,
      sessionId: null,
      duration: null,
      sortTime: Number(scheduledWorkout.scheduledCreatedAt) || 0,
    });
  }

  for (const session of standaloneSessions) {
    if (session.sessionStatus === 'cancelled' || consumedSessionIds.has(session.sessionId)) {
      continue;
    }

    candidates.push({
      name: session.sessionName,
      status: workoutStatusToDashboardState(session.sessionStatus),
      templateId: session.sessionTemplateId,
      sessionId: session.sessionId,
      duration: session.sessionDuration,
      sortTime: Number(session.sessionCompletedAt ?? session.sessionStartedAt) || 0,
    });
  }

  candidates.sort((left, right) => {
    const priorityDiff = workoutPriority(left.status) - workoutPriority(right.status);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return right.sortTime - left.sortTime;
  });

  return candidates[0] ?? null;
};

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

  // Compute EWMA trend weight from recent entries (up to 60 days)
  let trendWeight: number | null = null;
  if (weight) {
    const recentWeights = db
      .select({ date: bodyWeight.date, weight: bodyWeight.weight })
      .from(bodyWeight)
      .where(and(eq(bodyWeight.userId, userId), lte(bodyWeight.date, date)))
      .orderBy(asc(bodyWeight.date))
      .all()
      .slice(-60);

    if (recentWeights.length > 0) {
      const ewmaResults = computeEWMA(
        recentWeights.map((w) => ({ date: w.date, weight: Number(w.weight) })),
      );
      const lastResult = ewmaResults[ewmaResults.length - 1];
      if (lastResult) {
        trendWeight = Math.round(lastResult.trend * 10) / 10;
      }
    }
  }

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

  const scheduledRows = db
    .select(scheduledWorkoutSelection)
    .from(scheduledWorkouts)
    .leftJoin(
      workoutSessions,
      and(
        eq(workoutSessions.id, scheduledWorkouts.sessionId),
        eq(workoutSessions.userId, userId),
        isNull(workoutSessions.deletedAt),
      ),
    )
    .leftJoin(
      workoutTemplates,
      and(
        eq(workoutTemplates.id, scheduledWorkouts.templateId),
        eq(workoutTemplates.userId, userId),
      ),
    )
    .where(and(eq(scheduledWorkouts.userId, userId), eq(scheduledWorkouts.date, date)))
    .all();

  const standaloneSessions = db
    .select(standaloneSessionSelection)
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        isNull(workoutSessions.deletedAt),
        eq(workoutSessions.date, date),
        inArray(workoutSessions.status, ['scheduled', 'in-progress', 'paused', 'completed']),
      ),
    )
    .orderBy(desc(workoutSessions.completedAt), desc(workoutSessions.startedAt))
    .all();

  const workout = selectTodayWorkoutCandidate(scheduledRows, standaloneSessions);

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
    weight: toWeightSnapshot(weight, trendWeight),
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
