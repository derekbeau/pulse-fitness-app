import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { findAgentTokenByHash, updateAgentTokenLastUsedAt } from '../../middleware/store.js';

import { getLatestBodyWeightEntry, listBodyWeightEntries, upsertBodyWeightEntry } from './store.js';

vi.mock('./store.js', () => ({
  getLatestBodyWeightEntry: vi.fn(),
  listBodyWeightEntries: vi.fn(),
  upsertBodyWeightEntry: vi.fn(),
}));

vi.mock('../../middleware/store.js', () => ({
  findAgentTokenByHash: vi.fn(),
  updateAgentTokenLastUsedAt: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

describe('weight routes', () => {
  beforeEach(() => {
    vi.mocked(getLatestBodyWeightEntry).mockReset();
    vi.mocked(listBodyWeightEntries).mockReset();
    vi.mocked(upsertBodyWeightEntry).mockReset();
    vi.mocked(findAgentTokenByHash).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockResolvedValue(undefined);
    process.env.JWT_SECRET = 'test-weight-route-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('upserts a body weight entry for the authenticated user', async () => {
    vi.mocked(upsertBodyWeightEntry).mockResolvedValue({
      id: 'entry-1',
      date: '2026-03-07',
      weight: 181.5,
      notes: 'Fasted',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/weight',
        headers: createAuthorizationHeader(authToken),
        payload: {
          date: '2026-03-07',
          weight: 181.5,
          notes: ' Fasted ',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          id: 'entry-1',
          date: '2026-03-07',
          weight: 181.5,
          notes: 'Fasted',
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
        },
      });
      expect(vi.mocked(upsertBodyWeightEntry)).toHaveBeenCalledWith('user-1', {
        date: '2026-03-07',
        weight: 181.5,
        notes: 'Fasted',
      });
    } finally {
      await app.close();
    }
  });

  it('rejects invalid upsert payloads', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/weight',
        headers: createAuthorizationHeader(authToken),
        payload: {
          date: '03-07-2026',
          weight: -1,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid weight payload',
        },
      });
      expect(vi.mocked(upsertBodyWeightEntry)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('lists entries in a date range for an authenticated agent token', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-agent-1',
    });
    vi.mocked(listBodyWeightEntries).mockResolvedValue([
      {
        id: 'entry-1',
        date: '2026-03-01',
        weight: 183.2,
        notes: null,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
      {
        id: 'entry-2',
        date: '2026-03-03',
        weight: 182.7,
        notes: 'After cardio',
        createdAt: 1_700_000_100_000,
        updatedAt: 1_700_000_100_000,
      },
    ]);

    const app = buildServer();

    try {
      await app.ready();
      const token = 'plain-agent-token';
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/weight?from=2026-03-01&to=2026-03-03',
        headers: {
          authorization: `AgentToken ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: [
          {
            id: 'entry-1',
            date: '2026-03-01',
            weight: 183.2,
            notes: null,
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_000,
          },
          {
            id: 'entry-2',
            date: '2026-03-03',
            weight: 182.7,
            notes: 'After cardio',
            createdAt: 1_700_000_100_000,
            updatedAt: 1_700_000_100_000,
          },
        ],
      });
      expect(vi.mocked(findAgentTokenByHash)).toHaveBeenCalledWith(
        createHash('sha256').update(token).digest('hex'),
      );
      expect(vi.mocked(updateAgentTokenLastUsedAt)).toHaveBeenCalledWith('agent-token-1');
      expect(vi.mocked(listBodyWeightEntries)).toHaveBeenCalledWith('user-agent-1', {
        from: '2026-03-01',
        to: '2026-03-03',
      });
    } finally {
      await app.close();
    }
  });

  it('rejects invalid date range queries', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/weight?from=2026-03-08&to=2026-03-07',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid weight query params',
        },
      });
      expect(vi.mocked(listBodyWeightEntries)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns the latest body weight entry or null', async () => {
    vi.mocked(getLatestBodyWeightEntry)
      .mockResolvedValueOnce({
        id: 'entry-2',
        date: '2026-03-07',
        weight: 181.5,
        notes: null,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      })
      .mockResolvedValueOnce(null);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const [latestResponse, emptyResponse] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/weight/latest',
          headers: createAuthorizationHeader(authToken),
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/weight/latest',
          headers: createAuthorizationHeader(authToken),
        }),
      ]);

      expect(latestResponse.statusCode).toBe(200);
      expect(latestResponse.json()).toEqual({
        data: {
          id: 'entry-2',
          date: '2026-03-07',
          weight: 181.5,
          notes: null,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
        },
      });
      expect(emptyResponse.statusCode).toBe(200);
      expect(emptyResponse.json()).toEqual({
        data: null,
      });
      expect(vi.mocked(getLatestBodyWeightEntry)).toHaveBeenNthCalledWith(1, 'user-1');
      expect(vi.mocked(getLatestBodyWeightEntry)).toHaveBeenNthCalledWith(2, 'user-1');
    } finally {
      await app.close();
    }
  });

  it('requires authentication for all endpoints', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const responses = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/weight',
          payload: {
            date: '2026-03-07',
            weight: 181.5,
          },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/weight',
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/weight/latest',
        }),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }
    } finally {
      await app.close();
    }
  });
});
