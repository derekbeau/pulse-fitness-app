import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Habit, HabitEntry } from '@pulse/shared';
import { describe, expect, it, vi } from 'vitest';

import { useUpdateHabitEntry } from '@/features/habits/api/habits';

import { HabitDayModal } from './habit-day-modal';

vi.mock('@/features/habits/api/habits', () => ({
  useUpdateHabitEntry: vi.fn(),
}));

const mockedUseUpdateHabitEntry = vi.mocked(useUpdateHabitEntry);

function createMutationMock() {
  return {
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  };
}

const baseHabit: Habit = {
  id: 'habit-1',
  userId: 'user-1',
  name: 'Hydrate',
  description: null,
  emoji: '💧',
  trackingType: 'boolean',
  target: null,
  unit: null,
  frequency: 'daily',
  frequencyTarget: null,
  scheduledDays: null,
  pausedUntil: null,
  referenceSource: null,
  referenceConfig: null,
  sortOrder: 0,
  active: true,
  createdAt: 1,
  updatedAt: 1,
};

function renderHabitDayModal({
  date = '2026-03-09',
  entry = null,
  habit = baseHabit,
  isScheduled = true,
  status = 'not_scheduled',
}: {
  date?: string;
  entry?: HabitEntry | null;
  habit?: Habit;
  isScheduled?: boolean;
  status?: 'completed' | 'missed' | 'not_scheduled';
} = {}) {
  return render(
    <HabitDayModal
      date={date}
      entry={entry}
      habit={habit}
      isOpen
      isScheduled={isScheduled}
      onOpenChange={vi.fn()}
      status={status}
    />,
  );
}

describe('HabitDayModal', () => {
  it('saves boolean habits with the selected completion state', async () => {
    const mutation = createMutationMock();
    mockedUseUpdateHabitEntry.mockReturnValue(
      mutation as unknown as ReturnType<typeof useUpdateHabitEntry>,
    );
    const entry: HabitEntry = {
      id: 'entry-1',
      habitId: 'habit-1',
      userId: 'user-1',
      date: '2026-03-09',
      completed: true,
      value: null,
      createdAt: 1,
    };

    renderHabitDayModal({
      entry,
      status: 'completed',
    });

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Not done' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(mutation.mutateAsync).toHaveBeenCalledWith({
      id: 'entry-1',
      habitId: 'habit-1',
      date: '2026-03-09',
      completed: false,
    });
  });

  it('renders numeric input controls and creates a missing numeric entry', async () => {
    const mutation = createMutationMock();
    mockedUseUpdateHabitEntry.mockReturnValue(
      mutation as unknown as ReturnType<typeof useUpdateHabitEntry>,
    );
    const habit: Habit = {
      ...baseHabit,
      name: 'Water',
      trackingType: 'numeric',
      target: 8,
      unit: 'glasses',
    };

    renderHabitDayModal({
      habit,
      status: 'missed',
    });

    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText('Water (glasses)');
    fireEvent.change(input, { target: { value: '8' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(mutation.mutateAsync).toHaveBeenCalledWith({
      habitId: 'habit-1',
      date: '2026-03-09',
      completed: true,
      value: 8,
    });
  });

  it('renders duration inputs for time habits and converts them to stored hours', async () => {
    const mutation = createMutationMock();
    mockedUseUpdateHabitEntry.mockReturnValue(
      mutation as unknown as ReturnType<typeof useUpdateHabitEntry>,
    );
    const habit: Habit = {
      ...baseHabit,
      name: 'Sleep',
      trackingType: 'time',
      target: 8,
      unit: 'hours',
    };
    const entry: HabitEntry = {
      id: 'entry-2',
      habitId: 'habit-1',
      userId: 'user-1',
      date: '2026-03-09',
      completed: false,
      value: 7.5,
      createdAt: 2,
    };

    renderHabitDayModal({
      habit,
      entry,
      status: 'missed',
    });

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Hours'), { target: { value: '8' } });
    fireEvent.change(within(dialog).getByLabelText('Minutes'), { target: { value: '15' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(mutation.mutateAsync).toHaveBeenCalledWith({
      id: 'entry-2',
      habitId: 'habit-1',
      date: '2026-03-09',
      completed: true,
      value: 8.25,
    });
  });

  it('shows a read-only message for unscheduled days without entries', () => {
    const mutation = createMutationMock();
    mockedUseUpdateHabitEntry.mockReturnValue(
      mutation as unknown as ReturnType<typeof useUpdateHabitEntry>,
    );

    renderHabitDayModal({
      isScheduled: false,
      status: 'not_scheduled',
    });

    expect(
      screen.getByText('This habit was not scheduled for this day, so there is nothing to log here.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
