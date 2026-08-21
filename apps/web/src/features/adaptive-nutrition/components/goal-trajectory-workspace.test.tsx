import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdaptiveGoalTrajectory } from '@pulse/shared';

import { useAdaptiveGoalTrajectory } from '../api/adaptive-nutrition';
import { GoalTrajectoryWorkspace } from './goal-trajectory-workspace';

vi.mock('../api/adaptive-nutrition', () => ({ useAdaptiveGoalTrajectory: vi.fn() }));
vi.mock('@/hooks/use-weight-unit', () => ({ useWeightUnit: () => ({ weightUnit: 'lbs' }) }));
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">
        {React.isValidElement(children)
          ? React.cloneElement(
              children as React.ReactElement<{ height?: number; width?: number }>,
              { height: 320, width: 720 },
            )
          : children}
      </div>
    ),
  };
});

const trajectory: AdaptiveGoalTrajectory = {
  algorithmVersion: 'adaptive-tdee-v1',
  trendSource: 'adaptive_model_trend',
  timeZone: 'America/Detroit',
  isHistorical: false,
  goal: {
    id: 'goal-1',
    userId: 'user-1',
    programId: 'program-1',
    type: 'lose',
    status: 'active',
    startTrendWeightKg: 100,
    startScaleWeightKg: 100.2,
    finalTrendWeightKg: null,
    targetWeightKg: 90,
    maintenanceCenterKg: null,
    goalRatePctPerWeek: -0.5,
    startedLocalDate: '2026-07-01',
    endedLocalDate: null,
    endedReason: null,
    createdAt: 1,
    updatedAt: 2,
  },
  activeRevision: {
    id: 'revision-2',
    goalId: 'goal-1',
    userId: 'user-1',
    sequence: 2,
    targetWeightKg: 90,
    maintenanceCenterKg: null,
    goalRatePctPerWeek: -0.5,
    previousTargetWeightKg: 92,
    previousCenterKg: null,
    previousRatePctPerWeek: -0.4,
    reason: 'user_edit',
    effectiveLocalDate: '2026-08-01',
    createdAt: 2,
  },
  range: { preset: '3m', startDate: '2026-07-01', endDate: '2026-08-19' },
  strategyAsOfDate: '2026-08-20',
  evidenceThroughDate: '2026-08-19',
  currentTrendDate: '2026-08-19',
  summary: {
    kind: 'weight_change',
    type: 'lose',
    startTrendWeightKg: 100,
    currentTrendWeightKg: 97,
    currentTrendDate: '2026-08-19',
    latestScale: { entryId: 'weight-2', date: '2026-08-20', weightKg: 97.5 },
    targetWeightKg: 90,
    originalPlannedChangeKg: 8,
    revisionAdjustmentKg: 2,
    totalPlannedChangeKg: 10,
    completedChangeKg: 3,
    remainingChangeKg: 7,
    percentComplete: 30,
    selectedRatePctPerWeek: -0.5,
    selectedRateKgPerWeek: -0.485,
    paceState: 'slower_than_selected',
  },
  actualRate: {
    lookbackDays: 21,
    kgPerWeek: -0.3,
    pctPerWeek: -0.309,
    startDate: '2026-07-30',
    endDate: '2026-08-19',
    trendPointCount: 21,
    observedWeightCount: 5,
    spanDays: 20,
    confidence: 'supported',
    status: 'available',
    unavailableReason: null,
  },
  forecast: {
    status: 'available',
    basis: 'actual_rate',
    projectedStartDate: '2027-01-20',
    projectedCenterDate: '2027-02-01',
    projectedEndDate: '2027-02-14',
    projectedWeeks: 23.33333333,
    etaChangeFromGoalStartDays: 21,
    etaChangeFromLatestRevisionDays: 9,
    unavailableReason: null,
    explanationCode: 'ETA_LATER',
    points: [
      {
        date: '2026-08-20',
        expectedTrendWeightKg: 97,
        fasterTrendWeightKg: 97,
        slowerTrendWeightKg: 97,
      },
      {
        date: '2027-02-14',
        expectedTrendWeightKg: 90,
        fasterTrendWeightKg: 90,
        slowerTrendWeightKg: 91.4,
      },
    ],
  },
  context: {
    calorieTargetKcal: 2100,
    calorieTargetEffectiveDate: '2026-08-01',
    adaptiveExpenditureKcal: 2500,
    expenditureSourceCheckInId: 'check-in-1',
    expenditureSourceInputFingerprint: 'a'.repeat(64),
  },
  trendPoints: [
    {
      date: '2026-07-01',
      trendWeightKg: 100,
      modeledWeightKg: 100,
      sourceEntryId: 'weight-1',
      interpolated: false,
      goalRevisionId: 'revision-1',
      revisionSequence: 1,
      targetWeightKg: 92,
      maintenanceCenterKg: null,
      maintenanceLowerKg: null,
      maintenanceUpperKg: null,
      section: 'historical',
    },
    {
      date: '2026-08-19',
      trendWeightKg: 97,
      modeledWeightKg: 96.9,
      sourceEntryId: 'weight-2',
      interpolated: false,
      goalRevisionId: 'revision-2',
      revisionSequence: 2,
      targetWeightKg: 90,
      maintenanceCenterKg: null,
      maintenanceLowerKg: null,
      maintenanceUpperKg: null,
      section: 'current',
    },
  ],
  weeklyContributions: [
    {
      periodStartDate: '2026-07-01',
      periodEndDate: '2026-07-07',
      startTrendWeightKg: 100,
      endTrendWeightKg: 99.5,
      movementTowardTargetKg: 0.5,
      direction: 'toward',
      observedWeightCount: 2,
      remainingDistanceKg: 7.5,
      reasonCode: null,
    },
    {
      periodStartDate: '2026-07-08',
      periodEndDate: '2026-07-14',
      startTrendWeightKg: 99.5,
      endTrendWeightKg: null,
      movementTowardTargetKg: null,
      direction: 'insufficient_evidence',
      observedWeightCount: 0,
      remainingDistanceKg: null,
      reasonCode: 'INSUFFICIENT_WEEKLY_EVIDENCE',
    },
  ],
  annotations: [
    {
      id: 'start',
      date: '2026-07-01',
      kind: 'goal_started',
      label: 'Goal started',
      goalRevisionId: 'revision-1',
      revisionSequence: 1,
      checkInId: null,
    },
    {
      id: 'revision',
      date: '2026-08-01',
      kind: 'goal_revised',
      label: 'Target and pace revised',
      goalRevisionId: 'revision-2',
      revisionSequence: 2,
      checkInId: null,
    },
  ],
  completionReview: {
    toleranceKg: 0.23,
    trendTargetStatus: 'not_reached',
    scaleTargetStatus: 'not_reached',
    completionReviewRequired: false,
    completionAllowed: false,
    reasonCode: 'TARGET_NOT_REACHED',
  },
};

