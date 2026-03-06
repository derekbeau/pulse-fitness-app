import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HabitHistory } from '@/features/habits/components/habit-history';
import { defaultHabitConfigs } from '@/features/habits/lib/habit-constants';

describe('HabitHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a 90-day history grid with month markers for every habit', () => {
    const { container } = render(<HabitHistory />);

    expect(screen.getByText('Last 90 days')).toBeInTheDocument();
    expect(screen.getByText('Dec')).toBeInTheDocument();
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Feb')).toBeInTheDocument();
    expect(screen.getByText('Mar')).toBeInTheDocument();

    expect(container.querySelectorAll('[data-testid="habit-history-cell"]')).toHaveLength(
      defaultHabitConfigs.length * 90,
    );
  });

  it('shows current streak counts for each habit row', () => {
    render(<HabitHistory />);

    expect(screen.getByTestId('habit-streak-hydrate')).toHaveTextContent('3-day streak');
    expect(screen.getByTestId('habit-streak-vitamins')).toHaveTextContent('4-day streak');
    expect(screen.getByTestId('habit-streak-protein')).toHaveTextContent('0-day streak');
    expect(screen.getByTestId('habit-streak-sleep')).toHaveTextContent('7-day streak');
    expect(screen.getByTestId('habit-streak-mobility')).toHaveTextContent('0-day streak');
  });

  it('uses completion states for boolean cells, progress intensity for numeric cells, and tooltip labels on each cell', () => {
    render(<HabitHistory />);

    const vitaminsToday = screen.getByRole('button', {
      name: 'Take vitamins: Mar 6 - Completed',
    });
    const mobilityToday = screen.getByRole('button', {
      name: 'Mobility warm-up: Mar 6 - Not completed',
    });
    const hydrateToday = screen.getByRole('button', {
      name: 'Hydrate: Mar 6 - 8/8 glasses',
    });
    const proteinToday = screen.getByRole('button', {
      name: 'Protein goal: Mar 6 - 110/120 grams',
    });

    expect(vitaminsToday).toHaveClass('bg-emerald-500');
    expect(mobilityToday).toHaveClass('bg-slate-300/70');
    expect(hydrateToday).toHaveAttribute('data-percent', '100');
    expect(proteinToday).toHaveAttribute('data-percent', '92');
    expect(hydrateToday).toHaveStyle({ backgroundColor: 'rgb(16, 185, 129)' });

    expect(proteinToday).toHaveAttribute('title', 'Mar 6 - 110/120 grams');
  });
});
