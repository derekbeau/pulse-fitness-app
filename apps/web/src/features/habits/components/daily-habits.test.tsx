import type { Habit, HabitEntry } from '@pulse/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCreateHabit,
  useDeleteHabit,
  useHabitEntries,
  useHabits,
  useReorderHabits,
  useToggleHabit,
  useUpdateHabit,
  useUpdateHabitEntry,
} from '@/features/habits/api/habits';
import { DailyHabits } from '@/features/habits/components/daily-habits';

vi.mock('@/features/habits/api/habits', () => ({
  useCreateHabit: vi.fn(),
  useDeleteHabit: vi.fn(),
  useHabitEntries: vi.fn(),
  useHabits: vi.fn(),
  useReorderHabits: vi.fn(),
  useToggleHabit: vi.fn(),
  useUpdateHabit: vi.fn(),
  useUpdateHabitEntry: vi.fn(),
}));

const mockedUseCreateHabit = vi.mocked(useCreateHabit);
const mockedUseDeleteHabit = vi.mocked(useDeleteHabit);
const mockedUseHabitEntries = vi.mocked(useHabitEntries);
const mockedUseHabits = vi.mocked(useHabits);
const mockedUseReorderHabits = vi.mocked(useReorderHabits);
const mockedUseToggleHabit = vi.mocked(useToggleHabit);
const mockedUseUpdateHabit = vi.mocked(useUpdateHabit);
const mockedUseUpdateHabitEntry = vi.mocked(useUpdateHabitEntry);

function createMutationMock() {
  return {
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    variables: undefined,
  };
}

const habits: Habit[] = [
  {
    active: true,
    createdAt: 1,
    emoji: '💧',
    id: 'hydrate',
    name: 'Hydrate',
    sortOrder: 0,
    target: 10,
    trackingType: 'numeric',
    unit: 'glasses',
    frequency: 'weekly',
    frequencyTarget: 3,
    scheduledDays: null,
    pausedUntil: null,
    updatedAt: 1,
    userId: 'user-1',
  },
  {
    active: true,
    createdAt: 2,
    emoji: '😴',
    id: 'sleep',
    name: 'Sleep',
    sortOrder: 1,
    target: 8,
    trackingType: 'time',
    unit: 'hours',
    frequency: 'specific_days',
    frequencyTarget: null,
    scheduledDays: [0, 2, 4],
    pausedUntil: null,
    updatedAt: 2,
    userId: 'user-1',
  },
  {
    active: true,
    createdAt: 3,
    emoji: '🥗',
    id: 'protein',
    name: 'Protein',
    sortOrder: 2,
    target: 100,
    trackingType: 'numeric',
    unit: 'grams',
    frequency: 'daily',
    frequencyTarget: null,
    scheduledDays: null,
    pausedUntil: '2026-04-01',
    updatedAt: 3,
    userId: 'user-1',
  },
];

const entries: HabitEntry[] = [
  {
    completed: true,
    createdAt: 1,
    date: '2026-03-10',
    habitId: 'hydrate',
    id: 'entry-hydrate',
    userId: 'user-1',
    value: 12,
  },
  {
    completed: false,
    createdAt: 2,
    date: '2026-03-10',
    habitId: 'sleep',
    id: 'entry-sleep',
    userId: 'user-1',
    value: 6.8,
  },
  {
    completed: false,
    createdAt: 3,
    date: '2026-03-10',
    habitId: 'protein',
    id: 'entry-protein',
    userId: 'user-1',
    value: 50,
  },
];

describe('DailyHabits', () => {
  beforeEach(() => {
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
    mockedUseToggleHabit.mockReturnValue(
      createMutationMock() as unknown as ReturnType<typeof useToggleHabit>,
    );
    mockedUseUpdateHabitEntry.mockReturnValue(
      createMutationMock() as unknown as ReturnType<typeof useUpdateHabitEntry>,
    );
    mockedUseCreateHabit.mockReturnValue(
      createMutationMock() as unknown as ReturnType<typeof useCreateHabit>,
    );
    mockedUseUpdateHabit.mockReturnValue(
      createMutationMock() as unknown as ReturnType<typeof useUpdateHabit>,
    );
    mockedUseDeleteHabit.mockReturnValue(
      createMutationMock() as unknown as ReturnType<typeof useDeleteHabit>,
    );
    mockedUseReorderHabits.mockReturnValue(
      createMutationMock() as unknown as ReturnType<typeof useReorderHabits>,
    );
  });

  it('renders a menu trigger for every habit card', () => {
    render(<DailyHabits />);

    expect(screen.getAllByRole('button', { name: /open habit actions for/i })).toHaveLength(3);
  });

  it('shows frequency subtitles and paused badge on cards', () => {
    render(<DailyHabits />);

    expect(screen.getByText('3x per week')).toBeInTheDocument();
    expect(screen.getByText('Mon, Wed, Fri')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('shows target percentages with threshold colors', () => {
    render(<DailyHabits />);

    expect(screen.getAllByText(/6\.8h \/ 8h/)).toHaveLength(2);
    expect(screen.getAllByText(/50 grams \/ 100 grams/)).toHaveLength(2);

    expect(screen.getByText(/—\s*120%/)).toHaveClass('text-emerald-700');
    expect(screen.getByText(/—\s*85%/)).toHaveClass('text-amber-700');
    expect(screen.getByText(/—\s*50%/)).toHaveClass('text-rose-700');
  });

  it('opens add habit dialog from the inline button', async () => {
    render(<DailyHabits />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Habit' }));

    expect(await screen.findByRole('heading', { name: 'Add habit' })).toBeInTheDocument();
  });

  it('loads entries for the selected date and uses it in updates', () => {
    const selectedDate = new Date('2026-03-04T00:00:00');
    const updateMutation = createMutationMock();
    mockedUseUpdateHabitEntry.mockReturnValue(
      updateMutation as unknown as ReturnType<typeof useUpdateHabitEntry>,
    );

    render(<DailyHabits selectedDate={selectedDate} />);

    expect(mockedUseHabitEntries).toHaveBeenCalledWith('2026-03-04', '2026-03-04');
    const hydrateInput = screen.getByRole('spinbutton', { name: 'Hydrate' });
    fireEvent.change(hydrateInput, { target: { value: '9' } });
    fireEvent.blur(hydrateInput);

    expect(updateMutation.mutate).toHaveBeenCalledWith({
      completed: false,
      date: '2026-03-04',
      habitId: 'hydrate',
      id: 'entry-hydrate',
      value: 9,
    });
  });
});
