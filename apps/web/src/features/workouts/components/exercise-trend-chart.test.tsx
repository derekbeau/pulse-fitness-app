import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { workoutExerciseHistory } from '../lib/mock-data';
import { ExerciseTrendChart } from './exercise-trend-chart';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">
        {React.isValidElement(children)
          ? React.cloneElement(
              children as React.ReactElement<{ height?: number; width?: number }>,
              {
                height: 320,
                width: 640,
              },
            )
          : children}
      </div>
    ),
  };
});

describe('ExerciseTrendChart', () => {
  it('renders weight and rep trend lines for exercises with history', () => {
    const { container } = render(
      <ExerciseTrendChart
        exerciseName="Incline Dumbbell Press"
        history={workoutExerciseHistory['incline-dumbbell-press'] ?? []}
        weightUnit="kg"
      />,
    );

    expect(screen.getByLabelText('Incline Dumbbell Press trend chart')).toBeInTheDocument();
    expect(container.querySelectorAll('.recharts-line .recharts-curve')).toHaveLength(2);
    expect(screen.getByText('Latest weight')).toBeInTheDocument();
    expect(screen.getByText('Latest reps')).toBeInTheDocument();
    expect(screen.getByText('50 kg')).toBeInTheDocument();
  });

  it('filters chart history by date range', () => {
    render(
      <ExerciseTrendChart
        exerciseName="Incline Dumbbell Press"
        history={workoutExerciseHistory['incline-dumbbell-press'] ?? []}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));

    expect(screen.queryByText('Jan 5')).not.toBeInTheDocument();
    expect(screen.queryByText('Jan 26')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All time' }));

    expect(screen.getByText('Jan 5')).toBeInTheDocument();
  });

  it('shows an empty state when an exercise has no history', () => {
    render(<ExerciseTrendChart exerciseName="Air Bike" history={[]} />);

    expect(screen.getByText('No history yet')).toBeInTheDocument();
    expect(
      screen.getByText(/complete a few sessions for air bike to unlock progression trends/i),
    ).toBeInTheDocument();
  });

  it('renders reps-only trend cards for bodyweight tracking', () => {
    render(
      <ExerciseTrendChart
        exerciseName="Bodyweight Squat"
        history={[
          { date: '2026-02-01', reps: 12, weight: 0 },
          { date: '2026-03-01', reps: 15, weight: 0 },
        ]}
        trackingType="reps_only"
      />,
    );

    expect(screen.getByText('Latest reps')).toBeInTheDocument();
    expect(screen.getByText('15 reps')).toBeInTheDocument();
    expect(screen.queryByText('Latest weight')).not.toBeInTheDocument();
  });
});
