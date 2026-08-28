import { createHash } from 'node:crypto';

import {
  ADAPTIVE_TDEE_CONSTANTS,
  adaptiveCheckInSummarySchema,
  adaptiveWeeklyReviewSchema,
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
  AdaptiveGoalTrajectoryFutureEndError,
  AdaptiveGoalTrajectoryPreGoalEndError,
  getAdaptiveGoalTrajectory,
} from './goal-trajectory-store.js';

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
import {
  actOnAdaptiveWeeklyReview,
  AdaptiveReviewRefreshNotAllowedError,
  getAdaptiveWeeklyReview,
  getPendingAdaptiveWeeklyReview,
  listAdaptiveWeeklyReviews,
  previewAdaptiveWeeklyReview,
  refreshAdaptiveWeeklyReview,
} from './review-store.js';

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

vi.mock('./goal-trajectory-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./goal-trajectory-store.js')>();
  return { ...actual, getAdaptiveGoalTrajectory: vi.fn() };
});

vi.mock('./review-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./review-store.js')>();
  return {
    ...actual,
    actOnAdaptiveWeeklyReview: vi.fn(),
    createAdaptiveReviewContext: vi.fn(),
    deleteAdaptiveReviewContext: vi.fn(),
    getAdaptiveWeeklyReview: vi.fn(),
    getPendingAdaptiveWeeklyReview: vi.fn(),
    listAdaptiveWeeklyReviews: vi.fn(),
    previewAdaptiveWeeklyReview: vi.fn(),
    refreshAdaptiveWeeklyReview: vi.fn(),
    updateAdaptiveReviewContext: vi.fn(),
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
const reviewFingerprint = 'b'.repeat(64);
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
const goalTrajectory = {
  algorithmVersion: 'adaptive-tdee-v1' as const,
  trendSource: 'product_trend_weight_v1' as const,
  strategyTrendSource: 'adaptive_model_trend' as const,
  productTrend: {
    currentTrendWeightKg: 82,
    currentTrendDate: '2026-06-01',
    state: 'developing' as const,
  },
  timeZone: 'America/Detroit',
  isHistorical: true,
  goal: goalRecord,
  activeRevision: goalRevision,
  range: { preset: '3m' as const, startDate: '2026-06-01', endDate: '2026-06-01' },
  strategyAsOfDate: '2026-06-01',
  evidenceThroughDate: '2026-06-01',
  currentTrendDate: '2026-06-01',
  summary: {
    kind: 'maintenance' as const,
    startTrendWeightKg: 82,
    currentTrendWeightKg: 82,
    currentTrendDate: '2026-06-01',
    latestScale: { entryId: 'weight-1', date: '2026-06-01', weightKg: 82 },
    centerWeightKg: 82,
    rangeRadiusKg: 0.82,
    rangeLowerKg: 81.18,
    rangeUpperKg: 82.82,
    signedDistanceFromCenterKg: 0,
    rangeStatus: 'within' as const,
    correctionPolicy: 'review_only_no_automatic_change' as const,
    timeInRange: {
      intervalStartDate: '2026-06-01',
      intervalEndDate: '2026-06-01',
      modeledDays: 1,
      daysWithinRange: 1,
      timeInRangeFraction: 1,
      evidenceStatus: 'supported' as const,
    },
  },
  actualRate: {
    lookbackDays: 21 as const,
    kgPerWeek: null,
    pctPerWeek: null,
    startDate: null,
    endDate: null,
    trendPointCount: 1,
    observedWeightCount: 1,
    spanDays: 0,
    confidence: 'insufficient' as const,
    status: 'unavailable' as const,
    unavailableReason: 'INSUFFICIENT_TREND' as const,
  },
  forecast: null,
  context: {
    calorieTargetKcal: 2500,
    calorieTargetEffectiveDate: '2026-06-01',
    adaptiveExpenditureKcal: 2500,
    expenditureSourceCheckInId: null,
    expenditureSourceInputFingerprint: null,
  },
  trendPoints: [
    {
      date: '2026-06-01',
      trendWeightKg: 82,
      scaleWeightKg: 82,
      sourceEntryId: 'weight-1',
      evidenceState: 'developing' as const,
      observationCount: 2,
      spanDays: 7,
      gapFromPreviousDays: null,
      corrected: false,
      adaptiveStrategyTrendWeightKg: 82,
      goalRevisionId: 'revision-1',
      revisionSequence: 1,
      targetWeightKg: null,
      maintenanceCenterKg: 82,
      maintenanceLowerKg: 81.18,
      maintenanceUpperKg: 82.82,
      section: 'current' as const,
    },
  ],
  weeklyContributions: [],
  annotations: [
    {
      id: 'goal-start-goal-1',
      date: '2026-06-01',
      kind: 'goal_started' as const,
      label: 'Goal started',
      goalRevisionId: 'revision-1',
      revisionSequence: 1,
      checkInId: null,
    },
  ],
  completionReview: {
    toleranceKg: 0.23,
    trendTargetStatus: 'unavailable' as const,
    scaleTargetStatus: 'unavailable' as const,
    completionReviewRequired: false,
    completionAllowed: false,
    reasonCode: 'MAINTENANCE_NOT_APPLICABLE' as const,
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

const weeklyReview = adaptiveWeeklyReviewSchema.parse({
  id: 'review-1',
  checkInId: 'check-in-1',
  sourceFingerprint: reviewFingerprint,
  snapshot: {
    version: 1 as const,
    reviewLocalDate: '2026-06-01',
    analysisStart: '2026-05-11',
    analysisEnd: '2026-05-31',
    timeZone: 'America/Detroit',
    weightUnit: 'lbs',
    programId: 'program-1',
    checkInId: 'check-in-1',
    goalId: 'goal-1',
    goalRevisionId: 'revision-1',
    algorithmVersion: 'adaptive-tdee-v1',
    sourceFingerprint: reviewFingerprint,
    headline: 'Keep the current targets',
    summary: 'The available evidence does not support a material change.',
    confidenceLabel: 'High' as const,
    confidenceScore: 0.9,
    modules: [
      {
        kind: 'outcome' as const,
        title: 'Outcome' as const,
        goalType: 'maintain' as const,
        scaleWeightKg: 82,
        trendWeightKg: 82,
        trendChangeKg: 0,
        actualRateKgPerWeek: 0,
        desiredRateKgPerWeek: 0,
        etaStartDate: null,
        etaEndDate: null,
        summary: 'Trend Weight is stable.',
        scaleNoiseExplanation: 'Daily scale noise is smoothed before decisions.',
      },
      {
        kind: 'recommendation' as const,
        title: 'Recommendation' as const,
        outcome: 'keep' as const,
        headline: 'Keep the current targets',
        explanation: 'No material target change is supported.',
        currentTarget: {
          calories: 2500,
          protein: 180,
          carbs: 265,
          fat: 80,
          effectiveDate: '2026-06-01',
        },
        proposedTarget: null,
        causalBreakdown: {
          priorExpenditureKcal: 2500,
          observedExpenditureKcal: 2500,
          proposedExpenditureKcal: 2500,
          observedTrendContributionKcal: 0,
          goalRateContributionKcal: 0,
          requestedAdjustmentKcal: 0,
          appliedAdjustmentKcal: 0,
          smoothingOrCapKcal: 0,
          safetyFloorKcal: 1500,
          deficitLimitKcal: 1000,
          includedNutritionDates: ['2026-05-31'],
          excludedNutrition: [],
          includedWeightDates: ['2026-05-31'],
          excludedWeight: [],
          confidenceLabel: 'High' as const,
          confidenceScore: 0.9,
          readinessReasonCodes: [],
        },
      },
    ],
    contexts: [],
  },
  state: 'pending' as const,
  actionSequence: 0,
  actions: [],
  effectiveProposal: null,
  deferCondition: null,
  availableActions: ['accept', 'edit', 'defer', 'decline', 'ask_agent'],
  createdAt: 1_780_329_600_000,
});

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
      localDate: '2026-08-23',
      timeZone: 'America/Detroit',
      timeZoneSource: 'user_profile',
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
    vi.mocked(getAdaptiveGoalTrajectory).mockResolvedValue(goalTrajectory);
    vi.mocked(getPendingAdaptiveWeeklyReview).mockResolvedValue(weeklyReview);
    vi.mocked(refreshAdaptiveWeeklyReview).mockResolvedValue(weeklyReview);
    vi.mocked(getAdaptiveWeeklyReview).mockResolvedValue(weeklyReview);
    vi.mocked(previewAdaptiveWeeklyReview).mockResolvedValue(weeklyReview);
    vi.mocked(actOnAdaptiveWeeklyReview).mockResolvedValue(weeklyReview);
    vi.mocked(listAdaptiveWeeklyReviews).mockResolvedValue({
      data: [weeklyReview],
      meta: { page: 1, limit: 20, total: 1 },
    });
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

  it('returns identical strict goal trajectory facts to JWT and AgentToken callers', async () => {
    const app = buildServer();
    vi.mocked(findAgentTokenByHash).mockResolvedValue({ id: 'agent-1', userId: 'jwt-user' });
    try {
      await app.ready();
      const jwt = app.jwt.sign(
        { sub: 'jwt-user', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const url =
        '/api/v1/adaptive-nutrition/goals/goal-1/trajectory?range=3m&lookbackDays=21&end=2026-06-01';
      const [jwtResponse, agentResponse] = await Promise.all([
        app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${jwt}` } }),
        app.inject({
          method: 'GET',
          url,
          headers: { authorization: 'AgentToken plain-agent-token' },
        }),
      ]);

      expect(jwtResponse.statusCode, jwtResponse.body).toBe(200);
      expect(agentResponse.statusCode, agentResponse.body).toBe(200);
      expect(agentResponse.json()).toEqual(jwtResponse.json());
      expect(jwtResponse.json()).toEqual({ data: goalTrajectory });
      expect(vi.mocked(getAdaptiveGoalTrajectory)).toHaveBeenNthCalledWith(
        1,
        'jwt-user',
        'goal-1',
        {
          range: '3m',
          lookbackDays: 21,
          end: '2026-06-01',
        },
      );
      expect(vi.mocked(getAdaptiveGoalTrajectory)).toHaveBeenNthCalledWith(
        2,
        'jwt-user',
        'goal-1',
        {
          range: '3m',
          lookbackDays: 21,
          end: '2026-06-01',
        },
      );
    } finally {
      await app.close();
    }
  });

  it('validates goal trajectory queries and maps bounded date errors without writes', async () => {
    const app = buildServer();
    try {
      await app.ready();
      const jwt = app.jwt.sign(
        { sub: 'jwt-user', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const headers = { authorization: `Bearer ${jwt}` };
      const invalid = await app.inject({
        method: 'GET',
        url: '/api/v1/adaptive-nutrition/goals/goal-1/trajectory?range=2m&lookbackDays=15',
        headers,
      });
      expect(invalid.statusCode).toBe(400);
      expect(getAdaptiveGoalTrajectory).not.toHaveBeenCalled();

      vi.mocked(getAdaptiveGoalTrajectory).mockRejectedValueOnce(
        new AdaptiveGoalTrajectoryFutureEndError(),
      );
      const future = await app.inject({
        method: 'GET',
        url: '/api/v1/adaptive-nutrition/goals/goal-1/trajectory?end=2099-01-01',
        headers,
      });
      expect(future.statusCode).toBe(400);
      expect(future.json()).toMatchObject({
        error: { code: 'ADAPTIVE_GOAL_TRAJECTORY_FUTURE_END' },
      });

      vi.mocked(getAdaptiveGoalTrajectory).mockRejectedValueOnce(
        new AdaptiveGoalTrajectoryPreGoalEndError(),
      );
      const beforeGoal = await app.inject({
        method: 'GET',
        url: '/api/v1/adaptive-nutrition/goals/goal-1/trajectory?end=2000-01-01',
        headers,
      });
      expect(beforeGoal.statusCode).toBe(400);
      expect(beforeGoal.json()).toMatchObject({
        error: { code: 'ADAPTIVE_GOAL_TRAJECTORY_PRE_GOAL_END' },
      });

      const openApi = await app.inject({ method: 'GET', url: '/api/docs/json' });
      expect(
        openApi.json().paths['/api/v1/adaptive-nutrition/goals/{id}/trajectory'].get.security,
      ).toEqual([{ bearerAuth: [] }, { agentToken: [] }]);
      expect(
        openApi.json().paths['/api/v1/adaptive-nutrition/goals/{id}/trajectory'].get.description,
      ).toMatch(/read-only/u);
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

  it('returns identical immutable pending-review truth to JWT and AgentToken callers', async () => {
    const app = buildServer();
    vi.mocked(findAgentTokenByHash).mockResolvedValue({ id: 'agent-1', userId: 'agent-user' });
    try {
      await app.ready();
      const jwt = app.jwt.sign(
        { sub: 'jwt-user', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const [jwtResponse, agentResponse] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/adaptive-nutrition/reviews/pending',
          headers: { authorization: `Bearer ${jwt}` },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/adaptive-nutrition/reviews/pending',
          headers: { authorization: 'AgentToken plain-agent-token' },
        }),
      ]);

      expect(jwtResponse.statusCode, jwtResponse.body).toBe(200);
      expect(agentResponse.statusCode, agentResponse.body).toBe(200);
      expect(agentResponse.json()).toEqual(jwtResponse.json());
      expect(vi.mocked(getPendingAdaptiveWeeklyReview)).toHaveBeenNthCalledWith(1, 'jwt-user');
      expect(vi.mocked(getPendingAdaptiveWeeklyReview)).toHaveBeenNthCalledWith(2, 'agent-user');
    } finally {
      await app.close();
    }
  });

  it('allows JWT and AgentToken callers to refresh stale evidence without a plan decision', async () => {
    const app = buildServer();
    vi.mocked(findAgentTokenByHash).mockResolvedValue({ id: 'agent-1', userId: 'agent-user' });
    try {
      await app.ready();
      const jwt = app.jwt.sign(
        { sub: 'jwt-user', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const [jwtResponse, agentResponse] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/adaptive-nutrition/reviews/review-1/refresh',
          headers: { authorization: `Bearer ${jwt}` },
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/adaptive-nutrition/reviews/review-1/refresh',
          headers: { authorization: 'AgentToken plain-agent-token' },
        }),
      ]);
      expect(jwtResponse.statusCode, jwtResponse.body).toBe(200);
      expect(agentResponse.statusCode, agentResponse.body).toBe(200);
      expect(agentResponse.json()).toEqual(jwtResponse.json());
      expect(vi.mocked(refreshAdaptiveWeeklyReview)).toHaveBeenNthCalledWith(
        1,
        'jwt-user',
        'review-1',
      );
      expect(vi.mocked(refreshAdaptiveWeeklyReview)).toHaveBeenNthCalledWith(
        2,
        'agent-user',
        'review-1',
      );
    } finally {
      await app.close();
    }
  });

  it('returns the same stable conflict when JWT or AgentToken tries to refresh a non-stale review', async () => {
    const app = buildServer();
    vi.mocked(findAgentTokenByHash).mockResolvedValue({ id: 'agent-1', userId: 'agent-user' });
    vi.mocked(refreshAdaptiveWeeklyReview).mockRejectedValue(
      new AdaptiveReviewRefreshNotAllowedError(),
    );
    try {
      await app.ready();
      const jwt = app.jwt.sign(
        { sub: 'jwt-user', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const [jwtResponse, agentResponse] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/adaptive-nutrition/reviews/terminal-review/refresh',
          headers: { authorization: `Bearer ${jwt}` },
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/adaptive-nutrition/reviews/terminal-review/refresh',
          headers: { authorization: 'AgentToken plain-agent-token' },
        }),
      ]);

      expect(jwtResponse.statusCode, jwtResponse.body).toBe(409);
      expect(agentResponse.statusCode, agentResponse.body).toBe(409);
      expect(jwtResponse.json()).toEqual({
        error: {
          code: 'ADAPTIVE_REVIEW_REFRESH_NOT_ALLOWED',
          message: 'Only a stale, nonterminal weekly review can be refreshed',
        },
      });
      expect(agentResponse.json()).toEqual(jwtResponse.json());
      expect(vi.mocked(refreshAdaptiveWeeklyReview)).toHaveBeenNthCalledWith(
        1,
        'jwt-user',
        'terminal-review',
      );
      expect(vi.mocked(refreshAdaptiveWeeklyReview)).toHaveBeenNthCalledWith(
        2,
        'agent-user',
        'terminal-review',
      );
    } finally {
      await app.close();
    }
  });

  it.each(['accept', 'edit', 'defer', 'decline'] as const)(
    'rejects AgentToken material review action %s without calling the store',
    async (type) => {
      const app = buildServer();
      vi.mocked(findAgentTokenByHash).mockResolvedValue({ id: 'agent-1', userId: 'agent-user' });
      const payload =
        type === 'edit'
          ? {
              type,
              expectedFingerprint: reviewFingerprint,
              expectedActionSequence: 0,
              proposal: {
                calories: 2400,
                protein: 180,
                carbs: 240,
                fat: 80,
                effectiveDate: '2026-06-02',
              },
              reason: 'User-authored edit required.',
            }
          : type === 'defer'
            ? {
                type,
                expectedFingerprint: reviewFingerprint,
                expectedActionSequence: 0,
                condition: { kind: 'until_date', localDate: '2026-06-02' },
                reason: 'Wait for another record.',
              }
            : type === 'decline'
              ? {
                  type,
                  expectedFingerprint: reviewFingerprint,
                  expectedActionSequence: 0,
                  reason: 'Keep current targets.',
                }
              : {
                  type,
                  expectedFingerprint: reviewFingerprint,
                  expectedActionSequence: 0,
                };
      try {
        await app.ready();
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/adaptive-nutrition/reviews/review-1/actions',
          headers: { authorization: 'AgentToken plain-agent-token' },
          payload,
        });
        expect(response.statusCode, response.body).toBe(403);
        expect(response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
        expect(vi.mocked(actOnAdaptiveWeeklyReview)).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    },
  );

  it('allows an AgentToken caller to ask one bounded review question without plan mutation', async () => {
    const app = buildServer();
    vi.mocked(findAgentTokenByHash).mockResolvedValue({ id: 'agent-1', userId: 'agent-user' });
    try {
      await app.ready();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/adaptive-nutrition/reviews/review-1/actions',
        headers: { authorization: 'AgentToken plain-agent-token' },
        payload: {
          type: 'ask_agent',
          expectedActionSequence: 0,
          question: 'Was the low nutrition day already explained?',
        },
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(vi.mocked(actOnAdaptiveWeeklyReview)).toHaveBeenCalledWith(
        'agent-user',
        'review-1',
        expect.objectContaining({ type: 'ask_agent' }),
        { type: 'agent_token', agentTokenId: 'agent-1', label: 'agent-1' },
      );
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
          '/api/v1/adaptive-nutrition/reviews/pending',
          '/api/v1/adaptive-nutrition/reviews/preview',
          '/api/v1/adaptive-nutrition/reviews',
          '/api/v1/adaptive-nutrition/reviews/{id}',
          '/api/v1/adaptive-nutrition/reviews/{id}/refresh',
          '/api/v1/adaptive-nutrition/reviews/{id}/actions',
          '/api/v1/adaptive-nutrition/review-context',
          '/api/v1/adaptive-nutrition/review-context/{id}',
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
