import { z } from 'zod';

export * from './schemas/auth.js';
export * from './schemas/activities.js';
export * from './schemas/agent-tokens.js';
export * from './schemas/entity-links.js';
export * from './schemas/equipment.js';
export * from './schemas/habit-entries.js';
export * from './schemas/habits.js';
export * from './schemas/health-conditions.js';
export * from './schemas/journal.js';
export * from './schemas/resources.js';

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type User = z.infer<typeof userSchema>;
