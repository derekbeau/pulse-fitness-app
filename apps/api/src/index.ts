import fastifyJwt from '@fastify/jwt';
import Fastify from 'fastify';
import { fileURLToPath } from 'node:url';

import { authRoutes } from './routes/auth/index.js';
import { agentTokenRoutes } from './routes/agent-tokens/index.js';
import { exerciseRoutes } from './routes/exercises/index.js';
import { foodsRoutes } from './routes/foods/index.js';
import { habitEntryCollectionRoutes } from './routes/habit-entries/index.js';
import { habitRoutes } from './routes/habits/index.js';
import { nutritionRoutes } from './routes/nutrition/index.js';
import { nutritionTargetRoutes } from './routes/nutrition-targets/index.js';
import { scheduledWorkoutRoutes } from './routes/scheduled-workouts/index.js';
import { weightRoutes } from './routes/weight/index.js';
import { workoutSessionRoutes } from './routes/workout-sessions/index.js';
import { workoutTemplateRoutes } from './routes/workout-templates/index.js';

const DEV_JWT_SECRET = 'pulse-dev-jwt-secret';

const getJwtSecret = () => {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }

  return DEV_JWT_SECRET;
};

export const buildServer = () => {
  const app = Fastify({ logger: true });

  app.register(fastifyJwt, {
    secret: getJwtSecret(),
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(agentTokenRoutes, { prefix: '/api/v1/agent-tokens' });
  app.register(exerciseRoutes, { prefix: '/api/v1/exercises' });
  app.register(foodsRoutes, { prefix: '/api/v1/foods' });
  app.register(habitRoutes, { prefix: '/api/v1/habits' });
  app.register(habitEntryCollectionRoutes, { prefix: '/api/v1/habit-entries' });
  app.register(nutritionRoutes, { prefix: '/api/v1/nutrition' });
  app.register(nutritionTargetRoutes, { prefix: '/api/v1/nutrition-targets' });
  app.register(scheduledWorkoutRoutes, { prefix: '/api/v1/scheduled-workouts' });
  app.register(weightRoutes, { prefix: '/api/v1/weight' });
  app.register(workoutSessionRoutes, { prefix: '/api/v1/workout-sessions' });
  app.register(workoutTemplateRoutes, { prefix: '/api/v1/workout-templates' });

  return app;
};

const start = async () => {
  const app = buildServer();

  try {
    const [{ db }, { migrate }] = await Promise.all([
      import('./db/index.js'),
      import('drizzle-orm/better-sqlite3/migrator'),
    ]);
    const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

    migrate(db, { migrationsFolder });

    const address = await app.listen({
      host: process.env.HOST || '0.0.0.0',
      port: Number(process.env.PORT) || 3001,
    });
    app.log.info(`API server listening at ${address}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') {
  void start();
}
