import type { Habit, HabitEntry } from '@pulse/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useHabitEntries,
  useHabits,
  useToggleHabit,
} from '@/features/habits/api/habits';

import { HabitDailyStatusCard } from './habit-daily-status-card';

vi.mock('@/features/habits/api/habits', () => ({
  useHabitEntries: vi.fn(),
  useHabits: vi.fn(),
  useToggleHabit: vi.fn(),
}));

const mockedUseHabits = vi.mocked(useHabits);
const mockedUseHabitEntries = vi.mocked(useHabitEntries);
const mockedUseToggleHabit = vi.mocked(useToggleHabit);

const habitsFixture: Habit[] = [
  {
    active: true,
    createdAt: 1,
    emoji: null,
    id: 'habit-water',
    name: 'Water',
    description: null,
    sortOrder: 0,
    target: 100,
    trackingType: 'numeric',
    unit: 'oz',
    frequency: 'daily',
    frequencyTarget: null,
    scheduledDays: null,
    pausedUntil: null,
    updatedAt: 1,
    userId: 'user-1',
  },
  {
    active: true,
    createdAt: 2,
    emoji: null,
    id: 'habit-meditate',
    name: 'Meditate',
    description: null,
    sortOrder: 1,
    target: null,
    trackingType: 'boolean',
    unit: null,
    frequency: 'daily',
    frequencyTarget: null,
    scheduledDays: null,
    pausedUntil: null,
    updatedAt: 2,
    userId: 'user-1',
  },
  {
    active: true,
    createdAt: 3,
    emoji: null,
    id: 'habit-sleep',
    name: 'Sleep',
    description: null,
    sortOrder: 2,
    target: 8,
    trackingType: 'numeric',
    unit: 'h',
    frequency: 'daily',
    frequencyTarget: null,
    scheduledDays: null,
    pausedUntil: null,
    updatedAt: 3,
    userId: 'user-1',
  },
];

const entriesFixture: HabitEntry[] = [
  {
    completed: false,
    createdAt: 1,
    date: '2026-03-06',
    habitId: 'habit-water',
    id: 'entry-water',
    userId: 'user-1',
    value: 52,
  },
  {
    completed: false,
    createdAt: 2,
    date: '2026-03-06',
    habitId: 'habit-meditate',
    id: 'entry-meditate',
    userId: 'user-1',
    value: null,
  },
  {
    completed: true,
    createdAt: 3,
    date: '2026-03-06',
    habitId: 'habit-sleep',
    id: 'entry-sleep',
    userId: 'user-1',
    value: 8,
  },
];

function mockHabitHooks({
  entries = entriesFixture,
  habits = habitsFixture,
  mutate = vi.fn(),
}: {
  entries?: HabitEntry[];
  habits?: Habit[];
  mutate?: ReturnType<typeof vi.fn>;
}) {
  mockedUseHabits.mockReturnValue({
    data: habits,
    error: null,
    isError: false,
    isLoading: false,
  } as unknown as ReturnType<typeof useHabits>);

  mockedUseHabitEntries.mockReturnValue({
    data: entries,
    error: null,
    isError: false,
    isLoading: false,
  } as unknown as ReturnType<typeof useHabitEntries>);

  mockedUseToggleHabit.mockReturnValue({
    isPending: false,
    mutate,
    variables: undefined,
  } as unknown as ReturnType<typeof useToggleHabit>);

  return { mutate };
}

describe('HabitDailyStatusCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T09:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    mockedUseHabits.mockReset();
    mockedUseHabitEntries.mockReset();
    mockedUseToggleHabit.mockReset();
  });

  it('renders numeric habit values and progress against target', () => {
    mockHabitHooks({});

    render(<HabitDailyStatusCard habitId="habit-water" />);

    expect(screen.getByText('Water')).toBeInTheDocument();
    expect(screen.getByText('52 oz')).toBeInTheDocument();
    expect(screen.getByText('Target: 100 oz')).toBeInTheDocument();
    expect(screen.getByText('52%')).toBeInTheDocument();
    expect(screen.getByLabelText('Water daily progress')).toHaveAttribute('aria-valuenow', '52');
  });

  it('renders boolean habit cards with checkbox state text', () => {
    mockHabitHooks({
      entries: [
        {
          completed: true,
          createdAt: 5,
          date: '2026-03-06',
          habitId: 'habit-meditate',
          id: 'entry-meditate',
          userId: 'user-1',
          value: null,
        },
      ],
    });

    render(<HabitDailyStatusCard habitId="habit-meditate" />);

    expect(screen.getByText('Meditate')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Meditate completion' })).toBeChecked();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('saves numeric inline edits on blur', () => {
    const { mutate } = mockHabitHooks({});

    render(<HabitDailyStatusCard habitId="habit-water" />);

    fireEvent.click(screen.getByTestId('habit-daily-value-button-habit-water'));

    const valueInput = screen.getByTestId('habit-daily-value-input-habit-water');
    fireEvent.change(valueInput, { target: { value: '67' } });
    fireEvent.blur(valueInput);

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        completed: false,
        date: '2026-03-06',
        entryId: 'entry-water',
        habitId: 'habit-water',
        value: 67,
      }),
    );
  });

  it('toggles boolean habit completion and saves immediately', () => {
    const { mutate } = mockHabitHooks({
      entries: [
        {
          completed: false,
          createdAt: 5,
          date: '2026-03-06',
          habitId: 'habit-meditate',
          id: 'entry-meditate',
          userId: 'user-1',
          value: null,
        },
      ],
    });

    render(<HabitDailyStatusCard habitId="habit-meditate" />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Meditate completion' }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        completed: true,
        date: '2026-03-06',
        entryId: 'entry-meditate',
        habitId: 'habit-meditate',
      }),
    );
  });

  it('renders multiple habit daily cards independently', () => {
    const { mutate } = mockHabitHooks({});

    render(
      <>
        <HabitDailyStatusCard habitId="habit-water" />
        <HabitDailyStatusCard habitId="habit-sleep" />
      </>,
    );

    expect(screen.getByTestId('habit-daily-status-card-habit-water')).toBeInTheDocument();
    expect(screen.getByTestId('habit-daily-status-card-habit-sleep')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('habit-daily-value-button-habit-water'));
    const waterInput = screen.getByTestId('habit-daily-value-input-habit-water');
    fireEvent.change(waterInput, { target: { value: '60' } });
    fireEvent.blur(waterInput);

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        habitId: 'habit-water',
      }),
    );
    expect(mutate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        habitId: 'habit-sleep',
      }),
    );
  });
});
