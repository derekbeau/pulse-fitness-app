import { createHash } from 'node:crypto';

import {
  ADAPTIVE_TDEE_CONSTANTS,
  adaptiveCheckInSummarySchema,
  calculateAdaptiveGoalProgress,
} from '@pulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { findAgentTokenByHash, updateAgentTokenLastUsedAt } from '../../middleware/store.js';
import { getAdaptiveGoal, listAdaptiveGoals } from './goal-store.js';
import {
  AdaptiveAnalyticsFutureEndError,
  AdaptiveAnalyticsPreProgramEndError,
  getAdaptiveEnergyBalanceAnalytics,
} from './analytics-store.js';

import {
  acceptAdaptiveNutritionCheckIn,
  AdaptiveCheckInStaleError,
  AdaptiveCurrentWeightRequiredError,
  AdaptivePendingCheckInExistsError,
  cancelAdaptiveGoal,
  completeAdaptiveGoal,
  declineAdaptiveNutritionCheckIn,
  editAdaptiveGoal,
  getAdaptiveNutritionCheckIn,
  getAdaptiveNutritionState,
  getCurrentAdaptiveGoalWithProgress,
  listAdaptiveNutritionCheckIns,
  previewAdaptiveNutritionCheckIn,
  putAdaptiveNutritionProgram,
  startAdaptiveGoal,
} from './store.js';

vi.mock('./store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./store.js')>();
  return {
    ...actual,
    acceptAdaptiveNutritionCheckIn: vi.fn(),
    cancelAdaptiveGoal: vi.fn(),
    completeAdaptiveGoal: vi.fn(),
    declineAdaptiveNutritionCheckIn: vi.fn(),
    editAdaptiveGoal: vi.fn(),
    getAdaptiveNutritionCheckIn: vi.fn(),
    getAdaptiveNutritionState: vi.fn(),
    getCurrentAdaptiveGoalWithProgress: vi.fn(),
    listAdaptiveNutritionCheckIns: vi.fn(),
    previewAdaptiveNutritionCheckIn: vi.fn(),
    putAdaptiveNutritionProgram: vi.fn(),
    startAdaptiveGoal: vi.fn(),
  };
});

vi.mock('./goal-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./goal-store.js')>();
  return {
    ...actual,
    getAdaptiveGoal: vi.fn(),
    listAdaptiveGoals: vi.fn(),
  };
});

