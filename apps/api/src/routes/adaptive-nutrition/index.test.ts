import { createHash } from 'node:crypto';

import { ADAPTIVE_TDEE_CONSTANTS, adaptiveCheckInSummarySchema } from '@pulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { findAgentTokenByHash, updateAgentTokenLastUsedAt } from '../../middleware/store.js';

import {
  acceptAdaptiveNutritionCheckIn,
  AdaptiveCheckInStaleError,
  AdaptivePendingCheckInExistsError,
  declineAdaptiveNutritionCheckIn,
  getAdaptiveNutritionCheckIn,
  getAdaptiveNutritionState,
  listAdaptiveNutritionCheckIns,
  previewAdaptiveNutritionCheckIn,
  putAdaptiveNutritionProgram,
} from './store.js';

vi.mock('./store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./store.js')>();
  return {
    ...actual,
    acceptAdaptiveNutritionCheckIn: vi.fn(),
    declineAdaptiveNutritionCheckIn: vi.fn(),
    getAdaptiveNutritionCheckIn: vi.fn(),
    getAdaptiveNutritionState: vi.fn(),
    listAdaptiveNutritionCheckIns: vi.fn(),
    previewAdaptiveNutritionCheckIn: vi.fn(),
    putAdaptiveNutritionProgram: vi.fn(),
  };
});

vi.mock('../../middleware/store.js', () => ({
  findAgentTokenByHash: vi.fn(),
  findUserAuthById: vi.fn(),
  updateAgentTokenLastUsedAt: vi.fn(),
}));

const programCalculation = {
  status: 'active' as const,
  timeZone: 'America/Detroit',
  heightCm: null,
  birthDate: null,
  rmrEquation: 'manual_tdee' as const,
  activityLevel: null,
  activityMultiplier: null,
  estimatedRmrKcal: null,
  calculatedBaselineTdeeKcal: null,
  manualBaselineTdeeKcal: 2500,
  baselineTdeeKcal: 2500,
  goalType: 'maintain' as const,
  targetWeightKg: null,
  goalRatePctPerWeek: 0,
  proteinGrams: 180,
  fatAllocationPct: 30,
  systemCalorieFloorKcal: 1500,
  userCalorieFloorKcal: 1500,
  algorithmVersion: 'adaptive-tdee-v1' as const,
};

const program = {
  id: 'program-1',
  ...programCalculation,
  createdAt: 1_780_329_600_000,
  updatedAt: 1_780_329_600_000,
};

const boundaries = {
  previewDate: '2026-06-01',
  analysisStart: '2026-05-11',
  analysisEnd: '2026-06-01',
  warmupStart: '2026-04-20',
};

const fingerprint = 'a'.repeat(64);
const goal = {
  rawGoalCalories: 2500,
  goalCalories: 2500,
  desiredWeightChangeKgPerDay: 0,
  requestedCalorieAdjustment: 0,
  achievableGoalRatePctPerWeek: 0,
  goalReached: false,
  reasonCodes: [],
};
const macros = {
  calories: 2500,
  protein: 180,
  carbs: 258,
  fat: 83,
  macroCalories: 2499,
  calorieDifference: -1,
};
const checkIn = {
  id: 'check-in-1',
  kind: 'baseline' as const,
  status: 'pending' as const,
  calculationState: 'baseline' as const,
  localDate: '2026-06-01',
  analysisStart: null,
  analysisEnd: null,
  includeToday: true,
  algorithmVersion: 'adaptive-tdee-v1' as const,
  dataFingerprint: fingerprint,
  reasonCodes: [],
  priorTdeeKcal: 2500,
  observedTdeeKcal: null,
  proposedTdeeKcal: 2500,
  currentTargets: null,
  proposedTargets: {
    calories: macros.calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    effectiveDate: '2026-06-01',
  },
  acceptedNutritionTargetId: null,
  resolvedAt: null,
  createdAt: 1_780_329_600_000,
  inputSnapshot: {
    version: 1 as const,
    constants: ADAPTIVE_TDEE_CONSTANTS,
    program: programCalculation,
    priorTdee: null,
    currentTarget: null,
    boundaries,
    includeToday: true,
    nutritionDays: [],
    weightEntries: [
      { id: 'weight-1', date: '2026-06-01', weightKg: 82, updatedAt: 1_780_329_600_000 },
    ],
  },
  calculationSnapshot: {
    algorithmVersion: 'adaptive-tdee-v1' as const,
    inputFingerprint: fingerprint,
    kind: 'baseline' as const,
    state: 'baseline' as const,
    boundaries,
    reasonCodes: [],
    suspectWeightEntryIds: [],
    suspectWeightEntries: [],
    excludedNutritionDates: [],
    completeNutritionDays: 0,
    actualWeightCount: 1,
    trendPointCount: 1,
    averageDailyIntakeKcal: null,
    weightTrendKgPerDay: null,
    observedTdeeKcal: null,
    confidence: null,
    priorTdeeKcal: 2500,
    adaptiveUpdate: null,
    latestTrendWeightKg: 82,
    goal,
    macros,
  },
};
const checkInSummary = adaptiveCheckInSummarySchema.parse(
  Object.fromEntries(
    Object.entries(checkIn).filter(
      ([key]) => key !== 'inputSnapshot' && key !== 'calculationSnapshot',
    ),
  ),
);

