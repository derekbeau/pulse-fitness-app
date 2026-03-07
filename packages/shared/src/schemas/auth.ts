import { z } from 'zod';

export const registerInputSchema = z.object({
  username: z.string().trim().min(3),
  password: z.string().min(8),
  name: z.string().optional(),
});

export const loginInputSchema = z.object({
  username: z.string().trim().min(3),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
