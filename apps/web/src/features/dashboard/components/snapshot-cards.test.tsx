import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockDailySnapshot } from '@/lib/mock-data/dashboard';
import { calculateWeightTrend, SnapshotCards } from './snapshot-cards';

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

describe('SnapshotCards', () => {
  it('renders four snapshot cards in a responsive grid with mock data values', () => {
    const { container } = render(<SnapshotCards />);

    const grid = container.querySelector('div.grid.grid-cols-2.gap-4.lg\\:grid-cols-4');
    expect(grid).toBeInTheDocument();

    const cards = container.querySelectorAll('[data-slot="stat-card"]');
    expect(cards).toHaveLength(4);

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
    expect(screen.getByText(mockDailySnapshot.workoutName ?? 'Rest Day')).toBeInTheDocument();
  });

  it('calculates weight trend from yesterday and applies accent card backgrounds', () => {
    render(<SnapshotCards />);

    const weightCard = screen.getByText('Body Weight').closest('[data-slot="stat-card"]');
    const caloriesCard = screen.getByText('Calories').closest('[data-slot="stat-card"]');
    const proteinCard = screen.getByText('Protein').closest('[data-slot="stat-card"]');
    const workoutCard = screen.getByText("Today's Workout").closest('[data-slot="stat-card"]');

    expect(weightCard).toHaveClass('bg-[var(--color-accent-cream)]');
    expect(caloriesCard).toHaveClass('bg-[var(--color-accent-pink)]');
    expect(proteinCard).toHaveClass('bg-[var(--color-accent-mint)]');
    expect(workoutCard).toHaveClass('bg-[var(--color-primary)]/12');

    const expectedTrend = calculateWeightTrend(
      mockDailySnapshot.weight,
      mockDailySnapshot.weightYesterday,
    );

    expect(
      within(weightCard as HTMLElement).getByLabelText(`trend ${expectedTrend.direction}`),
    ).toBeInTheDocument();

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
      <SnapshotCards
        snapshot={{
          ...mockDailySnapshot,
          weightYesterday: 0,
          workoutName: null,
        }}
      />,
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
    const workoutCard = screen
      .getByText("Today's Workout")
      .closest('[data-slot="stat-card"]') as HTMLElement;

    expect(within(weightCard).getByLabelText('trend neutral')).toBeInTheDocument();
    expect(within(weightCard).getByText('0%')).toBeInTheDocument();

    expect(within(caloriesCard).getByLabelText('trend neutral')).toBeInTheDocument();
    expect(within(proteinCard).getByLabelText('trend neutral')).toBeInTheDocument();

    expect(within(workoutCard).queryByLabelText(/trend/i)).not.toBeInTheDocument();
    expect(within(workoutCard).getByText('Rest Day')).toBeInTheDocument();
  });
});
