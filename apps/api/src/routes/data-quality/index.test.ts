import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DataQualityCalendar } from '@pulse/shared';

import { buildServer } from '../../index.js';
import { findAgentTokenByHash, updateAgentTokenLastUsedAt } from '../../middleware/store.js';
import { getDataQualityCalendar } from './store.js';

vi.mock('./store.js', () => ({ getDataQualityCalendar: vi.fn() }));
vi.mock('../../middleware/store.js', () => ({
  findAgentTokenByHash: vi.fn(),
  findUserAuthById: vi.fn(),
  updateAgentTokenLastUsedAt: vi.fn(),
}));

const calendar: DataQualityCalendar = {
  range: { startDate: '2026-08-18', endDate: '2026-08-18' },
  timeZone: 'America/Detroit',
  days: [
    {
      date: '2026-08-18',
      isToday: true,
      nutrition: {
        qualityState: 'no_records',
        evidenceState: 'missing',
        logId: null,
        explicitStatus: null,
        totals: null,
        mealCount: null,
        itemCount: null,
        statusUpdatedAt: null,
        updatedAt: null,
        reasonCodes: [],
        actions: [],
      },
      weight: {
        evidenceState: 'missing',
        entryId: null,
        weight: null,
        unit: null,
        trendWeight: null,
        corrected: false,
        suspect: false,
        stale: false,
        createdAt: null,
        updatedAt: null,
        reasonCodes: [],
        actions: [],
      },
      workouts: [],
      algorithm: {
        state: 'no_program',
        nutritionEvidenceState: 'not_applicable',
        weightEvidenceState: 'not_applicable',
        reasonCodes: [],
        events: [],
      },
      contexts: [],
    },
  ],
  summary: {
    nutrition: { complete: 0, partial: 0, unknown: 0, missing: 1, pending: 0, excluded: 0 },
    weight: { logged: 0, missing: 1, pending: 0, excluded: 0, corrected: 0 },
    workout: { planned: 0, active: 0, completed: 0, cancelled: 0, corrected: 0 },
    algorithm: { learning: 0, updating: 0, holding: 0, pendingReview: 0 },
    contextDays: 0,
  },
};

beforeEach(() => {
  vi.mocked(getDataQualityCalendar).mockReset();
  vi.mocked(findAgentTokenByHash).mockReset();
  vi.mocked(updateAgentTokenLastUsedAt).mockReset();
});

describe('Data Quality calendar route', () => {
  it('returns identical strict data for JWT and AgentToken callers', async () => {
    vi.mocked(getDataQualityCalendar).mockResolvedValue(calendar);
    vi.mocked(findAgentTokenByHash).mockResolvedValue({ id: 'agent-1', userId: 'user-1' });
    const app = buildServer();
    try {
      await app.ready();
      const token = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const url =
        '/api/v1/data-quality/calendar?start=2026-08-18&end=2026-08-18&timeZone=America%2FDetroit';
      const [jwtResponse, agentResponse] = await Promise.all([
        app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } }),
        app.inject({ method: 'GET', url, headers: { authorization: 'AgentToken agent-secret' } }),
      ]);

      expect(jwtResponse.statusCode).toBe(200);
      expect(agentResponse.statusCode).toBe(200);
      expect(jwtResponse.json().data).toEqual(calendar);
      expect(agentResponse.json().data).toEqual(jwtResponse.json().data);
      expect(vi.mocked(getDataQualityCalendar)).toHaveBeenNthCalledWith(1, 'user-1', {
        start: '2026-08-18',
        end: '2026-08-18',
        timeZone: 'America/Detroit',
      });
      expect(vi.mocked(getDataQualityCalendar)).toHaveBeenNthCalledWith(2, 'user-1', {
        start: '2026-08-18',
        end: '2026-08-18',
        timeZone: 'America/Detroit',
      });
    } finally {
      await app.close();
    }
  });

  it('rejects invalid ranges before calling the store', async () => {
    const app = buildServer();
    try {
      await app.ready();
      const token = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/data-quality/calendar?start=2026-08-20&end=2026-08-18',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
      expect(getDataQualityCalendar).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
