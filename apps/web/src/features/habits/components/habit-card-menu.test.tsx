import type { Habit } from '@pulse/shared';
import type { MouseEvent, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDeleteHabit, useReorderHabits, useUpdateHabit } from '@/features/habits/api/habits';
import { HabitCardMenu } from '@/features/habits/components/habit-card-menu';

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
    onSelect,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
    onSelect?: (event: MouseEvent<HTMLButtonElement>) => void;
  }) => (
    <button
      disabled={disabled}
      onClick={(event) => {
        onSelect?.(event);
        onClick?.(event);
      }}
      type="button"
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/features/habits/api/habits', () => ({
  useDeleteHabit: vi.fn(),
  useReorderHabits: vi.fn(),
  useUpdateHabit: vi.fn(),
}));

const mockedUseDeleteHabit = vi.mocked(useDeleteHabit);
const mockedUseReorderHabits = vi.mocked(useReorderHabits);
const mockedUseUpdateHabit = vi.mocked(useUpdateHabit);

function createMutationMock() {
  return {
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
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
    target: 8,
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
    createdAt: 2,
    emoji: '😴',
    id: 'sleep',
    name: 'Sleep',
    sortOrder: 1,
    target: 8,
    trackingType: 'time',
    unit: 'hours',
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

function getHabitById(id: string) {
  const habit = habits.find((item) => item.id === id);
  if (!habit) {
    throw new Error(`Missing fixture habit: ${id}`);
  }

  return habit;
}

describe('HabitCardMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseDeleteHabit.mockReturnValue(
      createMutationMock() as unknown as ReturnType<typeof useDeleteHabit>,
    );
    mockedUseReorderHabits.mockReturnValue(
      createMutationMock() as unknown as ReturnType<typeof useReorderHabits>,
    );
    mockedUseUpdateHabit.mockReturnValue(
      createMutationMock() as unknown as ReturnType<typeof useUpdateHabit>,
    );
  });

  it('calls onEdit when edit is selected', async () => {
    const sleepHabit = getHabitById('sleep');
    const onEdit = vi.fn();
    render(<HabitCardMenu habit={sleepHabit} habits={habits} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(sleepHabit);
  });

  it('reorders habits when move down is selected', async () => {
    const hydrateHabit = getHabitById('hydrate');
    const reorderMutation = createMutationMock();
    mockedUseReorderHabits.mockReturnValue(
      reorderMutation as unknown as ReturnType<typeof useReorderHabits>,
    );

    render(<HabitCardMenu habit={hydrateHabit} habits={habits} onEdit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move down' }));

    await waitFor(() =>
      expect(reorderMutation.mutateAsync).toHaveBeenCalledWith([
        { id: 'sleep', sortOrder: 0 },
        { id: 'hydrate', sortOrder: 1 },
        { id: 'vitamins', sortOrder: 2 },
      ]),
    );
  });

  it('toggles active state when deactivate is selected', async () => {
    const sleepHabit = getHabitById('sleep');
    const updateMutation = createMutationMock();
    mockedUseUpdateHabit.mockReturnValue(
      updateMutation as unknown as ReturnType<typeof useUpdateHabit>,
    );

    render(<HabitCardMenu habit={sleepHabit} habits={habits} onEdit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() =>
      expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
        id: 'sleep',
        values: {
          active: false,
        },
      }),
    );
  });

  it('opens pause scheduling dialog and saves pause until date', async () => {
    const sleepHabit = getHabitById('sleep');
    const updateMutation = createMutationMock();
    mockedUseUpdateHabit.mockReturnValue(
      updateMutation as unknown as ReturnType<typeof useUpdateHabit>,
    );

    render(<HabitCardMenu habit={sleepHabit} habits={habits} onEdit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause scheduling' }));
    expect(screen.getByRole('heading', { name: 'Pause scheduling' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Pause until'), { target: { value: '2026-03-25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save pause' }));

    await waitFor(() =>
      expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
        id: 'sleep',
        values: {
          pausedUntil: '2026-03-25',
        },
      }),
    );
  });

  it('disables save pause when a past date is typed manually', async () => {
    const sleepHabit = getHabitById('sleep');
    render(<HabitCardMenu habit={sleepHabit} habits={habits} onEdit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause scheduling' }));

    const pauseInput = screen.getByLabelText('Pause until');
    const min = pauseInput.getAttribute('min');
    if (!min) {
      throw new Error('Expected pause date input min attribute');
    }

    const [year, month, day] = min.split('-').map(Number);
    if (year === undefined || month === undefined || day === undefined) {
      throw new Error('Expected valid min date format');
    }

    const minDate = new Date(year, month - 1, day);
    const pastDate = new Date(minDate);
    pastDate.setDate(pastDate.getDate() - 1);
    const pastDateKey = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, '0')}-${String(pastDate.getDate()).padStart(2, '0')}`;

    fireEvent.change(pauseInput, { target: { value: pastDateKey } });

    expect(screen.getByRole('button', { name: 'Save pause' })).toBeDisabled();
  });

  it('disables pause dialog actions while a mutation is pending', async () => {
    const sleepHabit = getHabitById('sleep');
    const updateMutation = createMutationMock();
    updateMutation.isPending = true;
    mockedUseUpdateHabit.mockReturnValue(
      updateMutation as unknown as ReturnType<typeof useUpdateHabit>,
    );

    render(<HabitCardMenu habit={sleepHabit} habits={habits} onEdit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause scheduling' }));

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pause indefinitely' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save pause' })).toBeDisabled();
  });

  it('shows resume scheduling for paused habits and clears pausedUntil', async () => {
    const pausedHabit = {
      ...getHabitById('sleep'),
      pausedUntil: '2026-03-25',
    };
    const updateMutation = createMutationMock();
    mockedUseUpdateHabit.mockReturnValue(
      updateMutation as unknown as ReturnType<typeof useUpdateHabit>,
    );

    render(<HabitCardMenu habit={pausedHabit} habits={habits} onEdit={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Pause scheduling' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume scheduling' }));

    await waitFor(() =>
      expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
        id: 'sleep',
        values: {
          pausedUntil: null,
        },
      }),
    );
  });

  it('confirms and deletes the habit', async () => {
    const sleepHabit = getHabitById('sleep');
    const deleteMutation = createMutationMock();
    mockedUseDeleteHabit.mockReturnValue(
      deleteMutation as unknown as ReturnType<typeof useDeleteHabit>,
    );

    render(<HabitCardMenu habit={sleepHabit} habits={habits} onEdit={vi.fn()} />);

    const menuDeleteButton = screen.getAllByRole('button', { name: 'Delete' })[0];
    if (!menuDeleteButton) {
      throw new Error('Delete menu item missing');
    }

    fireEvent.click(menuDeleteButton);

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteMutation.mutateAsync).toHaveBeenCalledWith({ id: 'sleep' }));
  });
});
