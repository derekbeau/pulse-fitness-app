import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  ADAPTIVE_TDEE_CONSTANTS,
  type AdaptiveCheckInDetail,
  type AdaptiveNutritionState,
} from '@pulse/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';

import { AdaptiveCoach } from './adaptive-coach';

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  decline: vi.fn(),
  completeGoal: vi.fn(),
  editGoal: vi.fn(),
  preview: vi.fn(),
  putProgram: vi.fn(),
  startGoal: vi.fn(),
  useCheckIn: vi.fn(),
  useHistory: vi.fn(),
  useGoalHistory: vi.fn(),
  useGoalDetail: vi.fn(),
  useLatestWeight: vi.fn(),
  useState: vi.fn(),
  weightUnit: 'lbs' as 'kg' | 'lbs',
}));

vi.mock('../api/adaptive-nutrition', () => ({
  useAdaptiveNutritionState: mocks.useState,
  useAdaptiveNutritionCheckIn: mocks.useCheckIn,
  useAdaptiveNutritionHistory: mocks.useHistory,
  useAdaptiveGoalHistory: mocks.useGoalHistory,
  useInfiniteAdaptiveGoalHistory: mocks.useGoalHistory,
  useAdaptiveGoalDetail: mocks.useGoalDetail,
  useAcceptAdaptiveNutritionCheckIn: () => ({ isPending: false, mutateAsync: mocks.accept }),
  useDeclineAdaptiveNutritionCheckIn: () => ({ isPending: false, mutateAsync: mocks.decline }),
  useCompleteAdaptiveGoal: () => ({ isPending: false, mutateAsync: mocks.completeGoal }),
  useEditAdaptiveGoal: () => ({ isPending: false, mutateAsync: mocks.editGoal }),
  usePreviewAdaptiveNutritionCheckIn: () => ({ isPending: false, mutateAsync: mocks.preview }),
  usePutAdaptiveNutritionProgram: () => ({ isPending: false, mutateAsync: mocks.putProgram }),
  useStartAdaptiveGoal: () => ({ isPending: false, mutateAsync: mocks.startGoal }),
}));

vi.mock('@/features/weight/api/weight', () => ({
  useLatestWeight: mocks.useLatestWeight,
}));

vi.mock('@/hooks/use-weight-unit', () => ({
  useWeightUnit: () => ({ weightUnit: mocks.weightUnit, formatWeight: vi.fn() }),
}));

const program = {
  id: 'program-1',
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
  createdAt: 1,
  updatedAt: 1,
};

