import { z } from 'zod';

export const resourceTypeSchema = z.enum(['program', 'book', 'creator']);

export const resourceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string().trim().min(1),
  type: resourceTypeSchema,
  author: z.string().trim().min(1),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  principles: z.array(z.string()),
  createdAt: z.number().int(),
});

export type ResourceType = z.infer<typeof resourceTypeSchema>;
export type Resource = z.infer<typeof resourceSchema>;
