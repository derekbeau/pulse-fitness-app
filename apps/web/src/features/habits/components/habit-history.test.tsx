import { render, screen } from '@testing-library/react';
import type { Habit, HabitEntry } from '@pulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useHabitEntries, useHabits } from '@/features/habits/api/habits';
import { HabitHistory } from '@/features/habits/components/habit-history';

vi.mock('@/features/habits/api/habits', () => ({
  useHabitEntries: vi.fn(),
  useHabits: vi.fn(),
}));

const mockedUseHabits = vi.mocked(useHabits);
const mockedUseHabitEntries = vi.mocked(useHabitEntries);

function buildHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit-1',
    userId: 'user-1',
    name: 'Meditation',
    emoji: '🧘',
    trackingType: 'boolean',
    target: null,
    unit: null,
    frequency: 'weekly',
    frequencyTarget: 3,
    scheduledDays: null,
    pausedUntil: null,
    sortOrder: 0,
    active: true,
    createdAt: Date.parse('2026-03-01T00:00:00Z'),
    updatedAt: Date.parse('2026-03-01T00:00:00Z'),
    ...overrides,
  };
}

function buildEntry(overrides: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: 'entry-1',
    userId: 'user-1',
    habitId: 'habit-1',
    date: '2026-03-04',
    completed: true,
    value: null,
    createdAt: 1,
    ...overrides,
  };
}

function mockQueries(habits: Habit[], entries: HabitEntry[]) {
  mockedUseHabits.mockReturnValue({
    data: habits,
    error: null,
    isError: false,
    isLoading: false,
    isPending: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useHabits>);
  mockedUseHabitEntries.mockReturnValue({
    data: entries,
    error: null,
    isError: false,
    isLoading: false,
    isPending: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useHabitEntries>);
}

describe('HabitHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00'));
    mockQueries([buildHabit()], [buildEntry()]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders history cells in a wrapped grid for habits with logged entries', () => {
    const { container } = render(<HabitHistory />);

    expect(screen.getByText('Last 90 days')).toBeInTheDocument();
    expect(screen.getByTestId('habit-history-grid-habit-1')).toBeInTheDocument();
    expect(container.querySelector('.overflow-x-auto')).not.toBeInTheDocument();
  });

  it('shows completion legend, completion-rate wording, and boolean status colors', () => {
    render(<HabitHistory />);

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Not completed')).toBeInTheDocument();
    expect(screen.getByText('Numeric/time intensity by target %')).toBeInTheDocument();
    expect(screen.getByTestId('habit-completion-rate-habit-1')).toHaveTextContent(
      '% completion rate (last 90 days)',
    );

    const completedCell = screen.getByRole('button', {
      name: 'Meditation: 2026-03-04 - Completed',
    });

    expect(completedCell).toHaveClass('bg-emerald-500');
  });

  it('shows a per-habit empty state when a habit has no entries', () => {
    mockQueries([buildHabit()], []);

    render(<HabitHistory />);

    expect(screen.getByText('Meditation')).toBeInTheDocument();
    expect(screen.getByText('No history yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('habit-history-grid-habit-1')).not.toBeInTheDocument();
  });

  it('computes schedule-aware completion rate from scheduled days only', () => {
    const specificDaysHabit = buildHabit({
      frequency: 'specific_days',
      scheduledDays: [2, 4],
      createdAt: Date.parse('2026-03-03T00:00:00Z'),
    });
    const specificDayEntries = [
      buildEntry({
        date: '2026-03-03',
      }),
    ];

    mockQueries([specificDaysHabit], specificDayEntries);

    render(<HabitHistory />);

    expect(screen.getByTestId('habit-completion-rate-habit-1')).toHaveTextContent(
      '50% completion rate (last 90 days)',
    );
  });

  it('renders numeric habit entries with intensity styling by target completion', () => {
    const numericHabit = buildHabit({
      id: 'habit-2',
      name: 'Hydration',
      emoji: '💧',
      trackingType: 'numeric',
      target: 10,
      unit: 'glasses',
      frequency: 'daily',
      frequencyTarget: null,
      createdAt: Date.parse('2026-03-05T00:00:00Z'),
    });
    const numericEntries = [
      buildEntry({
        id: 'entry-2',
        habitId: 'habit-2',
        date: '2026-03-05',
        completed: false,
        value: 5,
      }),
    ];

    mockQueries([numericHabit], numericEntries);

    render(<HabitHistory />);

    const intensityCell = screen.getByRole('button', {
      name: 'Hydration: 2026-03-05 - Logged 5/10 glasses',
    });

    expect(intensityCell.getAttribute('style')).toContain('color-mix');
    expect(intensityCell).toHaveAttribute('data-status', 'missed');
  });

  it('renders a loading state card while data is loading', () => {
    mockedUseHabits.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isLoading: true,
      isPending: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useHabits>);
    mockedUseHabitEntries.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isLoading: true,
      isPending: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useHabitEntries>);

    render(<HabitHistory />);

    expect(screen.getByText('Loading habit history...')).toBeInTheDocument();
  });
});
