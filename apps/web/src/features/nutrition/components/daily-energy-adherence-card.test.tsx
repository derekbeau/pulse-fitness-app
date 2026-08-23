import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DailyEnergyAdherence } from '@pulse/shared';

import { DailyEnergyAdherenceCard } from './daily-energy-adherence-card';

const adherence: DailyEnergyAdherence = {
  localDate: '2026-08-17',
  timeZone: 'America/Detroit',
  todayLocalDate: '2026-08-18',
  completedDayCutoff: '2026-08-17',
  isHistorical: true,
  dataState: 'gradeable',
  nutrition: {
    logId: 'log-1',
    status: 'complete',
    intakeKcal: 2_520,
    mealCount: 3,
    itemCount: 8,
  },
  target: {
    targetEventId: 'target-event-1',
    targetId: 'target-1',
    effectiveDate: '2026-08-01',
    recordedAt: 1_775_212_800_000,
    caloriesKcal: 2_400,
    source: 'adaptive',
    adaptiveCheckInId: 'check-in-1',
  },
  expenditure: {
    caloriesKcal: 2_760,
    effectiveDate: '2026-08-01',
    source: 'accepted_check_in',
    checkInId: 'check-in-1',
    inputFingerprint: 'a'.repeat(64),
  },
  intakeMinusTargetKcal: 120,
  intakeMinusExpenditureKcal: -240,
  innerToleranceKcal: 120,
  outerToleranceKcal: 250,
  adherence: 'on_target',
  reasonCodes: [],
};

describe('DailyEnergyAdherenceCard', () => {
  it('renders neutral accepted target and expenditure facts with signed differences', () => {
    render(<DailyEnergyAdherenceCard adherence={adherence} />);

    const card = screen.getByRole('article', { name: 'Daily energy' });
    expect(within(card).getByText('On target')).toBeInTheDocument();
    expect(within(card).getByText('2520 kcal')).toBeInTheDocument();
    expect(within(card).getByText('2400 kcal')).toBeInTheDocument();
    expect(within(card).getByText('2760 kcal')).toBeInTheDocument();
    expect(within(card).getByText('+120 kcal')).toBeInTheDocument();
    expect(within(card).getByText('−240 kcal')).toBeInTheDocument();
    expect(
      within(card).getByText(
        'Intake was 120 kcal above accepted target. Intake was 240 kcal below accepted expenditure.',
      ),
    ).toBeInTheDocument();
    expect(within(card).getByText(/Exercise calories are not credited here/)).toBeInTheDocument();
    expect(
      within(card).getByRole('img', {
        name: /Energy adherence: On target.*120 kcal above accepted target/,
      }),
    ).toBeInTheDocument();
  });

  it.each([
    ['in_progress', 'Day in progress', "Today is still being logged, so Pulse won't grade it yet."],
    ['pending_cutoff', 'Waiting for day cutoff', 'today remains open until the local day ends'],
    ['partial', 'Partial log', "Pulse won't grade its energy adherence"],
    ['unknown', 'Completeness unknown', 'Confirm that all calorie-containing items are logged'],
    ['missing', 'No nutrition log', "Pulse won't invent a comparison"],
    ['future', 'Future day', 'after this day is logged and complete'],
    ['unavailable', 'No accepted target', 'Pulse does not backfill one'],
  ] as const)('renders honest %s copy without a grade', (dataState, title, detail) => {
    const value: DailyEnergyAdherence = {
      ...adherence,
      dataState,
      adherence: null,
      ...(dataState === 'missing'
        ? {
            nutrition: {
              logId: null,
              status: null,
              intakeKcal: null,
              mealCount: 0,
              itemCount: 0,
            },
            intakeMinusTargetKcal: null,
            intakeMinusExpenditureKcal: null,
          }
        : {}),
    };

    render(<DailyEnergyAdherenceCard adherence={value} />);

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(detail))).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Energy adherence:/ })).not.toBeInTheDocument();
  });

  it('renders a status skeleton while the selected date changes', () => {
    render(<DailyEnergyAdherenceCard isLoading />);

    expect(screen.getByRole('status', { name: 'Loading daily energy' })).toBeInTheDocument();
  });

  it('keeps a scoped retry action in the error state', () => {
    const onRetry = vi.fn();
    render(<DailyEnergyAdherenceCard error={new Error('offline')} onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your meal data and accepted targets are unchanged.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry daily energy' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
