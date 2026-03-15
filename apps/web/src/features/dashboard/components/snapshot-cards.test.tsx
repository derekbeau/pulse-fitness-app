import type { DashboardSnapshot } from '@pulse/shared';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import {
  calculateHabitCompletionPercent,
  calculateWeightTrend,
  getSnapshotValueClassName,
  SnapshotCards,
} from './snapshot-cards';

const snapshotFixture: DashboardSnapshot = {
  date: '2026-03-06',
  weight: {
    date: '2026-03-06',
    unit: 'lb',
    value: 181.4,
  },
  macros: {
    actual: {
      calories: 1900,
      protein: 170,
      carbs: 210,
      fat: 70,
    },
    target: {
      calories: 2300,
      protein: 190,
      carbs: 260,
      fat: 75,
    },
  },
  workout: {
    name: 'Upper Push A',
    status: 'completed',
    templateId: 'template-upper-push-a',
    sessionId: 'session-upper-push-a',
    duration: 62,
  },
  habits: {
    total: 4,
    completed: 3,
    percentage: 75,
  },
};

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

describe('getSnapshotValueClassName', () => {
  it('returns larger text sizing for shorter values', () => {
    expect(getSnapshotValueClassName('3/5')).toContain('text-lg');
  });

  it('returns compact text sizing for longer values', () => {
    expect(getSnapshotValueClassName('2,450 / 2,200')).toContain('text-sm');
  });
});

describe('SnapshotCards', () => {
  it('renders five snapshot cards with dashboard snapshot API values', () => {
    const { container } = render(
      <MemoryRouter>
        <SnapshotCards snapshot={snapshotFixture} />
      </MemoryRouter>,
    );

    const grid = container.querySelector('div.grid.grid-cols-2.gap-3');
    expect(grid).toBeInTheDocument();

    const cards = container.querySelectorAll('[data-slot="stat-card"]');
    expect(cards).toHaveLength(5);
    cards.forEach((card) => {
      expect(card).toHaveAttribute('data-density', 'compact');
    });

    expect(screen.getByText('181.4 lbs')).toBeInTheDocument();
    expect(screen.getByText('1900 / 2300')).toBeInTheDocument();
    expect(screen.getByText('170g / 190g')).toBeInTheDocument();
    expect(screen.getByText('3/4')).toBeInTheDocument();
    expect(screen.getByText('Upper Push A (Completed)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open today's workout/i })).toHaveAttribute(
      'href',
      '/workouts/sessions/session-upper-push-a/summary',
    );
  });

  it('applies accent card backgrounds and neutral trends', () => {
    render(
      <MemoryRouter>
        <SnapshotCards snapshot={snapshotFixture} />
      </MemoryRouter>,
    );

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

    expect(within(weightCard as HTMLElement).getByLabelText('trend neutral')).toBeInTheDocument();
    expect(within(weightCard as HTMLElement).getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders placeholders for loading and null weight/workout states', () => {
    const { rerender } = render(
      <MemoryRouter>
        <SnapshotCards />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('--')).not.toHaveLength(0);

    rerender(
      <MemoryRouter>
        <SnapshotCards
          snapshot={{
            ...snapshotFixture,
            weight: null,
            macros: {
              actual: {
                calories: 1800,
                protein: 120,
                carbs: 210,
                fat: 70,
              },
              target: {
                calories: 0,
                protein: 0,
                carbs: 0,
                fat: 0,
              },
            },
            workout: null,
            habits: {
              total: 0,
              completed: 0,
              percentage: 0,
            },
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

    expect(within(weightCard).getByText('Log weight')).toBeInTheDocument();
    expect(within(weightCard).queryByLabelText(/trend/i)).not.toBeInTheDocument();
    expect(within(caloriesCard).getByText('No targets set')).toBeInTheDocument();
    expect(within(proteinCard).getByText('No targets set')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Settings' })).toHaveLength(2);
    expect(within(habitsCard).getByText('No habits')).toBeInTheDocument();
    expect(within(habitsCard).queryByLabelText(/trend/i)).not.toBeInTheDocument();
    expect(within(workoutCard).getByText('Rest Day')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open today's workout/i })).not.toBeInTheDocument();
    expect(weightCard).toHaveClass('border-dashed');
    expect(caloriesCard).toHaveClass('border-dashed');
    expect(proteinCard).toHaveClass('border-dashed');
    expect(habitsCard).toHaveClass('border-dashed');
  });

  it('links scheduled workouts to template preview', () => {
    render(
      <MemoryRouter>
        <SnapshotCards
          snapshot={{
            ...snapshotFixture,
            workout: {
              name: 'Lower Strength',
              status: 'scheduled',
              templateId: 'template-lower-strength',
              sessionId: null,
              duration: null,
            },
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /open today's workout/i })).toHaveAttribute(
      'href',
      '/workouts/templates/template-lower-strength',
    );
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('links in-progress workouts to active session', () => {
    render(
      <MemoryRouter>
        <SnapshotCards
          snapshot={{
            ...snapshotFixture,
            workout: {
              name: 'Upper Pull',
              status: 'in_progress',
              templateId: 'template-upper-pull',
              sessionId: 'session-upper-pull',
              duration: 24,
            },
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /open today's workout/i })).toHaveAttribute(
      'href',
      '/workouts/sessions/session-upper-pull',
    );
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('applies compact font sizing classes to long macro values to avoid overflow', () => {
    render(
      <MemoryRouter>
        <SnapshotCards
          snapshot={{
            ...snapshotFixture,
            macros: {
              ...snapshotFixture.macros,
              actual: {
                ...snapshotFixture.macros.actual,
                calories: 12450,
              },
              target: {
                ...snapshotFixture.macros.target,
                calories: 11200,
              },
            },
          }}
        />
      </MemoryRouter>,
    );

    const caloriesValue = screen.getByText('12450 / 11200');
    expect(caloriesValue).toHaveClass('text-sm', 'sm:text-base', 'lg:text-lg');
  });
});
