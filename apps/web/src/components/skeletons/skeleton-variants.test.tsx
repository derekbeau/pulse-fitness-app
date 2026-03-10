import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  FoodCardSkeleton,
  HabitRowSkeleton,
  MealCardSkeleton,
  StatCardSkeleton,
  WorkoutCardSkeleton,
} from '@/components/skeletons';

describe('skeleton variants', () => {
  it('renders a stat card skeleton with optional trend row', () => {
    const { rerender } = render(<StatCardSkeleton />);

    expect(screen.getByTestId('stat-card-skeleton')).toBeInTheDocument();
    expect(within(screen.getByTestId('stat-card-skeleton')).getAllByText('', { selector: '.animate-pulse' })).toHaveLength(4);

    rerender(<StatCardSkeleton showTrend={false} />);

    expect(within(screen.getByTestId('stat-card-skeleton')).queryAllByText('', { selector: '.animate-pulse' })).toHaveLength(3);
  });

  it('renders meal, workout, habit, and food placeholders', () => {
    render(
      <>
        <MealCardSkeleton />
        <WorkoutCardSkeleton />
        <HabitRowSkeleton />
        <FoodCardSkeleton />
      </>,
    );

    expect(screen.getByTestId('meal-card-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('workout-card-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('habit-row-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('food-card-skeleton')).toBeInTheDocument();
  });
});
