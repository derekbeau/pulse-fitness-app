import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnergyBalanceAnalytics } from '@pulse/shared';

import { useAdaptiveEnergyBalance } from '../api/adaptive-nutrition';
import {
  buildExpenditureStateSegments,
  EnergyBalanceWorkspace,
  resolveMarkerChartDate,
} from './energy-balance-workspace';

vi.mock('../api/adaptive-nutrition', () => ({
  useAdaptiveEnergyBalance: vi.fn(),
}));

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
              { height: 280, width: 720 },
            )
          : children}
      </div>
    ),
  };
});

const fingerprint = 'a'.repeat(64);
const readiness = {
  eligible: true,
  completeNutritionDaysLogged: 13,
  completeNutritionDaysUsable: 12,
  completeNutritionDaysBeforeWeightTrend: 0,
  completeNutritionDaysAwaitingWeightTrend: 0,
  completeNutritionDaysPendingCutoff: 1,
  requiredCompleteNutritionDays: 12,
  weighInsLogged: 5,
  weighInsUsable: 4,
  weighInsPendingCutoff: 1,
  requiredWeighIns: 3,
  weightSpanDays: 20,
  requiredWeightSpanDays: 14,
  latestUsableWeightAgeDays: 1,
  analysisEndDate: '2026-08-17',
  pendingCutoffDate: '2026-08-18',
  timeZone: 'America/Detroit',
  noteCodes: [
    'COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF' as const,
    'WEIGH_INS_PENDING_COMPLETED_DAY_CUTOFF' as const,
  ],
  reasonCodes: [],
};

const analytics: EnergyBalanceAnalytics = {
  algorithmVersion: 'adaptive-tdee-v1',
  timeZone: 'America/Detroit',
  range: {
    preset: '1m',
    startDate: '2026-07-20',
    endDate: '2026-08-18',
    aggregation: 'daily',
    calendarDays: 30,
  },
  isHistorical: false,
  current: {
    state: 'updating',
    calculationState: 'updating',
    adaptiveTdeeKcal: 2760,
    calorieTargetKcal: 2400,
    goalType: 'lose',
    confidenceLabel: 'High',
    confidenceScore: 0.88,
    readiness,
    reasonCodes: [],
    expenditureSourceCheckInId: 'check-in-1',
    expenditureSourceInputFingerprint: fingerprint,
    stateSourceCheckInId: 'check-in-1',
    stateSourceInputFingerprint: fingerprint,
  },
  summary: {
    averageIntakeKcal: 2520,
    averageExpenditureKcal: 2760,
    averageTargetKcal: 2400,
    averageIntakeMinusTargetKcal: 120,
    intakeTargetComparableDays: 12,
    averageIntakeMinusExpenditureKcal: -240,
    intakeExpenditureComparableDays: 12,
    completeNutritionDays: 12,
    excludedNutritionDays: 18,
    coverageRatio: 0.4,
    predictedWeightChangeKg: -0.374,
    predictedModeledDays: 12,
    observedTrendWeightChangeKg: -0.31,
    observedTrendStartDate: '2026-07-20',
    observedTrendEndDate: '2026-08-17',
    reconciliationComparable: false,
    reasonCodes: [
      'INTAKE_ABOVE_TARGET',
      'INTAKE_BELOW_EXPENDITURE',
      'INCOMPLETE_RECONCILIATION_COVERAGE',
    ],
  },
  points: [
    {
      periodStart: '2026-08-17',
      periodEnd: '2026-08-17',
      nutritionStatus: 'complete',
      sourceNutritionStatus: 'complete',
      nutritionLogIds: ['nutrition-1'],
      loggedIntakeKcal: 2520,
      intakeKcal: 2520,
      includedInBalance: true,
      completeNutritionDays: 1,
      partialNutritionDays: 0,
      unknownNutritionDays: 0,
      missingNutritionDays: 0,
      excludedNutritionDays: 0,
      targetKcal: 2400,
      targetIds: ['target-1'],
      expenditureKcal: 2760,
      trendWeightKg: 79.8,
      goalType: 'lose',
      state: 'updating',
      calculationState: 'updating',
      calculationReasonCodes: [],
      reasonCodes: [],
      expenditureSourceCheckInId: 'check-in-1',
      expenditureSourceInputFingerprint: fingerprint,
      stateSourceCheckInId: 'check-in-1',
      stateSourceInputFingerprint: fingerprint,
      sourceCheckInIds: ['check-in-1'],
      sourceInputFingerprints: [fingerprint],
      goalRevisionIds: ['revision-1'],
    },
    {
      periodStart: '2026-08-18',
      periodEnd: '2026-08-18',
      nutritionStatus: 'excluded',
      sourceNutritionStatus: 'complete',
      nutritionLogIds: ['nutrition-2'],
      loggedIntakeKcal: 2480,
      intakeKcal: null,
      includedInBalance: false,
      completeNutritionDays: 0,
      partialNutritionDays: 0,
      unknownNutritionDays: 0,
      missingNutritionDays: 0,
      excludedNutritionDays: 1,
      targetKcal: 2400,
      targetIds: ['target-1'],
      expenditureKcal: 2760,
      trendWeightKg: null,
      goalType: 'lose',
      state: 'updating',
      calculationState: 'updating',
      calculationReasonCodes: [],
      reasonCodes: ['COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF'],
      expenditureSourceCheckInId: 'check-in-1',
      expenditureSourceInputFingerprint: fingerprint,
      stateSourceCheckInId: 'check-in-1',
      stateSourceInputFingerprint: fingerprint,
      sourceCheckInIds: ['check-in-1'],
      sourceInputFingerprints: [fingerprint],
      goalRevisionIds: ['revision-1'],
    },
  ],
  markers: [
    {
      id: 'check-in-1',
      date: '2026-08-17',
      type: 'check_in',
      label: 'Updating check-in',
      checkInId: 'check-in-1',
      inputFingerprint: fingerprint,
      goalId: 'goal-1',
      goalRevisionId: 'revision-1',
      state: 'updating',
    },
  ],
  explanation: {
    headline: 'Your logged intake averaged 2,520 kcal',
    detail:
      'Across matched complete days, that was 120 kcal above target and 240 kcal below expenditure. Missing days are not estimated.',
    reasonCodes: ['INTAKE_ABOVE_TARGET', 'INTAKE_BELOW_EXPENDITURE'],
  },
};

