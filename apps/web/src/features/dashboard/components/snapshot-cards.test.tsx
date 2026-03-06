import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockDailySnapshot } from '@/lib/mock-data/dashboard';
import { SnapshotCards } from './snapshot-cards';

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
    expect(workoutCard).toHaveClass('bg-primary/10');

    const expectedDirection =
      mockDailySnapshot.weight > mockDailySnapshot.weightYesterday
        ? 'up'
        : mockDailySnapshot.weight < mockDailySnapshot.weightYesterday
          ? 'down'
          : 'neutral';

    const expectedPercent =
      mockDailySnapshot.weightYesterday > 0
        ? Number(
            (
              (Math.abs(mockDailySnapshot.weight - mockDailySnapshot.weightYesterday) /
                mockDailySnapshot.weightYesterday) *
              100
            ).toFixed(1),
          )
        : 0;

    expect(
      within(weightCard as HTMLElement).getByLabelText(`trend ${expectedDirection}`),
    ).toBeInTheDocument();

    const expectedTrendText =
      expectedDirection === 'up'
        ? `+${expectedPercent}%`
        : expectedDirection === 'down'
          ? `-${expectedPercent}%`
          : `${expectedPercent}%`;

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
