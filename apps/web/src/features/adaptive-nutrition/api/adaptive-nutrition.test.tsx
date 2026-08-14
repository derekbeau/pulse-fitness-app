import { act, renderHook, waitFor } from '@testing-library/react';
import {
  ADAPTIVE_TDEE_CONSTANTS,
  type AdaptiveCheckInDetail,
  type AdaptiveNutritionState,
} from '@pulse/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { macroTrendQueryKeys } from '@/hooks/use-macro-trend';
import { adaptiveNutritionQueryKey, nutritionTargetQueryKey } from '@/lib/query-invalidation';
import { createQueryClientWrapper } from '@/test/query-client';

import {
  useAcceptAdaptiveNutritionCheckIn,
  useAdaptiveGoalDetail,
  useInfiniteAdaptiveGoalHistory,
  useAdaptiveNutritionHistory,
  useAdaptiveNutritionState,
  useEditAdaptiveGoal,
  useCompleteAdaptiveGoal,
  usePreviewAdaptiveNutritionCheckIn,
  usePutAdaptiveNutritionProgram,
  useStartAdaptiveGoal,
} from './adaptive-nutrition';
import { adaptiveNutritionQueryKeys } from './keys';

const mockFetch = vi.fn();

const programCalculation = {
  status: 'active' as const,
  timeZone: 'America/Detroit',
  rmrEquation: 'manual_tdee' as const,
  heightCm: null,
  birthDate: null,
  activityLevel: null,
  activityMultiplier: null,
  estimatedRmrKcal: null,
  calculatedBaselineTdeeKcal: null,
  manualBaselineTdeeKcal: 2400,
  baselineTdeeKcal: 2400,
  goalType: 'maintain' as const,
  targetWeightKg: null,
  goalRatePctPerWeek: 0,
  proteinGrams: 180,
  fatAllocationPct: 30,
  systemCalorieFloorKcal: 1440,
  userCalorieFloorKcal: 1440,
  algorithmVersion: 'adaptive-tdee-v1' as const,
};

const currentTarget = {
  id: 'target-current',
  calories: 2300,
  protein: 180,
  carbs: 250,
  fat: 70,
  source: 'manual' as const,
  adaptiveCheckInId: null,
  macroCalories: 2350,
  effectiveDate: '2026-08-13',
  createdAt: 1,
  updatedAt: 1,
};

const inputCurrentTarget = {
  id: currentTarget.id,
  calories: currentTarget.calories,
  protein: currentTarget.protein,
  carbs: currentTarget.carbs,
  fat: currentTarget.fat,
  source: currentTarget.source,
  adaptiveCheckInId: currentTarget.adaptiveCheckInId,
  macroCalories: currentTarget.macroCalories,
  effectiveDate: currentTarget.effectiveDate,
  updatedAt: currentTarget.updatedAt,
};

const checkIn: AdaptiveCheckInDetail = {
  id: 'check-in-1',
  goalId: null,
  goalRevisionId: null,
  kind: 'baseline',
  status: 'pending',
  calculationState: 'baseline',
  localDate: '2026-08-13',
  analysisStart: null,
  analysisEnd: null,
  includeToday: false,
  algorithmVersion: 'adaptive-tdee-v1',
  dataFingerprint: 'a'.repeat(64),
  reasonCodes: ['SAME_DATE_TARGET_EXISTS'],
  priorTdeeKcal: 2400,
  observedTdeeKcal: null,
  proposedTdeeKcal: 2400,
  currentTargets: currentTarget,
  proposedTargets: {
    calories: 2400,
    protein: 180,
    carbs: 270,
    fat: 80,
    effectiveDate: '2026-08-13',
  },
  acceptedNutritionTargetId: null,
  resolvedAt: null,
  createdAt: 1,
  inputSnapshot: {
    version: 1,
    constants: ADAPTIVE_TDEE_CONSTANTS,
    program: programCalculation,
    priorTdee: null,
    currentTarget: inputCurrentTarget,
    boundaries: {
      previewDate: '2026-08-13',
      analysisStart: '2026-07-23',
      analysisEnd: '2026-08-12',
      warmupStart: '2026-07-02',
    },
    includeToday: false,
    nutritionDays: [],
    weightEntries: [],
  },
  calculationSnapshot: {
    algorithmVersion: 'adaptive-tdee-v1',
    inputFingerprint: 'a'.repeat(64),
    kind: 'baseline',
    boundaries: {
      previewDate: '2026-08-13',
      analysisStart: '2026-07-23',
      analysisEnd: '2026-08-12',
      warmupStart: '2026-07-02',
    },
    reasonCodes: ['SAME_DATE_TARGET_EXISTS'],
    suspectWeightEntryIds: [],
    suspectWeightEntries: [],
    excludedNutritionDates: [],
    completeNutritionDays: 0,
    actualWeightCount: 1,
    trendPointCount: 1,
    averageDailyIntakeKcal: null,
    priorTdeeKcal: 2400,
    latestTrendWeightKg: 82,
    state: 'baseline',
    weightTrendKgPerDay: null,
    observedTdeeKcal: null,
    confidence: null,
    adaptiveUpdate: null,
    goal: {
      rawGoalCalories: 2400,
      goalCalories: 2400,
      desiredWeightChangeKgPerDay: 0,
      requestedCalorieAdjustment: 0,
      achievableGoalRatePctPerWeek: 0,
      goalReached: false,
      reasonCodes: [],
    },
    macros: {
      calories: 2400,
      protein: 180,
      carbs: 270,
      fat: 80,
      macroCalories: 2400,
      calorieDifference: 0,
    },
  },
};

