import type { Habit } from '@pulse/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCreateHabit,
  useDeleteHabit,
  useHabits,
  useReorderHabits,
  useUpdateHabit,
} from '@/features/habits/api/habits';
import { HabitSettings } from '@/features/habits/components/habit-settings';

vi.mock('@/features/habits/api/habits', () => ({
  useCreateHabit: vi.fn(),
  useDeleteHabit: vi.fn(),
  useHabits: vi.fn(),
  useReorderHabits: vi.fn(),
  useUpdateHabit: vi.fn(),
}));

const mockedUseCreateHabit = vi.mocked(useCreateHabit);
const mockedUseDeleteHabit = vi.mocked(useDeleteHabit);
const mockedUseHabits = vi.mocked(useHabits);
const mockedUseReorderHabits = vi.mocked(useReorderHabits);
const mockedUseUpdateHabit = vi.mocked(useUpdateHabit);

const habits: Habit[] = [
  {
    active: true,
    createdAt: 1,
    emoji: '💧',
    id: 'hydrate',
    name: 'Hydrate',
    sortOrder: 0,
    target: 8,
    trackingType: 'numeric',
    unit: 'glasses',
    updatedAt: 1,
    userId: 'user-1',
  },
  {
    active: true,
    createdAt: 2,
    emoji: '💊',
    id: 'vitamins',
    name: 'Take vitamins',
    sortOrder: 1,
    target: null,
    trackingType: 'boolean',
    unit: null,
    updatedAt: 2,
    userId: 'user-1',
  },
  {
    active: true,
    createdAt: 3,
    emoji: '😴',
    id: 'sleep',
    name: 'Sleep',
    sortOrder: 2,
    target: 8,
    trackingType: 'time',
    unit: 'hours',
    updatedAt: 3,
    userId: 'user-1',
  },
];

function createMutationMock() {
  return {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  };
}

describe('HabitSettings', () => {
  beforeEach(() => {
    mockedUseHabits.mockReturnValue({
      data: habits,
      error: null,
      isError: false,
      isPending: false,
    } as ReturnType<typeof useHabits>);
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

  it('shows a loading state while habits are being fetched', () => {
    mockedUseHabits.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isPending: true,
    } as ReturnType<typeof useHabits>);

    render(<HabitSettings />);

    expect(screen.getByText('Loading habits...')).toBeInTheDocument();
  });

  it('creates a numeric habit through the create mutation', async () => {
    const createMutation = createMutationMock();
    mockedUseCreateHabit.mockReturnValue(
      createMutation as unknown as ReturnType<typeof useCreateHabit>,
    );

    render(<HabitSettings />);

    const addHabitButton = screen.getAllByRole('button', { name: 'Add habit' })[0];

    if (!addHabitButton) {
      throw new Error('Expected add habit button.');
    }

    fireEvent.click(addHabitButton);
    fireEvent.change(screen.getByLabelText('Habit name'), { target: { value: 'Stretch' } });
    fireEvent.change(screen.getByLabelText('Tracking type'), { target: { value: 'numeric' } });
    fireEvent.change(screen.getByLabelText('Target'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'minutes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(createMutation.mutateAsync).toHaveBeenCalledWith({
        emoji: '💧',
        name: 'Stretch',
        target: 15,
        trackingType: 'numeric',
        unit: 'minutes',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument());
  });

  it('pre-fills habit data when editing and calls the update mutation', async () => {
    const updateMutation = createMutationMock();
    mockedUseUpdateHabit.mockReturnValue(
      updateMutation as unknown as ReturnType<typeof useUpdateHabit>,
    );

    render(<HabitSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Hydrate' }));

    expect(screen.getByLabelText('Habit name')).toHaveValue('Hydrate');
    expect(screen.getByLabelText('Tracking type')).toHaveValue('numeric');
    expect(screen.getByLabelText('Target')).toHaveValue(8);
    expect(screen.getByLabelText('Unit')).toHaveValue('glasses');

    fireEvent.change(screen.getByLabelText('Habit name'), { target: { value: 'Hydration' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
        id: 'hydrate',
        values: {
          emoji: '💧',
          name: 'Hydration',
          target: 8,
          trackingType: 'numeric',
          unit: 'glasses',
        },
      }),
    );
  });

  it('deletes habits only after confirmation', async () => {
    const deleteMutation = createMutationMock();
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    mockedUseDeleteHabit.mockReturnValue(
      deleteMutation as unknown as ReturnType<typeof useDeleteHabit>,
    );

    render(<HabitSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Sleep' }));
    expect(deleteMutation.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Sleep' }));

    await waitFor(() => expect(deleteMutation.mutateAsync).toHaveBeenCalledWith({ id: 'sleep' }));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it('reorders habits with the up and down controls', async () => {
    const reorderMutation = createMutationMock();
    mockedUseReorderHabits.mockReturnValue(
      reorderMutation as unknown as ReturnType<typeof useReorderHabits>,
    );

    render(<HabitSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Move Hydrate down' }));

    await waitFor(() =>
      expect(reorderMutation.mutateAsync).toHaveBeenCalledWith([
        { id: 'vitamins', sortOrder: 0 },
        { id: 'hydrate', sortOrder: 1 },
        { id: 'sleep', sortOrder: 2 },
      ]),
    );
  });

  it('shows target and unit fields for boolean habits in a disabled state', () => {
    render(<HabitSettings />);

    const addHabitButton = screen.getAllByRole('button', { name: 'Add habit' })[0];

    if (!addHabitButton) {
      throw new Error('Expected add habit button.');
    }

    fireEvent.click(addHabitButton);

    expect(screen.getByLabelText('Tracking type')).toHaveValue('boolean');
    expect(screen.getByLabelText('Target')).toBeDisabled();
    expect(screen.getByLabelText('Unit')).toBeDisabled();
  });

  it('closes the form when cancel is pressed', () => {
    render(<HabitSettings />);

    const addHabitButton = screen.getAllByRole('button', { name: 'Add habit' })[0];

    if (!addHabitButton) {
      throw new Error('Expected add habit button.');
    }

    fireEvent.click(addHabitButton);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByText('Configuration tips')).toBeInTheDocument();
  });
});
