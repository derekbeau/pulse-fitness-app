import { z } from 'zod';

export const reconcileFoodUsageInputSchema = z
  .object({
    mode: z.enum(['dry-run', 'apply']).default('dry-run'),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .strict();

const usageSchema = z.object({
  usageCount: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nullable(),
});
export const reconcileFoodUsageResponseSchema = z.object({
  userId: z.string(),
  mode: z.enum(['dry-run', 'apply']),
  reconciled: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  rows: z.array(
    z.object({
      id: z.string(),
      before: usageSchema.extend({ usageCount: z.number(), lastUsedAt: z.number().nullable() }),
      projected: usageSchema,
    }),
  ),
});
