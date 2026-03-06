import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DateNavBar } from '@/features/nutrition/components/date-nav-bar';

describe('DateNavBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the selected date and blocks forward navigation when selected day is today', () => {
    const onDateChange = vi.fn();

    render(<DateNavBar selectedDate={new Date('2026-03-06T08:00:00')} onDateChange={onDateChange} />);

    expect(screen.getByText('Friday, Mar 6')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to next day' })).toBeDisabled();
  });

  it('navigates to the previous and next day and exposes a Today shortcut for past dates', () => {
    const onDateChange = vi.fn();

    render(<DateNavBar selectedDate={new Date('2026-03-05T09:00:00')} onDateChange={onDateChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to previous day' }));
    expect(onDateChange).toHaveBeenCalledWith(new Date('2026-03-04T00:00:00'));

    fireEvent.click(screen.getByRole('button', { name: 'Go to next day' }));
    expect(onDateChange).toHaveBeenCalledWith(new Date('2026-03-06T00:00:00'));

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(onDateChange).toHaveBeenCalledWith(new Date('2026-03-06T00:00:00'));
  });

  it('keeps the next button disabled when the selected date is already in the future', () => {
    const onDateChange = vi.fn();

    render(<DateNavBar selectedDate={new Date('2026-03-07T09:00:00')} onDateChange={onDateChange} />);

    expect(screen.getByRole('button', { name: 'Go to next day' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Go to previous day' }));
    expect(onDateChange).toHaveBeenCalledWith(new Date('2026-03-06T00:00:00'));
  });
});
