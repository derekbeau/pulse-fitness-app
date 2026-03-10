import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SetRow } from './set-row';

describe('SetRow', () => {
  it('renders compact inline inputs and auto-completes from field updates', () => {
    const onUpdate = vi.fn();

    render(
      <SetRow
        completed={false}
        onUpdate={onUpdate}
        reps={8}
        setNumber={3}
        weight={55}
        weightUnit="kg"
      />,
    );

    const weightInput = screen.getByLabelText('Weight for set 3');
    const repsInput = screen.getByLabelText('Reps for set 3');

    expect(weightInput).toHaveClass('h-9');
    expect(repsInput).toHaveClass('h-9');
    expect(screen.getByText('Set 3')).toBeInTheDocument();
    expect(screen.queryByText('Weight')).not.toBeInTheDocument();

    fireEvent.change(weightInput, { target: { value: '60' } });
    fireEvent.change(repsInput, { target: { value: '10' } });

    expect(onUpdate).toHaveBeenCalledWith({ completed: true, weight: 60 });
    expect(onUpdate).toHaveBeenCalledWith({ completed: true, reps: 10 });
  });

  it('applies completed styling and handles cleared numeric values', () => {
    const onUpdate = vi.fn();

    render(<SetRow completed onUpdate={onUpdate} reps={13} setNumber={1} weight={50} />);

    fireEvent.change(screen.getByLabelText('Reps for set 1'), { target: { value: '' } });

    expect(document.querySelector('[data-slot="set-row"]')).toHaveClass('bg-emerald-500/10');
    expect(onUpdate).toHaveBeenCalledWith({ completed: false, reps: null });
    expect(screen.queryByRole('button', { name: 'Add Set' })).not.toBeInTheDocument();
  });

  it('renders reps-only rows without weight input', () => {
    render(
      <SetRow
        completed={false}
        onUpdate={vi.fn()}
        reps={12}
        setNumber={2}
        trackingType="bodyweight_reps"
      />,
    );

    expect(screen.getByLabelText('Reps for set 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Weight for set 2')).not.toBeInTheDocument();
  });

  it('auto-completes seconds-only rows from duration input', () => {
    const onUpdate = vi.fn();

    render(
      <SetRow
        completed={false}
        onUpdate={onUpdate}
        reps={null}
        seconds={null}
        setNumber={4}
        trackingType="seconds_only"
      />,
    );

    fireEvent.change(screen.getByLabelText('Seconds for set 4'), { target: { value: '45' } });

    expect(onUpdate).toHaveBeenCalledWith({ completed: true, seconds: 45 });
  });

  it('uses km distance suffix for metric users', () => {
    render(
      <SetRow
        completed={false}
        distance={5}
        onUpdate={vi.fn()}
        reps={null}
        setNumber={1}
        trackingType="distance"
        weightUnit="kg"
      />,
    );

    expect(screen.getByText('km')).toBeInTheDocument();
  });
});
