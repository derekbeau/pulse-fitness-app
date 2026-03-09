import { z } from 'zod';

import { dateSchema } from './common.js';
import { workoutSessionStatusSchema } from './workout-sessions.js';

const macroValueSchema = z.number().nonnegative().finite();
const percentageSchema = z.number().min(0).max(100).finite();

export const dashboardSnapshotQuerySchema = z.object({
  date: dateSchema.optional(),
});

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

export type DashboardSnapshotQuery = z.infer<typeof dashboardSnapshotQuerySchema>;
export type DashboardWeightSnapshot = z.infer<typeof dashboardWeightSnapshotSchema>;
export type DashboardMacroTotals = z.infer<typeof dashboardMacroTotalsSchema>;
export type DashboardMacroSnapshot = z.infer<typeof dashboardMacroSnapshotSchema>;
export type DashboardWorkoutSnapshot = z.infer<typeof dashboardWorkoutSnapshotSchema>;
export type DashboardHabitsSnapshot = z.infer<typeof dashboardHabitsSnapshotSchema>;
export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>;
