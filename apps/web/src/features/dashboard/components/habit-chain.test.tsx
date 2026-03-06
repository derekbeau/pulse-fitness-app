import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { mockHabits } from '@/lib/mock-data/dashboard';

import { HabitChain } from './habit-chain';

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

describe('HabitChain', () => {
  it('renders all habits by default with 30 day squares each', () => {
    const { container } = render(<HabitChain />);

    mockHabits.forEach((habit) => {
      expect(screen.getByRole('heading', { name: habit.name })).toBeInTheDocument();
      expect(screen.getByText(`${habit.currentStreak} day streak`)).toBeInTheDocument();
    });

    const allSquares = container.querySelectorAll('[data-slot="habit-chain-day"]');
    expect(allSquares).toHaveLength(mockHabits.length * 30);
  });

  it('renders squares in oldest-to-newest order and highlights today', () => {
    const habit = getHabitByIndex(0);
    const { container } = render(<HabitChain habitIds={[habit.id]} />);

    const squares = container.querySelectorAll('[data-slot="habit-chain-day"]');
    const firstEntry = habit.entries[0];
    const lastEntry = habit.entries[29];

    if (!firstEntry || !lastEntry) {
      throw new Error('Expected first and last habit entries.');
    }

    expect(squares).toHaveLength(30);
    expect(squares[0]).toHaveAttribute('data-date', firstEntry.date);
    expect(squares[29]).toHaveAttribute('data-date', lastEntry.date);

    const todaySquares = container.querySelectorAll('[data-slot="habit-chain-day"][data-today="true"]');
    expect(todaySquares).toHaveLength(1);
    expect(todaySquares[0]).toHaveClass('border-[var(--color-primary)]');
  });

  it('uses mint squares for completed days and gray squares for missed days', () => {
    const habit = getHabitByIndex(0);
    const { container } = render(<HabitChain habitIds={[habit.id]} />);

    const completedSquare = container.querySelector(
      '[data-slot="habit-chain-day"][data-completed="true"]',
    );
    const missedSquare = container.querySelector('[data-slot="habit-chain-day"][data-completed="false"]');

    expect(completedSquare).toHaveClass('bg-[var(--color-accent-mint)]');
    expect(missedSquare).toHaveClass('bg-[var(--color-muted)]/40');
  });

  it('filters habits with habitIds', () => {
    const selectedHabits = [getHabitByIndex(1), getHabitByIndex(3)];
    const selectedHabitIds = selectedHabits.map((habit) => habit.id);
    const { container } = render(<HabitChain habitIds={selectedHabitIds} />);

    expect(screen.getByRole('heading', { name: selectedHabits[0].name })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: selectedHabits[1].name })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: getHabitByIndex(0).name })).not.toBeInTheDocument();

    const squares = container.querySelectorAll('[data-slot="habit-chain-day"]');
    expect(squares).toHaveLength(60);
  });

  it('assigns a date tooltip label to each day square', () => {
    const habit = getHabitByIndex(0);
    const { container } = render(<HabitChain habitIds={[habit.id]} />);

    const firstSquare = container.querySelector('[data-slot="habit-chain-day"]');
    const date = firstSquare?.getAttribute('data-date');
    expect(date).toBeTruthy();

    if (!firstSquare || !date) {
      throw new Error('Expected a day square with date attribute.');
    }

    expect(firstSquare).toHaveAttribute('title', formatDateLabel(date));
  });

  it('renders an empty state when no habits match the filter', () => {
    render(<HabitChain habitIds={['habit-does-not-exist']} />);

    expect(screen.getByText('No matching habits.')).toBeInTheDocument();
  });
});
