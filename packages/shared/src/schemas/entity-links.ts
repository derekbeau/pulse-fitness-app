import { z } from 'zod';

export const entityLinkSourceTypeSchema = z.enum(['journal', 'activity', 'resource']);
export const entityLinkTargetTypeSchema = z.enum([
  'workout',
  'activity',
  'habit',
  'injury',
  'exercise',
  'protocol',
]);

export const entityLinkSchema = z.object({
  id: z.string(),
  sourceType: entityLinkSourceTypeSchema,
  sourceId: z.string(),
  targetType: entityLinkTargetTypeSchema,
  targetId: z.string(),
  targetName: z.string().trim().min(1),
  createdAt: z.number().int(),
});

export type EntityLinkSourceType = z.infer<typeof entityLinkSourceTypeSchema>;
export type EntityLinkTargetType = z.infer<typeof entityLinkTargetTypeSchema>;
export type EntityLink = z.infer<typeof entityLinkSchema>;
