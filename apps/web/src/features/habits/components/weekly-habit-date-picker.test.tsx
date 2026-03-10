import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WeeklyHabitDatePicker } from './weekly-habit-date-picker';

const completionByDate = {
  '2026-03-02': { completedCount: 0, totalCount: 4 },
  '2026-03-03': { completedCount: 2, totalCount: 4 },
  '2026-03-04': { completedCount: 4, totalCount: 4 },
  '2026-03-05': { completedCount: 1, totalCount: 4 },
  '2026-03-06': { completedCount: 3, totalCount: 4 },
  '2026-03-07': { completedCount: 0, totalCount: 4 },
  '2026-03-08': { completedCount: 0, totalCount: 4 },
};

function getDayButton(date: string): HTMLElement {
  const button = document.querySelector<HTMLElement>(
    `[data-slot="habit-calendar-day"][data-date="${date}"]`,
  );

  if (!button) {
    throw new Error(`Expected day button for date ${date}.`);
  }

  return button;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('WeeklyHabitDatePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders monday through sunday cells for the selected week', () => {
    render(
      <WeeklyHabitDatePicker
        completionByDate={completionByDate}
        onDateSelect={vi.fn()}
        selectedDate={new Date('2026-03-06T00:00:00')}
      />,
    );

    const days = document.querySelectorAll('[data-slot="habit-calendar-day"]');
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveAttribute('data-date', '2026-03-02');
    expect(days[6]).toHaveAttribute('data-date', '2026-03-08');

    const firstDay = within(days[0] as HTMLElement);
    const lastDay = within(days[6] as HTMLElement);
    expect(firstDay.getByText('Mon')).toBeInTheDocument();
    expect(lastDay.getByText('Sun')).toBeInTheDocument();
  });

  it('shows completion fractions and color-coded dots', () => {
    render(
      <WeeklyHabitDatePicker
        completionByDate={completionByDate}
        onDateSelect={vi.fn()}
        selectedDate={new Date('2026-03-06T00:00:00')}
      />,
    );

    const noneDone = getDayButton('2026-03-02');
    const partialDone = getDayButton('2026-03-03');
    const allDone = getDayButton('2026-03-04');

    expect(within(noneDone).getByText('0/4')).toBeInTheDocument();
    expect(within(partialDone).getByText('2/4')).toBeInTheDocument();
    expect(within(allDone).getByText('4/4')).toBeInTheDocument();

    expect(
      noneDone.querySelector('[data-slot="habit-calendar-completion-dot"]'),
    ).toHaveClass('bg-slate-400');
    expect(
      partialDone.querySelector('[data-slot="habit-calendar-completion-dot"]'),
    ).toHaveClass('bg-amber-500');
    expect(
      allDone.querySelector('[data-slot="habit-calendar-completion-dot"]'),
    ).toHaveClass('bg-emerald-500');
  });

  it('navigates to previous and next weeks', () => {
    render(
      <WeeklyHabitDatePicker
        completionByDate={completionByDate}
        onDateSelect={vi.fn()}
        selectedDate={new Date('2026-03-06T00:00:00')}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(getDayButton('2026-02-23')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(getDayButton('2026-03-02')).toBeInTheDocument();
  });

  it('calls onDateSelect when a day is clicked', () => {
    const onDateSelect = vi.fn();

    render(
      <WeeklyHabitDatePicker
        completionByDate={completionByDate}
        onDateSelect={onDateSelect}
        selectedDate={new Date('2026-03-06T00:00:00')}
      />,
    );

    fireEvent.click(getDayButton('2026-03-04'));

    expect(onDateSelect).toHaveBeenCalledTimes(1);
    expect(formatDate(onDateSelect.mock.calls[0]?.[0] as Date)).toBe('2026-03-04');
  });
});
