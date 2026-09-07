import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SetRow } from './set-row';

const SET_VALUE_UPDATE_DEBOUNCE_MS = 700;

describe('SetRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders touch-sized populated inputs in a dedicated metric row and auto-completes', () => {
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

    expect(weightInput).toHaveClass('h-11');
    expect(repsInput).toHaveClass('h-11');
    expect(weightInput).toHaveAttribute('aria-describedby');
    expect(repsInput).toHaveAttribute('aria-describedby');
    expect(document.querySelector('[data-slot="set-metrics"]')).toHaveClass(
      'col-span-2',
      'row-start-2',
    );
    expect(screen.getByText('Set 3')).toBeInTheDocument();
    expect(screen.queryByText('Weight')).not.toBeInTheDocument();

    fireEvent.change(weightInput, { target: { value: '60' } });
    fireEvent.change(repsInput, { target: { value: '10' } });

    expect(onUpdate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SET_VALUE_UPDATE_DEBOUNCE_MS);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({
      completed: true,
      distance: null,
      reps: 10,
      seconds: null,
      weight: 60,
    });
  });

  it('waits for a keypad-friendly pause before saving multi-digit edits', () => {
    const onUpdate = vi.fn();

    render(<SetRow completed={false} onUpdate={onUpdate} reps={8} setNumber={1} weight={50} />);

    const repsInput = screen.getByLabelText('Reps for set 1');
    fireEvent.change(repsInput, { target: { value: '1' } });
    vi.advanceTimersByTime(250);

    expect(onUpdate).not.toHaveBeenCalled();

    fireEvent.change(repsInput, { target: { value: '15' } });
    vi.advanceTimersByTime(SET_VALUE_UPDATE_DEBOUNCE_MS - 1);

    expect(onUpdate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({
      completed: true,
      distance: null,
      reps: 15,
      seconds: null,
      weight: 50,
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
    vi.advanceTimersByTime(SET_VALUE_UPDATE_DEBOUNCE_MS);

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

  it('logs native RIR without completing the set and returns focus after selection', async () => {
    const onUpdate = vi.fn();
    render(
      <SetRow
        completed={false}
        onUpdate={onUpdate}
        reps={null}
        rir={null}
        setNumber={2}
        showRirControl
        weight={null}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: 'RIR for set 2: No repetitions in reserve logged',
    });
    fireEvent.click(trigger);
    expect(
      screen.getByRole('dialog', { name: 'Repetitions in reserve · Set 2' }),
    ).toHaveAccessibleDescription('0 = no reps left · 5+ = five or more reps left');
    expect(screen.getByText('0 = no reps left · 5+ = five or more reps left')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '5 or more repetitions in reserve' }));

    expect(onUpdate).toHaveBeenCalledWith({ rir: 5, rpe: null });
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ completed: true }));
    act(() => vi.runAllTimers());
    expect(trigger).toHaveFocus();
  });

  it.each([false, true])(
    'updates only the RIR/RPE pair on a closed trigger (completed=%s)',
    (completed) => {
      const onUpdate = vi.fn();
      render(
        <SetRow
          completed={completed}
          onUpdate={onUpdate}
          reps={8}
          rpe={8}
          setNumber={2}
          showRirControl
          weight={135}
        />,
      );
      const trigger = screen.getByRole('button', { name: /RIR for set 2/u });
      trigger.focus();
      fireEvent.keyDown(trigger, { key: '2' });
      act(() => vi.runAllTimers());
      expect(onUpdate.mock.calls).toEqual([[{ rir: 2, rpe: null }]]);
      expect(trigger).toHaveFocus();
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Weight for set 2')).toHaveValue(135);
      expect(screen.getByLabelText('Reps for set 2')).toHaveValue(8);
    },
  );

  it('supports arrow-key RIR selection and explicit clear', () => {
    const onUpdate = vi.fn();
    render(
      <SetRow
        completed
        onUpdate={onUpdate}
        reps={8}
        rir={2}
        setNumber={1}
        showRirControl
        weight={135}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'RIR for set 1: 2 repetitions in reserve' }),
    );
    const selected = screen.getByRole('radio', { name: '2 repetitions in reserve' });
    expect(selected).toHaveClass('bg-[var(--color-accent-mint)]');
    expect(selected).toHaveClass('text-[var(--color-on-accent)]');
    selected.focus();
    fireEvent.keyDown(selected, { key: 'ArrowRight' });
    expect(onUpdate).toHaveBeenCalledWith({ rir: 3, rpe: null });

    fireEvent.click(screen.getByRole('radio', { name: 'Clear repetitions in reserve' }));
    expect(onUpdate).toHaveBeenCalledWith({ rir: null, rpe: null });
  });

  it('does not expose RIR controls for unsupported tracking modes', () => {
    render(
      <SetRow
        completed={false}
        onUpdate={vi.fn()}
        reps={null}
        setNumber={1}
        trackingType="duration"
        showRirControl
      />,
    );
    expect(screen.queryByRole('button', { name: /RIR for set/u })).not.toBeInTheDocument();
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
    vi.advanceTimersByTime(SET_VALUE_UPDATE_DEBOUNCE_MS);

    expect(onUpdate).toHaveBeenCalledWith({
      completed: true,
      distance: null,
      reps: null,
      seconds: 45,
      weight: null,
    });
  });

  it('renders duration rows as one block with effort inputs', () => {
    const onUpdate = vi.fn();

    render(
      <SetRow
        completed={false}
        label="Duration"
        onUpdate={onUpdate}
        reps={null}
        seconds={1800}
        setNumber={1}
        targetSeconds={1800}
        trackingType="duration"
      />,
    );

    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Target: 1800 sec')).toBeInTheDocument();
    expect(screen.getByLabelText('Zone for set 1')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('RPE for set 1'), { target: { value: '3' } });
    vi.advanceTimersByTime(SET_VALUE_UPDATE_DEBOUNCE_MS);

    expect(onUpdate).toHaveBeenCalledWith({
      completed: true,
      distance: null,
      reps: null,
      rpe: 3,
      seconds: 1800,
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
    expect(screen.getByLabelText('Distance for set 1')).toHaveValue(5);
  });

  it.each([
    {
      labels: ['Weight', 'Reps'],
      props: { reps: 12, trackingType: 'weight_reps' as const, weight: 157.5 },
      values: [157.5, 12],
    },
    {
      labels: ['Weight', 'Seconds'],
      props: {
        reps: null,
        seconds: 3600,
        trackingType: 'weight_seconds' as const,
        weight: 155.5,
      },
      values: [155.5, 3600],
    },
    {
      labels: ['Reps'],
      props: { reps: 12, trackingType: 'bodyweight_reps' as const },
      values: [12],
    },
    {
      labels: ['Reps'],
      props: { reps: 12, trackingType: 'reps_only' as const },
      values: [12],
    },
    {
      labels: ['Reps', 'Seconds'],
      props: { reps: 12, seconds: 3600, trackingType: 'reps_seconds' as const },
      values: [12, 3600],
    },
    {
      labels: ['Seconds'],
      props: { reps: null, seconds: 3600, trackingType: 'seconds_only' as const },
      values: [3600],
    },
    {
      labels: ['Duration', 'RPE', 'Zone'],
      props: {
        reps: null,
        rpe: 8,
        seconds: 3600,
        trackingType: 'duration' as const,
        zone: 3,
      },
      values: [3600, 8, 3],
    },
    {
      labels: ['Distance'],
      props: { distance: 5.4, reps: null, trackingType: 'distance' as const },
      values: [5.4],
    },
    {
      labels: ['Seconds', 'Distance'],
      props: {
        distance: 5.4,
        reps: null,
        seconds: 3600,
        trackingType: 'cardio' as const,
      },
      values: [3600, 5.4],
    },
  ])(
    'keeps populated $props.trackingType metrics and units explicit',
    ({ labels, props, values }) => {
      render(<SetRow completed={false} onUpdate={vi.fn()} setNumber={7} {...props} />);

      labels.forEach((label, index) => {
        const input = screen.getByLabelText(`${label} for set 7`);
        expect(input).toHaveValue(values[index]);
        expect(input).toHaveClass('h-11', 'tabular-nums');
        expect(input).toHaveAttribute('aria-describedby');
      });
    },
  );

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
