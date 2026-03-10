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
        target={{ maxReps: 12, minReps: 8, weight: 50 }}
        reps={8}
        setNumber={3}
        weight={55}
        weightUnit="kg"
      />,
    );

    const weightInput = screen.getByLabelText('Weight for set 3');
    const repsInput = screen.getByLabelText('Reps for set 3');

    expect(weightInput).toHaveClass('h-11');
    expect(repsInput).toHaveClass('h-11');
    expect(screen.getByText('Target: 50 kg x 8-12')).toBeInTheDocument();

    fireEvent.change(weightInput, { target: { value: '60' } });
    fireEvent.change(repsInput, { target: { value: '10' } });
    fireEvent.click(screen.getByLabelText('Complete set 3'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Set' }));

    expect(onUpdate).toHaveBeenCalledWith({ completed: true, weight: 60 });
    expect(onUpdate).toHaveBeenCalledWith({ completed: true, reps: 10 });
    expect(onUpdate).toHaveBeenCalledWith({ completed: true });
    expect(onAddSet).toHaveBeenCalledTimes(1);
  });

  it('applies completed styling and handles cleared numeric values', () => {
    const onUpdate = vi.fn();

    render(
      <SetRow
        completed
        isLast={false}
        lastPerformance={{ reps: 12, weight: 50 }}
        onUpdate={onUpdate}
        reps={13}
        setNumber={1}
        weight={null}
      />,
    );

    fireEvent.change(screen.getByLabelText('Reps for set 1'), { target: { value: '' } });

    expect(document.querySelector('[data-slot="set-row"]')).toHaveClass('bg-emerald-500/10');
    expect(onUpdate).toHaveBeenCalledWith({ completed: false, reps: null });
    expect(screen.getByText('Last time: 50x12')).toBeInTheDocument();
    expect(screen.getByText('PR')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Set' })).not.toBeInTheDocument();
  });

  it('renders reps-only rows without weight input', () => {
    render(
      <SetRow
        completed={false}
        isLast={false}
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
        isLast={false}
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

  it('shows reps-only target text for reps-seconds tracking', () => {
    render(
      <SetRow
        completed={false}
        isLast={false}
        onUpdate={vi.fn()}
        reps={10}
        setNumber={2}
        target={{ maxReps: 12, minReps: 8, weight: 0 }}
        trackingType="reps_seconds"
      />,
    );

    expect(screen.getByText('Target: 8-12 reps')).toBeInTheDocument();
  });

  it('uses km distance suffix for metric users', () => {
    render(
      <SetRow
        completed={false}
        distance={5}
        isLast={false}
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