const checkInSummary = {
  id: checkIn.id,
  goalId: checkIn.goalId,
  goalRevisionId: checkIn.goalRevisionId,
  kind: checkIn.kind,
  status: checkIn.status,
  calculationState: checkIn.calculationState,
  localDate: checkIn.localDate,
  analysisStart: checkIn.analysisStart,
  analysisEnd: checkIn.analysisEnd,
  includeToday: checkIn.includeToday,
  algorithmVersion: checkIn.algorithmVersion,
  dataFingerprint: checkIn.dataFingerprint,
  reasonCodes: checkIn.reasonCodes,
  priorTdeeKcal: checkIn.priorTdeeKcal,
  observedTdeeKcal: checkIn.observedTdeeKcal,
  proposedTdeeKcal: checkIn.proposedTdeeKcal,
  currentTargets: checkIn.currentTargets,
  proposedTargets: checkIn.proposedTargets,
  acceptedNutritionTargetId: checkIn.acceptedNutritionTargetId,
  resolvedAt: checkIn.resolvedAt,
  createdAt: checkIn.createdAt,
};

const state: AdaptiveNutritionState = {
  state: 'pending_recommendation',
  program: { ...programCalculation, id: 'program-1', createdAt: 1, updatedAt: 1 },
  currentTarget,
  latestAcceptedCheckIn: null,
  pendingCheckIn: checkInSummary,
  checkInDue: true,
  nextCheckInDate: '2026-08-20',
  eligibility: {
    eligible: true,
    completeNutritionDays: 12,
    requiredCompleteNutritionDays: 12,
    weighIns: 3,
    requiredWeighIns: 3,
    weightSpanDays: 14,
    requiredWeightSpanDays: 14,
    latestWeightAgeDays: 1,
    reasonCodes: [],
  },
  activeGoal: null,
  goalProgress: null,
  pendingGoalChange: null,
  goalActionRequired: null,
};

const currentGoal = {
  goal: {
    id: 'goal-1',
    userId: 'user-1',
    programId: 'program-1',
    type: 'lose' as const,
    status: 'active' as const,
    targetWeightKg: 75,
    maintenanceCenterKg: null,
    goalRatePctPerWeek: -0.5,
    startTrendWeightKg: 82,
    startScaleWeightKg: 82.1,
    finalTrendWeightKg: null,
    startedLocalDate: '2026-07-01',
    endedLocalDate: null,
    endedReason: null,
    createdAt: 1,
    updatedAt: 1,
  },
  latestRevision: {
    id: 'revision-1',
    goalId: 'goal-1',
    userId: 'user-1',
    sequence: 1,
    targetWeightKg: 75,
    maintenanceCenterKg: null,
    goalRatePctPerWeek: -0.5,
    previousTargetWeightKg: 75,
    previousCenterKg: null,
    previousRatePctPerWeek: -0.5,
    reason: 'created' as const,
    effectiveLocalDate: '2026-07-01',
    createdAt: 1,
  },
  progress: {
    kind: 'weight_change' as const,
    goalId: 'goal-1',
    goalRevisionId: 'revision-1',
    revisionSequence: 1,
    startedLocalDate: '2026-07-01',
    currentLocalDate: '2026-08-13',
    currentTrendWeightKg: 80,
    latestScaleWeightKg: 80.2,
    actualRateKgPerWeek: -0.3,
    trendFreshness: 'fresh' as const,
    confidence: 'High' as const,
    provenance: 'valid_trend' as const,
    type: 'lose' as const,
    startTrendWeightKg: 82,
    targetWeightKg: 75,
    totalDistanceKg: 7,
    completedDistanceKg: 2,
    remainingDistanceKg: 5,
    percentComplete: 28.57,
    desiredRatePctPerWeek: -0.5,
    desiredRateKgPerWeek: -0.4,
    trajectory: 'toward_goal' as const,
    status: 'on_track' as const,
    desiredProjection: {
      basis: 'desired' as const,
      weeks: 12.5,
      projectedStartDate: '2026-10-25',
      projectedEndDate: '2026-11-24',
      unavailableReason: null,
    },
    actualProjection: {
      basis: 'actual' as const,
      weeks: 16.67,
      projectedStartDate: '2026-11-11',
      projectedEndDate: '2027-01-03',
      unavailableReason: null,
    },
  },
  pendingGoalChange: null,
  allowedActions: { edit: true, startNew: true, cancel: true, complete: false },
};

