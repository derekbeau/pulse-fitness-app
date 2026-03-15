import { DASHBOARD_WIDGET_IDS } from '@pulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';

import {
  getDashboardConfig,
  getDashboardConsistencyTrend,
  getDashboardMacrosTrend,
  getDashboardSnapshot,
  getDashboardWeightTrend,
  upsertDashboardConfig,
} from './dashboard-store.js';

vi.mock('./dashboard-store.js', () => ({
  getDashboardConfig: vi.fn(),
  getDashboardSnapshot: vi.fn(),
  getDashboardWeightTrend: vi.fn(),
  getDashboardMacrosTrend: vi.fn(),
  getDashboardConsistencyTrend: vi.fn(),
  upsertDashboardConfig: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});
const DEFAULT_VISIBLE_WIDGETS = Object.keys(DASHBOARD_WIDGET_IDS);

const expectRequestValidationError = (
  response: { json(): unknown },
  method: string,
  url: string,
) => {
  expect(response.json()).toMatchObject({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: {
        method,
        url,
      },
    },
  });
};

describe('dashboard routes', () => {
  beforeEach(() => {
    vi.mocked(getDashboardConfig).mockReset();
    vi.mocked(getDashboardSnapshot).mockReset();
    vi.mocked(getDashboardWeightTrend).mockReset();
    vi.mocked(getDashboardMacrosTrend).mockReset();
    vi.mocked(getDashboardConsistencyTrend).mockReset();
    vi.mocked(upsertDashboardConfig).mockReset();
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
        templateId: 'template-upper-push-a',
        sessionId: 'session-upper-push-a',
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
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
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
            templateId: 'template-upper-push-a',
            sessionId: 'session-upper-push-a',
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

  it('returns the dashboard config payload for the authenticated user', async () => {
    vi.mocked(getDashboardConfig).mockResolvedValue({
      habitChainIds: ['habit-1', 'habit-2'],
      trendMetrics: ['weight', 'protein'],
      visibleWidgets: DEFAULT_VISIBLE_WIDGETS,
      widgetOrder: ['snapshot', 'trends'],
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/config',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          habitChainIds: ['habit-1', 'habit-2'],
          trendMetrics: ['weight', 'protein'],
          visibleWidgets: DEFAULT_VISIBLE_WIDGETS,
          widgetOrder: ['snapshot', 'trends'],
        },
      });
      expect(vi.mocked(getDashboardConfig)).toHaveBeenCalledWith('user-1');
    } finally {
      await app.close();
    }
  });

  it('upserts dashboard config via PUT and POST', async () => {
    vi.mocked(upsertDashboardConfig).mockResolvedValue({
      habitChainIds: ['habit-1'],
      trendMetrics: ['calories'],
      visibleWidgets: DEFAULT_VISIBLE_WIDGETS,
      widgetOrder: ['trends', 'snapshot'],
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-2', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const payload = {
        habitChainIds: ['habit-1'],
        trendMetrics: ['calories'],
        visibleWidgets: DEFAULT_VISIBLE_WIDGETS,
        widgetOrder: ['trends', 'snapshot'],
      };

      const [putResponse, postResponse] = await Promise.all([
        app.inject({
          method: 'PUT',
          url: '/api/v1/dashboard/config',
          payload,
          headers: createAuthorizationHeader(authToken),
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/dashboard/config',
          payload,
          headers: createAuthorizationHeader(authToken),
        }),
      ]);

      expect(putResponse.statusCode).toBe(200);
      expect(putResponse.json()).toEqual({ data: payload });
      expect(postResponse.statusCode).toBe(200);
      expect(postResponse.json()).toEqual({ data: payload });
      expect(vi.mocked(upsertDashboardConfig)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(upsertDashboardConfig)).toHaveBeenCalledWith('user-2', payload);
    } finally {
      await app.close();
    }
  });

  it('rejects invalid dashboard config payloads', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-2', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/dashboard/config',
        payload: {
          habitChainIds: ['habit-1'],
          trendMetrics: ['steps'],
        },
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(400);
      expectRequestValidationError(response, 'PUT', '/api/v1/dashboard/config');
      expect(vi.mocked(upsertDashboardConfig)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('accepts PUT dashboard config payloads with an empty visibleWidgets array', async () => {
    vi.mocked(upsertDashboardConfig).mockResolvedValue({
      habitChainIds: ['habit-1'],
      trendMetrics: ['weight'],
      visibleWidgets: [],
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-2', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const payload = {
        habitChainIds: ['habit-1'],
        trendMetrics: ['weight'],
        visibleWidgets: [],
      };

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/dashboard/config',
        payload,
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ data: payload });
      expect(vi.mocked(upsertDashboardConfig)).toHaveBeenCalledWith('user-2', payload);
    } finally {
      await app.close();
    }
  });

  it('rejects dashboard configs containing empty widget ids', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-2', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/dashboard/config',
        payload: {
          habitChainIds: ['habit-1'],
          trendMetrics: ['weight'],
          visibleWidgets: [''],
        },
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(400);
      expectRequestValidationError(response, 'PUT', '/api/v1/dashboard/config');
      expect(vi.mocked(upsertDashboardConfig)).not.toHaveBeenCalled();
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
      const authToken = app.jwt.sign({ sub: 'user-2', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
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

  it('returns weight trend points for an explicit date range', async () => {
    vi.mocked(getDashboardWeightTrend).mockResolvedValue([
      { date: '2026-03-07', value: 181.4 },
      { date: '2026-03-08', value: 181.1 },
      { date: '2026-03-09', value: 180.9 },
    ]);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/trends/weight?from=2026-03-07&to=2026-03-09',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, max-age=3600');
      expect(response.json()).toEqual({
        data: [
          { date: '2026-03-07', value: 181.4 },
          { date: '2026-03-08', value: 181.1 },
          { date: '2026-03-09', value: 180.9 },
        ],
      });
      expect(vi.mocked(getDashboardWeightTrend)).toHaveBeenCalledWith(
        'user-1',
        '2026-03-07',
        '2026-03-09',
      );
    } finally {
      await app.close();
    }
  });

  it('defaults trend ranges when omitted', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T17:04:11.000Z'));
    vi.mocked(getDashboardMacrosTrend).mockResolvedValue([
      {
        date: '2026-02-08',
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
      {
        date: '2026-03-10',
        calories: 2200,
        protein: 180,
        carbs: 240,
        fat: 70,
      },
    ]);
    vi.mocked(getDashboardConsistencyTrend).mockResolvedValue([
      { date: '2026-03-09', completed: true },
      { date: '2026-03-10', completed: false },
    ]);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-2', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const [macrosResponse, consistencyResponse] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/dashboard/trends/macros',
          headers: createAuthorizationHeader(authToken),
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/dashboard/trends/consistency?from=2026-03-09',
          headers: createAuthorizationHeader(authToken),
        }),
      ]);

      expect(macrosResponse.statusCode).toBe(200);
      expect(macrosResponse.headers['cache-control']).toBe('private, max-age=3600');
      expect(vi.mocked(getDashboardMacrosTrend)).toHaveBeenCalledWith(
        'user-2',
        '2026-02-08',
        '2026-03-10',
      );

      expect(consistencyResponse.statusCode).toBe(200);
      expect(consistencyResponse.headers['cache-control']).toBe('private, max-age=3600');
      expect(vi.mocked(getDashboardConsistencyTrend)).toHaveBeenCalledWith(
        'user-2',
        '2026-03-09',
        '2026-03-10',
      );
    } finally {
      await app.close();
    }
  });

  it('rejects invalid query params', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-3', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
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
      expectRequestValidationError(
        invalidShapeResponse,
        'GET',
        '/api/v1/dashboard/snapshot?date=03-09-2026',
      );

      expect(invalidDateResponse.statusCode).toBe(400);
      expectRequestValidationError(
        invalidDateResponse,
        'GET',
        '/api/v1/dashboard/snapshot?date=2026-02-30',
      );
      expect(vi.mocked(getDashboardSnapshot)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rejects invalid trend query params', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ sub: 'user-3', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
      const [invalidShapeResponse, invalidCalendarDateResponse, oversizedRangeResponse] =
        await Promise.all([
          app.inject({
            method: 'GET',
            url: '/api/v1/dashboard/trends/weight?from=03-09-2026',
            headers: createAuthorizationHeader(authToken),
          }),
          app.inject({
            method: 'GET',
            url: '/api/v1/dashboard/trends/macros?from=2026-02-30&to=2026-03-01',
            headers: createAuthorizationHeader(authToken),
          }),
          app.inject({
            method: 'GET',
            url: '/api/v1/dashboard/trends/consistency?from=2025-01-01&to=2026-03-09',
            headers: createAuthorizationHeader(authToken),
          }),
      ]);

      expect(invalidShapeResponse.statusCode).toBe(400);
      expectRequestValidationError(
        invalidShapeResponse,
        'GET',
        '/api/v1/dashboard/trends/weight?from=03-09-2026',
      );

      expect(invalidCalendarDateResponse.statusCode).toBe(400);
      expectRequestValidationError(
        invalidCalendarDateResponse,
        'GET',
        '/api/v1/dashboard/trends/macros?from=2026-02-30&to=2026-03-01',
      );

      expect(oversizedRangeResponse.statusCode).toBe(400);
      expectRequestValidationError(
        oversizedRangeResponse,
        'GET',
        '/api/v1/dashboard/trends/consistency?from=2025-01-01&to=2026-03-09',
      );

      expect(vi.mocked(getDashboardWeightTrend)).not.toHaveBeenCalled();
      expect(vi.mocked(getDashboardMacrosTrend)).not.toHaveBeenCalled();
      expect(vi.mocked(getDashboardConsistencyTrend)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rejects unauthenticated requests', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const [
        missingSnapshotAuthResponse,
        missingTrendAuthResponse,
        missingConfigAuthResponse,
        missingConfigPutAuthResponse,
        missingConfigPostAuthResponse,
        invalidSnapshotAuthResponse,
      ] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/dashboard/snapshot',
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/dashboard/trends/weight',
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/dashboard/config',
        }),
        app.inject({
          method: 'PUT',
          url: '/api/v1/dashboard/config',
          payload: {
            habitChainIds: ['habit-1'],
            trendMetrics: ['weight'],
          },
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/dashboard/config',
          payload: {
            habitChainIds: ['habit-1'],
            trendMetrics: ['weight'],
          },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/dashboard/snapshot',
          headers: createAuthorizationHeader('not-a-valid-token'),
        }),
      ]);

      for (const response of [
        missingSnapshotAuthResponse,
        missingTrendAuthResponse,
        missingConfigAuthResponse,
        missingConfigPutAuthResponse,
        missingConfigPostAuthResponse,
        invalidSnapshotAuthResponse,
      ]) {
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }
      expect(vi.mocked(getDashboardSnapshot)).not.toHaveBeenCalled();
      expect(vi.mocked(getDashboardConfig)).not.toHaveBeenCalled();
      expect(vi.mocked(getDashboardWeightTrend)).not.toHaveBeenCalled();
      expect(vi.mocked(getDashboardMacrosTrend)).not.toHaveBeenCalled();
      expect(vi.mocked(getDashboardConsistencyTrend)).not.toHaveBeenCalled();
      expect(vi.mocked(upsertDashboardConfig)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
