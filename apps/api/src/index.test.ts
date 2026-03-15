import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildServer } from './index.js';

const ROUTE_DIR = fileURLToPath(new URL('./routes', import.meta.url));
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

const listRouteFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listRouteFiles(absolutePath);
      }

      if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
        return [];
      }

      return [absolutePath];
    }),
  );

  return files.flat();
};

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

      expect(body.paths?.['/api/v1/workout-templates/']?.post).toMatchObject({
        summary: 'Create a workout template',
        tags: ['workout-templates'],
        security: [{ bearerAuth: [] }, { agentToken: [] }],
      });
      expect(body.paths?.['/api/v1/workout-sessions/{id}/time-segments']?.patch).toMatchObject({
        summary: 'Replace workout session time segments',
        tags: ['workout-sessions'],
        security: [{ bearerAuth: [] }, { agentToken: [] }],
      });
      expect(body.paths?.['/api/v1/habits/']?.get).toMatchObject({
        summary: 'List active habits with today entry state',
        tags: ['habits'],
        security: [{ bearerAuth: [] }, { agentToken: [] }],
      });
      expect(body.paths?.['/api/v1/weight/latest']?.get).toMatchObject({
        summary: 'Get the latest body weight entry',
        tags: ['weight'],
        security: [{ bearerAuth: [] }, { agentToken: [] }],
      });
      expect(body.paths?.['/api/v1/dashboard/snapshot']?.get).toMatchObject({
        summary: 'Get the dashboard snapshot for a day',
        tags: ['dashboard'],
        security: [{ bearerAuth: [] }, { agentToken: [] }],
      });
      expect(body.paths?.['/api/v1/users/me']?.patch).toMatchObject({
        summary: 'Update the current user profile',
        tags: ['settings'],
        security: [{ bearerAuth: [] }],
      });
      expect(body.paths?.['/api/v1/context/']?.get).toMatchObject({
        summary: 'Get the agent context payload',
        tags: ['context'],
        security: [{ agentToken: [] }],
      });
      expect(body.paths?.['/api/v1/trash/{type}/{id}/restore']?.post).toMatchObject({
        summary: 'Restore a soft-deleted resource',
        tags: ['trash'],
        security: [{ bearerAuth: [] }, { agentToken: [] }],
      });
    } finally {
      await app.close();
    }
  });

  it('documents all versioned API operations with tags, summaries, responses, and matching security', async () => {
    const app = buildServer();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/docs/json',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json() as {
        paths: Record<string, Partial<Record<(typeof HTTP_METHODS)[number], Record<string, unknown>>>>;
      };

      const versionedOperations = Object.entries(body.paths)
        .filter(([routePath]) => routePath.startsWith('/api/v1/'))
        .flatMap(([routePath, methods]) =>
          HTTP_METHODS.flatMap((method) =>
            methods[method] ? [{ routePath, method, operation: methods[method] }] : [],
          ),
        );

      expect(versionedOperations.length).toBeGreaterThan(0);

      for (const { routePath, operation } of versionedOperations) {
        expect(operation.tags).toEqual(expect.arrayContaining([expect.any(String)]));
        expect(operation.summary).toEqual(expect.any(String));
        expect(operation.responses).toBeTruthy();

        if (routePath.startsWith('/api/v1/auth/')) {
          expect(operation.security).toBeUndefined();
          continue;
        }

        if (routePath.startsWith('/api/v1/users/') || routePath.startsWith('/api/v1/agent-tokens/')) {
          expect(operation.security).toEqual([{ bearerAuth: [] }]);
          continue;
        }

        if (routePath.startsWith('/api/v1/context')) {
          expect(operation.security).toEqual([{ agentToken: [] }]);
          continue;
        }

        expect(operation.security).toBeTruthy();
      }
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

describe('Route schema migration', () => {
  it('does not manually parse request params, query, or body in route files', async () => {
    const routeFiles = await listRouteFiles(ROUTE_DIR);
    const offenders: string[] = [];

    for (const routeFile of routeFiles) {
      const source = await readFile(routeFile, 'utf8');
      if (/\.(?:safeParse|parse)\(request\.(?:body|query|params)\)/.test(source)) {
        offenders.push(path.relative(process.cwd(), routeFile));
      }
    }

    expect(offenders).toEqual([]);
  });
});
