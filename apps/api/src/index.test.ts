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

      expect(body.paths?.['/api/v1/auth/register']?.post).toMatchObject({
        summary: 'Register a new user account',
        tags: ['auth'],
      });
      expect(body.paths?.['/api/v1/auth/register']?.post.security).toBeUndefined();
      expect(body.paths?.['/api/v1/auth/register']?.post.requestBody).toBeTruthy();

      expect(body.paths?.['/api/v1/foods/']?.get).toMatchObject({
        summary: 'List foods',
        tags: ['foods'],
        security: [{ bearerAuth: [] }, { agentToken: [] }],
      });
      expect(body.paths?.['/api/v1/foods/']?.get.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'page', in: 'query' }),
          expect.objectContaining({ name: 'limit', in: 'query' }),
        ]),
      );

      expect(body.paths?.['/api/v1/meals/']?.post).toMatchObject({
        summary: 'Create a meal entry',
        tags: ['nutrition'],
        security: [{ bearerAuth: [] }, { agentToken: [] }],
      });
      expect(body.paths?.['/api/v1/meals/']?.post.requestBody).toBeTruthy();

      expect(body.paths?.['/api/v1/nutrition/{date}/summary']?.get).toMatchObject({
        summary: 'Get daily nutrition summary',
        tags: ['nutrition'],
        security: [{ bearerAuth: [] }, { agentToken: [] }],
      });
      expect(body.paths?.['/api/v1/nutrition/{date}/summary']?.get.parameters).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'date', in: 'path' })]),
      );

      expect(body.paths?.['/api/v1/exercises/{id}/last-performance']?.get).toMatchObject({
        summary: 'Get the latest completed performance for an exercise',
        tags: ['exercises'],
        security: [{ bearerAuth: [] }, { agentToken: [] }],
      });
      expect(body.paths?.['/api/v1/exercises/{id}/last-performance']?.get.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'id', in: 'path' }),
          expect.objectContaining({ name: 'includeRelated', in: 'query' }),
        ]),
      );
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

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
    } finally {
      await app.close();
    }
  });
});
