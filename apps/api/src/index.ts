import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifyJwt from '@fastify/jwt';
import Fastify from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { fileURLToPath } from 'node:url';

import { authRoutes } from './routes/auth/index.js';
import { agentTokenRoutes } from './routes/agent-tokens/index.js';
import { exerciseRoutes } from './routes/exercises/index.js';
import { foodsRoutes } from './routes/foods/index.js';
import { habitEntryCollectionRoutes } from './routes/habit-entries/index.js';
import { habitRoutes } from './routes/habits/index.js';
import { mealRoutes } from './routes/meals/index.js';
import { nutritionRoutes } from './routes/nutrition/index.js';
import { nutritionTargetRoutes } from './routes/nutrition-targets/index.js';
import { scheduledWorkoutRoutes } from './routes/scheduled-workouts/index.js';
import { trashRoutes } from './routes/trash/index.js';
import { v1Routes } from './routes/v1/index.js';
import { weightRoutes } from './routes/weight/index.js';
import { workoutSessionRoutes } from './routes/workout-sessions/index.js';
import { workoutTemplateRoutes } from './routes/workout-templates/index.js';

const DEV_JWT_SECRET = 'pulse-dev-jwt-secret';
const OPENAPI_SERVER_URL = 'http://localhost:3001';

const getJwtSecret = () => {
  if (process.env.JWT_SECRET) {
    // Inject JWT_SECRET at runtime. Do not keep a production signing secret in
    // agent-readable env files or committed config.
    return process.env.JWT_SECRET;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }

  return DEV_JWT_SECRET;
};

export const buildServer = () => {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(fastifyJwt, {
    secret: getJwtSecret(),
  });

  app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Pulse Fitness API',
        description: 'Unified API for Pulse fitness app and agent integrations',
        version: '1.0.0',
      },
      servers: [{ url: OPENAPI_SERVER_URL }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          agentToken: {
            type: 'apiKey',
            in: 'header',
            name: 'Authorization',
            description: 'AgentToken <token>',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  app.register(swaggerUi, {
    routePrefix: '/api/docs',
  });

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: {
            issues: error.validation,
            method: request.method,
            url: request.url,
          },
        },
      });
    }

    if (isResponseSerializationError(error)) {
      request.log.error(
        { err: error, method: error.method, url: error.url, issues: error.cause.issues },
        "Response doesn't match the route schema",
      );

      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Response serialization failed',
        },
      });
    }

    return reply.send(error);
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(agentTokenRoutes, { prefix: '/api/v1/agent-tokens' });
  app.register(exerciseRoutes, { prefix: '/api/v1/exercises' });
  app.register(foodsRoutes, { prefix: '/api/v1/foods' });
  app.register(habitRoutes, { prefix: '/api/v1/habits' });
  app.register(habitEntryCollectionRoutes, { prefix: '/api/v1/habit-entries' });
  app.register(mealRoutes, { prefix: '/api/v1/meals' });
  app.register(nutritionRoutes, { prefix: '/api/v1/nutrition' });
  app.register(nutritionTargetRoutes, { prefix: '/api/v1/nutrition-targets' });
  app.register(scheduledWorkoutRoutes, { prefix: '/api/v1/scheduled-workouts' });
  app.register(trashRoutes, { prefix: '/api/v1/trash' });
  app.register(v1Routes, { prefix: '/api/v1' });
  app.register(weightRoutes, { prefix: '/api/v1/weight' });
  app.register(workoutSessionRoutes, { prefix: '/api/v1/workout-sessions' });
  app.register(workoutTemplateRoutes, { prefix: '/api/v1/workout-templates' });

  return app;
};

const start = async () => {
  const app = buildServer();

  try {
    const [{ db, sqlite }, { migrate }] = await Promise.all([
      import('./db/index.js'),
      import('drizzle-orm/better-sqlite3/migrator'),
    ]);
    const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

    // Disable FK checks for migrations — PRAGMA foreign_keys doesn't work
    // inside transactions, and Drizzle wraps each migration in one.
    sqlite.pragma('foreign_keys = OFF');
    migrate(db, { migrationsFolder });
    sqlite.pragma('foreign_keys = ON');

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