describe('EnergyBalanceWorkspace', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/energy-balance');
    vi.mocked(useAdaptiveEnergyBalance).mockReturnValue({
      data: analytics,
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdaptiveEnergyBalance>);
  });

  it('renders transparent matched-day signs, provenance, and cutoff semantics', () => {
    render(<EnergyBalanceWorkspace />);

    expect(screen.getByText('Updating')).toBeInTheDocument();
    expect(
      screen.getByText(/120 kcal above target and 240 kcal below expenditure/),
    ).toBeInTheDocument();
    expect(screen.getByText('+120 kcal')).toBeInTheDocument();
    expect(screen.getByText('−240 kcal')).toBeInTheDocument();
    expect(
      screen.getByText(/Today’s complete nutrition is logged and visible/),
    ).toBeInTheDocument();
    expect(screen.getByText('Accepted check-in · Aug 17, 2026')).toBeInTheDocument();
    expect(screen.getByText('Solid · updating')).toBeInTheDocument();
    expect(screen.getByText('Predicted · 12 daily intervals')).toBeInTheDocument();
    expect(screen.getByText(/up to, but not including, Aug 17, 2026/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Energy balance values/ })).toBeInTheDocument();
    expect(screen.queryByText('0 kcal')).not.toBeInTheDocument();
  });

  it('uses pressed range and comparison controls with real button semantics', () => {
    render(<EnergyBalanceWorkspace />);
    const oneMonth = screen.getByRole('button', { name: '1M' });
    const sixMonths = screen.getByRole('button', { name: '6M' });
    const expenditure = screen.getByRole('button', { name: 'Expenditure' });

    expect(oneMonth).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(sixMonths);
    expect(sixMonths).toHaveAttribute('aria-pressed', 'true');
    expect(vi.mocked(useAdaptiveEnergyBalance)).toHaveBeenLastCalledWith({
      aggregation: 'auto',
      end: undefined,
      range: '6m',
    });

    fireEvent.click(expenditure);
    expect(expenditure).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('img', { name: 'Complete intake compared with expenditure' }),
    ).toBeInTheDocument();
  });

  it('exposes a baseline expenditure without accepted-check-in provenance', () => {
    vi.mocked(useAdaptiveEnergyBalance).mockReturnValue({
      data: {
        ...analytics,
        current: {
          ...analytics.current,
          state: 'learning',
          expenditureSourceCheckInId: null,
          expenditureSourceInputFingerprint: null,
        },
        points: [
          {
            ...analytics.points[0],
            periodStart: '2026-07-19',
            periodEnd: '2026-07-19',
            expenditureKcal: null,
            targetKcal: null,
            goalRevisionIds: ['revision-pre-program'],
          },
          ...analytics.points,
        ].map((point) => ({
          ...point,
          state: 'learning' as const,
          expenditureSourceCheckInId: null,
          expenditureSourceInputFingerprint: null,
          sourceCheckInIds: [],
          sourceInputFingerprints: [],
        })),
        markers: [
          {
            id: 'goal-revision-baseline',
            date: '2026-08-18',
            type: 'goal_revision',
            label: 'Goal started',
            checkInId: null,
            inputFingerprint: null,
            goalId: 'goal-1',
            goalRevisionId: 'revision-1',
            state: null,
          },
        ],
      },
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdaptiveEnergyBalance>);
    render(<EnergyBalanceWorkspace />);

    expect(screen.getByText('Starting expenditure')).toBeInTheDocument();
    expect(screen.getByText('Starting estimate')).toBeInTheDocument();
    expect(
      screen.getByText(/starting expenditure has no accepted check-in ID or fingerprint/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Expenditure starting estimate/)).not.toHaveLength(0);
    expect(
      screen.getByText(/No expenditure estimate, Goal revision revision-pre-program/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Goal revision revision-1/)).not.toHaveLength(0);
  });

  it('passes a valid historical end date through the strict analytics query', () => {
    window.history.replaceState({}, '', '/energy-balance?end=2026-08-17');
    vi.mocked(useAdaptiveEnergyBalance).mockReturnValue({
      data: { ...analytics, isHistorical: true },
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdaptiveEnergyBalance>);
    render(<EnergyBalanceWorkspace />);

    expect(vi.mocked(useAdaptiveEnergyBalance)).toHaveBeenCalledWith({
      aggregation: 'auto',
      end: '2026-08-17',
      range: '1m',
    });
    expect(screen.getByText('Historical view')).toBeInTheDocument();
  });

  it('announces loading and provides a working read-only retry', () => {
    vi.mocked(useAdaptiveEnergyBalance).mockReturnValueOnce({
      data: undefined,
      isError: false,
      isFetching: true,
      isLoading: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdaptiveEnergyBalance>);
    const { unmount } = render(<EnergyBalanceWorkspace />);
    expect(
      screen.getByRole('status', { name: 'Loading energy balance analytics' }),
    ).toBeInTheDocument();
    unmount();

    const refetch = vi.fn();
    vi.mocked(useAdaptiveEnergyBalance).mockReturnValue({
      data: undefined,
      isError: true,
      isFetching: false,
      isLoading: false,
      refetch,
    } as unknown as ReturnType<typeof useAdaptiveEnergyBalance>);
    render(<EnergyBalanceWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry analytics' }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('Your nutrition data was not changed');
  });

  it('explains low-data reconciliation without inventing an interval', () => {
    vi.mocked(useAdaptiveEnergyBalance).mockReturnValue({
      data: {
        ...analytics,
        summary: {
          ...analytics.summary,
          predictedWeightChangeKg: null,
          predictedModeledDays: 0,
          observedTrendWeightChangeKg: null,
          observedTrendStartDate: null,
          observedTrendEndDate: null,
          reconciliationComparable: false,
        },
      },
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdaptiveEnergyBalance>);
    render(<EnergyBalanceWorkspace />);

    expect(screen.getByText('Predicted · 0 daily intervals')).toBeInTheDocument();
    expect(screen.getByText(/Two Trend Weight observations are needed/)).toBeInTheDocument();
  });

  it('keeps range focus and updates visible summary values from the selected response', () => {
    vi.mocked(useAdaptiveEnergyBalance).mockImplementation(
      (query) =>
        ({
          data:
            query.range === '6m'
              ? {
                  ...analytics,
                  range: { ...analytics.range, preset: '6m', aggregation: 'weekly' },
                  summary: {
                    ...analytics.summary,
                    averageIntakeKcal: 2310,
                    averageIntakeMinusTargetKcal: -90,
                  },
                }
              : analytics,
          isError: false,
          isFetching: false,
          isLoading: false,
          refetch: vi.fn(),
        }) as unknown as ReturnType<typeof useAdaptiveEnergyBalance>,
    );
    render(<EnergyBalanceWorkspace />);
    const sixMonths = screen.getByRole('button', { name: '6M' });
    sixMonths.focus();
    fireEvent.click(sixMonths);

    expect(sixMonths).toHaveFocus();
    expect(screen.getByText('2,310 kcal')).toBeInTheDocument();
    expect(screen.getByText('−90 kcal')).toBeInTheDocument();
  });

  it.each([
    ['learning', 'Dotted · learning'],
    ['holding', 'Dashed · holding'],
    ['review_needed', 'Fine dots · review needed'],
  ] as const)('provides visible and tabular %s history semantics', (state, legend) => {
    vi.mocked(useAdaptiveEnergyBalance).mockReturnValue({
      data: {
        ...analytics,
        current: { ...analytics.current, state },
        points: analytics.points.map((point) => ({ ...point, state })),
      },
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdaptiveEnergyBalance>);
    render(<EnergyBalanceWorkspace />);

    expect(screen.getByText(stateCopyLabel(state), { exact: true })).toBeInTheDocument();
    expect(screen.getByText(legend)).toBeInTheDocument();
    expect(screen.getAllByText(state.replace('_', ' '), { exact: false }).length).toBeGreaterThan(
      0,
    );
  });

  it.each([
    ['lose', 'Loss target', 2400, 120, '+120 kcal'],
    ['maintain', 'Maintenance target', 2760, -240, '−240 kcal'],
    ['gain', 'Gain target', 3000, -480, '−480 kcal'],
  ] as const)(
    'labels %s goals and keeps target arithmetic explicit',
    (goalType, label, targetKcal, targetDifference, expectedText) => {
      vi.mocked(useAdaptiveEnergyBalance).mockReturnValue({
        data: {
          ...analytics,
          current: { ...analytics.current, goalType, calorieTargetKcal: targetKcal },
          summary: {
            ...analytics.summary,
            averageTargetKcal: targetKcal,
            averageIntakeMinusTargetKcal: targetDifference,
          },
          points: analytics.points.map((point) => ({ ...point, goalType, targetKcal })),
        },
        isError: false,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useAdaptiveEnergyBalance>);
      render(<EnergyBalanceWorkspace />);

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getAllByText(expectedText).length).toBeGreaterThan(0);
    },
  );

  it('builds visible singleton and boundary-connected expenditure state segments', () => {
    const firstPoint = analytics.points.at(0);
    const secondPoint = analytics.points.at(1);
    expect(firstPoint).toBeDefined();
    expect(secondPoint).toBeDefined();
    if (!firstPoint || !secondPoint) throw new Error('Expected two analytics fixture points');

    expect(buildExpenditureStateSegments([firstPoint])).toEqual([
      expect.objectContaining({
        state: 'updating',
        data: [{ date: '2026-08-17', expenditure: 2760 }],
      }),
    ]);
    expect(
      buildExpenditureStateSegments([firstPoint, { ...secondPoint, state: 'holding' }]),
    ).toEqual([
      expect.objectContaining({ state: 'updating' }),
      expect.objectContaining({
        state: 'holding',
        data: [
          { date: '2026-08-17', expenditure: 2760 },
          { date: '2026-08-18', expenditure: 2760 },
        ],
      }),
    ]);
  });

  it('places exact mid-period revision dates on weekly and monthly chart categories', () => {
    const firstPoint = analytics.points.at(0);
    expect(firstPoint).toBeDefined();
    if (!firstPoint) throw new Error('Expected an analytics fixture point');

    expect(
      resolveMarkerChartDate(
        [{ ...firstPoint, periodStart: '2026-08-11', periodEnd: '2026-08-17' }],
        '2026-08-14',
      ),
    ).toBe('2026-08-17');
    expect(
      resolveMarkerChartDate(
        [{ ...firstPoint, periodStart: '2026-08-01', periodEnd: '2026-08-31' }],
        '2026-08-14',
      ),
    ).toBe('2026-08-31');
  });
});

function stateCopyLabel(state: EnergyBalanceAnalytics['current']['state']) {
  if (state === 'review_needed') return 'Review needed';
  return `${state.charAt(0).toUpperCase()}${state.slice(1)}`;
}
