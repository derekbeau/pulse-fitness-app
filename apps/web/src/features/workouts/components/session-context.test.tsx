import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workoutSessionContext } from '../lib/mock-data';

import { SessionContext } from './session-context';

describe('SessionContext', () => {
  function mockMatchMedia(matches: boolean) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches,
        media: '(min-width: 1280px)',
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00.000Z'));
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts collapsed on smaller viewports and expands on toggle', () => {
    mockMatchMedia(false);

    const { container } = render(<SessionContext context={workoutSessionContext} />);

    expect(screen.getByRole('region', { name: 'Session context' })).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /Session Context/i });
    const panel = container.querySelector('#session-context-panel');

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('hidden');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel).not.toHaveAttribute('hidden');
    expect(screen.getByText('Recent Training')).toBeInTheDocument();
    expect(screen.getByText('Recovery Status')).toBeInTheDocument();
    expect(screen.getByText('Active Injuries')).toBeInTheDocument();
    expect(screen.getByText('Training Phase')).toBeInTheDocument();
  });

  it('renders expanded by default on desktop with preview badges', () => {
    mockMatchMedia(true);

    const { container } = render(<SessionContext context={workoutSessionContext} />);

    const panel = container.querySelector('#session-context-panel');
    expect(panel).not.toHaveAttribute('hidden');
    expect(
      screen.getByText("Some cards are in preview — sample data is shown and won't be saved."),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Preview')).toHaveLength(3);

    const recentTrainingCard = screen.getByText('Recent Training').closest('.rounded-xl');

    if (!(recentTrainingCard instanceof HTMLElement)) {
      throw new Error('Expected recent training card.');
    }

    const trainingPhaseCard = screen.getByText('Training Phase').closest('.rounded-xl');

    if (!(trainingPhaseCard instanceof HTMLElement)) {
      throw new Error('Expected training phase card.');
    }

    expect(within(trainingPhaseCard).getByText('Rebuild Phase')).toBeInTheDocument();
    expect(
      within(trainingPhaseCard).getByText('Accumulation Block 2 - Rebuild'),
    ).toBeInTheDocument();

    const grid = container.querySelector(
      'div.grid.grid-cols-1.gap-4.md\\:grid-cols-2.xl\\:grid-cols-4',
    );
    expect(grid).toBeInTheDocument();
    expect(grid).not.toHaveClass('overflow-x-auto');
    expect(recentTrainingCard).toHaveClass('w-full');
  });

  it('shows the empty-state copy when there are no active conditions', () => {
    mockMatchMedia(true);

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
    mockMatchMedia(true);

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
