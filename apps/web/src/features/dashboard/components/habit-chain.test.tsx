import type { Habit, HabitEntry } from '@pulse/shared';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mockHabits } from '@/lib/mock-data/dashboard';

import { HabitChain } from './habit-chain';

type HabitChainProps = Parameters<typeof HabitChain>[0];

const formatDateLabel = (date: string): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
};

const getHabitByIndex = (index: number) => {
  const habit = mockHabits[index];

  if (!habit) {
    throw new Error(`Expected habit at index ${index}.`);
  }

  return habit;
};

const habitRecords: Habit[] = mockHabits.map((habit, index) => ({
  id: habit.id,
  userId: 'user-1',
  name: habit.name,
  description: null,
  emoji: null,
  trackingType: 'boolean',
  target: null,
  unit: null,
  frequency: 'daily',
  frequencyTarget: null,
  scheduledDays: null,
  pausedUntil: null,
  sortOrder: index,
  active: true,
  createdAt: 1_700_000_000_000 + index,
  updatedAt: 1_700_000_000_000 + index,
}));

const habitEntryRecords: HabitEntry[] = mockHabits.flatMap((habit, habitIndex) =>
  habit.entries.map((entry, entryIndex) => ({
    id: `${habit.id}-${entry.date}`,
    habitId: habit.id,
    userId: 'user-1',
    date: entry.date,
    completed: entry.completed,
    value: null,
    createdAt: 1_700_000_000_000 + habitIndex * 100 + entryIndex,
  })),
);

function renderHabitChain(props: HabitChainProps = {}) {
  return render(
    <MemoryRouter>
      <HabitChain {...props} />
    </MemoryRouter>,
  );
}

