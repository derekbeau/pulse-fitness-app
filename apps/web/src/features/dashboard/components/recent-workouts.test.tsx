import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Hoist fake timers before imports so the mock-data module (which computes
// dates at load time via getToday()) sees the same fake date the tests use.
vi.hoisted(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-06T10:00:00'));
});

import { formatRelativeWorkoutDate } from '@/features/dashboard/lib/recent-workouts';
import { mockRecentWorkouts } from '@/lib/mock-data/dashboard';

import { RecentWorkouts } from './recent-workouts';

afterAll(() => {
  vi.useRealTimers();
});

describe('formatRelativeWorkoutDate', () => {
  it('formats today, yesterday, day, and week ranges', () => {
    expect(formatRelativeWorkoutDate('2026-03-06T08:00:00.000Z')).toBe('Today');
    expect(formatRelativeWorkoutDate('2026-03-05T08:00:00.000Z')).toBe('Yesterday');
    expect(formatRelativeWorkoutDate('2026-03-03T08:00:00.000Z')).toBe('3 days ago');
    expect(formatRelativeWorkoutDate('2026-02-25T08:00:00.000Z')).toBe('1 week ago');
    expect(formatRelativeWorkoutDate('2026-02-21T08:00:00.000Z')).toBe('1 week ago');
    expect(formatRelativeWorkoutDate('2026-02-20T08:00:00.000Z')).toBe('2 weeks ago');
  });
});

describe('RecentWorkouts', () => {
  it('renders five recent workout cards with workout links and metadata', () => {
    render(
      <MemoryRouter>
        <RecentWorkouts />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Recent Workouts' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/workouts');

    const workoutLinks = screen.getAllByRole('link', { name: /^Open / });
    expect(workoutLinks).toHaveLength(5);

    mockRecentWorkouts.forEach((workout) => {
      const link = screen.getByRole('link', { name: `Open ${workout.name}` });

      expect(link).toHaveAttribute('href', `/workouts/${workout.id}`);
      expect(within(link).getByText(workout.name)).toBeInTheDocument();
      expect(within(link).getByText(`${workout.totalSets} sets`)).toBeInTheDocument();
      expect(within(link).getByText(`${workout.totalReps} reps`)).toBeInTheDocument();
      expect(within(link).getByText(`${workout.duration} min`)).toBeInTheDocument();
    });
  });

  it('shows relative date labels for recent sessions', () => {
    render(
      <MemoryRouter>
        <RecentWorkouts />
      </MemoryRouter>,
    );

    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('3 days ago')).toBeInTheDocument();
    expect(screen.getByText('6 days ago')).toBeInTheDocument();
    expect(screen.getByText('1 week ago')).toBeInTheDocument();
    expect(screen.getByText('2 weeks ago')).toBeInTheDocument();
  });
});
