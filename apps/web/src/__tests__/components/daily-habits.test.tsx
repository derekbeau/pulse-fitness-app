import { fireEvent, render, screen } from '@testing-library/react';
import type { Habit, HabitEntry } from '@pulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DailyHabits } from '@/features/habits';
import {
  useHabitEntries,
  useHabits,
  useToggleHabit,
  useUpdateHabitEntry,
} from '@/features/habits/api/habits';

vi.mock('@/features/habits/api/habits', () => ({
  useHabitEntries: vi.fn(),
  useHabits: vi.fn(),
  useToggleHabit: vi.fn(),
  useUpdateHabitEntry: vi.fn(),
}));

const mockedUseHabits = vi.mocked(useHabits);
const mockedUseHabitEntries = vi.mocked(useHabitEntries);
const mockedUseToggleHabit = vi.mocked(useToggleHabit);
const mockedUseUpdateHabitEntry = vi.mocked(useUpdateHabitEntry);

const toggleMutate = vi.fn();
const updateMutate = vi.fn();

const habits: Habit[] = [
  {
    id: 'habit-mobility',
    userId: 'user-1',
    name: 'Mobility',
    emoji: '🧘',
    trackingType: 'boolean',
    target: null,
    unit: null,
    sortOrder: 0,
    active: true,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'habit-hydrate',
    userId: 'user-1',
    name: 'Hydrate',
    emoji: '💧',
    trackingType: 'numeric',
    target: 8,
    unit: 'glasses',
    sortOrder: 1,
    active: true,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'habit-sleep',
    userId: 'user-1',
    name: 'Sleep',
    emoji: '😴',
    trackingType: 'time',
    target: 8,
    unit: 'hours',
    sortOrder: 2,
    active: true,
    createdAt: 1,
    updatedAt: 1,
  },
];

const entries: HabitEntry[] = [
  {
    id: 'entry-mobility',
    habitId: 'habit-mobility',
    userId: 'user-1',
    date: '2026-03-07',
    completed: false,
    value: null,
    createdAt: 10,
  },
  {
    id: 'entry-hydrate',
    habitId: 'habit-hydrate',
    userId: 'user-1',
    date: '2026-03-07',
    completed: false,
    value: 6,
    createdAt: 11,
  },
];

function mockUseHabitsResult(overrides: Partial<ReturnType<typeof useHabits>> = {}) {
  mockedUseHabits.mockReturnValue({
    data: habits,
    error: null,
    isError: false,
    isLoading: false,
    isPending: false,
    refetch: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useHabits>);
}

function mockUseHabitEntriesResult(overrides: Partial<ReturnType<typeof useHabitEntries>> = {}) {
  mockedUseHabitEntries.mockReturnValue({
    data: entries,
    error: null,
    isError: false,
    isLoading: false,
    isPending: false,
    refetch: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useHabitEntries>);
}

describe('DailyHabits', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-07T12:00:00'));

    toggleMutate.mockReset();
    updateMutate.mockReset();

    mockUseHabitsResult();
    mockUseHabitEntriesResult();

    mockedUseToggleHabit.mockReturnValue({
      isPending: false,
      mutate: toggleMutate,
      variables: undefined,
    } as unknown as ReturnType<typeof useToggleHabit>);
    mockedUseUpdateHabitEntry.mockReturnValue({
      isPending: false,
      mutate: updateMutate,
      variables: undefined,
    } as unknown as ReturnType<typeof useUpdateHabitEntry>);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a loading skeleton while habit queries are pending', () => {
    mockUseHabitsResult({ isLoading: true });
    mockUseHabitEntriesResult({ isLoading: true });

    render(<DailyHabits />);

    expect(screen.getByLabelText('Loading daily habits')).toBeInTheDocument();
    expect(screen.getAllByTestId('habit-row-skeleton')).toHaveLength(3);
  });

  it('shows an error state and retries both queries when loading fails', () => {
    const refetchHabits = vi.fn();
    const refetchEntries = vi.fn();

    mockUseHabitsResult({
      error: new Error('Habits API unavailable'),
      isError: true,
      refetch: refetchHabits,
    });
    mockUseHabitEntriesResult({
      error: new Error('Entries API unavailable'),
      isError: true,
      refetch: refetchEntries,
    });

    render(<DailyHabits />);

    expect(screen.getByText('Habits API unavailable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(refetchHabits).toHaveBeenCalledTimes(1);
    expect(refetchEntries).toHaveBeenCalledTimes(1);
  });

  it('renders habits with the correct controls and current progress', () => {
    render(<DailyHabits />);

    expect(screen.getByRole('checkbox', { name: 'Mobility' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Hydrate' })).toHaveValue(6);
    expect(screen.getByRole('spinbutton', { name: 'Sleep' })).toHaveValue(null);
    expect(screen.getByText('0 of 3 habits complete')).toBeInTheDocument();
  });

  it('toggles boolean habits through the upsert mutation', () => {
    render(<DailyHabits />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Mobility' }));

    expect(toggleMutate).toHaveBeenCalledWith({
      completed: true,
      date: '2026-03-07',
      entryId: 'entry-mobility',
      habitId: 'habit-mobility',
    });
  });

  it('patches an existing numeric entry when the value is changed', () => {
    render(<DailyHabits />);

    const input = screen.getByRole('spinbutton', { name: 'Hydrate' });

    fireEvent.change(input, { target: { value: '8' } });
    fireEvent.blur(input);

    expect(updateMutate).toHaveBeenCalledWith({
      completed: true,
      date: '2026-03-07',
      habitId: 'habit-hydrate',
      id: 'entry-hydrate',
      value: 8,
    });
  });

  it('reflects numeric progress from draft input before blur', () => {
    render(<DailyHabits />);

    const input = screen.getByRole('spinbutton', { name: 'Hydrate' });
    fireEvent.change(input, { target: { value: '8' } });

    expect(screen.getAllByText('8 / 8 glasses')).toHaveLength(2);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('creates a numeric or time entry through the upsert mutation when none exists yet', () => {
    render(<DailyHabits />);

    const input = screen.getByRole('spinbutton', { name: 'Sleep' });

    fireEvent.change(input, { target: { value: '8.5' } });
    fireEvent.blur(input);

    expect(toggleMutate).toHaveBeenCalledWith({
      completed: true,
      date: '2026-03-07',
      entryId: null,
      habitId: 'habit-sleep',
      value: 8.5,
    });
  });
});
