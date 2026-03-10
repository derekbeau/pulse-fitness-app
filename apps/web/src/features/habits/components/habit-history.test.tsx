import type { Habit, HabitEntry } from '@pulse/shared';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useHabitEntries, useHabits } from '@/features/habits/api/habits';
import { HabitHistory } from '@/features/habits/components/habit-history';

vi.mock('@/features/habits/api/habits', () => ({
  useHabitEntries: vi.fn(),
  useHabits: vi.fn(),
}));

const mockedUseHabitEntries = vi.mocked(useHabitEntries);
const mockedUseHabits = vi.mocked(useHabits);

const toCreatedAt = (date: string) => new Date(`${date}T12:00:00`).getTime();

const habits: Habit[] = [
  {
    active: true,
    createdAt: toCreatedAt('2025-12-01'),
    emoji: '💧',
    id: 'hydrate',
    name: 'Hydrate',
    sortOrder: 0,
    target: 10,
    trackingType: 'numeric',
    unit: 'glasses',
    frequency: 'daily',
    frequencyTarget: null,
    scheduledDays: null,
    pausedUntil: null,
    updatedAt: 1,
    userId: 'user-1',
  },
  {
    active: true,
    createdAt: toCreatedAt('2026-03-01'),
    emoji: '🧘',
    id: 'mobility',
    name: 'Mobility',
    sortOrder: 1,
    target: null,
    trackingType: 'boolean',
    unit: null,
    frequency: 'specific_days',
    frequencyTarget: null,
    scheduledDays: [2],
    pausedUntil: null,
    updatedAt: 2,
    userId: 'user-1',
  },
  {
    active: true,
    createdAt: toCreatedAt('2026-02-20'),
    emoji: '💊',
    id: 'vitamins',
    name: 'Vitamins',
    sortOrder: 2,
    target: null,
    trackingType: 'boolean',
    unit: null,
    frequency: 'daily',
    frequencyTarget: null,
    scheduledDays: null,
    pausedUntil: null,
    updatedAt: 3,
    userId: 'user-1',
  },
];

const entries: HabitEntry[] = [
  {
    completed: false,
    createdAt: 1,
    date: '2026-03-10',
    habitId: 'hydrate',
    id: 'entry-hydrate',
    userId: 'user-1',
    value: 5,
  },
  {
    completed: true,
    createdAt: 2,
    date: '2026-03-10',
    habitId: 'mobility',
    id: 'entry-mobility',
    userId: 'user-1',
    value: null,
  },
];

describe('HabitHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00'));
    vi.clearAllMocks();

    mockedUseHabits.mockReturnValue({
      data: habits,
      error: null,
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useHabits>);

    mockedUseHabitEntries.mockReturnValue({
      data: entries,
      error: null,
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useHabitEntries>);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads a 90-day range from API hooks and renders wrapped history grids', () => {
    const { container } = render(<HabitHistory />);

    expect(mockedUseHabitEntries).toHaveBeenCalledWith('2025-12-11', '2026-03-10');
    expect(screen.getByText('Last 90 days')).toBeInTheDocument();

    const hydrateGrid = screen.getByTestId('habit-history-grid-hydrate');
    expect(hydrateGrid).toHaveClass('flex', 'flex-wrap', 'gap-1');
    expect(container.querySelector('.overflow-x-auto')).toBeNull();
    expect(container.querySelector('.min-w-max')).toBeNull();
  });

  it('shows schedule-aware completion rate text and numeric intensity coloring', () => {
    render(<HabitHistory />);

    expect(screen.getByTestId('habit-completion-rate-hydrate')).toHaveTextContent(
      '0% completion rate (last 90 days)',
    );
    expect(screen.getByTestId('habit-completion-rate-mobility')).toHaveTextContent(
      '50% completion rate (last 90 days)',
    );

    const hydrateToday = screen.getByRole('button', {
      name: 'Hydrate: Mar 10 - 5/10 glasses',
    });

    expect(hydrateToday).toHaveAttribute('data-percent', '50');
    expect(hydrateToday.getAttribute('style')).toContain(
      'background-color: color-mix(in srgb, #10b981 50%, var(--color-border));',
    );
  });

  it('shows row-level empty state when a habit has no entries', () => {
    render(<HabitHistory />);

    expect(screen.getByText('Vitamins')).toBeInTheDocument();
    expect(screen.getByText('No history yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('habit-history-grid-vitamins')).not.toBeInTheDocument();
  });

  it('renders a loading card while habit history queries are pending', () => {
    mockedUseHabits.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isLoading: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useHabits>);

    mockedUseHabitEntries.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isLoading: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useHabitEntries>);

    render(<HabitHistory />);

    expect(screen.getByText('Loading habit history.')).toBeInTheDocument();
  });
});
