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
  preview: vi.fn(),
  putProgram: vi.fn(),
  useCheckIn: vi.fn(),
  useHistory: vi.fn(),
  useLatestWeight: vi.fn(),
  useState: vi.fn(),
}));

vi.mock('../api/adaptive-nutrition', () => ({
  useAdaptiveNutritionState: mocks.useState,
  useAdaptiveNutritionCheckIn: mocks.useCheckIn,
  useAdaptiveNutritionHistory: mocks.useHistory,
  useAcceptAdaptiveNutritionCheckIn: () => ({ isPending: false, mutateAsync: mocks.accept }),
  useDeclineAdaptiveNutritionCheckIn: () => ({ isPending: false, mutateAsync: mocks.decline }),
  usePreviewAdaptiveNutritionCheckIn: () => ({ isPending: false, mutateAsync: mocks.preview }),
  usePutAdaptiveNutritionProgram: () => ({ isPending: false, mutateAsync: mocks.putProgram }),
}));

vi.mock('@/features/weight/api/weight', () => ({
  useLatestWeight: mocks.useLatestWeight,
}));

vi.mock('@/hooks/use-weight-unit', () => ({
  useWeightUnit: () => ({ weightUnit: 'lbs', formatWeight: vi.fn() }),
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

const detail: AdaptiveCheckInDetail = {
  id: 'check-in-1',
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
    ...overrides,
  };
}

describe('AdaptiveCoach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useHistory.mockReturnValue({
      data: { data: [], meta: { page: 1, limit: 10, total: 0 } },
      isLoading: false,
      isError: false,
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

  it('announces the maintenance transition after accepting a reached goal', async () => {
    const goalDetail = {
      ...detail,
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
    fireEvent.click(screen.getByRole('button', { name: 'Use these targets' }));
    expect(await screen.findByText(/program is now in maintenance/i)).toBeInTheDocument();
  });
});
