import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { parseDateKey } from '@/lib/date-utils';
import { mockSchedule } from '@/lib/mock-data/workouts';

import { WorkoutCalendar } from './workout-calendar';

describe('WorkoutCalendar', () => {
  it('renders the month grid, workout indicators, and today highlight', () => {
    render(<WorkoutCalendar />);

    expect(screen.getByText('Workout Calendar')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Completed workout').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Scheduled workout').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: formatFullDate(new Date()) })).toHaveAttribute(
      'aria-current',
      'date',
    );
  });

  it('updates the day detail panel when a scheduled workout is selected', () => {
    const scheduledDay = mockSchedule.find((entry) => entry.status === 'scheduled');

    expect(scheduledDay).toBeDefined();

    render(<WorkoutCalendar buildDayHref={(date) => `/workouts?date=${date}`} />);

    fireEvent.click(
      screen.getByRole('button', { name: formatFullDate(parseDateKey(scheduledDay?.date ?? '')) }),
    );

    expect(
      screen.getByRole('heading', { name: scheduledDay?.templateName ?? '' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Details' })).toHaveAttribute(
      'href',
      `/workouts?date=${scheduledDay?.date}`,
    );
  });

  it('navigates between months', () => {
    render(<WorkoutCalendar />);

    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));

    expect(screen.getByText(formatMonth(nextMonth))).toBeInTheDocument();
  });
});

function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}
