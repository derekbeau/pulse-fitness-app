import { z } from 'zod';

import { dateSchema } from './common.js';

export const healthConditionStatusSchema = z.enum(['active', 'monitoring', 'resolved']);
export const conditionTimelineEventTypeSchema = z.enum([
  'onset',
  'flare',
  'improvement',
  'treatment',
  'milestone',
]);
export const conditionProtocolStatusSchema = z.enum(['active', 'discontinued', 'completed']);

export const healthConditionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string().trim().min(1),
  bodyArea: z.string().trim().min(1),
  status: healthConditionStatusSchema,
  onsetDate: dateSchema,
  description: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const conditionTimelineEventSchema = z.object({
  id: z.string(),
  conditionId: z.string(),
  date: dateSchema,
  event: z.string().trim().min(1),
  type: conditionTimelineEventTypeSchema,
  notes: z.string().nullable(),
  createdAt: z.number().int(),
});

export const conditionProtocolSchema = z.object({
  id: z.string(),
  conditionId: z.string(),
  name: z.string().trim().min(1),
  status: conditionProtocolStatusSchema,
  startDate: dateSchema,
  endDate: dateSchema.nullable(),
  notes: z.string().nullable(),
  createdAt: z.number().int(),
});

export const conditionSeverityPointSchema = z.object({
  id: z.string(),
  conditionId: z.string(),
  date: dateSchema,
  value: z.number().int().min(1).max(10),
  createdAt: z.number().int(),
});

export type HealthConditionStatus = z.infer<typeof healthConditionStatusSchema>;
export type ConditionTimelineEventType = z.infer<typeof conditionTimelineEventTypeSchema>;
export type ConditionProtocolStatus = z.infer<typeof conditionProtocolStatusSchema>;
export type HealthCondition = z.infer<typeof healthConditionSchema>;
export type ConditionTimelineEvent = z.infer<typeof conditionTimelineEventSchema>;
export type ConditionProtocol = z.infer<typeof conditionProtocolSchema>;
export type ConditionSeverityPoint = z.infer<typeof conditionSeverityPointSchema>;
