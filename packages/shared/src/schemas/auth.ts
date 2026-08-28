import { z } from 'zod';

import { userTimeZoneSchema } from './users.js';

const usernameSchema = z.string().trim().toLowerCase().min(3).max(30);

export const registerInputSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8).max(72),
  name: z.string().trim().min(1).optional(),
  timeZone: userTimeZoneSchema,
});

export const loginInputSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
