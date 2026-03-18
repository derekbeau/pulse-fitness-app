import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildServer } from './index.js';

const ROUTE_DIR = fileURLToPath(new URL('./routes', import.meta.url));
const REPO_AGENTS_DOC = fileURLToPath(new URL('../../../AGENTS.md', import.meta.url));
const REPO_README = fileURLToPath(new URL('../../../README.md', import.meta.url));
const PULSE_APP_USAGE_SKILL = fileURLToPath(
  new URL('../../../.agents/skills/pulse-app-usage/SKILL.md', import.meta.url),
);
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
    const previousApiUrl = process.env.API_URL;
    process.env.API_URL = 'https://api.pulse.test';

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
      expect(body.servers).toEqual([{ url: 'https://api.pulse.test' }]);
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
          description:
            'Send the full Authorization header value as `AgentToken <token>`. OpenAPI-generated clients may require manual prefixing.',
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
      if (previousApiUrl === undefined) {
        delete process.env.API_URL;
      } else {
        process.env.API_URL = previousApiUrl;
      }
    }
  });

  it('documents unified request-body schemas without auth-branch anyOf bodies', async () => {
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

      const operationsWithRequestBody = Object.entries(body.paths).flatMap(([routePath, methods]) =>
        HTTP_METHODS.flatMap((method) => {
          const operation = methods[method];
          if (!operation || typeof operation !== 'object' || !('requestBody' in operation)) {
            return [];
          }

          return [{ routePath, method, operation }];
        }),
      );

      expect(operationsWithRequestBody.length).toBeGreaterThan(0);

      for (const { routePath, method, operation } of operationsWithRequestBody) {
        const requestBody = operation.requestBody as
          | {
              content?: {
                'application/json'?: {
                  schema?: Record<string, unknown>;
                };
              };
            }
          | undefined;

        const schema = requestBody?.content?.['application/json']?.schema;
        if (!schema) {
          continue;
        }

        expect(
          schema.anyOf,
          `Unexpected top-level anyOf in ${method.toUpperCase()} ${routePath}`,
        ).toBeUndefined();
      }

      const serialized = JSON.stringify(body);
      const removedSchemaNames = [
        'agentCreateFoodInputSchema',
        'agentFoodResultSchema',
        'agentFoodSearchParamsSchema',
        'agentMealItemInputSchema',
        'agentCreateMealInputSchema',
        'agentWorkoutTemplateExerciseInputSchema',
        'agentWorkoutTemplateSectionInputSchema',
        'agentCreateWorkoutTemplateInputSchema',
        'agentUpdateWorkoutTemplateInputSchema',
        'agentCreateWorkoutSessionInputSchema',
        'agentWorkoutSetUpsertInputSchema',
        'agentWorkoutSessionExerciseMutationSchema',
        'agentUpdateWorkoutSessionInputSchema',
        'agentCreateExerciseInputSchema',
        'agentPatchExerciseInputSchema',
      ];

      for (const schemaName of removedSchemaNames) {
        expect(serialized).not.toContain(schemaName);
      }
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

  it('wraps unhandled errors in the standard API error envelope', async () => {
    const app = buildServer();
    app.get('/__test/unhandled-error', async () => {
      throw new Error('boom');
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/__test/unhandled-error',
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('documents the OpenAPI and Swagger UI endpoints consistently in project docs', async () => {
    const [agentsDoc, readme, skillDoc] = await Promise.all([
      readFile(REPO_AGENTS_DOC, 'utf8'),
      readFile(REPO_README, 'utf8'),
      readFile(PULSE_APP_USAGE_SKILL, 'utf8'),
    ]);

    expect(agentsDoc).toContain('API documentation: OpenAPI spec at `GET /api/docs/json`, Swagger UI at `/api/docs`');
    expect(agentsDoc).toContain('Request and response schemas are auto-generated from Zod schemas into the OpenAPI spec');
    expect(agentsDoc).toContain(
      'OpenAPI-generated clients using the `agentToken` security scheme must still send the full header value as `Authorization: AgentToken <token>`; the prefix is not implied automatically.',
    );

    expect(readme).toContain(
      'API documentation available at `/api/docs` (Swagger UI) and `/api/docs/json` (OpenAPI 3.1 spec).',
    );
    expect(readme).toContain('Response schemas are Zod-validated and documented in the OpenAPI spec.');
    expect(readme).toContain(
      'OpenAPI-generated clients using the `agentToken` security scheme must still prefix the header value manually as `AgentToken <token>`.',
    );

    expect(skillDoc).toContain('OpenAPI spec: `GET /api/docs/json` (no auth required)');
    expect(skillDoc).toContain('Swagger UI: `/api/docs` (browsable in browser)');
    expect(skillDoc).toContain(
      'For the full list of endpoints, request/response schemas, and auth requirements, fetch the OpenAPI spec.',
    );
    expect(skillDoc).toContain(
      'OpenAPI-generated clients using the `agentToken` security scheme must still send the full `Authorization: AgentToken <token>` header manually; the prefix is not implied by the spec metadata.',
    );
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