const target = {
  id: 'target-1',
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

const activeGoal = {
  id: 'goal-1',
  userId: 'user-1',
  programId: program.id,
  type: 'lose' as const,
  status: 'active' as const,
  targetWeightKg: 75,
  maintenanceCenterKg: null,
  goalRatePctPerWeek: -0.5,
  startTrendWeightKg: 82,
  startScaleWeightKg: 82.2,
  finalTrendWeightKg: null,
  startedLocalDate: '2026-07-01',
  endedLocalDate: null,
  endedReason: null,
  createdAt: 1,
  updatedAt: 1,
};

const lossProgress = {
  kind: 'weight_change' as const,
  goalId: activeGoal.id,
  goalRevisionId: 'goal-revision-1',
  revisionSequence: 1,
  startedLocalDate: activeGoal.startedLocalDate,
  currentLocalDate: '2026-08-13',
  currentTrendWeightKg: 79.5,
  latestScaleWeightKg: 79.8,
  actualRateKgPerWeek: -0.35,
  trendFreshness: 'fresh' as const,
  confidence: 'High' as const,
  provenance: 'valid_trend' as const,
  type: 'lose' as const,
  startTrendWeightKg: activeGoal.startTrendWeightKg,
  targetWeightKg: 75,
  totalDistanceKg: 7,
  completedDistanceKg: 2.5,
  remainingDistanceKg: 4.5,
  percentComplete: 35.714,
  desiredRatePctPerWeek: -0.5,
  desiredRateKgPerWeek: -0.3975,
  trajectory: 'toward_goal' as const,
  status: 'on_track' as const,
  desiredProjection: {
    basis: 'desired' as const,
    weeks: 11.32,
    projectedStartDate: '2026-10-17',
    projectedEndDate: '2026-11-04',
    unavailableReason: null,
  },
  actualProjection: {
    basis: 'actual' as const,
    weeks: 12.86,
    projectedStartDate: '2026-10-23',
    projectedEndDate: '2026-11-28',
    unavailableReason: null,
  },
};

const goalRevision = {
  id: 'goal-revision-1',
  goalId: activeGoal.id,
  userId: activeGoal.userId,
  sequence: 1,
  targetWeightKg: 75,
  maintenanceCenterKg: null,
  goalRatePctPerWeek: -0.5,
  previousTargetWeightKg: 75,
  previousCenterKg: null,
  previousRatePctPerWeek: -0.5,
  reason: 'created' as const,
  effectiveLocalDate: activeGoal.startedLocalDate,
  createdAt: 1,
};

const detail: AdaptiveCheckInDetail = {
  id: 'check-in-1',
  goalId: null,
  goalRevisionId: null,
  kind: 'manual',
  status: 'pending',
  calculationState: 'updating',
  localDate: '2026-08-13',
  analysisStart: '2026-07-23',
  analysisEnd: '2026-08-12',
  includeToday: false,
  algorithmVersion: 'adaptive-tdee-v1',
  dataFingerprint: 'b'.repeat(64),
  reasonCodes: [],
  priorTdeeKcal: 2400,
  observedTdeeKcal: 2510,
  proposedTdeeKcal: 2440,
  currentTargets: target,
  proposedTargets: {
    calories: 2340,
    protein: 180,
    carbs: 248,
    fat: 70,
    effectiveDate: '2026-08-13',
  },
  acceptedNutritionTargetId: null,
  resolvedAt: null,
  createdAt: 1,
  inputSnapshot: {
    version: 1,
    constants: ADAPTIVE_TDEE_CONSTANTS,
    program: {
      status: program.status,
      timeZone: program.timeZone,
      rmrEquation: program.rmrEquation,
      heightCm: program.heightCm,
      birthDate: program.birthDate,
      activityLevel: program.activityLevel,
      activityMultiplier: program.activityMultiplier,
      estimatedRmrKcal: program.estimatedRmrKcal,
      calculatedBaselineTdeeKcal: program.calculatedBaselineTdeeKcal,
      manualBaselineTdeeKcal: program.manualBaselineTdeeKcal,
      baselineTdeeKcal: program.baselineTdeeKcal,
      goalType: program.goalType,
      targetWeightKg: program.targetWeightKg,
      goalRatePctPerWeek: program.goalRatePctPerWeek,
      proteinGrams: program.proteinGrams,
      fatAllocationPct: program.fatAllocationPct,
      systemCalorieFloorKcal: program.systemCalorieFloorKcal,
      userCalorieFloorKcal: program.userCalorieFloorKcal,
      algorithmVersion: program.algorithmVersion,
    },
    priorTdee: { checkInId: 'accepted-1', tdeeKcal: 2400 },
    currentTarget: {
      id: target.id,
      calories: target.calories,
      protein: target.protein,
      carbs: target.carbs,
      fat: target.fat,
      source: target.source,
      adaptiveCheckInId: target.adaptiveCheckInId,
      macroCalories: target.macroCalories,
      effectiveDate: target.effectiveDate,
      updatedAt: target.updatedAt,
    },
    boundaries: {
      previewDate: '2026-08-13',
      analysisStart: '2026-07-23',
      analysisEnd: '2026-08-12',
      warmupStart: '2026-07-02',
    },
    includeToday: false,
    nutritionDays: [
      {
        id: 'nutrition-1',
        date: '2026-08-01',
        status: 'complete',
        calories: 2300,
        itemCount: 4,
        updatedAt: 1,
      },
    ],
    weightEntries: [
      { id: 'weight-1', date: '2026-08-01', weightKg: 82, updatedAt: 1 },
      { id: 'weight-2', date: '2026-08-12', weightKg: 81.8, updatedAt: 1 },
    ],
  },
  calculationSnapshot: {
    algorithmVersion: 'adaptive-tdee-v1',
    inputFingerprint: 'b'.repeat(64),
    kind: 'manual',
    boundaries: {
      previewDate: '2026-08-13',
      analysisStart: '2026-07-23',
      analysisEnd: '2026-08-12',
      warmupStart: '2026-07-02',
    },
    reasonCodes: [],
    suspectWeightEntryIds: [],
    suspectWeightEntries: [],
    excludedNutritionDates: [],
    completeNutritionDays: 12,
    actualWeightCount: 3,
    trendPointCount: 21,
    averageDailyIntakeKcal: 2300,
    priorTdeeKcal: 2400,
    latestTrendWeightKg: 82,
    state: 'updating',
    weightTrendKgPerDay: -0.02,
    observedTdeeKcal: 2510,
    confidence: {
      score: 0.8,
      label: 'High',
      nutritionCoverage: 0.8,
      weightFrequency: 0.7,
      spanScore: 0.9,
      recencyScore: 1,
    },
    adaptiveUpdate: {
      priorTdeeKcal: 2400,
      observedTdeeKcal: 2510,
      blendedTdeeKcal: 2488,
      requestedChangeKcal: 31,
      limitedChangeKcal: 31,
      proposedTdeeKcal: 2440,
      limited: false,
      reasonCodes: [],
    },
    goal: {
      rawGoalCalories: 2440,
      goalCalories: 2440,
      desiredWeightChangeKgPerDay: 0,
      requestedCalorieAdjustment: 0,
      achievableGoalRatePctPerWeek: 0,
      goalReached: false,
      reasonCodes: [],
    },
    macros: {
      calories: 2340,
      protein: 180,
      carbs: 248,
      fat: 70,
      macroCalories: 2342,
      calorieDifference: -2,
    },
  },
};

function createState(
  state: AdaptiveNutritionState['state'],
  overrides: Partial<AdaptiveNutritionState> = {},
): AdaptiveNutritionState {
  return {
    state,
    program,
    currentTarget: target,
    latestAcceptedCheckIn: null,
    pendingCheckIn: state === 'pending_recommendation' ? detail : null,
    checkInDue: false,
    nextCheckInDate: '2026-08-20',
    eligibility: {
      eligible: state === 'updating' || state === 'pending_recommendation',
      completeNutritionDays: 8,
      requiredCompleteNutritionDays: 12,
      weighIns: 2,
      requiredWeighIns: 3,
      weightSpanDays: 9,
      requiredWeightSpanDays: 14,
      latestWeightAgeDays: 3,
      reasonCodes: state === 'holding' ? ['STALE_WEIGHT'] : ['INSUFFICIENT_NUTRITION'],
    },
    activeGoal,
    goalProgress: lossProgress,
    pendingGoalChange: null,
    goalActionRequired: null,
    ...overrides,
  };
}

describe('AdaptiveCoach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.weightUnit = 'lbs';
    mocks.useHistory.mockReturnValue({
      data: { data: [], meta: { page: 1, limit: 10, total: 0 } },
      isLoading: false,
      isError: false,
    });
    mocks.useGoalHistory.mockReturnValue({
      data: {
        pages: [
          {
            data: [
              {
                goal: activeGoal,
                latestRevision: goalRevision,
                finalTrendWeightKg: null,
                netChangeKg: null,
                durationDays: null,
              },
            ],
            meta: { page: 1, limit: 20, total: 1 },
          },
        ],
      },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });
    mocks.useGoalDetail.mockReturnValue({
      data: {
        goal: activeGoal,
        revisions: [goalRevision],
        acceptedCheckIns: [],
        trendPoints: [
          {
            kind: 'weight_change',
            date: '2026-07-01',
            trendWeightKg: 82,
            scaleWeightKg: 82.2,
            goalRevisionId: goalRevision.id,
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
            scaleWeightKg: 81.4,
            goalRevisionId: goalRevision.id,
            revisionSequence: 1,
            targetWeightKg: 75,
            completedDistanceKg: 0.5,
            remainingDistanceKg: 6.5,
            percentComplete: 7.143,
          },
        ],
        completion: null,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useLatestWeight.mockReturnValue({ data: null, isLoading: false });
    mocks.useCheckIn.mockReturnValue({ data: detail, isLoading: false, isError: false });
    mocks.useState.mockReturnValue({
      data: createState('learning'),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.preview.mockResolvedValue(detail);
    mocks.decline.mockResolvedValue({ ...detail, status: 'declined' });
    mocks.accept.mockResolvedValue({
      checkIn: { ...detail, status: 'accepted' },
      target: { ...target, source: 'adaptive', adaptiveCheckInId: detail.id },
    });
    mocks.editGoal.mockResolvedValue({});
    mocks.startGoal.mockResolvedValue({});
    mocks.completeGoal.mockResolvedValue({
      goal: {
        ...activeGoal,
        id: 'maintenance-goal',
        type: 'maintain',
        targetWeightKg: null,
        maintenanceCenterKg: 75,
        goalRatePctPerWeek: 0,
      },
    });
  });

  it.each([
    ['baseline', 'Your baseline is active'],
    ['learning', 'A stronger estimate is taking shape'],
    ['updating', 'Your Adaptive TDEE is active'],
    ['holding', 'Pulse needs better data before changing targets'],
  ] as const)('renders the %s Coach state', (stateName, heading) => {
    mocks.useState.mockReturnValue({
      data: createState(stateName),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AdaptiveCoach />);
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lose to 165.3 lbs' })).toBeInTheDocument();
  });

  it('distinguishes trend from scale and renders accessible loss progress and projections', () => {
    render(<AdaptiveCoach />);
    expect(screen.getByText('Current trend')).toBeInTheDocument();
    expect(screen.getByText('Latest scale')).toBeInTheDocument();
    expect(screen.getByText('175.3 lbs')).toBeInTheDocument();
    expect(screen.getByText('175.9 lbs')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: '36 percent of goal distance completed' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Oct 23, 2026 – Nov 28, 2026')).toBeInTheDocument();
  });

  it('renders gain progress in the preferred unit', () => {
    mocks.weightUnit = 'kg';
    const gainGoal = {
      ...activeGoal,
      type: 'gain' as const,
      targetWeightKg: 85,
      goalRatePctPerWeek: 0.25,
      startTrendWeightKg: 78,
      startScaleWeightKg: 78.2,
    };
    mocks.useState.mockReturnValue({
      data: createState('updating', {
        activeGoal: gainGoal,
        goalProgress: {
          ...lossProgress,
          goalId: gainGoal.id,
          type: 'gain',
          startTrendWeightKg: 78,
          currentTrendWeightKg: 80,
          latestScaleWeightKg: 80.2,
          targetWeightKg: 85,
          totalDistanceKg: 7,
          completedDistanceKg: 2,
          remainingDistanceKg: 5,
          percentComplete: 28.571,
          desiredRatePctPerWeek: 0.25,
          desiredRateKgPerWeek: 0.2,
          actualRateKgPerWeek: 0.18,
        },
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AdaptiveCoach />);
    expect(screen.getByRole('heading', { name: 'Gain to 85 kg' })).toBeInTheDocument();
    expect(screen.getByText('80 kg')).toBeInTheDocument();
    expect(screen.getAllByText('+0.2 kg/week')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Edit goal' }));
    expect(screen.getByLabelText('Target weight (kg)')).toHaveValue(85);
  });

  it('renders maintenance as a range without percent-complete language', () => {
    const maintenanceGoal = {
      ...activeGoal,
      type: 'maintain' as const,
      targetWeightKg: null,
      maintenanceCenterKg: 79.5,
      goalRatePctPerWeek: 0,
    };
    const maintenanceProgress = {
      kind: 'maintenance' as const,
      goalId: maintenanceGoal.id,
      goalRevisionId: 'goal-revision-maintain',
      revisionSequence: 2,
      startedLocalDate: maintenanceGoal.startedLocalDate,
      currentLocalDate: '2026-08-13',
      currentTrendWeightKg: 79.7,
      latestScaleWeightKg: 79.9,
      actualRateKgPerWeek: 0.02,
      trendFreshness: 'fresh' as const,
      confidence: 'High' as const,
      provenance: 'valid_trend' as const,
      type: 'maintain' as const,
      centerWeightKg: 79.5,
      signedDistanceFromCenterKg: 0.2,
      rangeRadiusKg: 0.795,
      rangeLowerKg: 78.705,
      rangeUpperKg: 80.295,
      rangeStatus: 'within' as const,
      daysWithinRange: 18,
      observedDays: 21,
      trendDirection: 'rising' as const,
    };
    mocks.useState.mockReturnValue({
      data: createState('updating', {
        activeGoal: maintenanceGoal,
        goalProgress: maintenanceProgress,
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AdaptiveCoach />);
    expect(screen.getByRole('heading', { name: 'Maintain around 175.3 lbs' })).toBeInTheDocument();
    expect(screen.getAllByText('Within range')).toHaveLength(2);
    expect(screen.getByText('Days in range')).toBeInTheDocument();
    expect(screen.queryByText(/percent|% complete/i)).not.toBeInTheDocument();
  });

  it('states why an actual completion projection is unavailable', () => {
    mocks.useState.mockReturnValue({
      data: createState('holding', {
        goalProgress: {
          ...lossProgress,
          actualProjection: {
            basis: 'actual',
            weeks: null,
            projectedStartDate: null,
            projectedEndDate: null,
            unavailableReason: 'STALE_WEIGHT',
          },
        },
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AdaptiveCoach />);
    expect(screen.getByText('A current weight is needed')).toBeInTheDocument();
  });

  it('prefills edit, reviews it, and requires explicit pending replacement confirmation', async () => {
    mocks.useState.mockReturnValue({
      data: createState('pending_recommendation'),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AdaptiveCoach />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit goal' }));
    expect(screen.getByLabelText('Target weight (lbs)')).toHaveValue(165.3);
    expect(screen.getByLabelText('Desired rate (% body weight/week)')).toHaveValue(0.5);
    fireEvent.change(screen.getByLabelText('Target weight (lbs)'), { target: { value: '160' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    expect(await screen.findByText('Confirm your updated goal')).toBeInTheDocument();
    const updateButton = screen.getByRole('button', { name: 'Update goal' });
    expect(updateButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(updateButton).toBeEnabled();
    fireEvent.click(updateButton);
    await waitFor(() =>
      expect(mocks.editGoal).toHaveBeenCalledWith({
        id: activeGoal.id,
        input: expect.objectContaining({
          expectedRevisionId: lossProgress.goalRevisionId,
          supersedePendingRecommendation: true,
          targetWeightKg: expect.any(Number),
          type: 'lose',
        }),
      }),
    );
  });

  it('requires a different direction and final confirmation for a new goal', async () => {
    render(<AdaptiveCoach />);
    fireEvent.click(screen.getByRole('button', { name: 'Start a new goal' }));
    expect(screen.getByText(/new direction starts a new progress period/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gain weight' }));
    fireEvent.change(screen.getByLabelText('Target weight (lbs)'), { target: { value: '190' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    expect(await screen.findByText('Confirm your new goal')).toBeInTheDocument();
    expect(
      screen.getByText(/Historical goals and learned expenditure remain intact/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start new goal' }));
    await waitFor(() =>
      expect(mocks.startGoal).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'gain', supersedePendingRecommendation: false }),
      ),
    );
  });

  it('offers goal selection when no active goal exists', () => {
    mocks.useState.mockReturnValue({
      data: createState('holding', {
        activeGoal: null,
        goalProgress: null,
        goalActionRequired: 'select_goal',
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AdaptiveCoach />);
    expect(
      screen.getByRole('heading', { name: 'Choose what you’re working toward' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start a new goal' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('What are you working toward next?')).toBeInTheDocument();
  });

  it('restores focus to the goal action after the dialog closes', async () => {
    render(<AdaptiveCoach />);
    const editButton = screen.getByRole('button', { name: 'Edit goal' });
    editButton.focus();
    fireEvent.click(editButton);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(editButton).toHaveFocus();
  });

  it('shows exact eligibility progress and a corrective holding action', () => {
    mocks.useState.mockReturnValue({
      data: createState('holding'),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AdaptiveCoach />);
    expect(screen.getByText('8 / 12')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('9 / 14')).toBeInTheDocument();
    expect(
      screen.getByText('Log a current weight before requesting another check-in.'),
    ).toBeInTheDocument();
  });

  it('explains a paused holding state even when data eligibility is healthy', () => {
    mocks.useState.mockReturnValue({
      data: createState('holding', {
        program: { ...program, status: 'paused' },
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
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AdaptiveCoach />);
    expect(screen.getByText('Coaching is paused')).toBeInTheDocument();
    expect(
      screen.getByText('Resume the program before requesting a recommendation.'),
    ).toBeInTheDocument();
  });

  it('renders pending comparison, attribution, details, and preferred-unit formatting', () => {
    mocks.useState.mockReturnValue({
      data: createState('pending_recommendation'),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<AdaptiveCoach />);
    expect(screen.getByText('Current and proposed targets')).toBeInTheDocument();
    expect(screen.getAllByText('+40 kcal')).toHaveLength(2);
    fireEvent.click(screen.getByText('How Pulse calculated this'));
    expect(screen.getByText('180.8 lbs')).toBeInTheDocument();
    expect(screen.getByText('High · 80%')).toBeInTheDocument();
    expect(screen.getByText('Complete dates used')).toBeInTheDocument();
  });

  it('attributes a goal-change recommendation and states that targets remain unchanged', () => {
    const goalChangeDetail = { ...detail, kind: 'goal_change' as const };
    mocks.useState.mockReturnValue({
      data: createState('pending_recommendation', { pendingCheckIn: goalChangeDetail }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useCheckIn.mockReturnValue({ data: goalChangeDetail, isLoading: false, isError: false });
    render(<AdaptiveCoach />);
    expect(screen.getByText('Goal update')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your goal changed. Your current nutrition targets stay in place until you accept this recommendation.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'What changed this recommendation' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Updated goal, target, or pace')).toBeInTheDocument();
  });

  it('shows the required equation-based baseline inputs and outputs in the setup preview', () => {
    const formulaProgram = {
      ...program,
      rmrEquation: 'mifflin_male' as const,
      heightCm: 178,
      birthDate: '1990-02-28',
      activityLevel: 'active' as const,
      activityMultiplier: 1.55,
      estimatedRmrKcal: 1700,
      calculatedBaselineTdeeKcal: 2635,
      manualBaselineTdeeKcal: null,
      baselineTdeeKcal: 2500,
    };
    const baselineDetail: AdaptiveCheckInDetail = {
      ...detail,
      kind: 'baseline',
      calculationState: 'baseline',
      priorTdeeKcal: null,
      proposedTdeeKcal: 2500,
      inputSnapshot: {
        ...detail.inputSnapshot,
        program: {
          ...detail.inputSnapshot.program,
          status: formulaProgram.status,
          timeZone: formulaProgram.timeZone,
          rmrEquation: formulaProgram.rmrEquation,
          heightCm: formulaProgram.heightCm,
          birthDate: formulaProgram.birthDate,
          activityLevel: formulaProgram.activityLevel,
          activityMultiplier: formulaProgram.activityMultiplier,
          estimatedRmrKcal: formulaProgram.estimatedRmrKcal,
          calculatedBaselineTdeeKcal: formulaProgram.calculatedBaselineTdeeKcal,
          manualBaselineTdeeKcal: formulaProgram.manualBaselineTdeeKcal,
          baselineTdeeKcal: formulaProgram.baselineTdeeKcal,
        },
      },
      calculationSnapshot: {
        ...detail.calculationSnapshot,
        state: 'baseline',
        priorTdeeKcal: 2500,
        observedTdeeKcal: null,
        confidence: null,
        adaptiveUpdate: null,
        weightTrendKgPerDay: null,
      } as AdaptiveCheckInDetail['calculationSnapshot'],
    };
    mocks.useState.mockReturnValue({
      data: createState('pending_recommendation', {
        program: formulaProgram,
        pendingCheckIn: baselineDetail,
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useCheckIn.mockReturnValue({ data: baselineDetail, isLoading: false, isError: false });

    render(<AdaptiveCoach />);
    fireEvent.click(screen.getByText('How Pulse calculated this'));

    const setupDetails = screen.getByRole('region', { name: 'Starting estimate details' });
    expect(within(setupDetails).getByText('Estimated RMR')).toBeInTheDocument();
    expect(within(setupDetails).getByText('1,700 kcal')).toBeInTheDocument();
    expect(within(setupDetails).getByText('Activity multiplier')).toBeInTheDocument();
    expect(within(setupDetails).getByText('1.55')).toBeInTheDocument();
    expect(screen.getByText('Starting expenditure')).toBeInTheDocument();
    expect(screen.getAllByText('2,500 kcal').length).toBeGreaterThan(0);
    const comparison = screen.getByLabelText('Recommendation comparison');
    expect(within(comparison).getByText('Calories')).toBeInTheDocument();
    expect(within(comparison).getByText('Protein')).toBeInTheDocument();
    expect(within(comparison).getByText('Carbohydrates')).toBeInTheDocument();
    expect(within(comparison).getByText('Fat')).toBeInTheDocument();
    expect(
      screen.getByText(/multiple weeks of complete nutrition and weight data/i),
    ).toBeInTheDocument();
  });

  it('discloses a manual baseline without inventing equation inputs', () => {
    const baselineDetail: AdaptiveCheckInDetail = {
      ...detail,
      kind: 'baseline',
      calculationState: 'baseline',
      calculationSnapshot: {
        ...detail.calculationSnapshot,
        state: 'baseline',
        observedTdeeKcal: null,
        confidence: null,
        adaptiveUpdate: null,
        weightTrendKgPerDay: null,
      } as AdaptiveCheckInDetail['calculationSnapshot'],
    };
    mocks.useState.mockReturnValue({
      data: createState('pending_recommendation', { pendingCheckIn: baselineDetail }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useCheckIn.mockReturnValue({ data: baselineDetail, isLoading: false, isError: false });

    render(<AdaptiveCoach />);
    fireEvent.click(screen.getByText('How Pulse calculated this'));

    const setupDetails = screen.getByRole('region', { name: 'Starting estimate details' });
    expect(
      within(setupDetails).getByText(/starting expenditure was entered manually/i),
    ).toBeInTheDocument();
    expect(within(setupDetails).queryByText('Estimated RMR')).not.toBeInTheDocument();
    expect(within(setupDetails).queryByText('Activity multiplier')).not.toBeInTheDocument();
    expect(
      within(setupDetails).getByText(/multiple weeks of complete nutrition and weight data/i),
    ).toBeInTheDocument();
  });

  it('confirms same-date replacement before accepting and supports decline', async () => {
    const conflictDetail: AdaptiveCheckInDetail = {
      ...detail,
      reasonCodes: ['SAME_DATE_TARGET_EXISTS'],
    };
    mocks.useState.mockReturnValue({
      data: createState('pending_recommendation', { pendingCheckIn: conflictDetail }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useCheckIn.mockReturnValue({ data: conflictDetail, isLoading: false, isError: false });
    render(<AdaptiveCoach />);

    fireEvent.click(screen.getByRole('button', { name: 'Use these targets' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(mocks.accept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Replace target' }));
    await waitFor(() =>
      expect(mocks.accept).toHaveBeenCalledWith({
        id: detail.id,
        input: { replaceSameDateTarget: true },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Keep current' }));
    await waitFor(() => expect(mocks.decline).toHaveBeenCalledWith(detail.id));
  });

  it('recovers from a stale acceptance by generating a fresh preview', async () => {
    mocks.useState.mockReturnValue({
      data: createState('pending_recommendation'),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.accept.mockRejectedValueOnce(
      new ApiError(409, 'The recommendation is stale', 'CHECKIN_STALE'),
    );
    render(<AdaptiveCoach />);
    fireEvent.click(screen.getByRole('button', { name: 'Use these targets' }));
    await screen.findByText(/recommendation is out of date/i);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh recommendation' }));
    await waitFor(() =>
      expect(mocks.preview).toHaveBeenCalledWith({ kind: 'manual', includeToday: false }),
    );
  });

  it('recovers a stale baseline by explicitly rebaselining the existing program', async () => {
    const baselineDetail: AdaptiveCheckInDetail = { ...detail, kind: 'baseline' };
    mocks.useState.mockReturnValue({
      data: createState('pending_recommendation', { pendingCheckIn: baselineDetail }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useCheckIn.mockReturnValue({ data: baselineDetail, isLoading: false, isError: false });
    mocks.accept.mockRejectedValueOnce(
      new ApiError(409, 'The recommendation is stale', 'CHECKIN_STALE'),
    );
    mocks.putProgram.mockResolvedValueOnce(program);
    render(<AdaptiveCoach />);
    fireEvent.click(screen.getByRole('button', { name: 'Use these targets' }));
    await screen.findByText(/recommendation is out of date/i);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh recommendation' }));
    await waitFor(() =>
      expect(mocks.putProgram).toHaveBeenCalledWith(
        expect.objectContaining({ rebaseline: true, supersedePending: true }),
      ),
    );
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('keeps the maintenance transition explicit after accepting a reached goal', async () => {
    const goalDetail = {
      ...detail,
      reasonCodes: ['GOAL_REACHED' as const],
      calculationSnapshot: {
        ...detail.calculationSnapshot,
        goal: detail.calculationSnapshot.goal
          ? { ...detail.calculationSnapshot.goal, goalReached: true }
          : null,
      },
    };
    mocks.useState.mockReturnValue({
      data: createState('pending_recommendation', { pendingCheckIn: goalDetail }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useCheckIn.mockReturnValue({ data: goalDetail, isLoading: false, isError: false });
    mocks.accept.mockResolvedValueOnce({
      checkIn: { ...goalDetail, status: 'accepted' },
      target: { ...target, source: 'adaptive', adaptiveCheckInId: detail.id },
    });
    render(<AdaptiveCoach />);
    expect(
      screen.getByText(/then review goal completion before moving to maintenance/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use these targets' }));
    expect(
      await screen.findByText(/review goal completion before moving to maintenance/i),
    ).toBeInTheDocument();
  });

  it('offers load-more pagination when goal history exceeds the first 20 rows', () => {
    const fetchNextPage = vi.fn();
    mocks.useGoalHistory.mockReturnValue({
      data: {
        pages: [
          {
            data: [
              {
                goal: activeGoal,
                latestRevision: goalRevision,
                finalTrendWeightKg: null,
                netChangeKg: null,
                durationDays: null,
              },
            ],
            meta: { page: 1, limit: 20, total: 21 },
          },
        ],
      },
      isLoading: false,
      isError: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
      refetch: vi.fn(),
    });

    render(<AdaptiveCoach />);
    fireEvent.click(screen.getByRole('button', { name: 'Load more goals (1 of 21)' }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it('renders immutable goal history, revisions, linked check-ins, and chart text equivalents', async () => {
    const priorGoal = {
      ...activeGoal,
      id: 'goal-prior',
      status: 'replaced' as const,
      endedLocalDate: '2026-06-30',
      endedReason: 'direction_changed' as const,
    };
    mocks.useGoalHistory.mockReturnValue({
      data: {
        pages: [
          {
            data: [
              {
                goal: activeGoal,
                latestRevision: { ...goalRevision, sequence: 2, reason: 'user_edit' as const },
                finalTrendWeightKg: null,
                netChangeKg: null,
                durationDays: null,
              },
              {
                goal: { ...priorGoal, finalTrendWeightKg: 79.8 },
                latestRevision: { ...goalRevision, id: 'prior-revision', goalId: priorGoal.id },
                finalTrendWeightKg: 79.8,
                netChangeKg: -2.2,
                durationDays: 30,
              },
            ],
            meta: { page: 1, limit: 20, total: 2 },
          },
        ],
      },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });
    mocks.useGoalDetail.mockReturnValue({
      data: {
        goal: activeGoal,
        revisions: [
          goalRevision,
          {
            ...goalRevision,
            id: 'goal-revision-2',
            sequence: 2,
            targetWeightKg: 76,
            previousTargetWeightKg: 75,
            reason: 'user_edit' as const,
            effectiveLocalDate: '2026-07-15',
          },
        ],
        acceptedCheckIns: [
          {
            ...detail,
            goalId: activeGoal.id,
            goalRevisionId: 'goal-revision-2',
            status: 'accepted' as const,
          },
        ],
        trendPoints: [
          {
            kind: 'weight_change',
            date: '2026-07-01',
            trendWeightKg: 82,
            scaleWeightKg: 82.2,
            goalRevisionId: goalRevision.id,
            revisionSequence: 1,
            targetWeightKg: 75,
            completedDistanceKg: 0,
            remainingDistanceKg: 7,
            percentComplete: 0,
          },
          {
            kind: 'weight_change',
            date: '2026-07-08',
            trendWeightKg: 81.4,
            scaleWeightKg: 81.3,
            goalRevisionId: goalRevision.id,
            revisionSequence: 1,
            targetWeightKg: 75,
            completedDistanceKg: 0.6,
            remainingDistanceKg: 6.4,
            percentComplete: 8.571,
          },
          {
            kind: 'weight_change',
            date: '2026-07-15',
            trendWeightKg: 80.9,
            scaleWeightKg: null,
            goalRevisionId: 'goal-revision-2',
            revisionSequence: 2,
            targetWeightKg: 76,
            completedDistanceKg: 1.1,
            remainingDistanceKg: 4.9,
            percentComplete: 18.333,
          },
        ],
        completion: null,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AdaptiveCoach />);
    expect(screen.getByText('Prior goals')).toBeInTheDocument();
    expect(screen.getByText('Replaced')).toBeInTheDocument();
    const firstDetailButton = screen.getAllByRole('button', { name: 'View goal details' })[0];
    if (!firstDetailButton) throw new Error('Expected a current-goal detail action');
    fireEvent.click(firstDetailButton);
    expect(
      await screen.findByRole('heading', { name: 'Weekly goal progress' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /weekly trend-weight chart with 3 points/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Text equivalent of weekly goal trend and progress chart'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Targeted .* with a .* weekly rate\./)).toBeInTheDocument();
    expect(screen.getAllByText('Revision 2')).toHaveLength(2);
    expect(screen.getByText('Linked accepted check-ins')).toBeInTheDocument();
  });

  it('reviews and completes a reached goal without combining target acceptance', async () => {
    const accepted = {
      ...detail,
      goalId: activeGoal.id,
      goalRevisionId: goalRevision.id,
      status: 'accepted' as const,
      calculationSnapshot: {
        ...detail.calculationSnapshot,
        goal: detail.calculationSnapshot.goal
          ? { ...detail.calculationSnapshot.goal, goalReached: true }
          : null,
      },
    };
    mocks.useState.mockReturnValue({
      data: createState('updating', {
        latestAcceptedCheckIn: accepted,
        goalActionRequired: 'complete_goal',
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AdaptiveCoach />);
    fireEvent.click(screen.getByRole('button', { name: 'Review completion' }));
    expect(screen.getByRole('heading', { name: 'Review goal completion' })).toBeInTheDocument();
    expect(screen.getByText(/accepted nutrition target is already in place/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Review completion evidence'));
    expect(
      screen.getByText(/rechecks the trend tolerance and source fingerprint/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move to maintenance' }));
    await waitFor(() =>
      expect(mocks.completeGoal).toHaveBeenCalledWith({
        id: activeGoal.id,
        input: { checkInId: accepted.id, expectedRevisionId: goalRevision.id },
      }),
    );
    expect(await screen.findByText(/maintenance is now centered/i)).toBeInTheDocument();
  });

  it('fails stale completion closed and exposes a retry-safe action', async () => {
    const accepted = {
      ...detail,
      goalId: activeGoal.id,
      goalRevisionId: goalRevision.id,
      status: 'accepted' as const,
    };
    mocks.useState.mockReturnValue({
      data: createState('updating', {
        latestAcceptedCheckIn: accepted,
        goalActionRequired: 'complete_goal',
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.completeGoal.mockRejectedValueOnce(new ApiError(409, 'stale', 'CHECKIN_STALE'));

    render(<AdaptiveCoach />);
    fireEvent.click(screen.getByRole('button', { name: 'Review completion' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to maintenance' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/out of date.*unchanged/i);
    expect(screen.getByRole('button', { name: 'Refresh Coach state' })).toBeInTheDocument();
  });
});
