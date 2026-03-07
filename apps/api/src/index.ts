import fastifyJwt from '@fastify/jwt';
import Fastify from 'fastify';

import { authRoutes } from './routes/auth/index.js';
import { agentTokenRoutes } from './routes/agent-tokens/index.js';

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

  return app;
};

const start = async () => {
  const app = buildServer();

  try {
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
