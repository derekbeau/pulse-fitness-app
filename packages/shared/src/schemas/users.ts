import { z } from 'zod';

export const userProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string().nullable(),
  createdAt: z.number(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

export const updateUserInputSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
