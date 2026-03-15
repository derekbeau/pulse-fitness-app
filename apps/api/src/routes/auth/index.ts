import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';
import { apiDataResponseSchema, loginInputSchema, registerInputSchema } from '@pulse/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { issueSessionJwt } from '../../lib/session-jwt.js';
import { sendError } from '../../lib/reply.js';
import { badRequestResponseSchema } from '../../openapi.js';

import { createUser, ensureStarterHabitsForUser, findUserByUsername } from './store.js';

const INVALID_CREDENTIALS_RESPONSE = {
  error: {
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid username or password',
  },
} as const;

const PASSWORD_SALT_ROUNDS = 12;
const isSqliteUniqueConstraintError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'SQLITE_CONSTRAINT_UNIQUE';

type AuthUser = {
  id: string;
  username: string;
  name: string | null;
};

const authUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string().nullable(),
});

const authResponseSchema = apiDataResponseSchema(
  z.object({
    token: z.string(),
    user: authUserSchema,
  }),
);

const invalidCredentialsResponseSchema = z.object({
  error: z.object({
    code: z.literal('INVALID_CREDENTIALS'),
    message: z.string(),
  }),
});

const usernameTakenResponseSchema = z.object({
  error: z.object({
    code: z.literal('USERNAME_TAKEN'),
    message: z.string(),
  }),
});

const buildAuthResponse = (app: FastifyInstance, user: AuthUser) => ({
  data: {
    token: issueSessionJwt(app, user.id),
    user,
  },
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/register',
    {
      schema: {
        body: registerInputSchema,
        response: {
          201: authResponseSchema,
          400: badRequestResponseSchema,
          409: usernameTakenResponseSchema,
        },
        tags: ['auth'],
        summary: 'Register a new user account',
      },
    },
    async (request, reply) => {
      const body = request.body;
      const existingUser = await findUserByUsername(body.username);
      if (existingUser) {
        return sendError(reply, 409, 'USERNAME_TAKEN', 'Username is already taken');
      }

      const user = {
        id: randomUUID(),
        username: body.username,
        name: body.name,
      };

      try {
        const passwordHash = await bcrypt.hash(body.password, PASSWORD_SALT_ROUNDS);
        const createdUser = await createUser({
          ...user,
          passwordHash,
        });

        return reply.code(201).send(buildAuthResponse(app, createdUser));
      } catch (error) {
        if (isSqliteUniqueConstraintError(error)) {
          return sendError(reply, 409, 'USERNAME_TAKEN', 'Username is already taken');
        }

        throw error;
      }
    },
  );

  typedApp.post(
    '/login',
    {
      schema: {
        body: loginInputSchema,
        response: {
          200: authResponseSchema,
          400: badRequestResponseSchema,
          401: invalidCredentialsResponseSchema,
        },
        tags: ['auth'],
        summary: 'Authenticate a user session',
      },
    },
    async (request, reply) => {
      const body = request.body;
      const user = await findUserByUsername(body.username);
      if (!user) {
        return reply.code(401).send(INVALID_CREDENTIALS_RESPONSE);
      }

      const isValidPassword = await bcrypt.compare(body.password, user.passwordHash);
      if (!isValidPassword) {
        return reply.code(401).send(INVALID_CREDENTIALS_RESPONSE);
      }

      await ensureStarterHabitsForUser(user.id);

      return reply.send(
        buildAuthResponse(app, {
          id: user.id,
          username: user.username,
          name: user.name,
        }),
      );
    },
  );
};
