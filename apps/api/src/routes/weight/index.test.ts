import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { findAgentTokenByHash, updateAgentTokenLastUsedAt } from '../../middleware/store.js';

import {
  deleteBodyWeightEntryById,
  findBodyWeightEntryById,
  findBodyWeightEntryByDate,
  getLatestBodyWeightEntry,
  listBodyWeightEntries,
  patchBodyWeightEntryById,
  upsertBodyWeightEntry,
} from './store.js';

vi.mock('./store.js', () => ({
  deleteBodyWeightEntryById: vi.fn(),
  findBodyWeightEntryById: vi.fn(),
  findBodyWeightEntryByDate: vi.fn(),
  getLatestBodyWeightEntry: vi.fn(),
  listBodyWeightEntries: vi.fn(),
  patchBodyWeightEntryById: vi.fn(),
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
    vi.mocked(deleteBodyWeightEntryById).mockReset();
    vi.mocked(findBodyWeightEntryById).mockReset();
    vi.mocked(findBodyWeightEntryByDate).mockReset();
    vi.mocked(getLatestBodyWeightEntry).mockReset();
    vi.mocked(listBodyWeightEntries).mockReset();
    vi.mocked(patchBodyWeightEntryById).mockReset();
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
    vi.mocked(findBodyWeightEntryByDate).mockResolvedValue(null);
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

      expect(response.statusCode).toBe(201);
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
      expect(vi.mocked(findBodyWeightEntryByDate)).toHaveBeenCalledWith('user-1', '2026-03-07');
      expect(vi.mocked(upsertBodyWeightEntry)).toHaveBeenCalledWith('user-1', {
        date: '2026-03-07',
        weight: 181.5,
        notes: 'Fasted',
      });
    } finally {
      await app.close();
    }
  });

  it('returns 200 when updating an existing body weight entry', async () => {
    vi.mocked(findBodyWeightEntryByDate).mockResolvedValue({
      id: 'entry-1',
      date: '2026-03-07',
      weight: 182,
      notes: null,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    vi.mocked(upsertBodyWeightEntry).mockResolvedValue({
      id: 'entry-1',
      date: '2026-03-07',
      weight: 181.5,
      notes: 'Fasted',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
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
          notes: 'Fasted',
        },
      });

      expect(response.statusCode).toBe(200);
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

  it('accepts days query params and forwards parsed values to the store', async () => {
    vi.mocked(listBodyWeightEntries).mockResolvedValue([
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
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/weight?days=7',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(vi.mocked(listBodyWeightEntries)).toHaveBeenCalledWith('user-1', { days: 7 });
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

  it('rejects from and days query params when both are provided', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/weight?from=2026-03-01&days=30',
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

  it('patches weight entries with partial payloads', async () => {
    const app = buildServer();

    try {
      await app.ready();

      vi.mocked(findBodyWeightEntryById).mockResolvedValue({
        id: 'entry-1',
        date: '2026-03-07',
        weight: 182,
        notes: null,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      });
      vi.mocked(patchBodyWeightEntryById)
        .mockResolvedValueOnce({
          id: 'entry-1',
          date: '2026-03-07',
          weight: 181.5,
          notes: null,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_001_000,
        })
        .mockResolvedValueOnce({
          id: 'entry-1',
          date: '2026-03-07',
          weight: 181.5,
          notes: 'Evening weigh-in',
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_002_000,
        })
        .mockResolvedValueOnce({
          id: 'entry-1',
          date: '2026-03-07',
          weight: 181.2,
          notes: 'Fasted',
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_003_000,
        });

      const authToken = app.jwt.sign({ userId: 'user-1' });
      const weightOnlyResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/weight/entry-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          weight: 181.5,
        },
      });
      const notesOnlyResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/weight/entry-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          notes: '  Evening weigh-in  ',
        },
      });
      const bothResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/weight/entry-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          weight: 181.2,
          notes: 'Fasted',
        },
      });

      expect(weightOnlyResponse.statusCode).toBe(200);
      expect(notesOnlyResponse.statusCode).toBe(200);
      expect(bothResponse.statusCode).toBe(200);
      expect(vi.mocked(findBodyWeightEntryById)).toHaveBeenCalledTimes(3);
      expect(vi.mocked(patchBodyWeightEntryById)).toHaveBeenNthCalledWith(1, 'entry-1', 'user-1', {
        weight: 181.5,
      });
      expect(vi.mocked(patchBodyWeightEntryById)).toHaveBeenNthCalledWith(2, 'entry-1', 'user-1', {
        notes: 'Evening weigh-in',
      });
      expect(vi.mocked(patchBodyWeightEntryById)).toHaveBeenNthCalledWith(3, 'entry-1', 'user-1', {
        weight: 181.2,
        notes: 'Fasted',
      });
    } finally {
      await app.close();
    }
  });

  it('returns 404 when patching a missing scoped weight entry', async () => {
    vi.mocked(findBodyWeightEntryById).mockResolvedValue(null);
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/weight/missing-entry',
        headers: createAuthorizationHeader(authToken),
        payload: {
          weight: 181.5,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'WEIGHT_NOT_FOUND',
          message: 'Weight entry not found',
        },
      });
      expect(vi.mocked(patchBodyWeightEntryById)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rejects empty patch payloads', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/weight/entry-1',
        headers: createAuthorizationHeader(authToken),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid weight payload',
        },
      });
      expect(vi.mocked(findBodyWeightEntryById)).not.toHaveBeenCalled();
      expect(vi.mocked(patchBodyWeightEntryById)).not.toHaveBeenCalled();
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
        app.inject({
          method: 'PATCH',
          url: '/api/v1/weight/entry-1',
          payload: {
            weight: 181.5,
          },
        }),
        app.inject({
          method: 'DELETE',
          url: '/api/v1/weight/entry-1',
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

  it('deletes a scoped weight entry and returns delete metadata', async () => {
    vi.mocked(findBodyWeightEntryById).mockResolvedValue({
      id: 'entry-1',
      date: '2026-03-07',
      weight: 182,
      notes: null,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    vi.mocked(deleteBodyWeightEntryById).mockResolvedValue(true);
    vi.mocked(listBodyWeightEntries).mockResolvedValue([]);
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: '/api/v1/weight/entry-1',
        headers: createAuthorizationHeader(authToken),
      });
      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/weight?from=2026-03-01&to=2026-03-10',
        headers: createAuthorizationHeader(authToken),
      });

      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json()).toEqual({
        data: {
          deleted: true,
          id: 'entry-1',
        },
      });
      expect(vi.mocked(findBodyWeightEntryById)).toHaveBeenCalledWith('entry-1', 'user-1');
      expect(vi.mocked(deleteBodyWeightEntryById)).toHaveBeenCalledWith('entry-1', 'user-1');
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual({ data: [] });
    } finally {
      await app.close();
    }
  });

  it('returns 404 when deleting a missing or unauthorized scoped weight entry', async () => {
    vi.mocked(findBodyWeightEntryById).mockResolvedValue(null);
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/weight/entry-404',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'WEIGHT_NOT_FOUND',
          message: 'Weight entry not found',
        },
      });
      expect(vi.mocked(deleteBodyWeightEntryById)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
