import { z } from 'zod';

import { dateSchema } from './common.js';

export const activityTypeSchema = z.enum([
  'walking',
  'running',
  'stretching',
  'yoga',
  'cycling',
  'swimming',
  'hiking',
  'other',
]);

export const activitySchema = z.object({
  id: z.string(),
  userId: z.string(),
  date: dateSchema,
  type: activityTypeSchema,
  name: z.string().trim().min(1),
  durationMinutes: z.number().int().positive(),
  notes: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type ActivityType = z.infer<typeof activityTypeSchema>;
export type Activity = z.infer<typeof activitySchema>;
