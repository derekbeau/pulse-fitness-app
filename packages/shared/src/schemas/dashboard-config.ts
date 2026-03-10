import { z } from 'zod';

const trendMetricSchema = z.enum(['weight', 'calories', 'protein']);

const nonEmptyStringArraySchema = z.array(z.string().min(1));

export const DASHBOARD_WIDGET_IDS = {
  'snapshot-cards': 'Daily Snapshot',
  'macro-rings': 'Macro Progress',
  'habit-chain': 'Habit Streaks',
  'trend-sparklines': 'Trend Charts',
  'recent-workouts': 'Recent Workouts',
  calendar: 'Date Picker',
  'log-weight': 'Log Weight',
  'weight-trend': 'Weight Trend',
} as const;

export const DEFAULT_VISIBLE_WIDGETS = Object.keys(DASHBOARD_WIDGET_IDS);

export const dashboardConfigSchema = z.object({
  habitChainIds: nonEmptyStringArraySchema,
  trendMetrics: z.array(trendMetricSchema),
  visibleWidgets: z.array(z.string().min(1)).default(() => [...DEFAULT_VISIBLE_WIDGETS]),
  widgetOrder: nonEmptyStringArraySchema.optional(),
});

export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;
export type DashboardTrendMetric = z.infer<typeof trendMetricSchema>;
