import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';

import { getDashboardSnapshot } from './dashboard-store.js';

vi.mock('./dashboard-store.js', () => ({
  getDashboardSnapshot: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

describe('dashboard routes', () => {
  beforeEach(() => {
    vi.mocked(getDashboardSnapshot).mockReset();
    process.env.JWT_SECRET = 'test-dashboard-routes-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    vi.useRealTimers();
  });

  it('returns the dashboard snapshot for an explicit date', async () => {
    vi.mocked(getDashboardSnapshot).mockResolvedValue({
      date: '2026-03-09',
      weight: {
        value: 178.4,
        date: '2026-03-08',
        unit: 'lb',
      },
      macros: {
        actual: {
          calories: 1850,
          protein: 150,
          carbs: 190,
          fat: 65,
        },
        target: {
          calories: 2200,
          protein: 180,
          carbs: 250,
          fat: 70,
        },
      },
      workout: {
        name: 'Upper Push A',
        status: 'completed',
        duration: 64,
      },
      habits: {
        total: 6,
        completed: 4,
        percentage: 66.7,
      },
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/snapshot?date=2026-03-09',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          date: '2026-03-09',
          weight: {
            value: 178.4,
            date: '2026-03-08',
            unit: 'lb',
          },
          macros: {
            actual: {
              calories: 1850,
              protein: 150,
              carbs: 190,
              fat: 65,
            },
            target: {
              calories: 2200,
              protein: 180,
              carbs: 250,
              fat: 70,
            },
          },
          workout: {
            name: 'Upper Push A',
            status: 'completed',
            duration: 64,
          },
          habits: {
            total: 6,
            completed: 4,
            percentage: 66.7,
          },
        },
      });
      expect(vi.mocked(getDashboardSnapshot)).toHaveBeenCalledWith('user-1', '2026-03-09');
    } finally {
      await app.close();
    }
  });

  it('defaults the snapshot date to today when date is omitted', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T17:04:11.000Z'));
    vi.mocked(getDashboardSnapshot).mockResolvedValue({
      date: '2026-03-10',
      weight: null,
      macros: {
        actual: {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
        target: {
          calories: 2200,
          protein: 180,
          carbs: 250,
          fat: 70,
        },
      },
      workout: null,
      habits: {
        total: 0,
        completed: 0,
        percentage: 0,
      },
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-2' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/snapshot',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.date).toBe('2026-03-10');
      expect(vi.mocked(getDashboardSnapshot)).toHaveBeenCalledWith('user-2', '2026-03-10');
    } finally {
      await app.close();
    }
  });

  it('rejects invalid query params', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-3' });
      const [invalidShapeResponse, invalidDateResponse] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/dashboard/snapshot?date=03-09-2026',
          headers: createAuthorizationHeader(authToken),
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/dashboard/snapshot?date=2026-02-30',
          headers: createAuthorizationHeader(authToken),
        }),
      ]);

      expect(invalidShapeResponse.statusCode).toBe(400);
      expect(invalidShapeResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid dashboard snapshot query',
        },
      });

      expect(invalidDateResponse.statusCode).toBe(400);
      expect(invalidDateResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid dashboard snapshot date',
        },
      });
      expect(vi.mocked(getDashboardSnapshot)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rejects unauthenticated requests', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const [missingAuthResponse, invalidAuthResponse] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/dashboard/snapshot',
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/dashboard/snapshot',
          headers: createAuthorizationHeader('not-a-valid-token'),
        }),
      ]);

      for (const response of [missingAuthResponse, invalidAuthResponse]) {
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }
      expect(vi.mocked(getDashboardSnapshot)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