describe('HabitChain', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders an empty state when no habits are provided', () => {
    const { container } = renderHabitChain();

    expect(screen.getByText('No matching habits.')).toBeInTheDocument();
    const allSquares = container.querySelectorAll('[data-slot="habit-chain-day"]');
    expect(allSquares).toHaveLength(0);
  });

  it('renders all habits with 30 day squares each when API data is provided', () => {
    const { container } = renderHabitChain({ habits: habitRecords, entries: habitEntryRecords });

    mockHabits.forEach((habit) => {
      expect(screen.getByRole('heading', { name: habit.name })).toBeInTheDocument();
    });

    const streakLabels = screen.getAllByText(/\d+ day streak/);
    expect(streakLabels).toHaveLength(mockHabits.length);
    expect(screen.getAllByRole('link', { name: /view .* habit details/i })).toHaveLength(
      mockHabits.length,
    );

    const allSquares = container.querySelectorAll('[data-slot="habit-chain-day"]');
    expect(allSquares).toHaveLength(mockHabits.length * 30);
  });

  it('renders squares in oldest-to-newest order and highlights today', () => {
    const habit = getHabitByIndex(0);
    const { container } = renderHabitChain({
      entries: habitEntryRecords,
      habitIds: [habit.id],
      habits: habitRecords,
    });

    const squares = container.querySelectorAll('[data-slot="habit-chain-day"]');
    const firstEntry = habit.entries[0];
    const lastEntry = habit.entries[29];

    if (!firstEntry || !lastEntry) {
      throw new Error('Expected first and last habit entries.');
    }

    expect(squares).toHaveLength(30);
    expect(squares[0]).toHaveAttribute('data-date', firstEntry.date);
    expect(squares[29]).toHaveAttribute('data-date', lastEntry.date);

    const todaySquares = container.querySelectorAll(
      '[data-slot="habit-chain-day"][data-today="true"]',
    );
    expect(todaySquares).toHaveLength(1);
    expect(todaySquares[0]).toHaveClass('border-[var(--color-primary)]');
  });

  it('renders a 30-day window ending at the provided end date', () => {
    const habit = getHabitByIndex(0);
    const endDate = habit.entries[20]?.date;

    if (!endDate) {
      throw new Error('Expected a valid end date in mock habit entries.');
    }

    const { container } = renderHabitChain({
      endDate,
      entries: habitEntryRecords,
      habitIds: [habit.id],
      habits: habitRecords,
    });

    const squares = container.querySelectorAll('[data-slot="habit-chain-day"]');
    expect(squares).toHaveLength(30);
    expect(squares[29]).toHaveAttribute('data-date', endDate);

    const highlightedSquares = container.querySelectorAll(
      '[data-slot="habit-chain-day"][data-today="true"]',
    );
    expect(highlightedSquares).toHaveLength(1);
    expect(highlightedSquares[0]).toHaveAttribute('data-date', endDate);
  });

  it('uses mint, red, and gray squares for completed, missed, and not scheduled', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));

    const habit: Habit = {
      id: 'habit-tri-state',
      userId: 'user-1',
      name: 'Tri-state habit',
      description: null,
      emoji: null,
      trackingType: 'boolean',
      target: null,
      unit: null,
      frequency: 'specific_days',
      frequencyTarget: null,
      scheduledDays: [0, 2, 4],
      pausedUntil: null,
      sortOrder: 0,
      active: true,
      createdAt: new Date('2026-03-01T00:00:00Z').getTime(),
      updatedAt: new Date('2026-03-01T00:00:00Z').getTime(),
    };
    const chainEntries: HabitEntry[] = [
      {
        id: 'entry-completed',
        habitId: habit.id,
        userId: habit.userId,
        date: '2026-03-09',
        completed: true,
        value: null,
        createdAt: new Date('2026-03-09T12:00:00Z').getTime(),
      },
    ];

    const { container } = renderHabitChain({
      endDate: '2026-03-11',
      entries: chainEntries,
      habitIds: [habit.id],
      habits: [habit],
    });

    const completedSquare = container.querySelector(
      '[data-slot="habit-chain-day"][data-date="2026-03-09"]',
    );
    const missedSquare = container.querySelector(
      '[data-slot="habit-chain-day"][data-date="2026-03-06"]',
    );
    const unscheduledSquare = container.querySelector(
      '[data-slot="habit-chain-day"][data-date="2026-03-11"]',
    );

    expect(completedSquare).toHaveAttribute('data-status', 'completed');
    expect(completedSquare).toHaveClass('bg-[var(--color-accent-mint)]');
    expect(missedSquare).toHaveAttribute('data-status', 'missed');
    expect(missedSquare).toHaveClass('bg-red-400/70');
    expect(unscheduledSquare).toHaveAttribute('data-status', 'not_scheduled');
    expect(unscheduledSquare).toHaveClass('bg-[var(--color-muted)]/40');
  });

  it('does not mark today as missed when scheduled but incomplete', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));

    const habit: Habit = {
      id: 'habit-today',
      userId: 'user-1',
      name: 'Today habit',
      description: null,
      emoji: null,
      trackingType: 'boolean',
      target: null,
      unit: null,
      frequency: 'daily',
      frequencyTarget: null,
      scheduledDays: null,
      pausedUntil: null,
      sortOrder: 0,
      active: true,
      createdAt: new Date('2026-02-01T00:00:00Z').getTime(),
      updatedAt: new Date('2026-02-01T00:00:00Z').getTime(),
    };

    const { container } = renderHabitChain({
      endDate: '2026-03-10',
      entries: [],
      habitIds: [habit.id],
      habits: [habit],
    });

    const todaySquare = container.querySelector(
      '[data-slot="habit-chain-day"][data-date="2026-03-10"]',
    );

    expect(todaySquare).toHaveAttribute('data-status', 'not_scheduled');
    expect(todaySquare).toHaveClass('bg-[var(--color-muted)]/40');
  });

  it('shows future days as not scheduled', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));

    const habit = getHabitByIndex(0);
    const { container } = renderHabitChain({
      endDate: '2026-03-11',
      entries: habitEntryRecords,
      habitIds: [habit.id],
      habits: habitRecords,
    });

    const futureSquare = container.querySelector(
      '[data-slot="habit-chain-day"][data-date="2026-03-11"]',
    );

    expect(futureSquare).toHaveAttribute('data-status', 'not_scheduled');
    expect(futureSquare).toHaveClass('bg-[var(--color-muted)]/40');
  });

  it('counts streak across not scheduled gaps and breaks on missed days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T12:00:00Z'));

    const habit: Habit = {
      id: 'habit-streak',
      userId: 'user-1',
      name: 'Streak habit',
      description: null,
      emoji: null,
      trackingType: 'boolean',
      target: null,
      unit: null,
      frequency: 'specific_days',
      frequencyTarget: null,
      scheduledDays: [0, 2, 4],
      pausedUntil: null,
      sortOrder: 0,
      active: true,
      createdAt: new Date('2026-02-01T00:00:00Z').getTime(),
      updatedAt: new Date('2026-02-01T00:00:00Z').getTime(),
    };
    const entries: HabitEntry[] = [
      {
        id: 'entry-mon',
        habitId: habit.id,
        userId: habit.userId,
        date: '2026-03-09',
        completed: true,
        value: null,
        createdAt: new Date('2026-03-09T12:00:00Z').getTime(),
      },
      {
        id: 'entry-wed',
        habitId: habit.id,
        userId: habit.userId,
        date: '2026-03-11',
        completed: true,
        value: null,
        createdAt: new Date('2026-03-11T12:00:00Z').getTime(),
      },
      {
        id: 'entry-fri',
        habitId: habit.id,
        userId: habit.userId,
        date: '2026-03-13',
        completed: true,
        value: null,
        createdAt: new Date('2026-03-13T12:00:00Z').getTime(),
      },
    ];

    renderHabitChain({
      endDate: '2026-03-13',
      entries,
      habitIds: [habit.id],
      habits: [habit],
    });

    expect(screen.getByText('3 day streak')).toBeInTheDocument();
  });

  it('filters habits with habitIds', () => {
    const selectedHabits = [getHabitByIndex(1), getHabitByIndex(3)];
    const selectedHabitIds = selectedHabits.map((habit) => habit.id);
    const { container } = renderHabitChain({
      entries: habitEntryRecords,
      habitIds: selectedHabitIds,
      habits: habitRecords,
    });

    expect(screen.getByRole('heading', { name: selectedHabits[0].name })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: selectedHabits[1].name })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: getHabitByIndex(0).name }),
    ).not.toBeInTheDocument();

    const squares = container.querySelectorAll('[data-slot="habit-chain-day"]');
    expect(squares).toHaveLength(60);
  });

  it('assigns a date tooltip label to each day square', () => {
    const habit = getHabitByIndex(0);
    const { container } = renderHabitChain({
      entries: habitEntryRecords,
      habitIds: [habit.id],
      habits: habitRecords,
    });

    const firstSquare = container.querySelector('[data-slot="habit-chain-day"]');
    const date = firstSquare?.getAttribute('data-date');
    expect(date).toBeTruthy();

    if (!firstSquare || !date) {
      throw new Error('Expected a day square with date attribute.');
    }

    const status = firstSquare.getAttribute('data-status');
    const statusLabel =
      status === 'completed' ? 'Completed' : status === 'missed' ? 'Missed' : 'Not scheduled';
    expect(firstSquare).toHaveAttribute('title', `${formatDateLabel(date)} — ${statusLabel}`);
  });

  it('keeps each day circle at the minimum touch target size', () => {
    const habit = getHabitByIndex(0);
    const { container } = renderHabitChain({
      entries: habitEntryRecords,
      habitIds: [habit.id],
      habits: habitRecords,
    });

    const firstSquare = container.querySelector('[data-slot="habit-chain-day"]');
    expect(firstSquare).toHaveClass('size-11', 'min-h-11', 'min-w-11');

    const grid = container.querySelector('[data-slot="habit-chain-grid"]');
    expect(grid).toHaveClass('grid-cols-7', 'gap-1.5', 'sm:grid-cols-10');
  });

  it('includes the status in square aria labels', () => {
    const habit = getHabitByIndex(0);
    const { container } = renderHabitChain({
      entries: habitEntryRecords,
      habitIds: [habit.id],
      habits: habitRecords,
    });

    const square = container.querySelector(
      '[data-slot="habit-chain-day"][data-status="completed"]',
    );
    expect(square).toHaveAttribute('aria-label', expect.stringContaining('Completed'));
  });

  it('renders an empty state when no habits match the filter', () => {
    renderHabitChain({
      entries: habitEntryRecords,
      habitIds: ['habit-does-not-exist'],
      habits: habitRecords,
    });

    expect(screen.getByText('No matching habits.')).toBeInTheDocument();
  });

  it('renders an empty state when an explicit empty filter is provided', () => {
    renderHabitChain({ entries: habitEntryRecords, habitIds: [], habits: habitRecords });

    expect(screen.getByText('No matching habits.')).toBeInTheDocument();
  });
});
