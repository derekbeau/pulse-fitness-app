import { z } from 'zod';

import { dateSchema } from './common.js';
import { workoutSessionStatusSchema } from './workout-sessions.js';

const macroValueSchema = z.number().nonnegative().finite();
const percentageSchema = z.number().min(0).max(100).finite();
export const MAX_DASHBOARD_TREND_RANGE_DAYS = 365;

export const getUtcDateValue = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
};

export const dashboardSnapshotQuerySchema = z.object({
  date: dateSchema.optional(),
});

export const dashboardTrendQuerySchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: '`from` must be on or before `to`',
    path: ['to'],
  })
  .refine(
    (value) => {
      if (!value.from || !value.to) {
        return true;
      }

      const diffDays =
        (getUtcDateValue(value.to) - getUtcDateValue(value.from)) / (1000 * 60 * 60 * 24) + 1;
      return diffDays <= MAX_DASHBOARD_TREND_RANGE_DAYS;
    },
    {
      message: `Date range cannot exceed ${MAX_DASHBOARD_TREND_RANGE_DAYS} days`,
      path: ['to'],
    },
  );

export const dashboardWeightSnapshotSchema = z.object({
  value: z.number().positive().finite(),
  date: dateSchema,
  unit: z.literal('lb'),
});

export const dashboardMacroTotalsSchema = z.object({
  calories: macroValueSchema,
  protein: macroValueSchema,
  carbs: macroValueSchema,
  fat: macroValueSchema,
});

export const dashboardMacroSnapshotSchema = z.object({
  actual: dashboardMacroTotalsSchema,
  target: dashboardMacroTotalsSchema,
});

export const dashboardWorkoutSnapshotSchema = z.object({
  name: z.string(),
  status: workoutSessionStatusSchema,
  duration: z.number().int().nonnegative().nullable(),
});

export const dashboardHabitsSnapshotSchema = z.object({
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  percentage: percentageSchema,
});

export const dashboardSnapshotSchema = z.object({
  date: dateSchema,
  weight: dashboardWeightSnapshotSchema.nullable(),
  macros: dashboardMacroSnapshotSchema,
  workout: dashboardWorkoutSnapshotSchema.nullable(),
  habits: dashboardHabitsSnapshotSchema,
});

export const dashboardWeightTrendPointSchema = z.object({
  date: dateSchema,
  value: z.number().positive().finite(),
});

export const dashboardMacrosTrendPointSchema = z.object({
  date: dateSchema,
  calories: macroValueSchema,
  protein: macroValueSchema,
  carbs: macroValueSchema,
  fat: macroValueSchema,
});

export const dashboardConsistencyTrendPointSchema = z.object({
  date: dateSchema,
  completed: z.boolean(),
});

export const dashboardWeightTrendSchema = z.array(dashboardWeightTrendPointSchema);
export const dashboardMacrosTrendSchema = z.array(dashboardMacrosTrendPointSchema);
export const dashboardConsistencyTrendSchema = z.array(dashboardConsistencyTrendPointSchema);

export type DashboardSnapshotQuery = z.infer<typeof dashboardSnapshotQuerySchema>;
export type DashboardTrendQuery = z.infer<typeof dashboardTrendQuerySchema>;
export type DashboardWeightSnapshot = z.infer<typeof dashboardWeightSnapshotSchema>;
export type DashboardMacroTotals = z.infer<typeof dashboardMacroTotalsSchema>;
export type DashboardMacroSnapshot = z.infer<typeof dashboardMacroSnapshotSchema>;
export type DashboardWorkoutSnapshot = z.infer<typeof dashboardWorkoutSnapshotSchema>;
export type DashboardHabitsSnapshot = z.infer<typeof dashboardHabitsSnapshotSchema>;
export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>;
export type DashboardWeightTrendPoint = z.infer<typeof dashboardWeightTrendPointSchema>;
export type DashboardMacrosTrendPoint = z.infer<typeof dashboardMacrosTrendPointSchema>;
export type DashboardConsistencyTrendPoint = z.infer<typeof dashboardConsistencyTrendPointSchema>;
