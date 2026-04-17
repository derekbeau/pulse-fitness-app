import type { Habit } from '@pulse/shared';
import type { MouseEvent, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDeleteHabit, useReorderHabits, useUpdateHabit } from '@/features/habits/api/habits';
import { HabitCardMenu } from '@/features/habits/components/habit-card-menu';
import { useDashboardConfig, useSaveDashboardConfig } from '@/hooks/use-dashboard-config';
import { addDays, getToday, toDateKey } from '@/lib/date';

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

vi.mock('@/hooks/use-dashboard-config', () => ({
  useDashboardConfig: vi.fn(() => ({
    data: { habitChainIds: [], trendMetrics: [], visibleWidgets: [] },
    isLoading: false,
    isError: false,
  })),
  useSaveDashboardConfig: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

const mockedUseDeleteHabit = vi.mocked(useDeleteHabit);
const mockedUseReorderHabits = vi.mocked(useReorderHabits);
const mockedUseUpdateHabit = vi.mocked(useUpdateHabit);
const mockedUseDashboardConfig = vi.mocked(useDashboardConfig);
const mockedUseSaveDashboardConfig = vi.mocked(useSaveDashboardConfig);

function createMutationMock() {
  return {
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  };
}

function createDashboardConfig({
  habitChainIds = [],
  visibleWidgets = [],
}: {
  habitChainIds?: string[];
  visibleWidgets?: string[];
} = {}) {
  return {
    habitChainIds,
    trendMetrics: [],
    visibleWidgets,
  };
}

function createSaveDashboardConfigMutationMock() {
  return {
    mutate: vi.fn(),
    isPending: false,
  };
}

const habits: Habit[] = [
  {
    active: true,
    createdAt: 1,
    emoji: '💧',
    id: 'hydrate',
    name: 'Hydrate',
    description: null,
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
    description: null,
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
    description: null,
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
    mockedUseDashboardConfig.mockReturnValue({
      data: createDashboardConfig(),
      isError: false,
      isLoading: false,
    } as unknown as ReturnType<typeof useDashboardConfig>);
    mockedUseSaveDashboardConfig.mockReturnValue(
      createSaveDashboardConfigMutationMock() as unknown as ReturnType<
        typeof useSaveDashboardConfig
      >,
    );
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

  it('adds a habit chain to dashboard config when show on dashboard is selected', async () => {
    const sleepHabit = getHabitById('sleep');
    const saveDashboardConfigMutation = createSaveDashboardConfigMutationMock();
    mockedUseSaveDashboardConfig.mockReturnValue(
      saveDashboardConfigMutation as unknown as ReturnType<typeof useSaveDashboardConfig>,
    );

    render(<HabitCardMenu habit={sleepHabit} habits={habits} onEdit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show on dashboard' }));

    expect(saveDashboardConfigMutation.mutate).toHaveBeenCalledWith({
      habitChainIds: ['sleep'],
      trendMetrics: [],
      visibleWidgets: [],
    });
  });

  it('adds habit daily status widget to dashboard config when selected', async () => {
    const sleepHabit = getHabitById('sleep');
    const saveDashboardConfigMutation = createSaveDashboardConfigMutationMock();
    mockedUseSaveDashboardConfig.mockReturnValue(
      saveDashboardConfigMutation as unknown as ReturnType<typeof useSaveDashboardConfig>,
    );

    render(<HabitCardMenu habit={sleepHabit} habits={habits} onEdit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show daily status on dashboard' }));

    expect(saveDashboardConfigMutation.mutate).toHaveBeenCalledWith({
      habitChainIds: [],
      trendMetrics: [],
      visibleWidgets: ['habit-daily:sleep'],
    });
  });

  it('removes habit daily status widget from dashboard config when already visible', async () => {
    const sleepHabit = getHabitById('sleep');
    const saveDashboardConfigMutation = createSaveDashboardConfigMutationMock();
    mockedUseDashboardConfig.mockReturnValue({
      data: createDashboardConfig({
        visibleWidgets: ['snapshot-cards', 'habit-daily:sleep'],
      }),
      isError: false,
      isLoading: false,
    } as unknown as ReturnType<typeof useDashboardConfig>);
    mockedUseSaveDashboardConfig.mockReturnValue(
      saveDashboardConfigMutation as unknown as ReturnType<typeof useSaveDashboardConfig>,
    );

    render(<HabitCardMenu habit={sleepHabit} habits={habits} onEdit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove daily status from dashboard' }));

    expect(saveDashboardConfigMutation.mutate).toHaveBeenCalledWith({
      habitChainIds: [],
      trendMetrics: [],
      visibleWidgets: ['snapshot-cards'],
    });
  });

  it('shows remove daily status label when the widget is already visible', async () => {
    const sleepHabit = getHabitById('sleep');
    mockedUseDashboardConfig.mockReturnValue({
      data: createDashboardConfig({
        visibleWidgets: ['habit-daily:sleep'],
      }),
      isError: false,
      isLoading: false,
    } as unknown as ReturnType<typeof useDashboardConfig>);

    render(<HabitCardMenu habit={sleepHabit} habits={habits} onEdit={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Remove daily status from dashboard' }),
    ).toBeInTheDocument();
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

    const pauseInput = screen.getByLabelText('Pause until');
    const min = pauseInput.getAttribute('min');
    if (!min) {
      throw new Error('Expected pause date input min attribute');
    }

    const [year, month, day] = min.split('-').map(Number);
    if (year === undefined || month === undefined || day === undefined) {
      throw new Error('Expected valid min date format');
    }

    const futureDate = new Date(year, month - 1, day);
    futureDate.setDate(futureDate.getDate() + 1);
    const pauseDate = toDateKey(futureDate);

    fireEvent.change(pauseInput, { target: { value: pauseDate } });
    fireEvent.click(screen.getByRole('button', { name: 'Save pause' }));

    await waitFor(() =>
      expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
        id: 'sleep',
        values: {
          pausedUntil: pauseDate,
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
    const pastDateKey = toDateKey(pastDate);

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
      pausedUntil: toDateKey(addDays(getToday(), 14)),
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
    expect(within(dialog).getByText('Delete habit?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete habit' }));

    await waitFor(() => expect(deleteMutation.mutateAsync).toHaveBeenCalledWith({ id: 'sleep' }));
  });
});