describe('GoalTrajectoryWorkspace', () => {
  beforeEach(() => {
    vi.mocked(useAdaptiveGoalTrajectory).mockReturnValue({
      data: trajectory,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdaptiveGoalTrajectory>);
  });

  it('renders server-owned loss pace, ETA, consent, revisions, and honest weekly evidence', () => {
    render(<GoalTrajectoryWorkspace goalId="goal-1" />);

    expect(screen.getByRole('heading', { name: 'Lose to 198.4 lbs' })).toBeInTheDocument();
    expect(screen.getByText('Slower than selected')).toBeInTheDocument();
    expect(screen.getByText('30% complete')).toBeInTheDocument();
    expect(screen.getByText('21 days later')).toBeInTheDocument();
    expect(
      screen.getByText(/will not increase a deficit or surplus to catch up/),
    ).toBeInTheDocument();
    expect(screen.getByText('Not enough evidence')).toBeInTheDocument();
    expect(screen.getByText(/missing evidence is not treated as zero/)).toBeInTheDocument();
    expect(screen.getAllByText('Target and pace revised').length).toBeGreaterThan(0);
  });

  it('keeps chart range separate from the selected pace lookback', () => {
    render(<GoalTrajectoryWorkspace goalId="goal-1" />);
    fireEvent.click(screen.getByRole('button', { name: '1M' }));
    fireEvent.change(screen.getByLabelText('Recent pace lookback'), { target: { value: '28' } });

    expect(useAdaptiveGoalTrajectory).toHaveBeenLastCalledWith('goal-1', {
      range: '1m',
      lookbackDays: 28,
      end: undefined,
    });
    expect(screen.getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders sparse data without a fabricated ETA or invalid chart domain', () => {
    vi.mocked(useAdaptiveGoalTrajectory).mockReturnValue({
      data: {
        ...trajectory,
        currentTrendDate: null,
        trendPoints: [],
        summary: {
          ...trajectory.summary,
          currentTrendWeightKg: null,
          currentTrendDate: null,
          completedChangeKg: null,
          remainingChangeKg: null,
          percentComplete: null,
          paceState: 'insufficient_data',
        },
        actualRate: {
          ...trajectory.actualRate,
          kgPerWeek: null,
          pctPerWeek: null,
          startDate: null,
          endDate: null,
          trendPointCount: 0,
          observedWeightCount: 0,
          spanDays: 0,
          confidence: 'insufficient',
          status: 'unavailable',
          unavailableReason: 'INSUFFICIENT_TREND',
        },
        forecast: {
          status: 'unavailable',
          basis: 'none',
          projectedStartDate: null,
          projectedCenterDate: null,
          projectedEndDate: null,
          projectedWeeks: null,
          etaChangeFromGoalStartDays: null,
          etaChangeFromLatestRevisionDays: null,
          unavailableReason: 'INSUFFICIENT_TREND',
          explanationCode: 'NO_RELIABLE_ETA',
          points: [],
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdaptiveGoalTrajectory>);

    render(<GoalTrajectoryWorkspace goalId="goal-1" />);
    expect(screen.getByText('Building a reliable trend')).toBeInTheDocument();
    expect(screen.getByText('No reliable estimate yet')).toBeInTheDocument();
    expect(screen.getByText(/No supported model trend is available/)).toBeInTheDocument();
  });

  it.each([
    ['reached', null, /supported Adaptive model trend is inside the target tolerance/u],
    ['historical', null, /historical goal is closed/u],
    ['unavailable', 'MOVING_AWAY', /recent trend is moving away from the target/u],
    ['unavailable', 'RATE_TOO_SMALL', /supported recent trend is essentially flat/u],
    ['unavailable', 'STALE_WEIGHT', /Recent weigh-in evidence is stale/u],
    ['unavailable', 'SUSPECT_WEIGHT_DATA', /found suspect weight evidence/u],
    ['unavailable', 'LIMITED_TREND_CONFIDENCE', /evidence is still limited/u],
  ] as const)(
    'renders honest %s forecast explanation for %s',
    (status, unavailableReason, expectedCopy) => {
      const forecast: AdaptiveGoalTrajectory['forecast'] =
        status === 'historical'
          ? null
          : status === 'reached'
            ? {
                status: 'reached',
                basis: 'none',
                projectedStartDate: null,
                projectedCenterDate: null,
                projectedEndDate: null,
                projectedWeeks: 0,
                etaChangeFromGoalStartDays: null,
                etaChangeFromLatestRevisionDays: null,
                unavailableReason: null,
                explanationCode: 'TARGET_REACHED',
                points: [],
              }
            : {
                status: 'unavailable',
                basis: 'none',
                projectedStartDate: null,
                projectedCenterDate: null,
                projectedEndDate: null,
                projectedWeeks: null,
                etaChangeFromGoalStartDays: null,
                etaChangeFromLatestRevisionDays: null,
                unavailableReason,
                explanationCode: 'NO_RELIABLE_ETA',
                points: [],
              };
      vi.mocked(useAdaptiveGoalTrajectory).mockReturnValue({
        data: {
          ...trajectory,
          isHistorical: status === 'historical',
          goal:
            status === 'historical'
              ? { ...trajectory.goal, status: 'completed', endedLocalDate: '2026-08-19' }
              : trajectory.goal,
          forecast,
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useAdaptiveGoalTrajectory>);

      render(<GoalTrajectoryWorkspace goalId="goal-1" />);
      expect(screen.getByText(expectedCopy)).toBeInTheDocument();
      if (status === 'reached') {
        expect(
          screen.queryByText(/not have enough supported trend history/u),
        ).not.toBeInTheDocument();
      }
      if (status === 'historical') {
        expect(screen.getByText('Goal closed Aug 19, 2026')).toBeInTheDocument();
        expect(screen.getByText('Calorie target at goal end')).toBeInTheDocument();
        expect(screen.getByText('Adaptive expenditure at goal end')).toBeInTheDocument();
        expect(screen.getByText(/historical record cannot change your plan/u)).toBeInTheDocument();
        expect(screen.getByText(/Latest scale evidence in this goal/u)).toBeInTheDocument();
        expect(screen.queryByText('No reliable estimate yet')).not.toBeInTheDocument();
        expect(screen.queryByText(/Your next check-in reviews/u)).not.toBeInTheDocument();
      }
    },
  );

  it('describes a neutral completed week without claiming movement toward the target', () => {
    vi.mocked(useAdaptiveGoalTrajectory).mockReturnValue({
      data: {
        ...trajectory,
        weeklyContributions: [
          {
            periodStartDate: '2026-07-15',
            periodEndDate: '2026-07-21',
            startTrendWeightKg: 99,
            endTrendWeightKg: 99,
            movementTowardTargetKg: 0,
            direction: 'neutral',
            observedWeightCount: 3,
            remainingDistanceKg: 9,
            reasonCode: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdaptiveGoalTrajectory>);

    render(<GoalTrajectoryWorkspace goalId="goal-1" />);
    expect(screen.getByText('Neutral')).toBeInTheDocument();
    expect(screen.getByText(/No net movement toward or away from target/u)).toBeInTheDocument();
    expect(screen.queryByText(/0 lbs toward target/u)).not.toBeInTheDocument();
  });

  it('renders maintenance band and supported time-in-range without ETA', () => {
    vi.mocked(useAdaptiveGoalTrajectory).mockReturnValue({
      data: {
        ...trajectory,
        goal: {
          ...trajectory.goal,
          type: 'maintain',
          targetWeightKg: null,
          maintenanceCenterKg: 82,
          goalRatePctPerWeek: 0,
        },
        activeRevision: {
          ...trajectory.activeRevision,
          targetWeightKg: null,
          maintenanceCenterKg: 82,
          goalRatePctPerWeek: 0,
        },
        summary: {
          kind: 'maintenance',
          startTrendWeightKg: 82,
          currentTrendWeightKg: 82.4,
          currentTrendDate: '2026-08-19',
          latestScale: trajectory.summary.latestScale,
          centerWeightKg: 82,
          rangeRadiusKg: 0.82,
          rangeLowerKg: 81.18,
          rangeUpperKg: 82.82,
          signedDistanceFromCenterKg: 0.4,
          rangeStatus: 'within',
          correctionPolicy: 'review_only_no_automatic_change',
          timeInRange: {
            intervalStartDate: '2026-07-01',
            intervalEndDate: '2026-08-19',
            modeledDays: 40,
            daysWithinRange: 32,
            timeInRangeFraction: 0.8,
            evidenceStatus: 'supported',
          },
        },
        forecast: null,
        weeklyContributions: [],
        completionReview: {
          toleranceKg: 0.23,
          trendTargetStatus: 'unavailable',
          scaleTargetStatus: 'unavailable',
          completionReviewRequired: false,
          completionAllowed: false,
          reasonCode: 'MAINTENANCE_NOT_APPLICABLE',
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdaptiveGoalTrajectory>);

    render(<GoalTrajectoryWorkspace goalId="goal-1" />);
    expect(screen.getByRole('heading', { name: 'Maintain around 180.8 lbs' })).toBeInTheDocument();
    expect(screen.getByText('In maintenance range')).toBeInTheDocument();
    expect(screen.getByText('32 of 40 modeled days · 80%')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Forecast explanation' })).not.toBeInTheDocument();
  });

  it('exposes loading and retryable error states without mutation controls', () => {
    const refetch = vi.fn();
    vi.mocked(useAdaptiveGoalTrajectory).mockReturnValue({ isLoading: true } as ReturnType<
      typeof useAdaptiveGoalTrajectory
    >);
    const { rerender } = render(<GoalTrajectoryWorkspace goalId="goal-1" />);
    expect(screen.getByRole('status', { name: 'Loading goal trajectory' })).toBeInTheDocument();

    vi.mocked(useAdaptiveGoalTrajectory).mockReturnValue({
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useAdaptiveGoalTrajectory>);
    rerender(<GoalTrajectoryWorkspace goalId="goal-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry trajectory' }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('Your goal and nutrition targets are safe');
  });
});
