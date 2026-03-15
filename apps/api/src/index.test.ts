import { describe, expect, it } from 'vitest';

import { buildServer } from './index.js';

describe('GET /health', () => {
  it('returns an ok status payload', async () => {
    const app = buildServer();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    } finally {
      await app.close();
    }
  });
});

describe('OpenAPI docs', () => {
  it('serves an OpenAPI 3.1 document with Pulse security schemes', async () => {
    const app = buildServer();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/docs/json',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.openapi).toBe('3.1.0');
      expect(body.info).toMatchObject({
        title: 'Pulse Fitness API',
        version: '1.0.0',
      });
      expect(body.servers).toEqual([{ url: 'http://localhost:3001' }]);
      expect(body.paths).toBeTypeOf('object');
      expect(body.components?.securitySchemes).toMatchObject({
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
      });
    } finally {
      await app.close();
    }
  });

  it('serves Swagger UI at /api/docs', async () => {
    const app = buildServer();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/docs',
      });

      expect([200, 302]).toContain(response.statusCode);
      expect(response.headers['content-type']).toContain('text/html');
    } finally {
      await app.close();
    }
  });
});
