import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';
import { loginInputSchema, registerInputSchema } from '@pulse/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';

import { createUser, ensureStarterHabitsForUser, findUserByUsername } from './store.js';

const INVALID_CREDENTIALS_RESPONSE = {
  error: {
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid username or password',
  },
} as const;

const PASSWORD_SALT_ROUNDS = 12;
const JWT_EXPIRES_IN = '7d';

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

const buildAuthResponse = (app: FastifyInstance, user: AuthUser) => ({
  data: {
    token: app.jwt.sign({ userId: user.id }, { expiresIn: JWT_EXPIRES_IN }),
    user,
  },
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register', async (request, reply) => {
    const parsedBody = registerInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid registration payload');
    }

    const existingUser = await findUserByUsername(parsedBody.data.username);
    if (existingUser) {
      return sendError(reply, 409, 'USERNAME_TAKEN', 'Username is already taken');
    }

    const user = {
      id: randomUUID(),
      username: parsedBody.data.username,
      name: parsedBody.data.name,
    };

    try {
      const passwordHash = await bcrypt.hash(parsedBody.data.password, PASSWORD_SALT_ROUNDS);
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
  });

  app.post('/login', async (request, reply) => {
    const parsedBody = loginInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid login payload');
    }

    const user = await findUserByUsername(parsedBody.data.username);
    if (!user) {
      return reply.code(401).send(INVALID_CREDENTIALS_RESPONSE);
    }

    const isValidPassword = await bcrypt.compare(parsedBody.data.password, user.passwordHash);
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
  });
};
