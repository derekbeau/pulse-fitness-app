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
const DEFAULT_OPENAPI_SERVER_URL = 'http://localhost:3001';
// TODO: remove once transformed schemas no longer emit top-level request-body anyOf branches.
// This transitional map currently normalizes these endpoints:
// createExerciseInputSchema, createMealInputSchema, create/updateWorkoutSessionInputSchema,
// and create/updateWorkoutTemplateInputSchema.
const REQUEST_BODY_ANYOF_BRANCH_SELECTION: Record<string, Partial<Record<string, number>>> = {
  '/api/v1/exercises/': { post: 1 },
  '/api/v1/meals/': { post: 1 },
  '/api/v1/workout-sessions/': { post: 0 },
  '/api/v1/workout-sessions/{id}': { put: 0, patch: 0 },
  '/api/v1/workout-templates/': { post: 0 },
  '/api/v1/workout-templates/{id}': { put: 0, patch: 0 },
};

const normalizeOpenApiRequestBodySchemas = (openapiObject: unknown) => {
  if (typeof openapiObject === 'object' && openapiObject !== null) {
    const wrapper = openapiObject as { openapiObject?: unknown; swaggerObject?: unknown };
    if (wrapper.openapiObject !== undefined) {
      return normalizeOpenApiRequestBodySchemas(wrapper.openapiObject);
    }

    if (wrapper.swaggerObject !== undefined) {
      return normalizeOpenApiRequestBodySchemas(wrapper.swaggerObject);
    }
  }

  if (typeof openapiObject !== 'object' || openapiObject === null) {
    return openapiObject;
  }

  const document = openapiObject as {
    paths?: Record<
      string,
      Partial<
        Record<
          string,
          {
            requestBody?: {
              content?: {
                'application/json'?: {
                  schema?: Record<string, unknown>;
                };
              };
            };
          }
        >
      >
    >;
  };

  const paths = document.paths;
  if (!paths) {
    return openapiObject;
  }

  for (const [path, methodSelections] of Object.entries(REQUEST_BODY_ANYOF_BRANCH_SELECTION)) {
    const pathItem = paths[path];
    if (!pathItem) {
      continue;
    }

    for (const [method, selectedBranchIndex] of Object.entries(methodSelections)) {
      if (typeof selectedBranchIndex !== 'number') {
        continue;
      }

      const operation = pathItem[method];
      if (!operation) {
        continue;
      }

      const schema = operation.requestBody?.content?.['application/json']?.schema;
      if (!schema || !Array.isArray(schema.anyOf)) {
        continue;
      }

      const selectedSchema = schema.anyOf[selectedBranchIndex];
      if (typeof selectedSchema !== 'object' || selectedSchema === null) {
        continue;
      }

      const jsonContent = operation.requestBody?.content?.['application/json'];
      if (!jsonContent) {
        continue;
      }

      jsonContent.schema = selectedSchema as Record<string, unknown>;
    }
  }

  return openapiObject;
};

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
      servers: [{ url: process.env.API_URL ?? DEFAULT_OPENAPI_SERVER_URL }],
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
            description:
              'Send the full Authorization header value as `AgentToken <token>`. OpenAPI-generated clients may require manual prefixing.',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: (documentObject) =>
      normalizeOpenApiRequestBodySchemas(documentObject) as Record<string, unknown>,
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

    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;

    request.log.error({ err: error, statusCode }, 'Unhandled error');

    return reply.code(statusCode).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
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

    const shutdown = async () => {
      app.log.info('Shutting down…');
      await app.close();
      sqlite.pragma('wal_checkpoint(TRUNCATE)');
      sqlite.close();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

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
