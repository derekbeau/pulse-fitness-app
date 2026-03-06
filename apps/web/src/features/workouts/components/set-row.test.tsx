import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SetRow } from './set-row';

describe('SetRow', () => {
  it('renders touch-friendly inputs and reports field updates', () => {
    const onUpdate = vi.fn();
    const onAddSet = vi.fn();

    render(
      <SetRow
        completed={false}
        isLast
        onAddSet={onAddSet}
        onUpdate={onUpdate}
        reps={8}
        setNumber={3}
        weight={55}
      />,
    );

    const weightInput = screen.getByLabelText('Weight for set 3');
    const repsInput = screen.getByLabelText('Reps for set 3');

    expect(weightInput).toHaveClass('h-11');
    expect(repsInput).toHaveClass('h-11');

    fireEvent.change(weightInput, { target: { value: '60' } });
    fireEvent.change(repsInput, { target: { value: '10' } });
    fireEvent.click(screen.getByLabelText('Complete set 3'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Set' }));

    expect(onUpdate).toHaveBeenCalledWith({ weight: 60 });
    expect(onUpdate).toHaveBeenCalledWith({ reps: 10 });
    expect(onUpdate).toHaveBeenCalledWith({ completed: true });
    expect(onAddSet).toHaveBeenCalledTimes(1);
  });

  it('applies completed styling and handles cleared numeric values', () => {
    const onUpdate = vi.fn();

    render(
      <SetRow
        completed
        isLast={false}
        onUpdate={onUpdate}
        reps={12}
        setNumber={1}
        weight={null}
      />,
    );

    fireEvent.change(screen.getByLabelText('Reps for set 1'), { target: { value: '' } });

    expect(document.querySelector('[data-slot="set-row"]')).toHaveClass('bg-emerald-500/10');
    expect(onUpdate).toHaveBeenCalledWith({ reps: null });
    expect(screen.queryByRole('button', { name: 'Add Set' })).not.toBeInTheDocument();
  });
});