function createJsonResponse(data: unknown, meta?: unknown) {
  return new Response(JSON.stringify(meta ? { data, meta } : { data }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

describe('adaptive nutrition api hooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('parses the current state at the response boundary', async () => {
    mockFetch.mockResolvedValueOnce(createJsonResponse(state));
    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    const { result } = renderHook(() => useAdaptiveNutritionState(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.state).toBe('pending_recommendation');
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/adaptive-nutrition', expect.any(Object));
  });

  it('rejects malformed state and history metadata', async () => {
    mockFetch
      .mockResolvedValueOnce(createJsonResponse({ ...state, state: 'invented' }))
      .mockResolvedValueOnce(createJsonResponse([checkIn], { page: 0, limit: 20, total: 1 }));
    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    const stateHook = renderHook(() => useAdaptiveNutritionState(), { wrapper });
    const historyHook = renderHook(() => useAdaptiveNutritionHistory(), { wrapper });

    await waitFor(() => expect(stateHook.result.current.isError).toBe(true));
    await waitFor(() => expect(historyHook.result.current.isError).toBe(true));
  });

  it('writes program and preview inputs and invalidates adaptive state', async () => {
    mockFetch
      .mockResolvedValueOnce(createJsonResponse(state.program))
      .mockResolvedValueOnce(createJsonResponse(checkIn));
    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const programHook = renderHook(() => usePutAdaptiveNutritionProgram(), { wrapper });
    const previewHook = renderHook(() => usePreviewAdaptiveNutritionCheckIn(), { wrapper });

    await act(async () => {
      await programHook.result.current.mutateAsync({
        status: 'active',
        timeZone: 'America/Detroit',
        heightCm: null,
        birthDate: null,
        rmrEquation: 'manual_tdee',
        activityLevel: null,
        manualBaselineTdeeKcal: 2400,
        goalType: 'maintain',
        targetWeightKg: null,
        goalRatePctPerWeek: 0,
        proteinGrams: 180,
        fatAllocationPct: 30,
        currentWeight: { weight: 180, unit: 'lbs' },
        rebaseline: false,
        supersedePending: false,
      });
      await previewHook.result.current.mutateAsync({ kind: 'manual', includeToday: true });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/adaptive-nutrition/program',
      expect.objectContaining({ method: 'PUT' }),
    );
    const previewRequest = mockFetch.mock.calls.find(
      ([url]) => url === '/api/v1/adaptive-nutrition/check-ins/preview',
    );
    expect(previewRequest?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(previewRequest?.[1]?.body))).toEqual({
      kind: 'manual',
      includeToday: true,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: adaptiveNutritionQueryKey });
  });

  it('accepts with explicit replacement and invalidates every affected family', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        checkIn: { ...checkIn, status: 'accepted', acceptedNutritionTargetId: 'target-current' },
        target: { ...currentTarget, source: 'adaptive', adaptiveCheckInId: checkIn.id },
      }),
    );
    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useAcceptAdaptiveNutritionCheckIn(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: checkIn.id,
        input: { replaceSameDateTarget: true },
      });
    });

    const acceptRequest = mockFetch.mock.calls[0];
    expect(acceptRequest[0]).toBe(`/api/v1/adaptive-nutrition/check-ins/${checkIn.id}/accept`);
    expect(acceptRequest[1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(acceptRequest[1]?.body))).toEqual({ replaceSameDateTarget: true });
    for (const queryKey of [
      adaptiveNutritionQueryKey,
      nutritionTargetQueryKey,
      ['nutrition'],
      dashboardSnapshotQueryKeys.all,
      macroTrendQueryKeys.all,
    ]) {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey });
    }
  });

  it('edits and starts goals with strict payloads and adaptive invalidation', async () => {
    mockFetch.mockResolvedValueOnce(createJsonResponse(currentGoal)).mockResolvedValueOnce(
      createJsonResponse({
        ...currentGoal,
        goal: {
          ...currentGoal.goal,
          id: 'goal-2',
          type: 'gain',
          targetWeightKg: 86,
          goalRatePctPerWeek: 0.25,
        },
      }),
    );
    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const editHook = renderHook(() => useEditAdaptiveGoal(), { wrapper });
    const startHook = renderHook(() => useStartAdaptiveGoal(), { wrapper });

    await act(async () => {
      await editHook.result.current.mutateAsync({
        id: 'goal-1',
        input: {
          type: 'lose',
          targetWeightKg: 74,
          maintenanceCenterKg: null,
          goalRatePctPerWeek: -0.6,
          supersedePendingRecommendation: true,
          expectedRevisionId: 'revision-1',
        },
      });
    });
    expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/adaptive-nutrition/goals/goal-1');
    expect(mockFetch.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'PATCH' }));
    expect(JSON.parse(String(mockFetch.mock.calls[0][1]?.body))).toEqual({
      type: 'lose',
      targetWeightKg: 74,
      maintenanceCenterKg: null,
      goalRatePctPerWeek: -0.6,
      supersedePendingRecommendation: true,
      expectedRevisionId: 'revision-1',
    });

    await act(async () => {
      await startHook.result.current.mutateAsync({
        type: 'gain',
        targetWeightKg: 86,
        maintenanceCenterKg: null,
        goalRatePctPerWeek: 0.25,
        supersedePendingRecommendation: false,
      });
    });
    expect(mockFetch.mock.calls[1][0]).toBe('/api/v1/adaptive-nutrition/goals');
    expect(mockFetch.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: adaptiveNutritionQueryKey });
  });

  it('paginates goal history and parses server-authoritative trend details', async () => {
    const historySummary = {
      goal: {
        ...currentGoal.goal,
        status: 'completed' as const,
        finalTrendWeightKg: 80,
        endedLocalDate: '2026-08-13',
        endedReason: 'completed' as const,
      },
      latestRevision: currentGoal.latestRevision,
      finalTrendWeightKg: 80,
      netChangeKg: -2,
      durationDays: null,
    };
    const goalDetail = {
      goal: currentGoal.goal,
      revisions: [currentGoal.latestRevision],
      acceptedCheckIns: [],
      trendPoints: [
        {
          kind: 'weight_change',
          date: '2026-07-01',
          trendWeightKg: 82,
          scaleWeightKg: 82.1,
          goalRevisionId: 'revision-1',
          revisionSequence: 1,
          targetWeightKg: 75,
          completedDistanceKg: 0,
          remainingDistanceKg: 7,
          percentComplete: 0,
        },
        {
          kind: 'weight_change',
          date: '2026-07-08',
          trendWeightKg: 81.5,
          scaleWeightKg: null,
          goalRevisionId: 'revision-1',
          revisionSequence: 1,
          targetWeightKg: 75,
          completedDistanceKg: 0.5,
          remainingDistanceKg: 6.5,
          percentComplete: 7.143,
        },
      ],
      completion: null,
    };
    mockFetch
      .mockResolvedValueOnce(createJsonResponse([historySummary], { page: 1, limit: 1, total: 2 }))
      .mockResolvedValueOnce(createJsonResponse(goalDetail));
    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    const historyHook = renderHook(() => useInfiniteAdaptiveGoalHistory(1), { wrapper });
    const detailHook = renderHook(() => useAdaptiveGoalDetail('goal-1'), { wrapper });

    await waitFor(() => expect(historyHook.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detailHook.result.current.isSuccess).toBe(true));
    expect(historyHook.result.current.data?.pages[0]?.data[0]?.netChangeKg).toBe(-2);
    expect(historyHook.result.current.hasNextPage).toBe(true);
    expect(detailHook.result.current.data?.trendPoints).toHaveLength(2);
    mockFetch.mockResolvedValueOnce(
      createJsonResponse(
        [
          {
            ...historySummary,
            goal: {
              ...historySummary.goal,
              id: 'goal-older',
              startedLocalDate: '2026-06-01',
              endedLocalDate: '2026-06-30',
            },
            latestRevision: {
              ...historySummary.latestRevision,
              id: 'revision-older',
              goalId: 'goal-older',
              effectiveLocalDate: '2026-06-01',
            },
          },
        ],
        { page: 2, limit: 1, total: 2 },
      ),
    );
    await act(async () => {
      await historyHook.result.current.fetchNextPage();
    });
    await waitFor(() => expect(historyHook.result.current.data?.pages).toHaveLength(2));
    expect(historyHook.result.current.hasNextPage).toBe(false);
    expect(mockFetch.mock.calls.map((call) => call[0])).toEqual([
      '/api/v1/adaptive-nutrition/goals?page=1&limit=1',
      '/api/v1/adaptive-nutrition/goals/goal-1',
      '/api/v1/adaptive-nutrition/goals?page=2&limit=1',
    ]);
  });

  it('completes a goal with optimistic identifiers and invalidates all adaptive reads', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        ...currentGoal,
        goal: {
          ...currentGoal.goal,
          id: 'maintenance-goal',
          type: 'maintain',
          targetWeightKg: null,
          maintenanceCenterKg: 75,
          goalRatePctPerWeek: 0,
        },
        latestRevision: {
          ...currentGoal.latestRevision,
          id: 'maintenance-revision',
          goalId: 'maintenance-goal',
          targetWeightKg: null,
          maintenanceCenterKg: 75,
          goalRatePctPerWeek: 0,
          previousTargetWeightKg: null,
          previousCenterKg: 75,
          previousRatePctPerWeek: 0,
          reason: 'goal_completion',
        },
        progress: {
          kind: 'maintenance',
          goalId: 'maintenance-goal',
          goalRevisionId: 'maintenance-revision',
          revisionSequence: 1,
          startedLocalDate: '2026-08-13',
          currentLocalDate: '2026-08-13',
          currentTrendWeightKg: 75,
          latestScaleWeightKg: 75,
          actualRateKgPerWeek: null,
          trendFreshness: 'fresh',
          confidence: 'High',
          provenance: 'valid_trend',
          type: 'maintain',
          centerWeightKg: 75,
          signedDistanceFromCenterKg: 0,
          rangeRadiusKg: 0.75,
          rangeLowerKg: 74.25,
          rangeUpperKg: 75.75,
          rangeStatus: 'within',
          daysWithinRange: 1,
          observedDays: 1,
          trendDirection: 'flat',
        },
      }),
    );
    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const completeHook = renderHook(() => useCompleteAdaptiveGoal(), { wrapper });

    await act(async () => {
      await completeHook.result.current.mutateAsync({
        id: 'goal-1',
        input: { checkInId: 'check-in-1', expectedRevisionId: 'revision-1' },
      });
    });
    expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/adaptive-nutrition/goals/goal-1/complete');
    expect(JSON.parse(String(mockFetch.mock.calls[0][1]?.body))).toEqual({
      checkInId: 'check-in-1',
      expectedRevisionId: 'revision-1',
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: adaptiveNutritionQueryKey });
  });

  it('builds stable hierarchical keys', () => {
    expect(adaptiveNutritionQueryKeys.state()).toEqual(['adaptive-nutrition', 'state']);
    expect(adaptiveNutritionQueryKeys.history(2, 10)).toEqual([
      'adaptive-nutrition',
      'check-ins',
      { limit: 10, page: 2 },
    ]);
    expect(adaptiveNutritionQueryKeys.detail('check-in-1')).toEqual([
      'adaptive-nutrition',
      'check-ins',
      'detail',
      'check-in-1',
    ]);
    expect(adaptiveNutritionQueryKeys.goalHistory(2, 10)).toEqual([
      'adaptive-nutrition',
      'goals',
      { limit: 10, page: 2 },
    ]);
    expect(adaptiveNutritionQueryKeys.goalHistoryInfinite(20)).toEqual([
      'adaptive-nutrition',
      'goals',
      'infinite',
      { limit: 20 },
    ]);
    expect(adaptiveNutritionQueryKeys.goalDetail('goal-1')).toEqual([
      'adaptive-nutrition',
      'goals',
      'detail',
      'goal-1',
    ]);
  });
});
