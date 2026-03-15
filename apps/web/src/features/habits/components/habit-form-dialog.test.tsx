import type { Habit } from '@pulse/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateHabit, useUpdateHabit } from '@/features/habits/api/habits';
import { HabitFormDialog } from '@/features/habits/components/habit-form-dialog';

vi.mock('@/features/habits/api/habits', () => ({
  useCreateHabit: vi.fn(),
  useUpdateHabit: vi.fn(),
}));

const mockedUseCreateHabit = vi.mocked(useCreateHabit);
const mockedUseUpdateHabit = vi.mocked(useUpdateHabit);

const existingHabit: Habit = {
  active: true,
  createdAt: 1,
  emoji: '😴',
  id: 'sleep',
  name: 'Sleep',
  description: null,
  sortOrder: 0,
  target: 8,
  trackingType: 'time',
  unit: 'hours',
  frequency: 'daily',
  frequencyTarget: null,
  scheduledDays: null,
  pausedUntil: null,
  updatedAt: 1,
  userId: 'user-1',
};

function createMutationMock() {
  return {
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  };
}

describe('HabitFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedUseCreateHabit.mockReturnValue(
      createMutationMock() as unknown as ReturnType<typeof useCreateHabit>,
    );
    mockedUseUpdateHabit.mockReturnValue(
      createMutationMock() as unknown as ReturnType<typeof useUpdateHabit>,
    );
  });

  it('creates a habit in add mode and closes on success', async () => {
    const onOpenChange = vi.fn();
    const createMutation = createMutationMock();
    mockedUseCreateHabit.mockReturnValue(
      createMutation as unknown as ReturnType<typeof useCreateHabit>,
    );

    render(<HabitFormDialog onOpenChange={onOpenChange} open />);

    fireEvent.change(screen.getByLabelText('Habit name'), { target: { value: 'Hydrate' } });
    fireEvent.change(screen.getByLabelText('Tracking type'), { target: { value: 'numeric' } });
    fireEvent.change(screen.getByLabelText('Target'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'glasses' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(createMutation.mutateAsync).toHaveBeenCalledWith({
        description: null,
        emoji: '💧',
        frequency: 'daily',
        frequencyTarget: null,
        name: 'Hydrate',
        pausedUntil: null,
        scheduledDays: null,
        target: 8,
        trackingType: 'numeric',
        unit: 'glasses',
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('uses the compact dialog and form spacing classes', () => {
    render(<HabitFormDialog onOpenChange={vi.fn()} open />);

    expect(screen.getByRole('dialog')).toHaveClass('gap-4', 'p-5');
    expect(document.querySelector('form')).toHaveClass('space-y-4');
    expect(document.querySelector('[data-slot="dialog-footer"]')).toHaveClass('pt-1');
  });

  it('uses edit mode defaults and calls update mutation', async () => {
    const onOpenChange = vi.fn();
    const updateMutation = createMutationMock();
    mockedUseUpdateHabit.mockReturnValue(
      updateMutation as unknown as ReturnType<typeof useUpdateHabit>,
    );

    render(<HabitFormDialog habit={existingHabit} onOpenChange={onOpenChange} open />);

    expect(screen.getByText('Edit habit')).toBeInTheDocument();
    expect(screen.getByLabelText('Habit name')).toHaveValue('Sleep');
    expect(screen.getByLabelText('Tracking type')).toHaveValue('time');
    expect(screen.getByLabelText('Target')).toHaveValue(8);
    expect(screen.getByLabelText('Unit')).toHaveValue('hours');

    fireEvent.change(screen.getByLabelText('Habit name'), { target: { value: 'Sleep 8+' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
        id: 'sleep',
        values: {
          description: null,
          emoji: '😴',
          frequency: 'daily',
          frequencyTarget: null,
          name: 'Sleep 8+',
          pausedUntil: null,
          scheduledDays: null,
          target: 8,
          trackingType: 'time',
          unit: 'hours',
        },
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('hides target and unit fields for boolean tracking type', () => {
    render(<HabitFormDialog onOpenChange={vi.fn()} open />);

    expect(screen.getByLabelText('Tracking type')).toHaveValue('boolean');
    expect(screen.queryByLabelText('Target')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Unit')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tracking type'), { target: { value: 'numeric' } });

    expect(screen.getByLabelText('Target')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tracking type'), { target: { value: 'boolean' } });

    expect(screen.queryByLabelText('Target')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Unit')).not.toBeInTheDocument();
  });

  it('updates placeholders when switching tracking type', () => {
    render(<HabitFormDialog onOpenChange={vi.fn()} open />);

    fireEvent.change(screen.getByLabelText('Tracking type'), { target: { value: 'numeric' } });

    expect(screen.getByLabelText('Target')).toHaveAttribute('placeholder', '8');
    expect(screen.getByLabelText('Unit')).toHaveAttribute('placeholder', 'glasses');

    fireEvent.change(screen.getByLabelText('Tracking type'), { target: { value: 'time' } });

    expect(screen.getByLabelText('Target')).toHaveAttribute('placeholder', '8');
    expect(screen.getByLabelText('Unit')).toHaveAttribute('placeholder', 'hours');
  });

  it('shows weekly target input only when weekly frequency is selected', () => {
    render(<HabitFormDialog onOpenChange={vi.fn()} open />);

    expect(screen.getByLabelText('Frequency')).toHaveValue('daily');
    expect(screen.queryByLabelText('Times per week')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Frequency'), { target: { value: 'weekly' } });
    expect(screen.getByLabelText('Times per week')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Frequency'), { target: { value: 'daily' } });
    expect(screen.queryByLabelText('Times per week')).not.toBeInTheDocument();
  });

  it('shows specific-day toggles and submits selected weekdays', async () => {
    const createMutation = createMutationMock();
    mockedUseCreateHabit.mockReturnValue(
      createMutation as unknown as ReturnType<typeof useCreateHabit>,
    );

    render(<HabitFormDialog onOpenChange={vi.fn()} open />);

    fireEvent.change(screen.getByLabelText('Habit name'), { target: { value: 'Mobility' } });
    fireEvent.change(screen.getByLabelText('Frequency'), { target: { value: 'specific_days' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fri' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(createMutation.mutateAsync).toHaveBeenCalledWith({
        description: null,
        emoji: '💧',
        frequency: 'specific_days',
        frequencyTarget: null,
        name: 'Mobility',
        pausedUntil: null,
        scheduledDays: [0, 2, 4],
        target: null,
        trackingType: 'boolean',
        unit: null,
      }),
    );
  });

  it('validates required fields using zod schema rules', async () => {
    const createMutation = createMutationMock();
    mockedUseCreateHabit.mockReturnValue(
      createMutation as unknown as ReturnType<typeof useCreateHabit>,
    );

    render(<HabitFormDialog onOpenChange={vi.fn()} open />);

    fireEvent.change(screen.getByLabelText('Tracking type'), { target: { value: 'numeric' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByText('String must contain at least 1 character(s)')).toBeInTheDocument(),
    );
    expect(screen.getByText('Target is required for numeric and time habits')).toBeInTheDocument();
    expect(screen.getByText('Unit is required for numeric and time habits')).toBeInTheDocument();
    expect(createMutation.mutateAsync).not.toHaveBeenCalled();
  });
});
