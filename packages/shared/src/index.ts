import { z } from 'zod';

export * from './schemas/agent.js';
export * from './schemas/auth.js';
export * from './schemas/activities.js';
export * from './schemas/agent-tokens.js';
export * from './schemas/dashboard-config.js';
export * from './schemas/dashboard.js';
export * from './schemas/entity-links.js';
export * from './schemas/equipment.js';
export * from './schemas/exercises.js';
export * from './schemas/habit-entries.js';
export * from './schemas/habits.js';
export * from './schemas/health-conditions.js';
export * from './schemas/journal.js';
export * from './schemas/foods.js';
export * from './schemas/nutrition.js';
export * from './schemas/nutrition-targets.js';
export * from './schemas/resources.js';
export * from './schemas/scheduled-workouts.js';
export * from './schemas/session-set.js';
export * from './schemas/trash.js';
export * from './schemas/weight.js';
export * from './schemas/workout-sessions.js';
export * from './schemas/users.js';
export * from './schemas/workout-templates.js';
export * from './utils/ewma.js';
export * from './utils/habit-scheduling.js';
export * from './utils/weight-unit.js';

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type User = z.infer<typeof userSchema>;
