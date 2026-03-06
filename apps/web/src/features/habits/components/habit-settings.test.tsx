import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HabitSettings } from '@/features/habits/components/habit-settings';

function getHabitOrder() {
  const list = screen.getByRole('list', { name: 'Habit list' });

  return within(list)
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent);
}

describe('HabitSettings', () => {
  it('creates a numeric habit with conditional target and unit fields', () => {
    render(<HabitSettings />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add habit' })[0]);

    fireEvent.change(screen.getByLabelText('Habit name'), { target: { value: 'Stretch' } });
    fireEvent.change(screen.getByLabelText('Tracking type'), { target: { value: 'numeric' } });

    expect(screen.getByLabelText('Target')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Target'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'minutes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('heading', { name: 'Stretch', level: 3 })).toBeInTheDocument();
    expect(screen.getByText('15 minutes target')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('pre-fills habit data when editing and updates the list on save', () => {
    render(<HabitSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Hydrate' }));

    expect(screen.getByLabelText('Habit name')).toHaveValue('Hydrate');
    expect(screen.getByLabelText('Tracking type')).toHaveValue('numeric');
    expect(screen.getByLabelText('Target')).toHaveValue(8);
    expect(screen.getByLabelText('Unit')).toHaveValue('glasses');

    fireEvent.change(screen.getByLabelText('Habit name'), { target: { value: 'Hydration' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('heading', { name: 'Hydration', level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hydrate', level: 3 })).not.toBeInTheDocument();
  });

  it('deletes habits only after confirmation', () => {
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    render(<HabitSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Sleep' }));
    expect(screen.getByRole('heading', { name: 'Sleep', level: 3 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Sleep' }));
    expect(screen.queryByRole('heading', { name: 'Sleep', level: 3 })).not.toBeInTheDocument();

    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it('reorders habits with the up and down controls', () => {
    render(<HabitSettings />);

    expect(getHabitOrder()).toEqual([
      'Hydrate',
      'Take vitamins',
      'Protein goal',
      'Sleep',
      'Mobility warm-up',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Move Hydrate down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Sleep up' }));

    expect(getHabitOrder()).toEqual([
      'Take vitamins',
      'Hydrate',
      'Sleep',
      'Protein goal',
      'Mobility warm-up',
    ]);
  });

  it('hides target and unit fields for boolean habits', () => {
    render(<HabitSettings />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add habit' })[0]);

    expect(screen.getByLabelText('Tracking type')).toHaveValue('boolean');
    expect(screen.queryByLabelText('Target')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Unit')).not.toBeInTheDocument();
  });

  it('closes the form when cancel is pressed', () => {
    render(<HabitSettings />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add habit' })[0]);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByText('Configuration tips')).toBeInTheDocument();
  });
});