const programPayload = {
  status: 'active',
  timeZone: 'America/Detroit',
  heightCm: null,
  birthDate: null,
  rmrEquation: 'manual_tdee',
  activityLevel: null,
  manualBaselineTdeeKcal: 2500,
  goalType: 'maintain',
  targetWeightKg: null,
  goalRatePctPerWeek: 0,
  proteinGrams: 180,
  fatAllocationPct: 30,
  currentWeight: { weight: 180, unit: 'lbs' },
};

describe('adaptive nutrition routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'adaptive-route-secret';
    vi.mocked(updateAgentTokenLastUsedAt).mockResolvedValue(undefined);
    vi.mocked(getAdaptiveNutritionState).mockResolvedValue({
      state: 'setup_required',
      program: null,
      currentTarget: null,
      latestAcceptedCheckIn: null,
      pendingCheckIn: null,
      checkInDue: false,
      nextCheckInDate: null,
      eligibility: null,
    });
    vi.mocked(previewAdaptiveNutritionCheckIn).mockResolvedValue(checkIn);
    vi.mocked(putAdaptiveNutritionProgram).mockResolvedValue(program);
    vi.mocked(listAdaptiveNutritionCheckIns).mockResolvedValue({
      data: [checkInSummary],
      meta: { page: 1, limit: 20, total: 1 },
    });
    vi.mocked(getAdaptiveNutritionCheckIn).mockResolvedValue(checkIn);
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('allows JWT and AgentToken reads and previews with response-schema validation', async () => {
    const app = buildServer();
    vi.mocked(findAgentTokenByHash).mockResolvedValue({ id: 'agent-1', userId: 'agent-user' });
    try {
      await app.ready();
      const jwt = app.jwt.sign(
        { sub: 'jwt-user', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const [stateResponse, previewResponse, historyResponse, detailResponse] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/adaptive-nutrition',
          headers: { authorization: `Bearer ${jwt}` },
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/adaptive-nutrition/check-ins/preview',
          headers: { authorization: 'AgentToken plain-agent-token' },
          payload: { kind: 'manual', includeToday: true },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/adaptive-nutrition/check-ins?page=1&limit=20',
          headers: { authorization: 'AgentToken plain-agent-token' },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/adaptive-nutrition/check-ins/check-in-1',
          headers: { authorization: 'AgentToken plain-agent-token' },
        }),
      ]);
      expect(stateResponse.statusCode, stateResponse.body).toBe(200);
      expect(previewResponse.statusCode).toBe(200);
      expect(historyResponse.statusCode).toBe(200);
      expect(detailResponse.statusCode).toBe(200);
      expect(previewResponse.json()).toEqual({ data: checkIn });
      expect(vi.mocked(findAgentTokenByHash)).toHaveBeenCalledWith(
        createHash('sha256').update('plain-agent-token').digest('hex'),
      );
    } finally {
      await app.close();
    }
  });

  it('allows JWT program writes and rejects invalid setup bodies before the store', async () => {
    const app = buildServer();
    try {
      await app.ready();
      const jwt = app.jwt.sign(
        { sub: 'jwt-user', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const valid = await app.inject({
        method: 'PUT',
        url: '/api/v1/adaptive-nutrition/program',
        headers: { authorization: `Bearer ${jwt}` },
        payload: programPayload,
      });
      const invalid = await app.inject({
        method: 'PUT',
        url: '/api/v1/adaptive-nutrition/program',
        headers: { authorization: `Bearer ${jwt}` },
        payload: { ...programPayload, manualBaselineTdeeKcal: null },
      });
      expect(valid.statusCode, valid.body).toBe(200);
      expect(invalid.statusCode).toBe(400);
      expect(vi.mocked(putAdaptiveNutritionProgram)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(putAdaptiveNutritionProgram)).toHaveBeenCalledWith(
        'jwt-user',
        expect.objectContaining({ rebaseline: false, supersedePending: false }),
      );
    } finally {
      await app.close();
    }
  });

  it('maps lifecycle conflicts to the specified stable error codes', async () => {
    const app = buildServer();
    vi.mocked(putAdaptiveNutritionProgram).mockRejectedValue(
      new AdaptivePendingCheckInExistsError(),
    );
    vi.mocked(acceptAdaptiveNutritionCheckIn).mockRejectedValue(new AdaptiveCheckInStaleError());
    try {
      await app.ready();
      const jwt = app.jwt.sign(
        { sub: 'jwt-user', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const [programResponse, acceptResponse] = await Promise.all([
        app.inject({
          method: 'PUT',
          url: '/api/v1/adaptive-nutrition/program',
          headers: { authorization: `Bearer ${jwt}` },
          payload: programPayload,
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/adaptive-nutrition/check-ins/check-in-1/accept',
          headers: { authorization: `Bearer ${jwt}` },
          payload: {},
        }),
      ]);
      expect(programResponse).toMatchObject({ statusCode: 409 });
      expect(programResponse.json()).toMatchObject({
        error: { code: 'PENDING_CHECKIN_EXISTS' },
      });
      expect(acceptResponse).toMatchObject({ statusCode: 409 });
      expect(acceptResponse.json()).toMatchObject({ error: { code: 'CHECKIN_STALE' } });
    } finally {
      await app.close();
    }
  });

  it.each([
    ['PUT', '/api/v1/adaptive-nutrition/program', programPayload],
    ['POST', '/api/v1/adaptive-nutrition/check-ins/check-in-1/accept', {}],
    ['POST', '/api/v1/adaptive-nutrition/check-ins/check-in-1/decline', undefined],
  ])('rejects AgentToken account mutation %s %s', async (method, url, payload) => {
    const app = buildServer();
    vi.mocked(findAgentTokenByHash).mockResolvedValue({ id: 'agent-1', userId: 'agent-user' });
    try {
      await app.ready();
      const response = await app.inject({
        method: method as 'PUT' | 'POST',
        url,
        headers: { authorization: 'AgentToken plain-agent-token' },
        payload,
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: { code: 'FORBIDDEN', message: 'JWT authentication required' },
      });
      expect(vi.mocked(acceptAdaptiveNutritionCheckIn)).not.toHaveBeenCalled();
      expect(vi.mocked(declineAdaptiveNutritionCheckIn)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('documents every lifecycle route with the correct security scheme', async () => {
    const app = buildServer();
    try {
      await app.ready();
      const response = await app.inject({ method: 'GET', url: '/api/docs/json' });
      const document = response.json() as {
        paths: Record<string, Record<string, { security: unknown }>>;
      };
      expect(response.statusCode).toBe(200);
      expect(Object.keys(document.paths)).toEqual(
        expect.arrayContaining([
          '/api/v1/adaptive-nutrition/',
          '/api/v1/adaptive-nutrition/program',
          '/api/v1/adaptive-nutrition/check-ins/preview',
          '/api/v1/adaptive-nutrition/check-ins/{id}/accept',
          '/api/v1/adaptive-nutrition/check-ins/{id}/decline',
          '/api/v1/adaptive-nutrition/check-ins',
          '/api/v1/adaptive-nutrition/check-ins/{id}',
        ]),
      );
      const programOperation = document.paths['/api/v1/adaptive-nutrition/program']?.put;
      const previewOperation = document.paths['/api/v1/adaptive-nutrition/check-ins/preview']?.post;
      expect(programOperation?.security).toEqual([{ bearerAuth: [] }]);
      expect(previewOperation?.security).toEqual([{ bearerAuth: [] }, { agentToken: [] }]);
    } finally {
      await app.close();
    }
  });
});
