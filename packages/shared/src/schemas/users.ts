import { z } from 'zod';

export const userProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string().nullable(),
  createdAt: z.number(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

export const updateUserInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
