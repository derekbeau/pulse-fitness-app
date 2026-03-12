import { z } from 'zod';

export const trashTypeSchema = z.enum([
  'habits',
  'workout-templates',
  'exercises',
  'foods',
  'workout-sessions',
]);

export const trashItemSchema = z.object({
  id: z.string(),
  type: trashTypeSchema,
  name: z.string(),
  deletedAt: z.string(),
});

export const trashListResponseSchema = z.object({
  habits: z.array(trashItemSchema),
  'workout-templates': z.array(trashItemSchema),
  exercises: z.array(trashItemSchema),
  foods: z.array(trashItemSchema),
  'workout-sessions': z.array(trashItemSchema),
});

export type TrashType = z.infer<typeof trashTypeSchema>;
export type TrashItem = z.infer<typeof trashItemSchema>;
export type TrashListResponse = z.infer<typeof trashListResponseSchema>;
