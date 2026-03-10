import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SetRow } from './set-row';

describe('SetRow', () => {
  it('renders weight + reps inputs for weight_reps and reports updates', () => {
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
        target={{ maxReps: 12, minReps: 8, weight: 50 }}
        trackingType="weight_reps"
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

    expect(onUpdate).toHaveBeenCalledWith({ weight: 60 });
    expect(onUpdate).toHaveBeenCalledWith({ reps: 10 });
    expect(onUpdate).toHaveBeenCalledWith({ completed: true });
    expect(onAddSet).toHaveBeenCalledTimes(1);
  });

  it('renders seconds-only input without weight or reps fields', () => {
    const onUpdate = vi.fn();

    render(
      <SetRow
        completed
        isLast={false}
        onUpdate={onUpdate}
        seconds={45}
        setNumber={1}
        trackingType="seconds_only"
      />,
    );

    expect(screen.getByLabelText('Seconds for set 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Weight for set 1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reps for set 1')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Seconds for set 1'), { target: { value: '' } });

    expect(document.querySelector('[data-slot="set-row"]')).toHaveClass('bg-emerald-500/10');
    expect(onUpdate).toHaveBeenCalledWith({ seconds: null });
  });

  it('renders cardio duration + distance and shows PR on better last performance', () => {
    const onUpdate = vi.fn();

    render(
      <SetRow
        completed={false}
        distance={1.1}
        isLast={false}
        lastPerformance={{ distance: 1, reps: 120, weight: null }}
        onUpdate={onUpdate}
        seconds={120}
        setNumber={2}
        trackingType="cardio"
        weightUnit="lbs"
      />,
    );

    expect(screen.getByLabelText('Duration for set 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Distance for set 2')).toBeInTheDocument();
    expect(screen.getByText('Last time: 120 sec + 1 mi')).toBeInTheDocument();
    expect(screen.getByText('PR')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Distance for set 2'), { target: { value: '1.3' } });

    expect(onUpdate).toHaveBeenCalledWith({ distance: 1.3 });
  });
});
