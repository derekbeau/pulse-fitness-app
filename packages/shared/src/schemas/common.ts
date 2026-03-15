import { z } from 'zod';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const isValidIsoDate = (value: string) => {
  if (!datePattern.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const dateSchema = z.string().refine(isValidIsoDate, 'Invalid date');

export const agentEnrichmentSchema = z.object({
  hints: z.array(z.string().min(1)).min(1).optional(),
  suggestedActions: z.array(z.string().min(1)).min(1).optional(),
  relatedState: z.record(z.string(), z.unknown()).optional(),
});

export const apiDataResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    agent: agentEnrichmentSchema.optional(),
  });

export const apiMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const apiPaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    meta: apiMetaSchema,
    agent: agentEnrichmentSchema.optional(),
  });

export type AgentEnrichment = z.infer<typeof agentEnrichmentSchema>;
