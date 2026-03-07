import { z } from 'zod';

const usernameSchema = z.string().trim().toLowerCase().min(3);

export const registerInputSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8).max(72),
  name: z.string().trim().min(1).optional(),
});

export const loginInputSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