vi.mock('./analytics-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./analytics-store.js')>();
  return {
    ...actual,
    getAdaptiveEnergyBalanceAnalytics: vi.fn(),
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

const goalRecord = {
  id: 'goal-1',
  userId: 'jwt-user',
  programId: 'program-1',
  type: 'maintain' as const,
  status: 'active' as const,
  startTrendWeightKg: 82,
  startScaleWeightKg: 82,
  finalTrendWeightKg: null,
  targetWeightKg: null,
  maintenanceCenterKg: 82,
  goalRatePctPerWeek: 0,
  startedLocalDate: '2026-06-01',
  endedLocalDate: null,
  endedReason: null,
  createdAt: 1_780_329_600_000,
  updatedAt: 1_780_329_600_000,
};

const goalRevision = {
  id: 'revision-1',
  goalId: 'goal-1',
  userId: 'jwt-user',
  sequence: 1,
  targetWeightKg: null,
  maintenanceCenterKg: 82,
  goalRatePctPerWeek: 0,
  previousTargetWeightKg: null,
  previousCenterKg: 82,
  previousRatePctPerWeek: 0,
  reason: 'created' as const,
  effectiveLocalDate: '2026-06-01',
  createdAt: 1_780_329_600_000,
};

const goalProgress = calculateAdaptiveGoalProgress({
  goal: goalRecord,
  revision: goalRevision,
  currentLocalDate: '2026-06-01',
  currentTrendWeightKg: 82,
  latestScaleWeightKg: 82,
  latestWeightAgeDays: 0,
  confidence: 'High',
  trendPoints: [],
});

const boundaries = {
  previewDate: '2026-06-01',
  analysisStart: '2026-05-11',
  analysisEnd: '2026-06-01',
  warmupStart: '2026-04-20',
};

const fingerprint = 'a'.repeat(64);
const energyBalanceAnalytics = {
  algorithmVersion: 'adaptive-tdee-v1' as const,
  timeZone: 'America/Detroit',
  range: {
    preset: '1m' as const,
    startDate: '2026-05-03',
    endDate: '2026-06-01',
    aggregation: 'daily' as const,
    calendarDays: 30,
  },
  isHistorical: false,
  current: {
    state: 'learning' as const,
    calculationState: 'baseline' as const,
    adaptiveTdeeKcal: 2500,
    calorieTargetKcal: 2400,
    goalType: 'maintain' as const,
    confidenceLabel: null,
    confidenceScore: null,
    readiness: {
      eligible: false,
      completeNutritionDaysLogged: 0,
      completeNutritionDaysUsable: 0,
      completeNutritionDaysBeforeWeightTrend: 0,
      completeNutritionDaysAwaitingWeightTrend: 0,
      completeNutritionDaysPendingCutoff: 0,
      requiredCompleteNutritionDays: 12,
      weighInsLogged: 1,
      weighInsUsable: 0,
      weighInsPendingCutoff: 1,
      requiredWeighIns: 3,
      weightSpanDays: 0,
      requiredWeightSpanDays: 14,
      latestUsableWeightAgeDays: null,
      analysisEndDate: '2026-05-31',
      pendingCutoffDate: '2026-06-01',
      timeZone: 'America/Detroit',
      noteCodes: ['WEIGH_INS_PENDING_COMPLETED_DAY_CUTOFF' as const],
      reasonCodes: ['INSUFFICIENT_WEIGHT' as const, 'INSUFFICIENT_NUTRITION' as const],
    },
    reasonCodes: ['INSUFFICIENT_WEIGHT' as const, 'INSUFFICIENT_NUTRITION' as const],
    expenditureSourceCheckInId: 'check-in-1',
    expenditureSourceInputFingerprint: fingerprint,
    stateSourceCheckInId: 'check-in-1',
    stateSourceInputFingerprint: fingerprint,
  },
  summary: {
    averageIntakeKcal: null,
    averageExpenditureKcal: null,
    averageTargetKcal: null,
    averageIntakeMinusTargetKcal: null,
    intakeTargetComparableDays: 0,
    averageIntakeMinusExpenditureKcal: null,
    intakeExpenditureComparableDays: 0,
    completeNutritionDays: 0,
    excludedNutritionDays: 30,
    coverageRatio: 0,
    predictedWeightChangeKg: null,
    predictedModeledDays: 0,
    observedTrendWeightChangeKg: null,
    observedTrendStartDate: null,
    observedTrendEndDate: null,
    reconciliationComparable: false,
    reasonCodes: [
      'NO_COMPLETE_NUTRITION' as const,
      'NO_TARGET_DATA' as const,
      'NO_EXPENDITURE_DATA' as const,
      'INSUFFICIENT_TREND_DATA' as const,
    ],
  },
  points: [],
  markers: [],
  explanation: {
    headline: 'Complete nutrition days will unlock your energy balance',
    detail: 'Incomplete days are visible but excluded.',
    reasonCodes: ['LEARNING_ESTIMATE' as const, 'NO_COMPLETE_NUTRITION' as const],
  },
};
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
  goalId: null,
  goalRevisionId: null,
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
      activeGoal: null,
      goalProgress: null,
      pendingGoalChange: null,
      goalActionRequired: null,
    });
    vi.mocked(getAdaptiveEnergyBalanceAnalytics).mockResolvedValue(energyBalanceAnalytics);
    vi.mocked(previewAdaptiveNutritionCheckIn).mockResolvedValue(checkIn);
    vi.mocked(putAdaptiveNutritionProgram).mockResolvedValue(program);
    vi.mocked(listAdaptiveNutritionCheckIns).mockResolvedValue({
      data: [checkInSummary],
      meta: { page: 1, limit: 20, total: 1 },
    });
    vi.mocked(getAdaptiveNutritionCheckIn).mockResolvedValue(checkIn);
    vi.mocked(getCurrentAdaptiveGoalWithProgress).mockResolvedValue({
      goal: goalRecord,
      latestRevision: goalRevision,
      progress: goalProgress,
      pendingGoalChange: null,
      allowedActions: { edit: true, startNew: true, cancel: true, complete: false },
    });
    vi.mocked(editAdaptiveGoal).mockResolvedValue({
      goal: goalRecord,
      latestRevision: goalRevision,
      progress: goalProgress,
      pendingGoalChange: null,
      allowedActions: { edit: true, startNew: true, cancel: true, complete: false },
    });
    vi.mocked(startAdaptiveGoal).mockResolvedValue({
      goal: goalRecord,
      latestRevision: goalRevision,
      progress: goalProgress,
      pendingGoalChange: null,
      allowedActions: { edit: true, startNew: true, cancel: true, complete: false },
    });
    vi.mocked(completeAdaptiveGoal).mockResolvedValue({
      goal: goalRecord,
      latestRevision: goalRevision,
      progress: goalProgress,
      pendingGoalChange: null,
      allowedActions: { edit: true, startNew: true, cancel: true, complete: false },
    });
    vi.mocked(cancelAdaptiveGoal).mockResolvedValue({
      ...goalRecord,
      status: 'cancelled',
      finalTrendWeightKg: 82,
      endedLocalDate: '2026-06-01',
      endedReason: 'cancelled',
    });
    vi.mocked(listAdaptiveGoals).mockResolvedValue({
      data: [
        {
          goal: goalRecord,
          latestRevision: goalRevision,
          finalTrendWeightKg: null,
          netChangeKg: null,
          durationDays: null,
        },
      ],
      meta: { page: 1, limit: 20, total: 1 },
    });
    vi.mocked(getAdaptiveGoal).mockResolvedValue({
      goal: goalRecord,
      revisions: [goalRevision],
      acceptedCheckIns: [],
      trendPoints: [
        {
          kind: 'maintenance',
          date: goalRecord.startedLocalDate,
          trendWeightKg: 82,
          scaleWeightKg: 82.2,
          goalRevisionId: goalRevision.id,
          revisionSequence: 1,
          centerWeightKg: 82,
          signedDistanceFromCenterKg: 0,
          rangeRadiusKg: 0.82,
          rangeLowerKg: 81.18,
          rangeUpperKg: 82.82,
          rangeStatus: 'within',
        },
      ],
      completion: null,
    });
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('allows JWT and AgentToken reads and previews with response-schema validation', async () => {
    const app = buildServer();
    vi.mocked(findAgentTokenByHash).mockResolvedValue({ id: 'agent-1', userId: 'agent-user' });
    vi.mocked(getAdaptiveEnergyBalanceAnalytics).mockResolvedValue({
      ...energyBalanceAnalytics,
      isHistorical: true,
    });
    try {
      await app.ready();
      const jwt = app.jwt.sign(
        { sub: 'jwt-user', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const [
        stateResponse,
        analyticsJwtResponse,
        analyticsAgentResponse,
        previewResponse,
        historyResponse,
        detailResponse,
        currentGoalResponse,
        goalHistoryResponse,
        goalDetailResponse,
      ] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/adaptive-nutrition',
          headers: { authorization: `Bearer ${jwt}` },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/adaptive-nutrition/analytics?range=1m&aggregation=auto&end=2026-06-01',
          headers: { authorization: `Bearer ${jwt}` },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/adaptive-nutrition/analytics?range=1m&aggregation=auto&end=2026-06-01',
          headers: { authorization: 'AgentToken plain-agent-token' },
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
        app.inject({
          method: 'GET',
          url: '/api/v1/adaptive-nutrition/goals/current',
          headers: { authorization: 'AgentToken plain-agent-token' },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/adaptive-nutrition/goals',
          headers: { authorization: 'AgentToken plain-agent-token' },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/adaptive-nutrition/goals/goal-1',
          headers: { authorization: 'AgentToken plain-agent-token' },
        }),
      ]);
      expect(stateResponse.statusCode, stateResponse.body).toBe(200);
      expect(analyticsJwtResponse.statusCode, analyticsJwtResponse.body).toBe(200);
      expect(analyticsAgentResponse.statusCode, analyticsAgentResponse.body).toBe(200);
      expect(analyticsAgentResponse.json()).toEqual(analyticsJwtResponse.json());
      expect(analyticsJwtResponse.json().data.isHistorical).toBe(true);
      expect(vi.mocked(getAdaptiveEnergyBalanceAnalytics)).toHaveBeenCalledWith('jwt-user', {
        range: '1m',
        aggregation: 'auto',
        end: '2026-06-01',
      });
      expect(vi.mocked(getAdaptiveEnergyBalanceAnalytics)).toHaveBeenCalledWith('agent-user', {
        range: '1m',
        aggregation: 'auto',
        end: '2026-06-01',
      });
      expect(previewResponse.statusCode).toBe(200);
      expect(historyResponse.statusCode).toBe(200);
      expect(detailResponse.statusCode).toBe(200);
      expect(currentGoalResponse.statusCode, currentGoalResponse.body).toBe(200);
      expect(goalHistoryResponse.statusCode, goalHistoryResponse.body).toBe(200);
      expect(goalDetailResponse.statusCode, goalDetailResponse.body).toBe(200);
      expect(previewResponse.json()).toEqual({ data: checkIn });
      expect(vi.mocked(findAgentTokenByHash)).toHaveBeenCalledWith(
        createHash('sha256').update('plain-agent-token').digest('hex'),
      );
    } finally {
      await app.close();
    }
  });

  it('keeps every goal mutation JWT-only and validates the mutation responses', async () => {
    const app = buildServer();
    vi.mocked(findAgentTokenByHash).mockResolvedValue({ id: 'agent-1', userId: 'agent-user' });
    try {
      await app.ready();
      const jwt = app.jwt.sign(
        { sub: 'jwt-user', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const headers = { authorization: `Bearer ${jwt}` };
      const editPayload = {
        type: 'maintain',
        targetWeightKg: null,
        maintenanceCenterKg: 82,
        goalRatePctPerWeek: 0,
      };
      const responses = await Promise.all([
        app.inject({
          method: 'PATCH',
          url: '/api/v1/adaptive-nutrition/goals/goal-1',
          headers,
          payload: editPayload,
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/adaptive-nutrition/goals',
          headers,
          payload: {
            type: 'lose',
            targetWeightKg: 75,
            maintenanceCenterKg: null,
            goalRatePctPerWeek: -0.5,
          },
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/adaptive-nutrition/goals/goal-1/cancel',
          headers,
          payload: {},
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/adaptive-nutrition/goals/goal-1/complete',
          headers,
          payload: { checkInId: 'check-in-1' },
        }),
      ]);
      expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200, 200]);
      for (const [method, url, payload] of [
        ['PATCH', '/api/v1/adaptive-nutrition/goals/goal-1', editPayload],
        [
          'POST',
          '/api/v1/adaptive-nutrition/goals',
          { type: 'lose', targetWeightKg: 75, maintenanceCenterKg: null, goalRatePctPerWeek: -0.5 },
        ],
        ['POST', '/api/v1/adaptive-nutrition/goals/goal-1/cancel', {}],
        ['POST', '/api/v1/adaptive-nutrition/goals/goal-1/complete', { checkInId: 'check-in-1' }],
      ] as const) {
        const response = await app.inject({
          method,
          url,
          headers: { authorization: 'AgentToken plain-agent-token' },
          payload,
        });
        expect(response.statusCode).toBe(403);
      }
    } finally {
      await app.close();
    }
  });

  it('validates analytics queries before the store and documents both read auth schemes', async () => {
    const app = buildServer();
    try {
      await app.ready();
      const jwt = app.jwt.sign(
        { sub: 'jwt-user', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const invalid = await app.inject({
        method: 'GET',
        url: '/api/v1/adaptive-nutrition/analytics?range=2m&extra=true',
        headers: { authorization: `Bearer ${jwt}` },
      });
      const unauthenticated = await app.inject({
        method: 'GET',
        url: '/api/v1/adaptive-nutrition/analytics',
      });
      const openApi = await app.inject({ method: 'GET', url: '/api/docs/json' });

      expect(invalid.statusCode).toBe(400);
      expect(unauthenticated.statusCode).toBe(401);
      expect(getAdaptiveEnergyBalanceAnalytics).not.toHaveBeenCalled();
      vi.mocked(getAdaptiveEnergyBalanceAnalytics).mockRejectedValueOnce(
        new AdaptiveAnalyticsFutureEndError(),
      );
      const future = await app.inject({
        method: 'GET',
        url: '/api/v1/adaptive-nutrition/analytics?end=2099-01-01',
        headers: { authorization: `Bearer ${jwt}` },
      });
      expect(future.statusCode).toBe(400);
      expect(future.json()).toMatchObject({
        error: { code: 'ADAPTIVE_ANALYTICS_FUTURE_END' },
      });
      vi.mocked(getAdaptiveEnergyBalanceAnalytics).mockRejectedValueOnce(
        new AdaptiveAnalyticsPreProgramEndError(),
      );
      const beforeProgram = await app.inject({
        method: 'GET',
        url: '/api/v1/adaptive-nutrition/analytics?end=2000-01-01',
        headers: { authorization: `Bearer ${jwt}` },
      });
      expect(beforeProgram.statusCode).toBe(400);
      expect(beforeProgram.json()).toMatchObject({
        error: { code: 'ADAPTIVE_ANALYTICS_PRE_PROGRAM_END' },
      });
      expect(openApi.statusCode).toBe(200);
      expect(openApi.json().paths['/api/v1/adaptive-nutrition/analytics'].get.security).toEqual([
        { bearerAuth: [] },
        { agentToken: [] },
      ]);
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

  it('maps cancellation without a fresh canonical trend to NO_CURRENT_WEIGHT', async () => {
    const app = buildServer();
    vi.mocked(cancelAdaptiveGoal).mockRejectedValue(new AdaptiveCurrentWeightRequiredError());
    try {
      await app.ready();
      const jwt = app.jwt.sign(
        { sub: 'jwt-user', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/adaptive-nutrition/goals/goal-1/cancel',
        headers: { authorization: `Bearer ${jwt}` },
        payload: {},
      });

      expect(response.statusCode, response.body).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'NO_CURRENT_WEIGHT' } });
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
        paths: Record<
          string,
          Record<string, { description?: string; security: unknown; summary?: string }>
        >;
      };
      expect(response.statusCode).toBe(200);
      expect(Object.keys(document.paths)).toEqual(
        expect.arrayContaining([
          '/api/v1/adaptive-nutrition/',
          '/api/v1/adaptive-nutrition/goals/current',
          '/api/v1/adaptive-nutrition/goals',
          '/api/v1/adaptive-nutrition/goals/{id}',
          '/api/v1/adaptive-nutrition/goals/{id}/cancel',
          '/api/v1/adaptive-nutrition/goals/{id}/complete',
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
      const goalOperation = document.paths['/api/v1/adaptive-nutrition/goals/current']?.get;
      const editGoalOperation = document.paths['/api/v1/adaptive-nutrition/goals/{id}']?.patch;
      const startGoalOperation = document.paths['/api/v1/adaptive-nutrition/goals']?.post;
      const cancelGoalOperation =
        document.paths['/api/v1/adaptive-nutrition/goals/{id}/cancel']?.post;
      const completeGoalOperation =
        document.paths['/api/v1/adaptive-nutrition/goals/{id}/complete']?.post;
      const goalHistoryOperation = document.paths['/api/v1/adaptive-nutrition/goals']?.get;
      const goalDetailOperation = document.paths['/api/v1/adaptive-nutrition/goals/{id}']?.get;
      expect(programOperation?.security).toEqual([{ bearerAuth: [] }]);
      expect(previewOperation?.security).toEqual([{ bearerAuth: [] }, { agentToken: [] }]);
      expect(goalOperation?.security).toEqual([{ bearerAuth: [] }, { agentToken: [] }]);
      for (const operation of [
        editGoalOperation,
        startGoalOperation,
        cancelGoalOperation,
        completeGoalOperation,
      ]) {
        expect(operation?.security).toEqual([{ bearerAuth: [] }]);
      }
      expect(goalOperation?.description).toMatch(/server-owned trend-weight progress/u);
      expect(editGoalOperation?.description).toMatch(/remain unchanged until explicit acceptance/u);
      expect(completeGoalOperation?.description).toMatch(
        /does not create or replace a nutrition target/u,
      );
      expect(completeGoalOperation?.description).toMatch(/immutable relation/u);
      expect(goalHistoryOperation?.description).toMatch(/final canonical trend persisted/u);
      expect(goalDetailOperation?.description).toMatch(/revision effective on each date/u);
      expect(goalDetailOperation?.description).toMatch(/max\(0\.68 kg, center × 1%\)/u);
    } finally {
      await app.close();
    }
  });
});
