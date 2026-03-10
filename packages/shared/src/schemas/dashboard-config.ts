import { z } from 'zod';

const trendMetricSchema = z.enum(['weight', 'calories', 'protein']);

const nonEmptyStringArraySchema = z.array(z.string().min(1));

export const dashboardConfigSchema = z.object({
  habitChainIds: nonEmptyStringArraySchema,
  trendMetrics: z.array(trendMetricSchema),
  widgetOrder: nonEmptyStringArraySchema.optional(),
});

export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;
export type DashboardTrendMetric = z.infer<typeof trendMetricSchema>;
