import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DailyHabits } from '@/features/habits/components/daily-habits';

const todayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

function getHabitCard(name: string) {
  return screen.getByRole('heading', { name }).closest('[data-slot="card"]');
}

describe('DailyHabits', () => {
  it('renders today header and the mock habits list', () => {
    render(<DailyHabits />);

    expect(
      screen.getByRole('heading', { name: todayFormatter.format(new Date()) }),
    ).toBeInTheDocument();
    expect(screen.getByText('Hydrate')).toBeInTheDocument();
    expect(screen.getByText('Take vitamins')).toBeInTheDocument();
    expect(screen.getByText('Sleep')).toBeInTheDocument();
    expect(screen.getByText('3 of 7 habits complete')).toBeInTheDocument();
  });

  it('toggles boolean habits with the checkbox control', () => {
    render(<DailyHabits />);

    const checkbox = screen.getByRole('checkbox', { name: 'Mobility warm-up' });

    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(screen.getByText('4 of 7 habits complete')).toBeInTheDocument();

    const card = getHabitCard('Mobility warm-up');

    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText('Done')).toBeInTheDocument();
  });

  it('updates numeric habits and marks them complete when they hit the target', () => {
    render(<DailyHabits />);

    const input = screen.getByRole('spinbutton', { name: 'Hydrate' });

    fireEvent.change(input, { target: { value: '8' } });

    const card = getHabitCard('Hydrate');

    expect(card).not.toBeNull();
    expect(screen.getByDisplayValue('8')).toBeInTheDocument();
    expect(within(card as HTMLElement).getAllByText('8 / 8 glasses')).toHaveLength(2);
    expect(within(card as HTMLElement).getByText('Done')).toBeInTheDocument();
  });

  it('supports decimal time habits and updates progress text', () => {
    render(<DailyHabits />);

    const input = screen.getByRole('spinbutton', { name: 'Sleep' });

    fireEvent.change(input, { target: { value: '8.25' } });

    const card = getHabitCard('Sleep');

    expect(card).not.toBeNull();
    expect(screen.getByDisplayValue('8.25')).toBeInTheDocument();
    expect(within(card as HTMLElement).getAllByText('8.3 / 8 hours')).toHaveLength(2);
    expect(within(card as HTMLElement).getByText('Done')).toBeInTheDocument();
  });
});
