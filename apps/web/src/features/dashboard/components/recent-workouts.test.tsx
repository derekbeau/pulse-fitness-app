import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatRelativeWorkoutDate } from '@/features/dashboard/lib/recent-workouts';
import { useRecentWorkouts } from '@/hooks/use-recent-workouts';

import { RecentWorkouts } from './recent-workouts';

vi.mock('@/hooks/use-recent-workouts', () => ({
  useRecentWorkouts: vi.fn(),
}));

// Hoist fake timers before imports so relative-date formatting is deterministic.
vi.hoisted(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-06T10:00:00'));
});

afterAll(() => {
  vi.useRealTimers();
});

const recentWorkoutsFixture = [
  {
    id: 'session-1',
    name: 'Upper Push A',
    date: '2026-03-05',
    duration: 62,
    exerciseCount: 6,
  },
  {
    id: 'session-2',
    name: 'Lower Strength',
    date: '2026-03-03',
    duration: 70,
    exerciseCount: 5,
  },
  {
    id: 'session-3',
    name: 'Upper Pull A',
    date: '2026-02-28',
    duration: 58,
    exerciseCount: 7,
  },
  {
    id: 'session-4',
    name: 'Conditioning Circuit',
    date: '2026-02-25',
    duration: 45,
    exerciseCount: 4,
  },
  {
    id: 'session-5',
    name: 'Upper Push B',
    date: '2026-02-20',
    duration: null,
    exerciseCount: 6,
  },
];

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
  beforeEach(() => {
    vi.mocked(useRecentWorkouts).mockReset();
  });

  it('renders five recent workout cards with workout links and metadata', () => {
    vi.mocked(useRecentWorkouts).mockReturnValue({
      data: recentWorkoutsFixture,
      isLoading: false,
    } as ReturnType<typeof useRecentWorkouts>);

    render(
      <MemoryRouter>
        <RecentWorkouts />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Recent Workouts' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/workouts');
    expect(screen.queryByText('Your last five sessions at a glance.')).not.toBeInTheDocument();

    const workoutLinks = screen.getAllByRole('link', { name: /^Open / });
    expect(workoutLinks).toHaveLength(5);

    recentWorkoutsFixture.forEach((workout) => {
      const link = screen.getByRole('link', { name: `Open ${workout.name}` });

      expect(link).toHaveAttribute('href', `/workouts/sessions/${workout.id}`);
      expect(within(link).getByText(workout.name)).toBeInTheDocument();
      expect(within(link).getByText(`${workout.exerciseCount} exercises`)).toBeInTheDocument();
      expect(
        within(link).getByText(workout.duration === null ? 'Duration n/a' : `${workout.duration} min`),
      ).toBeInTheDocument();
    });
  });

  it('uses compact card spacing and inline metadata pills', () => {
    vi.mocked(useRecentWorkouts).mockReturnValue({
      data: recentWorkoutsFixture,
      isLoading: false,
    } as ReturnType<typeof useRecentWorkouts>);

    const { container } = render(
      <MemoryRouter>
        <RecentWorkouts />
      </MemoryRouter>,
    );

    const cards = container.querySelectorAll('[data-slot="recent-workout-card"]');
    expect(cards.length).toBe(5);
    cards.forEach((card) => {
      expect(card).toHaveClass('py-2');
      expect(card).toHaveClass('overflow-hidden');
    });

    const metadataPills = screen.getAllByText('6 exercises');
    metadataPills.forEach((pill) => {
      expect(pill).toHaveClass('rounded-full');
      expect(pill.parentElement).toHaveClass('text-xs');
    });
  });

  it('keeps workout names untruncated while preventing container overflow', () => {
    vi.mocked(useRecentWorkouts).mockReturnValue({
      data: [
        {
          ...recentWorkoutsFixture[0],
          name: 'Very Long Workout Name That Should Stay Readable Across Narrow Mobile Dashboard Layout Widths',
        },
      ],
      isLoading: false,
    } as ReturnType<typeof useRecentWorkouts>);

    const { container } = render(
      <MemoryRouter>
        <RecentWorkouts />
      </MemoryRouter>,
    );

    const title = screen.getByText(
      'Very Long Workout Name That Should Stay Readable Across Narrow Mobile Dashboard Layout Widths',
    );
    expect(title).not.toHaveClass('truncate');

    const cardContent = container.querySelector('[data-slot="card-content"]');
    expect(cardContent).toHaveClass('overflow-hidden');
  });

  it('shows relative date labels for recent sessions', () => {
    vi.mocked(useRecentWorkouts).mockReturnValue({
      data: recentWorkoutsFixture,
      isLoading: false,
    } as ReturnType<typeof useRecentWorkouts>);

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

  it('renders skeleton rows while loading', () => {
    vi.mocked(useRecentWorkouts).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useRecentWorkouts>);

    const { container } = render(
      <MemoryRouter>
        <RecentWorkouts />
      </MemoryRouter>,
    );

    expect(container.querySelectorAll('[data-slot="recent-workout-card-skeleton"]')).toHaveLength(4);
  });

  it('renders an empty state when there are no completed sessions', () => {
    vi.mocked(useRecentWorkouts).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useRecentWorkouts>);

    render(
      <MemoryRouter>
        <RecentWorkouts />
      </MemoryRouter>,
    );

    expect(screen.getByText('No completed workouts yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a workout' })).toHaveAttribute('href', '/workouts');
  });

  it('renders an error state when recent workouts query fails', () => {
    vi.mocked(useRecentWorkouts).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useRecentWorkouts>);

    render(
      <MemoryRouter>
        <RecentWorkouts />
      </MemoryRouter>,
    );

    expect(screen.getByText('Unable to load recent workouts.')).toBeInTheDocument();
    expect(screen.queryByText('No completed workouts yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Start a workout' })).not.toBeInTheDocument();
  });
});
