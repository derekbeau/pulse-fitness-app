import { z } from 'zod';

export * from './schemas/auth.js';
export * from './schemas/activities.js';
export * from './schemas/agent-tokens.js';
export * from './schemas/entity-links.js';
export * from './schemas/equipment.js';
export * from './schemas/health-conditions.js';
export * from './schemas/journal.js';
export * from './schemas/resources.js';
export * from './schemas/weight.js';

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type User = z.infer<typeof userSchema>;
