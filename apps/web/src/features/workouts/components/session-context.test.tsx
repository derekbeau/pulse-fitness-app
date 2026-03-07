import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workoutSessionContext } from '../lib/mock-data';

import { SessionContext } from './session-context';

describe('SessionContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders all four context cards with recent sessions and phase details', () => {
    render(<SessionContext context={workoutSessionContext} />);

    expect(screen.getByRole('region', { name: 'Session context' })).toBeInTheDocument();
    expect(screen.getByText('Recent Training')).toBeInTheDocument();
    expect(screen.getByText('Recovery Status')).toBeInTheDocument();
    expect(screen.getByText('Active Injuries')).toBeInTheDocument();
    expect(screen.getByText('Training Phase')).toBeInTheDocument();

    const recentTrainingCard = screen.getByText('Recent Training').closest('[data-slot="card"]');

    if (!(recentTrainingCard instanceof HTMLElement)) {
      throw new Error('Expected recent training card.');
    }

    expect(within(recentTrainingCard).getByText('Upper Push')).toBeInTheDocument();
    expect(within(recentTrainingCard).getByText('4 days ago')).toBeInTheDocument();
    expect(within(recentTrainingCard).getByText('Mar 2')).toBeInTheDocument();

    const trainingPhaseCard = screen.getByText('Training Phase').closest('[data-slot="card"]');

    if (!(trainingPhaseCard instanceof HTMLElement)) {
      throw new Error('Expected training phase card.');
    }

    expect(within(trainingPhaseCard).getByText('Rebuild Phase')).toBeInTheDocument();
    expect(within(trainingPhaseCard).getByText('Accumulation Block 2 - Rebuild')).toBeInTheDocument();
  });

  it('shows the empty-state copy when there are no active conditions', () => {
    render(
      <SessionContext
        context={{
          ...workoutSessionContext,
          activeInjuries: [],
        }}
      />,
    );

    expect(screen.getByText('0 active')).toBeInTheDocument();
    expect(screen.getByText('No active conditions')).toBeInTheDocument();
  });

  it('renders sleep-specific recovery guidance', () => {
    render(
      <SessionContext
        context={{
          ...workoutSessionContext,
          sleepStatus: 'poor',
        }}
      />,
    );

    expect(screen.getByText('Poor sleep')).toBeInTheDocument();
    expect(
      screen.getByText('Recovery is limited. Reduce load or volume if the session feels off.'),
    ).toBeInTheDocument();
  });
});
