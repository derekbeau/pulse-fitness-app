import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ExerciseTrendChart } from './exercise-trend-chart';
import {
  computeEstimated1RM,
  computeSessionVolume,
  getMetricOptionsForTrackingType,
} from './exercise-trend-metrics';

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

const sessions = [
  {
    date: '2026-01-05',
    notes: null,
    sessionId: 'session-1',
    sets: [
      { reps: 8, setNumber: 1, weight: 40 },
      { reps: 10, setNumber: 2, weight: 35 },
    ],
  },
  {
    date: '2026-02-09',
    notes: null,
    sessionId: 'session-2',
    sets: [
      { reps: 7, setNumber: 1, weight: 50 },
      { reps: 9, setNumber: 2, weight: 45 },
    ],
  },
  {
    date: '2026-03-01',
    notes: null,
    sessionId: 'session-3',
    sets: [
      { reps: 10, setNumber: 1, weight: 47.5 },
      { reps: 8, setNumber: 2, weight: 50 },
    ],
  },
];

describe('ExerciseTrendChart', () => {
  it('renders metric selector and switches metric values', () => {
    render(
      <ExerciseTrendChart
        exerciseName="Incline Dumbbell Press"
        sessions={sessions}
        trackingType="weight_reps"
        weightUnit="lbs"
      />,
    );

    expect(screen.getByRole('button', { name: 'Max Weight' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Total Volume' })).toBeInTheDocument();
    expect(screen.getByText('Latest max weight')).toBeInTheDocument();
    expect(screen.getByText('50 lbs')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Total Volume' }));

    expect(screen.getByText('Latest total volume')).toBeInTheDocument();
    expect(screen.getByText('875 lbs*reps')).toBeInTheDocument();
  });

  it('filters chart history by date range', () => {
    render(
      <ExerciseTrendChart
        exerciseName="Incline Dumbbell Press"
        sessions={sessions}
        trackingType="weight_reps"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));

    expect(screen.queryByText('Jan 5')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All time' }));

    expect(screen.getByText('Jan 5')).toBeInTheDocument();
  });

  it('shows an empty state when an exercise has no history', () => {
    render(<ExerciseTrendChart exerciseName="Air Bike" sessions={[]} trackingType="seconds_only" />);

    expect(screen.getByText('No history yet')).toBeInTheDocument();
    expect(
      screen.getByText(/complete a few sessions for air bike to unlock progression trends/i),
    ).toBeInTheDocument();
  });

  it('computeEstimated1RM follows Epley formula', () => {
    expect(computeEstimated1RM(100, 10)).toBeCloseTo(133.3, 1);
  });

  it('computeSessionVolume sums weight and reps across sets', () => {
    expect(
      computeSessionVolume([
        { reps: 10, weight: 100 },
        { reps: 8, weight: 90 },
      ]),
    ).toBe(1720);
  });

  it('filters available metrics by tracking type', () => {
    expect(getMetricOptionsForTrackingType('weight_reps').map((metric) => metric.key)).toEqual([
      'max_weight',
      'max_reps',
      'total_volume',
      'est_1rm',
    ]);

    expect(getMetricOptionsForTrackingType('seconds_only').map((metric) => metric.key)).toEqual([
      'max_time',
    ]);
  });
});
