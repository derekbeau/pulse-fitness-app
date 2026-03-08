import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { mockDailySnapshot } from '@/lib/mock-data/dashboard';
import {
  calculateHabitCompletionPercent,
  calculateWeightTrend,
  SnapshotCards,
} from './snapshot-cards';

describe('calculateWeightTrend', () => {
  it('returns neutral when yesterday weight is not positive', () => {
    expect(calculateWeightTrend(180, 0)).toEqual({ direction: 'neutral', value: 0 });
    expect(calculateWeightTrend(180, -1)).toEqual({ direction: 'neutral', value: 0 });
  });

  it('returns neutral when there is no change', () => {
    expect(calculateWeightTrend(180, 180)).toEqual({ direction: 'neutral', value: 0 });
  });

  it('returns up or down trend with rounded percent change', () => {
    expect(calculateWeightTrend(182, 180)).toEqual({ direction: 'up', value: 1.1 });
    expect(calculateWeightTrend(178, 180)).toEqual({ direction: 'down', value: 1.1 });
  });
});

describe('calculateHabitCompletionPercent', () => {
  it('returns 0 when there are no active habits', () => {
    expect(calculateHabitCompletionPercent(0, 0)).toBe(0);
  });

  it('returns the rounded completion percent for active habits', () => {
    expect(calculateHabitCompletionPercent(1, 3)).toBe(33);
    expect(calculateHabitCompletionPercent(3, 4)).toBe(75);
  });
});

describe('SnapshotCards', () => {
  it('renders five snapshot cards in a responsive grid with mock data values', () => {
    const { container } = render(<MemoryRouter><SnapshotCards /></MemoryRouter>);

    const grid = container.querySelector('div.grid.grid-cols-2');
    expect(grid).toBeInTheDocument();

    const cards = container.querySelectorAll('[data-slot="stat-card"]');
    expect(cards).toHaveLength(5);

    expect(screen.getByText(`${mockDailySnapshot.weight.toFixed(1)} lbs`)).toBeInTheDocument();
    expect(
      screen.getByText(
        `${mockDailySnapshot.macros.calories.actual} / ${mockDailySnapshot.macros.calories.target}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `${mockDailySnapshot.macros.protein.actual}g / ${mockDailySnapshot.macros.protein.target}g`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${mockDailySnapshot.habitsCompleted} / ${mockDailySnapshot.habitsTotal} complete`),
    ).toBeInTheDocument();
    expect(screen.getByText(mockDailySnapshot.workoutName ?? 'Rest Day')).toBeInTheDocument();
  });

  it('calculates weight trend from yesterday and applies accent card backgrounds', () => {
    render(<MemoryRouter><SnapshotCards /></MemoryRouter>);

    const weightCard = screen.getByText('Body Weight').closest('[data-slot="stat-card"]');
    const caloriesCard = screen.getByText('Calories').closest('[data-slot="stat-card"]');
    const proteinCard = screen.getByText('Protein').closest('[data-slot="stat-card"]');
    const habitsCard = screen.getByText('Habits').closest('[data-slot="stat-card"]');
    const workoutCard = screen.getByText("Today's Workout").closest('[data-slot="stat-card"]');

    expect(weightCard).toHaveClass('bg-[var(--color-accent-cream)]');
    expect(caloriesCard).toHaveClass('bg-[var(--color-accent-pink)]');
    expect(proteinCard).toHaveClass('bg-[var(--color-accent-mint)]');
    expect(habitsCard).toHaveClass('bg-[var(--color-accent-mint)]');
    expect(workoutCard).toHaveClass('bg-secondary');
    expect(screen.getByText('Body Weight')).toHaveClass('text-on-cream');
    expect(screen.getByText('Calories')).toHaveClass('text-on-pink');
    expect(screen.getByText('Protein')).toHaveClass('text-on-mint');
    expect(screen.getByText('Habits')).toHaveClass('text-on-mint');

    const expectedTrend = calculateWeightTrend(
      mockDailySnapshot.weight,
      mockDailySnapshot.weightYesterday,
    );

    const weightTrend = within(weightCard as HTMLElement).getByLabelText(`trend ${expectedTrend.direction}`);
    expect(weightTrend).toBeInTheDocument();
    expect(weightTrend).toHaveClass('text-on-cream');

    const expectedTrendText =
      expectedTrend.direction === 'up'
        ? `+${expectedTrend.value}%`
        : expectedTrend.direction === 'down'
          ? `-${expectedTrend.value}%`
          : `${expectedTrend.value}%`;

    expect(within(weightCard as HTMLElement).getByText(expectedTrendText)).toBeInTheDocument();
  });

  it('renders neutral calories/protein trends and handles rest day fallback', () => {
    render(
      <MemoryRouter>
        <SnapshotCards
          snapshot={{
            ...mockDailySnapshot,
            habitsCompleted: 0,
            habitsTotal: 0,
            weightYesterday: 0,
            workoutName: null,
          }}
        />
      </MemoryRouter>,
    );

    const weightCard = screen
      .getByText('Body Weight')
      .closest('[data-slot="stat-card"]') as HTMLElement;
    const caloriesCard = screen
      .getByText('Calories')
      .closest('[data-slot="stat-card"]') as HTMLElement;
    const proteinCard = screen
      .getByText('Protein')
      .closest('[data-slot="stat-card"]') as HTMLElement;
    const habitsCard = screen.getByText('Habits').closest('[data-slot="stat-card"]') as HTMLElement;
    const workoutCard = screen
      .getByText("Today's Workout")
      .closest('[data-slot="stat-card"]') as HTMLElement;

    expect(within(weightCard).getByLabelText('trend neutral')).toBeInTheDocument();
    expect(within(weightCard).getByText('0%')).toBeInTheDocument();

    expect(within(caloriesCard).getByLabelText('trend neutral')).toBeInTheDocument();
    expect(within(proteinCard).getByLabelText('trend neutral')).toBeInTheDocument();
    expect(within(habitsCard).getByLabelText('trend neutral')).toBeInTheDocument();
    expect(within(habitsCard).getByText('0 / 0 complete')).toBeInTheDocument();

    expect(within(workoutCard).queryByLabelText(/trend/i)).not.toBeInTheDocument();
    expect(within(workoutCard).getByText('Rest Day')).toBeInTheDocument();
  });
});
