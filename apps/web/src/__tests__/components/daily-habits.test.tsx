import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DailyHabits } from '@/features/habits';
import type { DailyHabit } from '@/features/habits';

const habits: DailyHabit[] = [
  {
    id: 'mobility',
    name: 'Mobility',
    emoji: '🧘',
    trackingType: 'boolean',
    target: null,
    unit: null,
    todayValue: false,
  },
  {
    id: 'hydrate',
    name: 'Hydrate',
    emoji: '💧',
    trackingType: 'numeric',
    target: 8,
    unit: 'glasses',
    todayValue: 6,
  },
  {
    id: 'sleep',
    name: 'Sleep',
    emoji: '😴',
    trackingType: 'time',
    target: 8,
    unit: 'hours',
    todayValue: 7,
  },
];

function getHabitCard(name: string) {
  const card = screen.getByRole('heading', { name }).closest('[data-slot="card"]');

  if (!(card instanceof HTMLElement)) {
    throw new Error(`Habit card not found for ${name}.`);
  }

  return card;
}

describe('DailyHabits', () => {
  it('renders all provided habits with their tracking-type controls', () => {
    render(<DailyHabits habits={habits} />);

    expect(screen.getByText('Mobility')).toBeInTheDocument();
    expect(screen.getByText('Hydrate')).toBeInTheDocument();
    expect(screen.getByText('Sleep')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mobility' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Hydrate' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Sleep' })).toBeInTheDocument();
  });

  it('toggles a boolean habit when the checkbox is clicked', () => {
    render(<DailyHabits habits={habits} />);

    const checkbox = screen.getByRole('checkbox', { name: 'Mobility' });

    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(screen.getByText('1 of 3 habits complete')).toBeInTheDocument();
    expect(within(getHabitCard('Mobility')).getByText('Done')).toBeInTheDocument();
  });

  it('updates numeric habits when a number is entered', () => {
    render(<DailyHabits habits={habits} />);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Hydrate' }), {
      target: { value: '8' },
    });

    expect(within(getHabitCard('Hydrate')).getAllByText('8 / 8 glasses')).toHaveLength(2);
  });

  it('updates duration habits when a duration is entered', () => {
    render(<DailyHabits habits={habits} />);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sleep' }), {
      target: { value: '8.5' },
    });

    expect(within(getHabitCard('Sleep')).getAllByText('8.5 / 8 hours')).toHaveLength(2);
  });
});
