import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SetRow } from './set-row';

describe('SetRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders compact inline inputs and auto-completes when all fields are filled', () => {
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

    expect(onUpdate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({
      completed: true,
      distance: null,
      reps: 10,
      seconds: null,
      weight: 60,
    });
  });

  it('applies completed styling and auto-uncompletes when a required field is cleared', () => {
    const onUpdate = vi.fn();

    render(<SetRow completed onUpdate={onUpdate} reps={13} setNumber={1} weight={50} />);

    const repsInput = screen.getByLabelText('Reps for set 1');
    fireEvent.change(repsInput, { target: { value: '' } });
    fireEvent.blur(repsInput);

    expect(document.querySelector('[data-slot="set-row"]')).toHaveClass('bg-emerald-500/10');
    expect(onUpdate).toHaveBeenCalledWith({
      completed: false,
      distance: null,
      reps: null,
      seconds: null,
      weight: 50,
    });
  });

  it('auto-completes a set when all required fields are filled', () => {
    const onUpdate = vi.fn();

    render(<SetRow completed={false} onUpdate={onUpdate} reps={null} setNumber={2} weight={60} />);

    fireEvent.change(screen.getByLabelText('Reps for set 2'), { target: { value: '8' } });
    vi.advanceTimersByTime(250);

    expect(onUpdate).toHaveBeenCalledWith({
      completed: true,
      distance: null,
      reps: 8,
      seconds: null,
      weight: 60,
    });
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

  it('auto-completes seconds-only rows when seconds are entered', () => {
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
    vi.advanceTimersByTime(250);

    expect(onUpdate).toHaveBeenCalledWith({
      completed: true,
      distance: null,
      reps: null,
      seconds: 45,
      weight: null,
    });
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

  it('renders read-only target hints when prescribed targets exist', () => {
    render(
      <SetRow
        completed={false}
        onUpdate={vi.fn()}
        reps={null}
        seconds={null}
        setNumber={2}
        targetSeconds={45}
        targetWeight={135}
        trackingType="weight_seconds"
      />,
    );

    expect(screen.getByText('Target: 135 lbs × 45 sec')).toBeInTheDocument();
  });

  it('prefixes cardio target hints when only one dimension exists', () => {
    render(
      <SetRow
        completed={false}
        onUpdate={vi.fn()}
        reps={null}
        seconds={null}
        setNumber={1}
        targetSeconds={45}
        trackingType="cardio"
      />,
    );

    expect(screen.getByText('Target: 45 sec')).toBeInTheDocument();
  });

  it('renders weight ranges in target hints for weight-rep exercises', () => {
    render(
      <SetRow
        completed={false}
        onUpdate={vi.fn()}
        reps={8}
        setNumber={1}
        targetWeightMax={90}
        targetWeightMin={70}
        trackingType="weight_reps"
      />,
    );

    expect(screen.getByText('Target: 70-90 lbs')).toBeInTheDocument();
  });

  it('renders distance targets with unit suffix based on weight unit', () => {
    render(
      <SetRow
        completed={false}
        onUpdate={vi.fn()}
        reps={null}
        setNumber={1}
        targetDistance={0.4}
        trackingType="distance"
        weightUnit="kg"
      />,
    );

    expect(screen.getByText('Target: 0.4 km')).toBeInTheDocument();
  });

  it('renders seconds target hints for reps-seconds tracking', () => {
    render(
      <SetRow
        completed={false}
        onUpdate={vi.fn()}
        reps={6}
        setNumber={1}
        targetSeconds={45}
        trackingType="reps_seconds"
      />,
    );

    expect(screen.getByText('Target: 45 sec')).toBeInTheDocument();
  });

  it('does not render a target hint when no prescribed targets exist', () => {
    render(
      <SetRow
        completed={false}
        onUpdate={vi.fn()}
        reps={10}
        setNumber={1}
        trackingType="weight_reps"
      />,
    );

    expect(screen.queryByText(/^Target:/i)).not.toBeInTheDocument();
  });
});
