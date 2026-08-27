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
    actualProteinGrams: 170,
    mealCount: 3,
    itemCount: 8,
  },
  target: {
    targetEventId: 'target-event-1',
    targetId: 'target-1',
    effectiveDate: '2026-08-01',
    recordedAt: 1_775_212_800_000,
    caloriesKcal: 2_400,
    proteinFloorGrams: 190,
    source: 'adaptive',
    adaptiveCheckInId: 'check-in-1',
  },
  proteinFloor: {
    actualProteinGrams: 170,
    proteinFloorGrams: 190,
    remainingToFloorGrams: 20,
    amountAboveFloorGrams: 0,
    state: 'below_floor',
    isFinal: true,
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
              actualProteinGrams: null,
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

  it('keeps accepted facts visible and announces a background refresh', () => {
    render(<DailyEnergyAdherenceCard adherence={adherence} isFetching />);

    expect(screen.getByRole('article', { name: 'Daily energy' })).toHaveTextContent('2520 kcal');
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing accepted facts');
  });

  it('keeps accepted facts visible after a refetch failure and retries only the card', () => {
    const onRetry = vi.fn();
    render(
      <DailyEnergyAdherenceCard
        adherence={adherence}
        error={new Error('offline')}
        isRefetchError
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('article', { name: 'Daily energy' })).toHaveTextContent('2520 kcal');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'accepted facts shown here may be out of date',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('labels retained accepted facts as stale and offers a scoped refresh', () => {
    const onRetry = vi.fn();
    render(<DailyEnergyAdherenceCard adherence={adherence} isStale onRetry={onRetry} />);

    expect(screen.getByRole('status')).toHaveTextContent('ready to refresh');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh facts' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('discloses accepted target and expenditure provenance on demand', () => {
    render(<DailyEnergyAdherenceCard adherence={adherence} />);

    const disclosure = screen.getByText('Accepted-fact provenance');
    expect(disclosure).toBeInTheDocument();
    fireEvent.click(disclosure);

    const target = screen.getByRole('region', { name: 'Target provenance' });
    expect(target).toHaveTextContent('Accepted adaptive recommendation');
    expect(target).toHaveTextContent('target-event-1');
    expect(target).toHaveTextContent('target-1');
    expect(target).toHaveTextContent('check-in-1');
    expect(target).toHaveTextContent(/EST|EDT/);
    const expenditure = screen.getByRole('region', { name: 'Expenditure provenance' });
    expect(expenditure).toHaveTextContent('Accepted adaptive check-in');
    expect(expenditure).toHaveTextContent('check-in-1');
    expect(expenditure).toHaveTextContent('a'.repeat(64));
  });

  it('shows manual target provenance without inventing an accepted check-in', () => {
    if (!adherence.target) throw new Error('Expected target fixture');
    render(
      <DailyEnergyAdherenceCard
        adherence={{
          ...adherence,
          target: {
            ...adherence.target,
            source: 'manual',
            adaptiveCheckInId: null,
          },
        }}
      />,
    );

    fireEvent.click(screen.getByText('Accepted-fact provenance'));
    const target = screen.getByRole('region', { name: 'Target provenance' });
    expect(target).toHaveTextContent('Manual target');
    expect(target).not.toHaveTextContent('Accepted check-in ID');
  });

  it('does not relabel retained facts as a newly requested date', () => {
    render(<DailyEnergyAdherenceCard adherence={adherence} requestedDate="2026-08-18" />);

    expect(screen.getByRole('status', { name: 'Loading daily energy' })).toBeInTheDocument();
    expect(screen.queryByText('Accepted facts for 2026-08-18')).not.toBeInTheDocument();
  });

  it('renders a defensive unavailable state for an impossible gradeable payload', () => {
    render(
      <DailyEnergyAdherenceCard
        adherence={{ ...adherence, adherence: null } as DailyEnergyAdherence}
      />,
    );

    expect(screen.getByText('Comparison unavailable')).toBeInTheDocument();
  });
});
