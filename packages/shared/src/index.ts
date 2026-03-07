import { z } from 'zod';

export * from './schemas/auth.js';
export * from './schemas/agent-tokens.js';
export * from './schemas/health-conditions.js';

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type User = z.infer<typeof userSchema>;
