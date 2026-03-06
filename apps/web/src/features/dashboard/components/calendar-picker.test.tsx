import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CalendarPicker } from './calendar-picker';

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDayButton = (date: string): HTMLElement => {
  const button = document.querySelector<HTMLElement>(`[data-slot="calendar-day"][data-date="${date}"]`);

  if (!button) {
    throw new Error(`Expected day button for date ${date}.`);
  }

  return button;
};

describe('CalendarPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T09:15:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders seven weekday cells (Mon-Sun) with month label for the displayed week', () => {
    const { container } = render(<CalendarPicker />);

    expect(screen.getByText('March 2026')).toBeInTheDocument();

    const days = container.querySelectorAll('[data-slot="calendar-day"]');
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveAttribute('data-date', '2026-03-02');
    expect(days[6]).toHaveAttribute('data-date', '2026-03-08');

    const firstDay = within(days[0] as HTMLElement);
    const lastDay = within(days[6] as HTMLElement);
    expect(firstDay.getByText('Mon')).toBeInTheDocument();
    expect(lastDay.getByText('Sun')).toBeInTheDocument();
  });

  it('highlights today and dims future dates', () => {
    render(<CalendarPicker />);

    const todayButton = getDayButton('2026-03-06');
    const saturdayButton = getDayButton('2026-03-07');
    const sundayButton = getDayButton('2026-03-08');

    expect(todayButton).toHaveClass('bg-[var(--color-primary)]');
    expect(todayButton).toHaveClass('text-[var(--color-on-accent)]');
    expect(todayButton).toHaveAttribute('data-today', 'true');
    expect(saturdayButton).toHaveClass('opacity-45');
    expect(sundayButton).toHaveClass('opacity-45');
  });

  it('shows activity dots for days with workout or meal data', () => {
    const { container } = render(<CalendarPicker />);

    const activityDots = container.querySelectorAll(
      '[data-slot="calendar-day"] [data-slot="calendar-activity-dot"][data-has-activity="true"]',
    );

    expect(activityDots.length).toBeGreaterThan(0);
  });

  it('navigates weeks with arrow buttons and updates month/year label', () => {
    const { container } = render(<CalendarPicker />);

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));

    expect(screen.getByText('February 2026')).toBeInTheDocument();

    const days = container.querySelectorAll('[data-slot="calendar-day"]');
    expect(days[0]).toHaveAttribute('data-date', '2026-02-23');
    expect(days[6]).toHaveAttribute('data-date', '2026-03-01');
  });

  it('calls onDateSelect with the clicked day and marks non-today selection with primary border', () => {
    const onDateSelect = vi.fn();
    render(<CalendarPicker onDateSelect={onDateSelect} />);

    const selectedDay = getDayButton('2026-03-04');
    fireEvent.click(selectedDay);

    expect(onDateSelect).toHaveBeenCalledTimes(1);
    expect(formatDate(onDateSelect.mock.calls[0]?.[0] as Date)).toBe('2026-03-04');
    expect(selectedDay).toHaveClass('border-[var(--color-primary)]');
    expect(selectedDay).toHaveAttribute('data-selected', 'true');
  });

  it('supports controlled selectedDate and responsive card sizing classes', () => {
    render(<CalendarPicker selectedDate={new Date('2026-03-03T00:00:00')} />);

    const selectedDay = getDayButton('2026-03-03');
    expect(selectedDay).toHaveAttribute('data-selected', 'true');

    const calendar = screen.getByLabelText('Calendar day picker');
    expect(calendar).toHaveClass('w-full');
    expect(selectedDay).toHaveClass('sm:px-2');
  });

  it('syncs the displayed week when a controlled selectedDate moves across week boundaries', () => {
    const { rerender } = render(<CalendarPicker selectedDate={new Date('2026-03-03T00:00:00')} />);

    expect(getDayButton('2026-03-03')).toHaveAttribute('data-selected', 'true');

    rerender(<CalendarPicker selectedDate={new Date('2026-02-24T00:00:00')} />);

    expect(getDayButton('2026-02-24')).toHaveAttribute('data-selected', 'true');
    expect(document.querySelector('[data-slot="calendar-day"][data-date="2026-03-03"]')).toBeNull();
  });
});
